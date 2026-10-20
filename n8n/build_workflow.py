"""Build srvmon-workflow.json (an n8n import file) from the Code node sources in code/.

Edit the .js files, run `python3 build_workflow.py`, and import the result in n8n
(Workflows → Import from file). Node IDs are derived from node names, so a rebuild
only changes what you changed.
"""
import json
import pathlib
import uuid

HERE = pathlib.Path(__file__).parent
NS = uuid.UUID("6b0d6f3e-4f0a-4c55-9a43-3b2b5f2b1a10")


def uid(name):
    return str(uuid.uuid5(NS, name))


def code(name):
    return (HERE / "code" / name).read_text(encoding="utf-8")


def table(name):
    return {"__rl": True, "mode": "name", "value": name}


def col(name, kind):
    return {"id": name, "displayName": name, "required": False, "defaultMatch": False,
            "display": True, "type": kind, "canBeUsedToMatch": True}


STATUS, EVENTS, SECURITY = table("srvmon_status"), table("srvmon_events"), table("srvmon_security")
STATUS_COLS = [col("server", "string"), col("online", "boolean"), col("last_seen", "number"),
               col("payload", "string"), col("state", "string")]
EVENT_COLS = [col("server", "string"), col("kind", "string"), col("message", "string"), col("ts", "number")]
SECURITY_COLS = [col("server", "string"), col("ts", "number"), col("report", "string")]
CHAT_ID = "YOUR_CHAT_ID"
TELEGRAM_OPTS = {"appendAttribution": False, "parse_mode": "HTML", "disable_web_page_preview": True}

nodes, connections = [], {}


def node(name, kind, version, pos, params, **extra):
    n = {"parameters": params, "id": uid(name), "name": name, "type": kind,
         "typeVersion": version, "position": list(pos)}
    if kind == "n8n-nodes-base.webhook":
        n["webhookId"] = uid("webhook " + name)
    n.update(extra)
    nodes.append(n)
    return name


def link(src, *dsts):
    out = connections.setdefault(src, {"main": [[]]})["main"][0]
    out.extend({"node": d, "type": "main", "index": 0} for d in dsts)


def webhook(name, pos, method, path, **params):
    return node(name, "n8n-nodes-base.webhook", 2.1, pos,
                dict({"httpMethod": method, "path": path, "options": {}}, **params))


def schedule(name, pos, rule):
    return node(name, "n8n-nodes-base.scheduleTrigger", 1.2, pos, {"rule": {"interval": [rule]}})


def js(name, pos, source):
    return node(name, "n8n-nodes-base.code", 2, pos, {"jsCode": code(source)})


def rows_get(name, pos, tbl, conditions=None, **extra):
    params = {"resource": "row", "operation": "get", "dataTableId": tbl}
    if conditions:
        params.update({"matchType": "allConditions", "filters": {"conditions": conditions}})
    params.update(extra.pop("params", {"returnAll": True}))
    return node(name, "n8n-nodes-base.dataTable", 1.1, pos, params, alwaysOutputData=True, **extra)


def rows_write(name, pos, operation, tbl, values, schema, conditions=None, **extra):
    params = {"resource": "row", "operation": operation, "dataTableId": tbl}
    if conditions:
        params.update({"matchType": "allConditions", "filters": {"conditions": conditions}})
    params["columns"] = {"mappingMode": "defineBelow", "value": values, "matchingColumns": [], "schema": schema}
    params["options"] = {}
    return node(name, "n8n-nodes-base.dataTable", 1.1, pos, params, **extra)


def prune(name, pos, tbl, days):
    return node(name, "n8n-nodes-base.dataTable", 1.1, pos, {
        "resource": "row", "operation": "deleteRows", "dataTableId": tbl, "matchType": "allConditions",
        "filters": {"conditions": [{"keyName": "ts", "condition": "lt",
                                    "keyValue": "={{ Date.now() - %d }}" % (days * 86400000)}]},
        "options": {}}, executeOnce=True)


def not_empty(name, pos, value):
    return node(name, "n8n-nodes-base.filter", 2.2, pos, {
        "conditions": {
            "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "loose"},
            "conditions": [{"id": uid("cond " + name), "leftValue": value, "rightValue": "",
                            "operator": {"type": "string", "operation": "notEmpty", "singleValue": True}}],
            "combinator": "and"},
        "options": {}})


def telegram(name, pos, text, **fields):
    return node(name, "n8n-nodes-base.telegram", 1.2, pos, {
        "resource": "message", "operation": "sendMessage", "chatId": CHAT_ID, "text": text,
        "additionalFields": dict(TELEGRAM_OPTS, **fields)}, onError="continueRegularOutput")


def sticky(name, pos, size, text, color=7):
    node(name, "n8n-nodes-base.stickyNote", 1, pos,
         {"content": text, "width": size[0], "height": size[1], "color": color})


BY_SERVER = [{"keyName": "server", "condition": "eq", "keyValue": "={{ $json.server }}"}]

# ---- 1. agent reports, every minute from every server
report = webhook("Agent Report", (0, 0), "POST", "srvmon/in/CHANGE-ME", responseMode="onReceived")
previous = rows_get("Load Previous State", (240, 0), STATUS,
                    [{"keyName": "server", "condition": "eq", "keyValue": "={{ $json.body.server }}"}],
                    params={"returnAll": False, "limit": 1})
evaluate = js("Evaluate Report", (480, 0), "evaluate-report.js")
save = rows_write("Save Status", (760, -100), "upsert", STATUS,
                  {c["id"]: "={{ $json.%s }}" % c["id"] for c in STATUS_COLS}, STATUS_COLS, BY_SERVER)
changed = not_empty("Anything Changed?", (760, 140), "={{ $json.message }}")
link(report, previous)
link(previous, evaluate)
link(evaluate, save, changed)

# ---- 2. servers that stopped reporting
minute = schedule("Every Minute", (0, 300), {"field": "minutes", "minutesInterval": 1})
all_status = rows_get("Load All Status", (240, 300), STATUS)
silent = js("Find Silent Servers", (480, 300), "find-silent-servers.js")
link(minute, all_status)
link(all_status, silent)
link(silent, save, changed)

# ---- 3. alerts: Telegram, the logs as a reply, the event log, WhatsApp if you want it
alert = telegram("Send Telegram Alert", (1020, 40), "={{ $json.message }}")
has_logs = not_empty("Has Logs?", (1260, 40), "={{ $('Anything Changed?').item.json.logs_message }}")
send_logs = telegram("Send Logs", (1500, 40), "={{ $('Anything Changed?').item.json.logs_message }}",
                     reply_to_message_id="={{ $json.result.message_id }}", disable_notification=True)
log_event = rows_write("Log Event", (1020, 240), "insert", EVENTS,
                       {"server": "={{ $json.server }}", "kind": "={{ $json.kind }}",
                        "message": "={{ $json.message }}", "ts": "={{ Date.now() }}"}, EVENT_COLS)
whatsapp = node("Send WhatsApp (optional)", "n8n-nodes-base.httpRequest", 4.2, (1020, 440), {
    "method": "POST",
    "url": "https://graph.facebook.com/v21.0/YOUR_PHONE_NUMBER_ID/messages",
    "authentication": "genericCredentialType", "genericAuthType": "httpHeaderAuth",
    "sendBody": True, "specifyBody": "json",
    "jsonBody": "={{ JSON.stringify({ messaging_product: 'whatsapp', to: 'YOUR_WHATSAPP_NUMBER', type: 'text', "
                "text: { body: $json.message.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>')"
                ".replace(/&amp;/g, '&') } }) }}",
    "options": {}}, disabled=True, onError="continueRegularOutput")
link(changed, alert, log_event, whatsapp)
link(alert, has_logs)
link(has_logs, send_logs)

# ---- 4. the dashboard page
page = webhook("Dashboard Page", (0, 640), "GET", "srvmon/CHANGE-ME", responseMode="responseNode",
               authentication="basicAuth")
status = rows_get("Load Status", (240, 640), STATUS)
recent = rows_get("Load Recent Events", (480, 640), EVENTS, executeOnce=True,
                  params={"returnAll": False, "limit": 40, "orderBy": True,
                          "orderByColumn": "createdAt", "orderByDirection": "DESC"})
build = js("Build Dashboard", (720, 640), "build-dashboard.js")
headers = [("Content-Type", "text/html; charset=utf-8"), ("Cache-Control", "no-store"),
           ("X-Robots-Tag", "noindex, nofollow"), ("Referrer-Policy", "no-referrer"),
           ("X-Content-Type-Options", "nosniff")]
respond = node("Send Dashboard", "n8n-nodes-base.respondToWebhook", 1.4, (960, 640), {
    "respondWith": "text", "responseBody": "={{ $json.html }}",
    "options": {"responseHeaders": {"entries": [{"name": k, "value": v} for k, v in headers]}}})
link(page, status)
link(status, recent)
link(recent, build)
link(build, respond)

# ---- 5. the daily report
daily = schedule("Daily 9 AM", (0, 920), {"field": "cronExpression", "expression": "0 9 * * *"})
daily_status = rows_get("Load Status (Daily)", (240, 920), STATUS)
day_events = rows_get("Load Events 24h", (480, 920), EVENTS,
                      [{"keyName": "ts", "condition": "gt", "keyValue": "={{ Date.now() - 86400000 }}"}],
                      executeOnce=True)
daily_build = js("Build Daily Report", (720, 920), "build-daily-report.js")
daily_send = telegram("Send Daily Report", (960, 840), "={{ $json.message }}")
daily_prune = prune("Prune Events > 30 Days", (960, 1000), EVENTS, 30)
link(daily, daily_status)
link(daily_status, day_events)
link(day_events, daily_build)
link(daily_build, daily_send, daily_prune)

# ---- 6. the daily security digest
sec_in = webhook("Security Report", (0, 1240), "POST", "srvmon/sec/CHANGE-ME", responseMode="onReceived")
sec_check = js("Check Security Report", (240, 1240), "check-security-report.js")
sec_save = rows_write("Save Security Report", (480, 1240), "insert", SECURITY,
                      {c["id"]: "={{ $json.%s }}" % c["id"] for c in SECURITY_COLS}, SECURITY_COLS)
link(sec_in, sec_check)
link(sec_check, sec_save)
digest_at = schedule("Daily 9:10", (0, 1460), {"field": "cronExpression", "expression": "10 9 * * *"})
sec_status = rows_get("Load Status (Security)", (240, 1460), STATUS)
sec_rows = rows_get("Load Security Reports", (480, 1460), SECURITY,
                    [{"keyName": "ts", "condition": "gt", "keyValue": "={{ Date.now() - 26 * 3600000 }}"}],
                    executeOnce=True)
digest = js("Build Security Digest", (720, 1460), "build-security-digest.js")
digest_send = telegram("Send Security Digest", (960, 1380), "={{ $json.message }}")
sec_prune = prune("Prune Security Reports > 30 Days", (960, 1540), SECURITY, 30)
link(digest_at, sec_status)
link(sec_status, sec_rows)
link(sec_rows, digest)
link(digest, digest_send, sec_prune)

sticky("Setup", (-600, -80), (520, 640), """## srvmon · setup

1. **Data tables** (Overview → Data tables), with these columns:
   - `srvmon_status`: server (string), online (boolean), last_seen (number), payload (string), state (string)
   - `srvmon_events`: server (string), kind (string), message (string), ts (number)
   - `srvmon_security`: server (string), ts (number), report (string)
2. **Webhook paths**: replace `CHANGE-ME` in *Agent Report* and *Security Report* with one long random token (`openssl rand -hex 16`), the same in both, and in *Dashboard Page* with a different one.
3. **Dashboard login**: pick a Basic Auth credential in *Dashboard Page*.
4. **Telegram**: pick your bot's credential and put your chat ID in the four Telegram nodes.
5. **Settings** at the top of the Code nodes: `LANG` ('en' or 'ar'), `KNOWN` server names (Evaluate Report and Check Security Report), `SHOPS`, `DASHBOARD_URL`.
6. Workflow settings: set the time zone; don't save successful executions (one per server per minute adds up).
7. Activate, then install the agent on each server.""", color=4)
sticky("Note: alerts", (1000, -140), (720, 160),
       "**Alerts** go out only when something changes: a new problem, a problem resolved, a server silent or back. "
       "The logs the agent attached go as a reply under the alert. WhatsApp is off; to use it, fill in the "
       "Cloud API number and a header-auth credential (`Authorization: Bearer <token>`). Outside the 24-hour "
       "customer window WhatsApp only delivers approved templates.")

workflow = {
    "name": "Server Monitor (srvmon)",
    "nodes": nodes,
    "connections": connections,
    "active": False,
    "settings": {"executionOrder": "v1", "saveDataSuccessExecution": "none", "saveManualExecutions": True},
    "pinData": {},
    "meta": {"templateCredsSetupCompleted": False},
    "tags": [],
}
out = HERE / "srvmon-workflow.json"
with open(out, "w", encoding="utf-8", newline="\n") as f:
    f.write(json.dumps(workflow, indent=2, ensure_ascii=False) + "\n")
print("wrote %s: %d nodes" % (out.name, len(nodes)))

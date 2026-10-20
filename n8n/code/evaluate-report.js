// srvmon · Evaluate Report
// Compares one agent report with what the server looked like last time: what is new, what is
// still open, what was fixed. A problem has to show up in `need` reports in a row before it
// alerts, and it alerts once; when it goes away you get one "resolved" line with how long it lasted.

// ---- settings ---------------------------------------------------------------------------
var LANG = 'en';  // 'en', or 'ar' for Egyptian Arabic
// Only these servers may report. A leaked URL or a typo'd name is dropped instead of showing up as a new server.
var KNOWN = ['web-1', 'web-2', 'erp-1', 'shop-1'];
// The agent attaches logs at the same disk/RAM/CPU levels (DISK_PCT, MEM_PCT, CPU_PCT in srvmon-agent).
var DISK_PCT = 85, MEM_PCT = 92, CPU_PCT = 95, SSL_DAYS = 14, ROUTER_CPU_PCT = 90;
// -------------------------------------------------------------------------------------------

var T = {
  en: {
    disk: function (d) { return '💾 Disk ' + d.mount + ' at ' + d.pct + '% (' + d.used_gb + '/' + d.total_gb + 'G)'; },
    mem: function (p) { return '🧠 RAM at ' + p + '%'; },
    psi: function (p) { return '🧠 Memory pressure: tasks waited for RAM ' + p + '% of the last 5 minutes. Something is using too much, or the server needs more RAM'; },
    cpu: function (p) { return '🔥 CPU at ' + p + '%'; },
    unit: function (u) { return '⚙️ Service ' + u + ' failed'; },
    unhealthy: function (c) { return '🐳 ' + c + ' unhealthy'; },
    restarting: function (c) { return '🐳 ' + c + ' keeps restarting'; },
    exited: function (c, x) { return '🐳 ' + c + ' stopped (exit ' + x + ')'; },
    site: function (t, e) { return '🌐 ' + t + ' is down: ' + e; },
    ssl: function (t, d) { return '🔒 Certificate for ' + t + ' expires in ' + d + ' days'; },
    routerDown: function (e) { return '📡 The router does not answer: ' + e; },
    wan: function (l, running, other) { return '🔌 ' + l + ' is down' + (running ? ' (the link is up, but no internet from the provider)' : ' (the port is unplugged)') + (other ? ' · running on ' + other : ' · ⚠️ no line is up'); },
    port: function (p) { return '🔗 Router port ' + p + ' is down'; },
    routerCpu: function (p) { return '🔥 Router CPU at ' + p + '%'; },
    reboot: function (m) { return '🔄 The router restarted (up ' + m + ' min). If nobody did it by hand, it was most likely a power cut'; },
    device: function (icon, name, since, nvr) { return icon + ' ' + name + ' is offline' + (since ? ' since ' + since : '') + (nvr ? ' (and every camera behind it)' : ''); },
    noBackup: function (l) { return '💾 Backup ' + l + ': no copy found'; },
    oldBackup: function (l, h, lim) { return '💾 Backup ' + l + ': the newest copy is ' + h + ' h old (expected every ' + lim + ' h)'; },
    lasted: function (d) { return ' (lasted ' + d + ')'; },
    added: '🆕 Added to monitoring',
    back: function (d) { return '✅ Back online after ' + d; },
    fixed: '✅ Resolved: ',
    logs: 'logs',
    min: function (m) { return m + ' min'; },
    hours: function (h, m) { return h + ' h ' + m + ' min'; },
    days: function (d) { return d + ' days'; }
  },
  ar: {
    disk: function (d) { return '💾 الديسك ' + d.mount + ' وصل ' + d.pct + '% (' + d.used_gb + '/' + d.total_gb + 'G)'; },
    mem: function (p) { return '🧠 الرام ' + p + '%'; },
    psi: function (p) { return '🧠 السيرفر بيستنى الرام ' + p + '% من الوقت (آخر 5 دقايق) — حاجة بتاكل رام زيادة أو السيرفر محتاج رام أكتر'; },
    cpu: function (p) { return '🔥 الـ CPU ' + p + '%'; },
    unit: function (u) { return '⚙️ خدمة ' + u + ' واقعة (failed)'; },
    unhealthy: function (c) { return '🐳 ' + c + ' unhealthy'; },
    restarting: function (c) { return '🐳 ' + c + ' بيعمل restart متكرر'; },
    exited: function (c, x) { return '🐳 ' + c + ' واقف (exit ' + x + ')'; },
    site: function (t, e) { return '🌐 ' + t + ' مش شغال: ' + e; },
    ssl: function (t, d) { return '🔒 شهادة ' + t + ' فاضلها ' + d + ' يوم'; },
    routerDown: function (e) { return '📡 الراوتر مش بيرد على السيرفر: ' + e; },
    wan: function (l, running, other) { return '🔌 ' + l + ' واقع' + (running ? ' (الكابل متوصل بس مفيش نت من الشركة)' : ' (البورت مفصول من الراوتر)') + (other ? ' · المحل شغال على ' + other : ' · ⚠️ مفيش ولا خط شغال'); },
    port: function (p) { return '🔗 بورت ' + p + ' على الراوتر مفصول'; },
    routerCpu: function (p) { return '🔥 الـ CPU بتاع الراوتر ' + p + '%'; },
    reboot: function (m) { return '🔄 الراوتر عمل restart (شغال بقاله ' + m + ' دقيقة). لو محدش عمله بإيده يبقى غالباً الكهربا قطعت'; },
    device: function (icon, name, since, nvr) { return icon + ' ' + name + ' مفصول' + (since ? ' من ' + since : '') + (nvr ? ' (وكل الكاميرات معاه)' : ''); },
    noBackup: function (l) { return '💾 باك أب ' + l + ': مفيش ولا نسخة'; },
    oldBackup: function (l, h, lim) { return '💾 باك أب ' + l + ' آخر نسخة من ' + h + ' ساعة (المفروض كل ' + lim + ' ساعة)'; },
    lasted: function (d) { return ' (استمرت ' + d + ')'; },
    added: '🆕 اتضاف للمراقبة',
    back: function (d) { return '✅ رجع أونلاين بعد ' + d; },
    fixed: '✅ اتحلت: ',
    logs: 'اللوجز',
    min: function (m) { return m + ' دقيقة'; },
    hours: function (h, m) { return h + ' ساعة و ' + m + ' دقيقة'; },
    days: function (d) { return d + ' يوم'; }
  }
}[LANG];

var NL = String.fromCharCode(10);
var TZ = $now.zoneName;
var body = $('Agent Report').first().json.body || {};
var server = String(body.server || '').trim();
if (KNOWN.indexOf(server) < 0) return [];
if (JSON.stringify(body).length > 500000) return [];

// Coerce every number and flag before the report is stored: the dashboard and the reports print them as they are.
function num(v) { if (v == null || v === '') return null; var n = Number(v); return isFinite(n) ? n : null; }
function nums(o, keys) { if (o && typeof o === 'object') keys.forEach(function (k) { if (k in o) o[k] = num(o[k]); }); }
function list(o, k, fn) { if (!o || !(k in o)) return; o[k] = Array.isArray(o[k]) ? o[k].filter(function (x) { return x && typeof x === 'object'; }) : []; if (fn) o[k].forEach(fn); }
function strs(o, k) { if (o && k in o) o[k] = Array.isArray(o[k]) ? o[k].map(String) : []; }
nums(body, ['cpu_pct', 'ncpu', 'uptime_h', 'services_running']);
if ('load' in body) body.load = Array.isArray(body.load) ? body.load.map(num) : [];
if ('mem' in body && (!body.mem || typeof body.mem !== 'object')) body.mem = null;
nums(body.mem, ['pct', 'used_gb', 'total_gb', 'swap_pct', 'psi_some60', 'psi_some300', 'psi_full60', 'psi_full300']);
list(body, 'disks', function (d) { nums(d, ['pct', 'used_gb', 'total_gb']); });
list(body, 'sites', function (s) { nums(s, ['status', 'ms', 'ssl_days']); });
list(body, 'containers', function (c) { nums(c, ['exit_code']); });
strs(body, 'failed_units');
strs(body, 'services');
if (body.router && typeof body.router === 'object') {
  nums(body.router, ['uptime_s', 'cpu_pct', 'mem_pct', 'dhcp_bound', 'wlan_clients', 'hotspot_users']);
  list(body.router, 'lines', function (l) { nums(l, ['rx_bps', 'tx_bps']); l.up = !!l.up; l.running = !!l.running; });
  list(body.router, 'ports', function (p) { p.running = !!p.running; });
} else delete body.router;
list(body, 'devices', function (d) { nums(d, ['since']); d.up = !!d.up; });
list(body, 'backups', function (b) { nums(b, ['max_age_h', 'age_h', 'count']); b.label = String(b.label || '').slice(0, 60); });

var prev = null;
$input.all().forEach(function (it) { if (it.json && it.json.server) prev = it.json; });
var now = Date.now();
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function dur(ms) { var m = Math.round(ms / 60000); if (m < 60) return T.min(m); var h = Math.floor(m / 60); if (h < 48) return T.hours(h, m % 60); return T.days(Math.round(h / 24)); }
function timeOf(s) { return DateTime.fromSeconds(Number(s)).setZone(TZ).toFormat('dd/MM HH:mm'); }
var state = {};
try { state = prev && prev.state ? JSON.parse(prev.state) : {}; } catch (e) { state = {}; }
var prevBody = {};
try { prevBody = prev && prev.payload ? JSON.parse(prev.payload) : {}; } catch (e) { prevBody = {}; }
var active = state.active || {};

// Every problem in this report, keyed so the same problem is recognised next time.
var probs = {};
var oneShot = [];
function add(key, msg, need) { probs[key] = { msg: msg, need: need || 1 }; }
(body.disks || []).forEach(function (d) { if (d.pct >= DISK_PCT) add('disk:' + d.mount, T.disk(d)); });
if (body.mem && body.mem.pct >= MEM_PCT) add('mem', T.mem(body.mem.pct), 3);
// Real memory pressure (PSI). A full swap alone is not a problem (idle pages parked there);
// pressure is what makes a server slow, so that is what alerts.
if (body.mem && (body.mem.psi_some300 >= 10 || body.mem.psi_full300 >= 2)) add('mem_psi', T.psi(body.mem.psi_some300), 2);
if (body.cpu_pct >= CPU_PCT) add('cpu', T.cpu(body.cpu_pct), 5);
(body.failed_units || []).forEach(function (u) { add('unit:' + u, T.unit(u)); });
(body.containers || []).forEach(function (c) {
  if (c.health === 'unhealthy') add('ctr:' + c.name, T.unhealthy(c.name), 2);
  else if (c.status === 'restarting') add('ctr:' + c.name, T.restarting(c.name), 2);
  else if (c.status === 'exited' && c.restart && c.restart !== 'no') add('ctr:' + c.name, T.exited(c.name, c.exit_code));
});
(body.sites || []).forEach(function (s) {
  var tag = s.host + (s.owner ? ' [' + s.owner + ']' : '');
  if (s.error || !s.status || s.status >= 500) add('site:' + s.host, T.site(tag, s.error || ('HTTP ' + s.status)), 2);
  if (s.ssl_days != null && s.ssl_days < SSL_DAYS) add('ssl:' + s.host, T.ssl(tag, s.ssl_days));
});
var rt = body.router;
if (rt) {
  if (rt.error) add('router:unreachable', T.routerDown(rt.error), 2);
  else {
    var lines = rt.lines || [];
    lines.forEach(function (l) {
      if (l.up) return;
      var other = lines.filter(function (o) { return o.id !== l.id && o.up; })[0];
      add('wan:' + l.id, T.wan(l.label, l.running, other && other.label), 2);
    });
    (rt.ports || []).forEach(function (p) { if (!p.running) add('port:' + p.name, T.port(p.name), 3); });
    if (rt.cpu_pct >= ROUTER_CPU_PCT) add('router:cpu', T.routerCpu(rt.cpu_pct), 5);
    var prt = prevBody.router;
    if (prt && !prt.error && prt.uptime_s != null && rt.uptime_s != null && rt.uptime_s < prt.uptime_s) oneShot.push(T.reboot(Math.max(1, Math.round(rt.uptime_s / 60))));
  }
}
var devs = body.devices || [];
// When the NVR is down the cameras behind it are too; one alert for the NVR says it all.
var nvrDown = devs.some(function (d) { return d.group === 'nvr' && !d.up; });
var ICON = { printer: '🖨', iot: '📟', nvr: '📹', camera: '🎥', clock: '👆' };
devs.forEach(function (d) {
  if (d.up || (d.group === 'camera' && nvrDown)) return;
  add('dev:' + d.group + ':' + d.id, T.device(ICON[d.group] || '🔌', d.name, d.since ? timeOf(d.since) : '', d.group === 'nvr'));
});
// A backup whose newest copy is older than max_age_h (or that has no copy at all) means the job stopped.
(body.backups || []).forEach(function (b) {
  var lim = b.max_age_h || 30;
  if (b.age_h == null) add('backup:' + b.label, T.noBackup(b.label));
  else if (b.age_h > lim) add('backup:' + b.label, T.oldBackup(b.label, Math.round(b.age_h), lim));
});

var nextActive = {}, opened = [], openedKeys = [], closed = [];
Object.keys(probs).forEach(function (k) {
  var a = active[k] || { since: now, count: 0, notified: false };
  a.count = (a.count || 0) + 1;
  a.msg = probs[k].msg;
  if (!a.notified && a.count >= probs[k].need) { a.notified = true; opened.push(a.msg); openedKeys.push(k); }
  nextActive[k] = a;
});
Object.keys(active).forEach(function (k) { if (!probs[k] && active[k].notified) closed.push(active[k].msg + T.lasted(dur(now - active[k].since))); });

var out = [], kind = '';
if (!prev) { out.push(T.added); kind = 'new'; }
if (prev && prev.online === false) { out.push(T.back(dur(now - Number(prev.last_seen)))); kind = 'up'; }
oneShot.forEach(function (m) { out.push('🔴 ' + esc(m)); });
opened.forEach(function (m) { out.push('🔴 ' + esc(m)); });
if (opened.length || oneShot.length) kind = 'alert';
closed.forEach(function (m) { out.push(T.fixed + esc(m)); });
if (closed.length && !kind) kind = 'resolved';
var message = out.length ? '<b>🖥 ' + esc(server) + '</b>' + NL + out.join(NL) : '';
if (message.length > 4000) message = message.slice(0, 4000).replace(/&[a-z]*$/, '') + '…';

// The evidence the agent attached for each new problem, sent as a reply under the alert.
var logs = body.problem_logs || {};
var withLogs = openedKeys.filter(function (k) { return logs[k]; });
var logsMessage = '';
if (withLogs.length) {
  var each = Math.max(400, Math.floor(3000 / withLogs.length));
  logsMessage = '<b>🖥 ' + esc(server) + ' · ' + T.logs + '</b>';
  withLogs.forEach(function (k) {
    var part = NL + NL + '<b>' + esc(k) + '</b>' + NL + '<pre>' + esc(String(logs[k]).slice(-each)) + '</pre>';
    if (logsMessage.length + part.length < 4000) logsMessage += part;
  });
}
delete body.problem_logs;

return [{ json: { server: server, online: true, last_seen: now, payload: JSON.stringify(body), state: JSON.stringify({ active: nextActive }), kind: kind, message: message, logs_message: logsMessage } }];

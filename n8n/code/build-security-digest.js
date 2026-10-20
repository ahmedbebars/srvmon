// srvmon · Build Security Digest
// One Telegram message a day from every server's security summary: SSH attempts and logins,
// fail2ban and Suricata, sudo, new listening ports, account changes, OOM kills, pending updates.
// Servers with something worth a look come first; failed SSH logins on their own don't count,
// they are the normal noise of a public server.

// ---- settings ---------------------------------------------------------------------------
var LANG = 'en';  // 'en', or 'ar' for Egyptian Arabic
// -------------------------------------------------------------------------------------------

var T = {
  en: {
    head: '🛡 <b>Security digest</b> · ', date: 'd MMM yyyy',
    summary: function (n, w) { return n + ' server' + (n === 1 ? '' : 's') + ' reported' + (w ? ' · ' + w + ' need a look' : ' · nothing unusual ✅'); },
    ssh: function (f, ips) { return f ? 'SSH: ' + f + ' failed logins from ' + ips + ' IP' + (ips === 1 ? '' : 's') : 'SSH: no failed logins'; },
    logins: ' · logged in: ', f2b: function (n) { return 'fail2ban: ' + n + ' bans'; },
    suri: function (a, p1) { return 'Suricata: ' + a + ' alerts' + (p1 ? ', ' + p1 + ' priority 1' : ''); },
    sudo: function (n) { return 'sudo: ' + n + ' command' + (n === 1 ? '' : 's'); },
    newPorts: '⚠️ New listening ports: ', closedPorts: 'Ports closed: ',
    accounts: function (n) { return '⚠️ Account or group changes: ' + n; },
    oom: function (n) { return '⚠️ Processes killed for lack of memory (OOM): ' + n; },
    reboot: '⚠️ Reboot required', updates: function (n, s) { return (s ? '⚠️ ' : '') + 'Updates: ' + n + (s ? ' (' + s + ' security)' : ''); },
    missing: '🚨 No security report from: '
  },
  ar: {
    head: '🛡 <b>ملخص الأمان</b> · ', date: 'dd/MM/yyyy',
    summary: function (n, w) { return 'وصل تقرير من ' + n + ' سيرفر' + (w ? ' · ' + w + ' محتاجين نظرة' : ' · مفيش حاجة غريبة ✅'); },
    ssh: function (f, ips) { return f ? 'SSH: ' + f + ' محاولة دخول فاشلة من ' + ips + ' IP' : 'SSH: مفيش محاولات دخول فاشلة'; },
    logins: ' · دخول: ', f2b: function (n) { return 'fail2ban: ' + n + ' حظر'; },
    suri: function (a, p1) { return 'Suricata: ' + a + ' تنبيه' + (p1 ? '، منهم ' + p1 + ' أولوية 1' : ''); },
    sudo: function (n) { return 'sudo: ' + n + ' أمر'; },
    newPorts: '⚠️ بورتات جديدة مفتوحة: ', closedPorts: 'بورتات اتقفلت: ',
    accounts: function (n) { return '⚠️ تغييرات في اليوزرات والجروبات: ' + n; },
    oom: function (n) { return '⚠️ برامج اتقفلت عشان الرام خلصت (OOM): ' + n; },
    reboot: '⚠️ محتاج restart', updates: function (n, s) { return (s ? '⚠️ ' : '') + 'تحديثات: ' + n + (s ? ' (' + s + ' أمنية)' : ''); },
    missing: '🚨 مفيش تقرير أمان من: '
  }
}[LANG];

var NL = String.fromCharCode(10);
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function sum(a) { return a.reduce(function (x, y) { return x + y; }, 0); }

// The newest report per server.
var latest = {};
$input.all().forEach(function (it) {
  var r = it.json;
  if (!r.server || !r.report) return;
  if (!latest[r.server] || Number(r.ts) > Number(latest[r.server].ts)) latest[r.server] = r;
});
var expected = $('Load Status (Security)').all().map(function (i) { return i.json.server; }).filter(Boolean);

var blocks = [];
Object.keys(latest).sort().forEach(function (server) {
  var p = {}; try { p = JSON.parse(latest[server].report); } catch (e) { return; }
  var L = [], warn = 0;
  var ssh = p.ssh || {};
  var logins = (ssh.successful_logins || []).slice(0, 4).map(function (l) { return esc(l.user + '@' + l.ip) + (l.count > 1 ? ' ×' + l.count : ''); });
  L.push(T.ssh(ssh.failed_attempts || 0, ssh.failed_unique_ips || 0) + (logins.length ? T.logins + logins.join(', ') : ''));
  var sec = [];
  if (p.fail2ban) sec.push(T.f2b(p.fail2ban.bans_24h || 0));
  if (p.suricata) {
    var p1 = sum((p.suricata.top_signatures || []).filter(function (s) { return s.priority === 1; }).map(function (s) { return s.count; }));
    if (p1) warn++;
    sec.push(T.suri(p.suricata.alerts_24h || 0, p1));
  }
  var sudo = sum((p.sudo_top || []).map(function (x) { return x[1]; }));
  if (sudo) sec.push(T.sudo(sudo));
  if (sec.length) L.push(sec.join(' · '));
  var ports = p.ports || {};
  if ((ports.new || []).length) { warn++; L.push(T.newPorts + esc(ports.new.join(', '))); }
  if ((ports.closed || []).length) L.push(T.closedPorts + esc(ports.closed.join(', ')));
  if ((p.account_changes || []).length) { warn++; L.push(T.accounts(p.account_changes.length)); }
  if ((p.oom_kills || []).length) { warn++; L.push(T.oom(p.oom_kills.length)); }
  if (p.reboot_required) { warn++; L.push(T.reboot + ((p.reboot_pkgs || []).length ? ' (' + esc(p.reboot_pkgs.slice(0, 3).join(', ')) + ')' : '')); }
  if (p.security_updates_pending) warn++;
  if (p.updates_pending) L.push(T.updates(p.updates_pending, p.security_updates_pending));
  blocks.push({ server: server, warn: warn, text: (warn ? '🟠' : '🟢') + ' <b>' + esc(server) + '</b>' + NL + L.join(NL) });
});
blocks.sort(function (a, b) { return (b.warn ? 1 : 0) - (a.warn ? 1 : 0) || a.server.localeCompare(b.server); });

var missing = expected.filter(function (s) { return !latest[s]; }).sort();
var out = [T.head + DateTime.now().setZone($now.zoneName).toFormat(T.date),
  T.summary(blocks.length, blocks.filter(function (b) { return b.warn; }).length)];
if (missing.length) out.push(T.missing + esc(missing.join(', ')));
blocks.forEach(function (b) { out.push(''); out.push(b.text); });
var text = out.join(NL);
// Telegram takes 4096 characters; drop whole servers from the end (the quiet ones) until it fits.
while (text.length > 3900 && blocks.length) { blocks.pop(); text = out.slice(0, missing.length ? 3 : 2).concat(blocks.map(function (b) { return NL + b.text; })).join(NL) + NL + '…'; }
return [{ json: { message: text } }];

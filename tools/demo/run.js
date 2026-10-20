// Runs the workflow's Code nodes (n8n/code/*.js) outside n8n, on the made-up fleet in fleet.js.
// It replays five hours of reports, a few problems that came and went and a few still open,
// then writes the dashboard, the daily report, the security digest and sample alerts to out/.
//
//   npm install && node run.js          (English and Arabic)
//
// Nothing here talks to n8n or to any server.
var fs = require('fs');
var path = require('path');
var DateTime = require('luxon').DateTime;
var fleet = require('./fleet').fleet;
var NAMES = require('./fleet').NAMES;

var CODE = path.join(__dirname, '..', '..', 'n8n', 'code');
var OUT = path.join(__dirname, 'out');
var TZ = 'Europe/Berlin';
var NOW = Date.now();
var MIN = 60000;
var clock = NOW;
class FakeDate extends Date { static now() { return clock; } }

function node(file, settings, ctx) {
  var src = fs.readFileSync(path.join(CODE, file), 'utf8');
  Object.keys(settings).forEach(function (k) { src = src.replace(new RegExp('^var ' + k + ' = .*$', 'm'), 'var ' + k + ' = ' + settings[k] + ';'); });
  var items = function (list) { return { all: function () { return list.map(function (j) { return { json: j }; }); }, first: function () { return { json: list[0] }; } }; };
  var named = ctx.named || {};
  var $ = function (name) { if (!named[name]) throw new Error('no node ' + name); return items(named[name]); };
  var fn = new Function('$', '$input', 'DateTime', '$now', 'Date', src);
  return fn($, items(ctx.input || []), DateTime, DateTime.fromMillis(clock).setZone(TZ), FakeDate).map(function (i) { return i.json; });
}

function simulate(lang) {
  var L = JSON.stringify(lang);
  var known = JSON.stringify(NAMES);
  var status = {}, events = [], alerts = [];
  function report(payload, record) {
    var prev = status[payload.server];
    var out = node('evaluate-report.js', { LANG: L, KNOWN: known }, {
      named: { 'Agent Report': [{ body: JSON.parse(JSON.stringify(payload)) }] }, input: [prev || {}]
    });
    if (!out.length) throw new Error('report dropped: ' + payload.server);
    var r = out[0];
    status[r.server] = { server: r.server, online: r.online, last_seen: r.last_seen, payload: r.payload, state: r.state };
    if (record && r.message) {
      events.push({ server: r.server, kind: r.kind, message: r.message, ts: clock });
      alerts.push(r.message + (r.logs_message ? '\n\n— reply —\n' + r.logs_message : ''));
    }
  }
  function at(minutesAgo, trouble, only, record) {
    clock = NOW - minutesAgo * MIN;
    fleet(trouble).forEach(function (p) { if (!only || only.indexOf(p.server) >= 0) report(lang === 'ar' ? arabic(p) : p, record !== false); });
  }
  at(300, {}, null, false);                                   // everything joins; nothing recorded
  at(240, { restarting: true }, ['erp-1']); at(239, { restarting: true }, ['erp-1']);
  at(220, {}, ['erp-1']);                                     // fixed after 20 minutes
  at(130, { lineDown: true }, ['shop-1']); at(129, { lineDown: true }, ['shop-1']);
  at(95, {}, ['shop-1']);                                     // the backup line is back
  var now = { diskFull: true, unhealthy: true, lateBackup: true, printerDown: true, printerSince: (NOW - 27 * MIN) / 1000 };
  at(55, { diskFull: true }, ['web-2']);
  at(26, now, ['shop-2', 'erp-2']); at(25, now, ['erp-2']);
  at(0.6, now);                                               // the latest report from every server

  clock = NOW;
  var rows = NAMES.map(function (n) { return status[n]; });
  var recent = events.slice().sort(function (a, b) { return b.ts - a.ts; }).slice(0, 40);
  var html = node('build-dashboard.js', { LANG: L, SHOPS: lang === 'ar' ? "{ 'shop-1': '☕ الكافيه', 'shop-2': '🎮 الصالة' }" : "{ 'shop-1': '☕ Café, Main Street', 'shop-2': '🎮 Game lounge' }" },
    { named: { 'Load Status': rows }, input: recent })[0].html;
  var daily = node('build-daily-report.js', { LANG: L, DASHBOARD_URL: "'https://n8n.example.com/webhook/srvmon/CHANGE-ME'" },
    { named: { 'Load Status (Daily)': rows }, input: events })[0].message;
  var secRows = securityReports().map(function (r) {
    return node('check-security-report.js', { KNOWN: known }, { input: [{ body: r }] })[0];
  });
  var digest = node('build-security-digest.js', { LANG: L }, { named: { 'Load Status (Security)': rows }, input: secRows })[0].message;
  return { html: html, daily: daily, digest: digest, alerts: alerts };
}

// The Arabic demo names the shop's lines, devices and backups in Arabic, as a shop would.
var AR = {
  'Fibre': 'الفايبر', 'LTE backup': 'خط الـ 4G الاحتياطي', 'Kitchen printer': 'طابعة المطبخ', 'Bar printer': 'طابعة البار',
  'Pizza printer': 'طابعة البيتزا', 'Cashier printer': 'طابعة الكاشير', 'Console printer': 'طابعة البلايستيشن',
  'Terrace printer ⏸': 'طابعة التراس ⏸', 'Time clock': 'جهاز البصمة', 'Odoo HR': 'أودو الموظفين', 'Odoo': 'أودو', 'Postgres': 'قاعدة البيانات'
};
function arabic(p) {
  p = JSON.parse(JSON.stringify(p));
  var tr = function (s) { return AR[s] || s.replace(/^Cam (\d+)$/, 'كاميرا $1'); };
  ((p.router && p.router.lines) || []).forEach(function (l) { l.label = tr(l.label); });
  (p.devices || []).forEach(function (d) { d.name = tr(d.name); });
  (p.backups || []).forEach(function (b) { b.label = tr(b.label); });
  return p;
}

function securityReports() {
  function rep(server, o) {
    return Object.assign({
      server: server, kind: 'security', agent: '1.5', ts: new Date(NOW - 3 * 3600000).toISOString(), hostname: server,
      ssh: { failed_attempts: 0, failed_unique_ips: 0, top_failed_ips: [], top_tried_users: [], successful_logins: [] },
      fail2ban: null, suricata: null, sudo_top: [], account_changes: [], oom_kills: [],
      ports: { listening: ['0.0.0.0:22', '0.0.0.0:443'], new: [], closed: [] },
      updates_pending: 0, security_updates_pending: 0, reboot_required: false, reboot_pkgs: []
    }, o);
  }
  var admin = [{ user: 'admin', ip: '198.51.100.7', method: 'publickey', count: 3 }];
  return [
    rep('gateway', { ssh: { failed_attempts: 1874, failed_unique_ips: 212, successful_logins: admin }, fail2ban: { bans_24h: 61 }, sudo_top: [['admin: /usr/bin/systemctl restart caddy', 1]], updates_pending: 3 }),
    rep('web-1', { ssh: { failed_attempts: 2410, failed_unique_ips: 305, successful_logins: [] }, fail2ban: { bans_24h: 88 },
      suricata: { alerts_24h: 412, top_signatures: [{ sig: 'ET SCAN Suspicious inbound to mySQL port 3306', class: 'Potentially Bad Traffic', priority: 2, count: 260 }], top_sources: [], priority1_samples: [] } }),
    rep('web-2', { ssh: { failed_attempts: 960, failed_unique_ips: 140, successful_logins: [] }, fail2ban: { bans_24h: 22 },
      ports: { listening: ['0.0.0.0:22', '0.0.0.0:443', '0.0.0.0:8080'], new: ['0.0.0.0:8080'], closed: [] }, updates_pending: 14, security_updates_pending: 6 }),
    rep('erp-1', { ssh: { failed_attempts: 0, failed_unique_ips: 0, successful_logins: admin }, sudo_top: [['admin: /usr/bin/docker compose pull', 2]], reboot_required: true, reboot_pkgs: ['linux-image-6.8.0-47-generic'] }),
    rep('erp-2', { oom_kills: ['2026-10-20T03:12:09+0000 erp-2 kernel: Out of memory: Killed process 81234 (odoo)'], updates_pending: 2 }),
    rep('shop-1', { ssh: { failed_attempts: 0, failed_unique_ips: 0, successful_logins: [] }, updates_pending: 7, security_updates_pending: 2 })
  ];
}

fs.mkdirSync(OUT, { recursive: true });
['en', 'ar'].forEach(function (lang) {
  var r = simulate(lang);
  fs.writeFileSync(path.join(OUT, 'dashboard-' + lang + '.html'), r.html);
  fs.writeFileSync(path.join(OUT, 'daily-' + lang + '.txt'), r.daily + '\n');
  fs.writeFileSync(path.join(OUT, 'security-' + lang + '.txt'), r.digest + '\n');
  fs.writeFileSync(path.join(OUT, 'alerts-' + lang + '.txt'), r.alerts.join('\n\n==========\n\n') + '\n');
  console.log(lang + ': dashboard ' + r.html.length + ' bytes, ' + r.alerts.length + ' alerts');
});

// srvmon · Build Daily Report
// The morning summary on Telegram: one line per server, the shops, the sites, and what
// happened in the last 24 hours.

// ---- settings ---------------------------------------------------------------------------
var LANG = 'en';  // 'en', or 'ar' for Egyptian Arabic
var DASHBOARD_URL = '';  // optional, e.g. 'https://n8n.example.com/webhook/srvmon/<dashboard token>'
// -------------------------------------------------------------------------------------------

var T = {
  en: {
    head: '📊 <b>Daily server report</b> · ', online: function (a, b) { return 'Servers: ' + a + '/' + b + ' online'; },
    open: function (n) { return ' · ⚠️ ' + n + ' open'; }, stale: function (n) { return ' · 💾 ' + n + ' late backup' + (n > 1 ? 's' : ''); },
    shop: function (s, l, d) { return '🏪 <b>' + s + '</b>' + (l ? ': lines ' + l : '') + (d ? (l ? ' · ' : ': ') + 'devices ' + d : ''); },
    sites: function (a, b) { return '🌐 Sites: ' + a + '/' + b + ' up'; }, ssl: function (d) { return ' certificate expires in ' + d + ' days'; },
    day: function (a, f) { return '🔔 Last 24 hours: ' + a + ' alert' + (a === 1 ? '' : 's') + ', ' + f + ' resolved'; },
    link: 'Open the dashboard', date: 'd MMM yyyy'
  },
  ar: {
    head: '📊 <b>تقرير السيرفرات</b> · ', online: function (a, b) { return 'السيرفرات: ' + a + '/' + b + ' أونلاين'; },
    open: function (n) { return ' · ⚠️ ' + n + ' مشكلة'; }, stale: function (n) { return ' · 💾 ' + n + ' باك أب متأخر'; },
    shop: function (s, l, d) { return '🏪 <b>' + s + '</b>' + (l ? ': خطوط النت ' + l : '') + (d ? (l ? ' · ' : ': ') + 'الأجهزة ' + d : ''); },
    sites: function (a, b) { return '🌐 المواقع: ' + a + '/' + b + ' شغالة'; }, ssl: function (d) { return ' شهادته فاضلها ' + d + ' يوم'; },
    day: function (a, f) { return '🔔 آخر 24 ساعة: ' + a + ' تنبيه، و ' + f + ' اتحلّت'; },
    link: 'افتح الداشبورد', date: 'dd/MM/yyyy'
  }
}[LANG];

var NL = String.fromCharCode(10);
var TZ = $now.zoneName;
var now = Date.now();
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
var rows = $('Load Status (Daily)').all().map(function (i) { return i.json; }).filter(function (r) { return r.server; });
rows.sort(function (a, b) { return a.server.localeCompare(b.server); });
var events = $input.all().map(function (i) { return i.json; }).filter(function (e) { return e.server; });
var lines = [], shops = [], allSites = [], up = 0;
rows.forEach(function (r) {
  var p = {}; try { p = JSON.parse(r.payload || '{}'); } catch (e) {}
  var st = {}; try { st = JSON.parse(r.state || '{}'); } catch (e) {}
  var isOn = r.online !== false && now - Number(r.last_seen) < 180000;
  if (isOn) up++;
  var dmax = (p.disks || []).reduce(function (m, d) { return Math.max(m, d.pct); }, 0);
  var ctr = p.containers || [];
  var run = ctr.filter(function (c) { return c.status === 'running'; }).length;
  var act = Object.keys(st.active || {}).filter(function (k) { return st.active[k].notified; }).length;
  var late = (p.backups || []).filter(function (b) { return b.age_h == null || b.age_h > (b.max_age_h || 30); }).length;
  lines.push((isOn ? (act ? '🟠' : '🟢') : '🔴') + ' <b>' + esc(r.server) + '</b>: CPU ' + p.cpu_pct + '% · RAM ' + (p.mem ? p.mem.pct : '?') + '% · Disk ' + dmax + '%'
    + (ctr.length ? ' · 🐳 ' + run + '/' + ctr.length : '') + (act ? T.open(act) : '') + (late ? T.stale(late) : ''));
  var ln = (p.router && p.router.lines) || [], dv = p.devices || [];
  if (ln.length || dv.length) {
    var lu = ln.filter(function (l) { return l.up; }).length, du = dv.filter(function (d) { return d.up; }).length;
    shops.push(T.shop(esc(r.server), ln.length ? lu + '/' + ln.length : '', dv.length ? du + '/' + dv.length : ''));
  }
  (p.sites || []).forEach(function (s) { allSites.push(s); });
});
var down = allSites.filter(function (s) { return s.error || !s.status || s.status >= 500; });
var sslSoon = allSites.filter(function (s) { return s.ssl_days != null && s.ssl_days < 30; });
var alerts = events.filter(function (e) { return e.kind === 'alert' || e.kind === 'down'; }).length;
var fixed = events.filter(function (e) { return e.kind === 'up' || e.kind === 'resolved'; }).length;
var L = [T.head + DateTime.now().setZone(TZ).toFormat(T.date), T.online(up, rows.length), ''];
L = L.concat(lines);
if (shops.length) { L.push(''); L = L.concat(shops); }
if (allSites.length) {
  L.push('');
  L.push(T.sites(allSites.length - down.length, allSites.length));
  down.forEach(function (s) { L.push('   🔴 ' + esc(s.host) + ': ' + esc(s.error || ('HTTP ' + s.status))); });
  sslSoon.forEach(function (s) { L.push('   🔒 ' + esc(s.host) + T.ssl(s.ssl_days)); });
}
L.push('');
L.push(T.day(alerts, fixed));
events.sort(function (a, b) { return b.ts - a.ts; }).slice(0, 8).forEach(function (e) {
  var body = String(e.message || '').replace(/<[^>]+>/g, '').split(NL).slice(1).join(' / ');
  L.push('   • ' + DateTime.fromMillis(Number(e.ts)).setZone(TZ).toFormat('HH:mm') + ' ' + esc(e.server) + ': ' + body.slice(0, 140).replace(/&[a-z]*$/, ''));
});
if (DASHBOARD_URL) { L.push(''); L.push('🔗 <a href="' + esc(DASHBOARD_URL) + '">' + T.link + '</a>'); }
// Telegram takes 4096 characters; drop whole lines so no HTML tag is cut in half.
while (L.join(NL).length > 3900 && L.length > 3) L.splice(L.length - 2, 1);
return [{ json: { message: L.join(NL) } }];

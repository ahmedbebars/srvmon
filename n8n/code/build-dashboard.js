// srvmon · Build Dashboard
// One HTML page: open problems, a card per shop (internet lines, router, devices), a card per
// server, the sites table and the latest events. It refreshes itself every minute and follows
// the browser's light or dark theme.

// ---- settings ---------------------------------------------------------------------------
var LANG = 'en';  // 'en', or 'ar' for Egyptian Arabic (the page turns right to left)
// Display names for servers that watch a shop's router and devices, e.g. { 'shop-1': '☕ Main street café' }.
// Any server that sends router or device data gets a shop card, named or not.
var SHOPS = {};
// -------------------------------------------------------------------------------------------

var T = {
  en: {
    s: ' s', m: ' min', h: ' h', d: ' d', day: ' d ', hr: ' h ',
    noNet: 'no internet from the provider', unplugged: 'cable unplugged', inUse: 'in use',
    lbl: { printer: '🖨 Printers', camera: '🎥 Cameras', nvr: '📹 NVR', iot: '📟 IoT box', clock: '👆 Time clock' },
    router: '📡 Router', lines: '🌐 Internet lines', upFor: 'up ', connected: '👥 Connected', ports: '🔗 Ports', devices: '🏪 Devices',
    via: 'via', stale: '⚠️ This data is old; the server has not reported for ', silent: '🚨 No report for ',
    running: ' running', servicesRunning: ' running', backups: '💾 Backups', newest: function (h) { return ' · newest ' + h + ' h old'; },
    noCopy: ': no copy', hOld: function (h) { return ': ' + h + ' h old'; }, details: 'Containers and services', pressure: 'pressure ',
    days: ' d', allGood: 'All good ✅', since: 'for ', noEvents: 'No events yet',
    kProblems: 'Open problems', kOnline: 'Servers online', kLines: 'Internet lines', kDevices: 'Shop devices', kSites: 'Sites up', kCtr: 'Containers running',
    title: 'Server Monitor', h1: '🖥 Servers and shops', updated: 'Updated ', refresh: ' · refreshes every minute',
    nProblems: '⚠️ Problems', nShops: '🏪 Shops', nServers: '🖥 Servers', nSites: '🌐 Sites', nEvents: '🔔 Events',
    hProblems: '⚠️ Open problems', hShops: '🏪 Shops', hServers: '🖥 Servers', hSites: '🌐 Sites', hEvents: '🔔 Recent events',
    thHost: 'Host', thServer: 'Server', thStatus: 'Status', thTime: 'Time', thSsl: 'TLS',
    printerWord: /\s+printer(?=\s|$)/i, short: 'd MMM HH:mm', long: 'd MMM yyyy, HH:mm:ss'
  },
  ar: {
    s: ' ث', m: ' د', h: ' س', d: ' يوم', day: ' يوم ', hr: ' س ',
    noNet: 'مفيش نت من الشركة', unplugged: 'الكابل مفصول', inUse: 'مستخدم',
    lbl: { printer: '🖨 الطابعات', camera: '🎥 الكاميرات', nvr: '📹 NVR', iot: '📟 IoT box', clock: '👆 البصمة' },
    router: '📡 الراوتر', lines: '🌐 خطوط النت', upFor: 'شغال من ', connected: '👥 أجهزة متصلة', ports: '🔗 البورتات', devices: '🏪 أجهزة المحل',
    via: 'عبر سيرفر', stale: '⚠️ البيانات دي قديمة، السيرفر مبعتش من ', silent: '🚨 مش بيبعت من ',
    running: ' شغال', servicesRunning: ' شغالة', backups: '💾 الباك أب', newest: function (h) { return ' · آخر نسخة من ' + h + ' س'; },
    noCopy: ': مفيش نسخ', hOld: function (h) { return ': من ' + h + ' س'; }, details: 'تفاصيل الكونتينرات والخدمات', pressure: 'ضغط ',
    days: ' يوم', allGood: 'كله تمام ✅', since: 'من ', noEvents: 'مفيش أحداث لسه',
    kProblems: 'مشاكل مفتوحة', kOnline: 'سيرفرات أونلاين', kLines: 'خطوط النت', kDevices: 'أجهزة المحلات', kSites: 'مواقع شغالة', kCtr: 'كونتينرات شغالة',
    title: 'مراقبة السيرفرات', h1: '🖥 مراقبة السيرفرات والمحلات', updated: 'آخر تحديث ', refresh: ' · الصفحة بتتحدث كل دقيقة',
    nProblems: '⚠️ المشاكل', nShops: '🏪 المحلات', nServers: '🖥 السيرفرات', nSites: '🌐 المواقع', nEvents: '🔔 الأحداث',
    hProblems: '⚠️ المشاكل المفتوحة', hShops: '🏪 المحلات', hServers: '🖥 السيرفرات', hSites: '🌐 المواقع', hEvents: '🔔 آخر الأحداث',
    thHost: 'الدومين', thServer: 'السيرفر', thStatus: 'الحالة', thTime: 'الرد', thSsl: 'SSL',
    printerWord: /^طابعة\s+/, short: 'dd/MM HH:mm', long: 'dd/MM/yyyy HH:mm:ss'
  }
}[LANG];
var RTL = LANG === 'ar';

var NL = String.fromCharCode(10);
var TZ = $now.zoneName;
var now = Date.now();
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function ago(ms) { var s = Math.max(0, Math.round(ms / 1000)); if (s < 90) return s + T.s; var m = Math.round(s / 60); if (m < 90) return m + T.m; var h = Math.round(m / 60); if (h < 48) return h + T.h; return Math.round(h / 24) + T.d; }
function upt(h) { if (h == null) return '?'; var d = Math.floor(h / 24); return d ? d + T.day + Math.round(h % 24) + T.h : Math.round(h) + T.h; }
function hdur(s) { s = Number(s) || 0; var d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60); return d ? d + T.day + h + T.h : (h ? h + T.hr + m + T.m : m + T.m); }
function mbps(b) { return b == null ? '—' : (b >= 1e6 ? (b / 1e6).toFixed(1) + ' Mbps' : Math.round(b / 1e3) + ' kbps'); }
function bar(p) { p = Number(p) || 0; var c = p >= 90 ? 'bad' : (p >= 75 ? 'warn' : 'ok'); return '<div class="bar"><i class="' + c + '" style="width:' + Math.min(100, p) + '%"></i></div>'; }
function when(ms) { return DateTime.fromMillis(Number(ms)).setZone(TZ).toFormat(T.short); }
// Values stay left to right inside an Arabic page; without dir=ltr the bidi algorithm reorders them (/boot shows as boot/).
function val(s) { return '<span class="v" dir="ltr">' + esc(s) + '</span>'; }
function row(label, value) { return '<div class="row"><span>' + label + '</span>' + val(value) + '</div>'; }
function badge(n) { return n ? '<span class="badge">⚠️ ' + n + '</span>' : ''; }
// A shop is watched from the server that sits in it; its alert keys are counted on the shop card, not the server card.
function isShopKey(k) { return /^(wan|router|port|dev):/.test(k); }
function shopName(server) { return SHOPS[server] || '🏪 ' + server; }

function lineHtml(l, inUse) {
  var st = l.up ? val('↓ ' + mbps(l.rx_bps) + '   ↑ ' + mbps(l.tx_bps)) : (l.running ? T.noNet : T.unplugged);
  return '<div class="line ' + (l.up ? 'ok' : 'bad') + '"><div class="lt"><span>' + (l.up ? '🟢' : '🔴') + ' ' + esc(l.label) + '</span>'
    + (inUse ? '<span class="tag">' + T.inUse + '</span>' : '') + '</div><div class="ls">' + st + '</div></div>';
}
function chip(d, isPrinter) {
  var nm = String(d.name || d.id || '');
  if (isPrinter) nm = nm.replace(T.printerWord, '');
  var cls = d.up ? (d.quiet || d.off ? 'zz' : 'ok') : 'bad';
  return '<span class="chip ' + cls + '" title="' + esc(d.id || '') + '">' + esc(nm) + (!d.up && d.since ? ' <small>· ' + ago(now - d.since * 1000) + '</small>' : '') + '</span>';
}
function devicesHtml(dv) {
  var grp = {}, order = [];
  dv.forEach(function (d) { var k = d.group || 'other'; if (!grp[k]) { grp[k] = { up: 0, list: [] }; order.push(k); } grp[k].list.push(d); if (d.up) grp[k].up++; });
  var keys = ['printer', 'camera', 'nvr', 'iot', 'clock'].filter(function (k) { return grp[k]; }).concat(order.filter(function (k) { return !T.lbl[k]; }));
  return keys.map(function (k) {
    var g = grp[k], n = g.list.length;
    // Small groups list every device; single devices and big groups (27 cameras) only show the ones that are down.
    var list = n > 1 && n <= 6 ? g.list : g.list.filter(function (d) { return !d.up; });
    return '<div class="dg"><div class="row"><span>' + (T.lbl[k] || esc(k)) + '</span><b class="' + (g.up === n ? 'g' : 'r') + '" dir="ltr">' + g.up + '/' + n + '</b></div>'
      + (list.length ? '<div class="chips">' + list.map(function (d) { return chip(d, k === 'printer'); }).join('') + '</div>' : '') + '</div>';
  }).join('');
}
function shopCard(server, p, nProb, isOn, lastSeen) {
  var rt = p.router, dv = p.devices || [], net = '', dev = '';
  if (rt && rt.error) net = '<div class="sec">' + T.router + '</div><div class="bad-list" dir="ltr">' + esc(rt.error) + '</div>';
  else if (rt) {
    var ports = rt.ports || [], pd = ports.filter(function (x) { return !x.running; });
    net = '<div class="sec">' + T.lines + '</div>' + (rt.lines || []).map(function (l) { return lineHtml(l, rt.line_in_use === l.id); }).join('')
      + '<div class="sec">' + T.router + ' <span class="muted"><bdi dir="ltr">' + esc(rt.model || '') + ' · ' + esc(String(rt.version || '').replace(/\s*\(.*\)$/, '')) + '</bdi> · ' + T.upFor + hdur(rt.uptime_s) + '</span></div>'
      + row('🧮 CPU / RAM', rt.cpu_pct + '% · ' + rt.mem_pct + '%')
      + row(T.connected, rt.dhcp_bound + (rt.wlan_clients != null ? ' · wifi ' + rt.wlan_clients : '') + (rt.hotspot_users != null ? ' · hotspot ' + rt.hotspot_users : ''))
      + (ports.length ? '<div class="row"><span>' + T.ports + '</span><b class="' + (pd.length ? 'r' : 'g') + '" dir="ltr">' + (ports.length - pd.length) + '/' + ports.length + '</b></div>'
        + '<div class="chips">' + ports.map(function (x) { return '<span class="chip ' + (x.running ? 'ok' : 'bad') + '" dir="ltr">' + esc(x.name) + '</span>'; }).join('') + '</div>' : '');
  }
  if (dv.length) dev = '<div class="sec">' + T.devices + '</div>' + devicesHtml(dv);
  return '<div class="card shop' + (!isOn ? ' down' : (nProb ? ' warn' : '')) + '">'
    + '<div class="hd"><b class="big">' + esc(shopName(server)) + '</b><small>' + T.via + ' <bdi dir="ltr">' + esc(server) + '</bdi></small><span class="ago">' + badge(nProb) + '</span></div>'
    + (isOn ? '' : '<div class="bad-list txt">' + T.stale + ago(now - lastSeen) + '</div>')
    + '<div class="cols"><div>' + net + '</div>' + (dev ? '<div>' + dev + '</div>' : '') + '</div></div>';
}

var rows = $('Load Status').all().map(function (i) { return i.json; }).filter(function (r) { return r.server; });
var events = $input.all().map(function (i) { return i.json; }).filter(function (e) { return e.server; });
var problems = [], sites = [], srv = [], shops = [], online = 0, ctrTotal = 0, ctrRun = 0, linesUp = 0, linesAll = 0, devUp = 0, devAll = 0;
rows.forEach(function (r) {
  var p = {}; try { p = JSON.parse(r.payload || '{}'); } catch (e) {}
  var st = {}; try { st = JSON.parse(r.state || '{}'); } catch (e) {}
  var last = Number(r.last_seen);
  var isOn = r.online !== false && (now - last) < 180000;
  if (isOn) online++; else problems.push({ who: '🖥 ' + r.server, msg: T.silent + ago(now - last) });
  var act = st.active || {}, nSrv = 0, nShop = 0;
  Object.keys(act).forEach(function (k) {
    if (!act[k].notified) return;
    var shop = isShopKey(k);
    if (shop) nShop++; else nSrv++;
    problems.push({ who: shop ? shopName(r.server) : '🖥 ' + r.server, msg: act[k].msg, since: act[k].since });
  });
  (p.sites || []).forEach(function (s) { sites.push(s); });
  if (p.router || (p.devices || []).length) {
    shops.push({ name: r.server, html: shopCard(r.server, p, nShop, isOn, last) });
    ((p.router && p.router.lines) || []).forEach(function (l) { linesAll++; if (l.up) linesUp++; });
    (p.devices || []).forEach(function (d) { devAll++; if (d.up) devUp++; });
  }
  var ctr = p.containers || [];
  var running = ctr.filter(function (c) { return c.status === 'running'; }).length;
  ctrTotal += ctr.length; ctrRun += running;
  var badCtr = ctr.filter(function (c) { return c.status !== 'running' || c.health === 'unhealthy'; });
  var failed = p.failed_units || [];
  var bks = p.backups || [];
  var oldBk = bks.filter(function (b) { return b.age_h == null || b.age_h > (b.max_age_h || 30); });
  var newestBk = bks.length ? Math.round(Math.min.apply(null, bks.map(function (b) { return b.age_h == null ? 1e9 : b.age_h; }))) : '';
  var disks = (p.disks || []).map(function (d) { return row('💾 <bdi dir="ltr">' + esc(d.mount) + '</bdi>', d.pct + '% · ' + d.used_gb + '/' + d.total_gb + 'G') + bar(d.pct); }).join('');
  var html = '<div class="card' + (!isOn ? ' down' : (nSrv ? ' warn' : '')) + '">'
    + '<div class="hd"><span class="dot ' + (isOn ? 'on' : 'off') + '"></span><b>' + esc(r.server) + '</b><small dir="ltr">' + esc(p.hostname || '') + '</small>'
    + (p.router || (p.devices || []).length ? '<small class="shoptag">' + esc(shopName(r.server)) + '</small>' : '') + '<span class="ago">' + badge(nSrv) + ' <small>' + ago(now - last) + '</small></span></div>'
    + '<div class="meta"><bdi dir="ltr">' + esc(p.os || '') + ' · ' + esc(p.ncpu || '?') + ' CPU</bdi> · ' + T.upFor + upt(p.uptime_h) + '</div>'
    + row('🔥 CPU', (p.cpu_pct != null ? p.cpu_pct : '?') + '% · load ' + (p.load || []).join(' / ')) + bar(p.cpu_pct)
    // Memory pressure is words and a number; it gets its own isolate so it reads right in both directions.
    + '<div class="row"><span>🧠 RAM</span><span class="v">' + (p.mem ? val(p.mem.pct + '% · ' + p.mem.used_gb + '/' + p.mem.total_gb + 'G')
      + (p.mem.psi_some60 != null ? ' · <bdi>' + T.pressure + '<span dir="ltr">' + esc(p.mem.psi_some60) + '%</span></bdi>' : '') : '?') + '</span></div>' + bar(p.mem ? p.mem.pct : 0)
    + disks
    + '<div class="row"><span>🐳 Docker</span><span>' + (ctr.length ? running + '/' + ctr.length + T.running : '—') + '</span></div>'
    + (badCtr.length ? '<div class="bad-list" dir="ltr">' + badCtr.map(function (c) { return esc(c.name) + ' (' + esc(c.health === 'unhealthy' ? 'unhealthy' : c.status) + ')'; }).join('<br>') + '</div>' : '')
    + '<div class="row"><span>⚙️ Services</span><span>' + esc(p.services_running || 0) + T.servicesRunning + (failed.length ? ' · <b class="r">' + failed.length + ' failed</b>' : '') + '</span></div>'
    + (failed.length ? '<div class="bad-list" dir="ltr">' + failed.map(esc).join('<br>') + '</div>' : '')
    + (bks.length ? '<div class="row"><span>' + T.backups + '</span><span class="' + (oldBk.length ? 'r' : 'g') + '">' + (bks.length - oldBk.length) + '/' + bks.length + esc(T.newest(newestBk)) + '</span></div>'
      + (oldBk.length ? '<div class="bad-list txt">' + oldBk.map(function (b) { return esc(b.label) + (b.age_h == null ? T.noCopy : esc(T.hOld(Math.round(b.age_h)))); }).join('<br>') + '</div>' : '') : '')
    + '<details><summary>' + T.details + '</summary><div class="small">'
    + ctr.map(function (c) { return '<div>' + (c.status === 'running' ? (c.health === 'unhealthy' ? '🟠' : '🟢') : '🔴') + ' ' + esc(c.name) + ' <span class="muted">' + esc(c.image || '') + '</span></div>'; }).join('')
    + (ctr.length ? '<hr>' : '') + (p.services || []).map(function (s) { return '<div>⚙️ ' + esc(s) + '</div>'; }).join('')
    + '</div></details></div>';
  // Servers that are down or have open problems move to the front.
  srv.push({ name: r.server, rank: !isOn ? 0 : (nSrv || badCtr.length || failed.length || oldBk.length ? 1 : 2), html: html });
});
srv.sort(function (a, b) { return (a.rank - b.rank) || a.name.localeCompare(b.name); });
shops.sort(function (a, b) { return a.name.localeCompare(b.name); });
sites.sort(function (a, b) { return String(a.owner || '').localeCompare(String(b.owner || '')) || a.host.localeCompare(b.host); });
var sitesUp = sites.filter(function (s) { return !s.error && s.status && s.status < 500; }).length;
var siteRows = sites.map(function (s) {
  var ok = !s.error && s.status && s.status < 500;
  var sc = s.ssl_days == null ? '' : (s.ssl_days < 14 ? 'r' : (s.ssl_days < 30 ? 'y' : ''));
  return '<tr><td class="host" dir="ltr"><a href="https://' + esc(s.host) + '" target="_blank" rel="noopener noreferrer">' + esc(s.host) + '</a></td><td>' + esc(s.owner || '') + '</td><td class="' + (ok ? 'g' : 'r') + '">' + esc(s.error || s.status) + '</td><td>' + (s.ms != null ? '<bdi dir="ltr">' + esc(s.ms) + ' ms</bdi>' : '') + '</td><td class="' + sc + '">' + (s.ssl_days != null ? esc(s.ssl_days) + T.days : '—') + '</td></tr>';
}).join('');
var probHtml = problems.length ? problems.map(function (p) { return '<li><b>' + esc(p.who) + '</b> ' + esc(p.msg) + (p.since ? ' <span class="muted">' + T.since + ago(now - p.since) + '</span>' : '') + '</li>'; }).join('') : '<li class="g">' + T.allGood + '</li>';
var evHtml = events.length ? events.map(function (e) {
  var lines = String(e.message || '').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').split(NL);
  var body = lines.length > 1 ? lines.slice(1) : lines;
  return '<li><span class="muted">' + when(e.ts) + '</span> <b>' + esc(e.server) + '</b> ' + esc(body.join(' · ').replace(/^[🔴✅🆕🚨]\s*/u, '')) + '</li>';
}).join('') : '<li class="muted">' + T.noEvents + '</li>';
var kpi = function (label, a, b, cls) { return '<div class="kpi">' + label + '<b class="' + cls + '" dir="ltr">' + a + (b != null ? '/' + b : '') + '</b></div>'; };
var css = ":root{--bg:#f4f6f8;--card:#fff;--fg:#1d2329;--muted:#6b7682;--line:#e3e7eb;--ok:#1f9d55;--warn:#d69e2e;--bad:#e03e3e}"
  + "@media (prefers-color-scheme:dark){:root{--bg:#0f1418;--card:#182027;--fg:#e6edf3;--muted:#8b98a5;--line:#26313b}}"
  + "*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;font-family:system-ui,'Segoe UI',Tahoma,sans-serif;background:var(--bg);color:var(--fg);padding:16px;max-width:1400px;margin-inline:auto;overflow-x:hidden}"
  + "h1{font-size:20px;margin:0}h2{font-size:16px;margin:0 0 10px;display:flex;align-items:center;gap:8px}h2 .muted{font-weight:400;font-size:12px}.sub{color:var(--muted);font-size:12px;margin-top:2px}"
  + ".nav{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}.nav a{font-size:12px;text-decoration:none;border:1px solid var(--line);background:var(--card);border-radius:999px;padding:3px 11px}"
  + ".sum{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin:14px 0}.kpi{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 14px;font-size:12px;color:var(--muted)}.kpi b{font-size:22px;display:block;color:var(--fg);text-align:end}"
  + ".grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,290px),1fr));gap:12px}"
  + ".shops{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,560px),1fr));gap:12px}"
  + ".cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr));gap:0 22px}.cols>div>.sec:first-child{border-top:0;padding-top:0}"
  + ".card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px;min-width:0;display:flex;flex-direction:column}.card.down{border-color:var(--bad);box-shadow:0 0 0 1px var(--bad)}.card.warn{border-color:var(--warn)}"
  + ".hd{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.hd small{color:var(--muted);font-size:11px}.ago{margin-inline-start:auto;display:flex;align-items:center;gap:6px}.big{font-size:17px}.shoptag{border:1px solid var(--line);border-radius:999px;padding:0 7px}"
  + ".badge{background:var(--warn);color:#1d2329;border-radius:999px;padding:1px 8px;font-size:11px;font-weight:600}"
  + ".dot{width:10px;height:10px;border-radius:50%;flex:none}.on{background:var(--ok)}.off{background:var(--bad)}"
  + ".meta{color:var(--muted);font-size:12px;margin:4px 0 6px}.row{display:flex;justify-content:space-between;gap:8px;font-size:13px;margin-top:7px}.v{font-variant-numeric:tabular-nums;white-space:pre-wrap}"
  + ".sec{margin-top:14px;padding-top:10px;border-top:1px solid var(--line);font-size:13px;font-weight:600}.sec .muted{font-weight:400;font-size:11px}"
  + ".line{border:1px solid var(--line);border-inline-start:4px solid var(--ok);border-radius:8px;padding:7px 10px;margin-top:7px}.line.bad{border-inline-start-color:var(--bad)}"
  + ".lt{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:13px}.ls{font-size:12px;color:var(--muted);margin-top:3px}.line.bad .ls{color:var(--bad)}"
  + ".tag{color:var(--ok);border:1px solid var(--ok);border-radius:999px;padding:0 8px;font-size:11px;white-space:nowrap}"
  + ".dg{margin-bottom:4px}.chips{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}.chip{font-size:12px;border-radius:999px;padding:2px 9px;border:1px solid var(--line);white-space:nowrap}"
  + ".chip.ok{border-color:var(--ok);color:var(--ok)}.chip.bad{background:var(--bad);border-color:var(--bad);color:#fff}.chip.bad small{opacity:.85}.chip.zz{color:var(--muted)}"
  + ".bar{height:6px;background:var(--line);border-radius:3px;overflow:hidden;margin-top:3px}.bar i{display:block;height:100%}.bar .ok{background:var(--ok)}.bar .warn{background:var(--warn)}.bar .bad{background:var(--bad)}"
  + ".bad-list{color:var(--bad);font-size:12px;margin-top:4px;text-align:left}.bad-list.txt{text-align:start}.small{font-size:12px;max-height:260px;overflow:auto;direction:ltr;text-align:left}.small div{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"
  + ".card details{margin-top:auto;padding-top:12px}summary{cursor:pointer;color:var(--muted);font-size:12px}hr{border:0;border-top:1px solid var(--line)}"
  + ".muted{color:var(--muted)}.g{color:var(--ok)}.r{color:var(--bad)}.y{color:var(--warn)}"
  + "section{margin-top:24px;scroll-margin-top:12px}.box{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px}"
  + ".two{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,520px),1fr));gap:12px;align-items:start;margin-top:24px}.two>section{margin-top:0}"
  + ".tw{overflow-x:auto;border:1px solid var(--line);border-radius:12px}table{width:100%;border-collapse:collapse;background:var(--card);font-size:13px}"
  + "td,th{padding:7px 10px;border-bottom:1px solid var(--line);text-align:start;white-space:nowrap}" + (RTL ? "td.host{text-align:right}" : "") + "th{color:var(--muted);font-weight:500}a{color:inherit}"
  + "ul{margin:0;padding-inline-start:18px}li{margin:5px 0;font-size:13px}.ev{max-height:640px;overflow:auto}"
  + "@media (max-width:600px){body{padding:12px}.sum{grid-template-columns:1fr 1fr}td,th{padding:6px 5px;font-size:11.5px}td.host{white-space:normal;word-break:break-all}}";
var html = '<!doctype html><html lang="' + LANG + '" dir="' + (RTL ? 'rtl' : 'ltr') + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><meta http-equiv="refresh" content="60"><title>' + T.title + '</title><style>' + css + '</style></head><body>'
  + '<h1>' + T.h1 + '</h1><div class="sub">' + T.updated + DateTime.now().setZone(TZ).toFormat(T.long) + T.refresh + '</div>'
  + '<nav class="nav"><a href="#problems">' + T.nProblems + '</a>' + (shops.length ? '<a href="#shops">' + T.nShops + '</a>' : '') + '<a href="#servers">' + T.nServers + '</a><a href="#sites">' + T.nSites + '</a><a href="#events">' + T.nEvents + '</a></nav>'
  + '<div class="sum">'
  + kpi(T.kProblems, problems.length, null, problems.length ? 'r' : 'g')
  + kpi(T.kOnline, online, rows.length, online === rows.length ? 'g' : 'r')
  + (linesAll ? kpi(T.kLines, linesUp, linesAll, linesUp === linesAll ? 'g' : 'r') : '')
  + (devAll ? kpi(T.kDevices, devUp, devAll, devUp === devAll ? 'g' : 'r') : '')
  + kpi(T.kSites, sitesUp, sites.length, sitesUp === sites.length ? 'g' : 'r')
  + kpi(T.kCtr, ctrRun, ctrTotal, '')
  + '</div>'
  + '<section id="problems" class="box"><h2>' + T.hProblems + '</h2><ul>' + probHtml + '</ul></section>'
  + (shops.length ? '<section id="shops"><h2>' + T.hShops + '</h2><div class="shops">' + shops.map(function (s) { return s.html; }).join('') + '</div></section>' : '')
  + '<section id="servers"><h2>' + T.hServers + ' <span class="muted" dir="ltr">' + online + '/' + rows.length + '</span></h2><div class="grid">' + srv.map(function (s) { return s.html; }).join('') + '</div></section>'
  + '<div class="two"><section id="sites"><h2>' + T.hSites + ' <span class="muted" dir="ltr">' + sitesUp + '/' + sites.length + '</span></h2><div class="tw"><table><tr><th>' + T.thHost + '</th><th>' + T.thServer + '</th><th>' + T.thStatus + '</th><th>' + T.thTime + '</th><th>' + T.thSsl + '</th></tr>' + siteRows + '</table></div></section>'
  + '<section id="events" class="box"><h2>' + T.hEvents + '</h2><ul class="ev">' + evHtml + '</ul></section></div>'
  + '</body></html>';
return [{ json: { html: html } }];

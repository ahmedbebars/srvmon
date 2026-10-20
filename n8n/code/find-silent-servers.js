// srvmon · Find Silent Servers
// Runs every minute. A server that has sent nothing for SILENT_MS is marked down, once;
// Evaluate Report says "back online" when it reports again.

// ---- settings ---------------------------------------------------------------------------
var LANG = 'en';  // 'en', or 'ar' for Egyptian Arabic
var SILENT_MS = 180000;
// -------------------------------------------------------------------------------------------

var T = {
  en: function (min, at) { return '🚨 No report for ' + min + ' minutes (the last one came at ' + at + '). The server is down, or its network is cut'; },
  ar: function (min, at) { return '🚨 السيرفر مبعتش أي قراءة من ' + min + ' دقيقة (آخر قراءة ' + at + '). يا إما واقع يا إما النت عنده مقطوع'; }
}[LANG];

var NL = String.fromCharCode(10);
var now = Date.now();
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
var out = [];
$input.all().forEach(function (it) {
  var r = it.json;
  if (!r.server || r.online === false) return;
  var age = now - Number(r.last_seen);
  if (age > SILENT_MS) {
    var at = DateTime.fromMillis(Number(r.last_seen)).setZone($now.zoneName).toFormat('HH:mm');
    out.push({ json: { server: r.server, online: false, last_seen: Number(r.last_seen), payload: r.payload, state: r.state, kind: 'down', message: '<b>🖥 ' + esc(r.server) + '</b>' + NL + T(Math.round(age / 60000), at), logs_message: '' } });
  }
});
return out;

// srvmon · Check Security Report
// Each agent posts a summary of its last 24 hours once a day (srvmon-agent --security).
// Keep it only if it comes from a known server and is a sane size; the digest is built later.

// ---- settings ---------------------------------------------------------------------------
var KNOWN = ['web-1', 'web-2', 'erp-1', 'shop-1'];  // the same list as in Evaluate Report
// -------------------------------------------------------------------------------------------

var body = $input.first().json.body || {};
var server = String(body.server || '').trim();
if (KNOWN.indexOf(server) < 0 || body.kind !== 'security') return [];
var raw = JSON.stringify(body);
if (raw.length > 300000) return [];
return [{ json: { server: server, ts: Date.now(), report: raw } }];

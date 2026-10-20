// A made-up fleet for the demo: five servers in a data centre and two shops.
// Every name, address and number here is invented.

var OS = 'Ubuntu 24.04.1 LTS', KERNEL = '6.8.0-45-generic';
var BASE_SERVICES = ['docker', 'fail2ban', 'nginx', 'tailscaled', 'ufw'];

function ctr(name, image, extra) {
  return Object.assign({ name: name, status: 'running', health: 'healthy', restart: 'unless-stopped', exit_code: 0, started: '2026-10-12T03:10:44', image: image }, extra || {});
}

var SITES = [
  ['example.com', 'web-1', 41], ['www.example.com', 'web-1', 41], ['shop.example.com', 'web-1', 63],
  ['blog.example.org', 'web-2', 77], ['docs.example.org', 'web-2', 9],
  ['erp.example.net', 'erp-1', 52], ['pos.example.net', 'erp-1', 52], ['hr.example.net', 'erp-2', 33],
  ['n8n.example.com', 'gateway', 70], ['status.example.com', 'gateway', 70]
].map(function (s, i) { return { host: s[0], owner: s[1], status: 200, ms: 90 + (i * 37) % 260, ssl_days: s[2], error: null }; });

function server(name, o) {
  return Object.assign({
    server: name, agent: '1.5', hostname: name, os: OS, kernel: KERNEL, ncpu: 4, uptime_h: 512.4,
    cpu_pct: 7.5, load: [0.31, 0.42, 0.38],
    mem: { pct: 41.2, used_gb: 3.2, total_gb: 7.8, swap_pct: 12, psi_some60: 0, psi_some300: 0, psi_full60: 0, psi_full300: 0 },
    disks: [{ mount: '/', pct: 38.1, used_gb: 28.9, total_gb: 75.8 }],
    services_running: 31, services: BASE_SERVICES, failed_units: [], containers: [], problem_logs: {}
  }, o);
}

function fleet(t) {
  // t: what is going on right now, e.g. { diskFull: true, unhealthy: true, printerDown: true }
  t = t || {};
  var web2disk = t.diskFull ? 87.4 : 71.2;
  return [
    server('gateway', {
      ncpu: 2, cpu_pct: 4.1, mem: { pct: 58.3, used_gb: 2.2, total_gb: 3.8, swap_pct: 31, psi_some60: 0.4, psi_some300: 0.2, psi_full60: 0, psi_full300: 0 },
      services: BASE_SERVICES.concat(['caddy']), services_running: 27,
      containers: [ctr('n8n', 'n8nio/n8n:1.116.2'), ctr('n8n-postgres', 'postgres:16'), ctr('uptime-probe', 'alpine:3.20', { health: null })],
      sites: SITES
    }),
    server('web-1', {
      ncpu: 4, cpu_pct: 12.8, load: [0.62, 0.71, 0.66], services_running: 33,
      containers: [ctr('site-main', 'node:22-alpine'), ctr('site-shop', 'node:22-alpine'), ctr('redis', 'redis:7', { health: null }),
        ctr('traefik', 'traefik:v3.1', { health: null }), ctr('mariadb', 'mariadb:11')],
      disks: [{ mount: '/', pct: 54.9, used_gb: 41.6, total_gb: 75.8 }]
    }),
    server('web-2', {
      ncpu: 2, cpu_pct: 9.3, services_running: 29,
      containers: [ctr('blog', 'ghost:5'), ctr('docs', 'nginx:1.27-alpine', { health: null }), ctr('blog-mysql', 'mysql:8.4')],
      disks: [{ mount: '/', pct: web2disk, used_gb: Math.round(web2disk * 0.388 * 10) / 10, total_gb: 38.8 }],
      problem_logs: t.diskFull ? { 'disk:/': '$ du -xh --max-depth=2 / | sort -rh | head -20\n33G\t/\n19G\t/var\n17G\t/var/lib\n9.8G\t/var/lib/docker\n6.1G\t/var/log\n5.9G\t/var/log/nginx\n3.1G\t/home\n\n$ journalctl --disk-usage\nArchived and active journals take up 3.9G in the file system.' } : {}
    }),
    server('erp-1', {
      ncpu: 8, cpu_pct: 18.6, load: [1.4, 1.2, 1.1], mem: { pct: 63.7, used_gb: 19.9, total_gb: 31.3, swap_pct: 4, psi_some60: 0, psi_some300: 0.1, psi_full60: 0, psi_full300: 0 },
      services_running: 35, services: BASE_SERVICES.concat(['postgresql']),
      containers: [ctr('odoo-18', 'odoo:18.0'), ctr('odoo-17', 'odoo:17.0'), ctr('odoo-18-staging', 'odoo:18.0'), ctr('pgbouncer', 'bitnami/pgbouncer:1', { health: null }),
        ctr('odoo-worker', 'odoo:18.0', t.restarting ? { status: 'restarting', health: null, exit_code: 1 } : {})],
      disks: [{ mount: '/', pct: 46.0, used_gb: 69.7, total_gb: 151.6 }, { mount: '/var/lib/postgresql', pct: 61.3, used_gb: 286.4, total_gb: 467.2 }],
      backups: [{ label: 'Odoo', max_age_h: 30, count: 14, age_h: 6.2 }, { label: 'Postgres', max_age_h: 30, count: 14, age_h: 6.1 }]
    }),
    server('erp-2', {
      ncpu: 4, cpu_pct: 22.4, load: [0.9, 0.8, 0.8], mem: { pct: 71.5, used_gb: 11.1, total_gb: 15.6, swap_pct: 46, psi_some60: 0.8, psi_some300: 0.6, psi_full60: 0, psi_full300: 0 },
      services_running: 32,
      containers: [ctr('odoo-hr', 'odoo:17.0', t.unhealthy ? { health: 'unhealthy' } : {}), ctr('odoo-hr-db', 'postgres:15'), ctr('caddy', 'caddy:2', { health: null })],
      disks: [{ mount: '/', pct: 64.2, used_gb: 48.6, total_gb: 75.8 }],
      backups: [{ label: 'Odoo HR', max_age_h: 30, count: 9, age_h: t.lateBackup ? 41.3 : 5.8 }],
      problem_logs: t.unhealthy ? { 'ctr:odoo-hr': 'restart policy=unless-stopped exit_code=0 started=2026-10-12T03:10:44\nhealthcheck:\n1: curl: (28) Operation timed out after 10001 milliseconds\n--- docker logs --tail 40\n2026-10-20 13:58:02,114 1 WARNING hr odoo.service.server: Thread <Thread(odoo.service.http.request.140)> virtual real time limit (151/120s) reached.' } : {}
    }),
    server('shop-1', {
      ncpu: 4, cpu_pct: 6.2, uptime_h: 189.7, services_running: 30,
      containers: [ctr('odoo-pos', 'odoo:18.0'), ctr('odoo-pos-db', 'postgres:16')],
      disks: [{ mount: '/', pct: 29.4, used_gb: 67.0, total_gb: 228.0 }],
      backups: [{ label: 'Odoo', max_age_h: 30, count: 30, age_h: 9.1 }],
      router: {
        model: 'RB951Ui-2HnD', version: '6.49.17 (long-term)', uptime_s: 1209600 + 3600 * 5, cpu_pct: 9, mem_pct: 38.5,
        lines: [
          { id: 'line1', label: 'Fibre', iface: 'ether1', running: true, up: true, rx_bps: 18400000, tx_bps: 2100000 },
          { id: 'line2', label: 'LTE backup', iface: 'lte1', running: true, up: !t.lineDown, rx_bps: t.lineDown ? null : 41000, tx_bps: t.lineDown ? null : 12000 }
        ],
        line_in_use: 'line1', ports: [{ name: 'ether2-pos', running: true }, { name: 'ether3-cams', running: true }, { name: 'ether4-office', running: true }],
        dhcp_bound: 37, hotspot_users: 14, wlan_clients: 22
      },
      devices: [
        { group: 'printer', id: 'kitchen', name: 'Kitchen printer', up: true },
        { group: 'printer', id: 'bar', name: 'Bar printer', up: true },
        { group: 'printer', id: 'pizza', name: 'Pizza printer', up: true },
        { group: 'printer', id: 'cashier', name: 'Cashier printer', up: true },
        { group: 'printer', id: 'terrace', name: 'Terrace printer ⏸', up: true, off: true },
        { group: 'nvr', id: 'nvr', name: 'NVR', up: true }
      ].concat([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(function (n) { return { group: 'camera', id: 'cam' + n, name: 'Cam ' + n, up: true }; }))
        .concat([{ group: 'clock', id: 'clock', name: 'Time clock', up: true }])
    }),
    server('shop-2', {
      ncpu: 4, cpu_pct: 5.1, uptime_h: 302.2, services_running: 28,
      containers: [ctr('odoo-pos', 'odoo:17.0'), ctr('odoo-pos-db', 'postgres:15')],
      disks: [{ mount: '/', pct: 22.7, used_gb: 51.8, total_gb: 228.0 }],
      backups: [{ label: 'Odoo', max_age_h: 30, count: 30, age_h: 8.7 }],
      router: {
        model: 'RB750Gr3', version: '7.16.2 (stable)', uptime_s: 86400 * 3 + 3600 * 2, cpu_pct: 3, mem_pct: 21.4,
        lines: [{ id: 'line1', label: 'Fibre', iface: 'WAN', running: true, up: true, rx_bps: 9600000, tx_bps: 880000 }],
        line_in_use: 'line1', ports: [{ name: 'LAN', running: true }],
        dhcp_bound: 24, hotspot_users: null, wlan_clients: null
      },
      devices: [
        { group: 'printer', id: 'kitchen', name: 'Kitchen printer', up: true },
        { group: 'printer', id: 'console', name: 'Console printer', up: !t.printerDown, since: t.printerDown ? t.printerSince : null },
        { group: 'printer', id: 'cashier', name: 'Cashier printer', up: true },
        { group: 'printer', id: 'bar', name: 'Bar printer', up: true },
        { group: 'clock', id: 'clock', name: 'Time clock', up: true }
      ]
    })
  ];
}

module.exports = { fleet: fleet, NAMES: ['gateway', 'web-1', 'web-2', 'erp-1', 'erp-2', 'shop-1', 'shop-2'] };

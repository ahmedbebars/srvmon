#!/bin/sh
# Install or update the srvmon agent on this server.
#
#   sudo ./install.sh     systemd timers; config in /etc/srvmon/agent.json
#   ./install.sh --user   without root: ~/.local/bin and crontab; config in ~/.config/srvmon/agent.json
#
# The first run writes a minimal config and stops, so you can put in the server name and the
# webhook URL. Run it again to start the timers. An existing config is never overwritten.
set -e
here=$(cd "$(dirname "$0")" && pwd)

new_config() {
  mkdir -p "$(dirname "$1")"
  umask 077
  cat > "$1" <<JSON
{"server": "$(hostname -s)",
 "url": "https://n8n.example.com/webhook/srvmon/in/CHANGE-ME"}
JSON
  echo "Wrote $1. Set \"server\" and \"url\" (see agent.example.json for sites, backups,"
  echo "router and devices), then run this script again."
}

if [ "$1" = "--user" ]; then
  bin="$HOME/.local/bin/srvmon-agent"
  conf="$HOME/.config/srvmon/agent.json"
  mkdir -p "$(dirname "$bin")"
  install -m 755 "$here/srvmon-agent" "$bin"
  if [ ! -f "$conf" ]; then new_config "$conf"; exit 0; fi
  # Times are in this server's local time zone.
  ( crontab -l 2>/dev/null | grep -v srvmon-agent
    echo "* * * * * /usr/bin/python3 $bin $conf >/dev/null 2>&1"
    echo "45 5 * * * nice -n 15 /usr/bin/python3 $bin --security $conf >/dev/null 2>&1" ) | crontab -
  /usr/bin/python3 "$bin" "$conf" && echo "First report sent. The agent now runs every minute from crontab."
  exit 0
fi

[ "$(id -u)" = 0 ] || { echo "Run as root, or use --user." >&2; exit 1; }
install -m 755 "$here/srvmon-agent" /usr/local/bin/srvmon-agent
conf=/etc/srvmon/agent.json
if [ ! -f "$conf" ]; then new_config "$conf"; exit 0; fi
install -m 644 "$here"/systemd/srvmon-*.service "$here"/systemd/srvmon-*.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now srvmon-agent.timer srvmon-security.timer
systemctl start srvmon-agent.service
echo "Timers: $(systemctl is-active srvmon-agent.timer) / $(systemctl is-active srvmon-security.timer)"
echo "Check the last run with: journalctl -u srvmon-agent -n 20"

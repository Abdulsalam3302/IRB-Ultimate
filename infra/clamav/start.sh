#!/bin/sh
# PID 1 supervisor: no public HTTP port, no milter, no application credentials.
set -eu
umask 077
clamd_pid=
freshclam_pid=
stopping=0
cleanup() {
  [ "$stopping" -eq 0 ] || return
  stopping=1
  for child in "$clamd_pid" "$freshclam_pid"; do
    [ -z "$child" ] || kill -TERM "$child" 2>/dev/null || true
  done
  # Bound shutdown and reap children, including on a failed readiness check.
  end=$(( $(date +%s) + 20 ))
  while [ "$(date +%s)" -lt "$end" ]; do
    alive=0
    for child in "$clamd_pid" "$freshclam_pid"; do
      if [ -n "$child" ] && kill -0 "$child" 2>/dev/null; then alive=1; fi
    done
    [ "$alive" -eq 1 ] || break
    sleep 1
  done
  for child in "$clamd_pid" "$freshclam_pid"; do
    [ -z "$child" ] || kill -KILL "$child" 2>/dev/null || true
    [ -z "$child" ] || wait "$child" 2>/dev/null || true
  done
}
trap cleanup EXIT
trap 'exit 0' TERM INT
install -d -m 0700 -o clamav -g clamav /run/clamav /run/clamav/tmp /var/lib/clamav
chown -R clamav:clamav /var/lib/clamav
rm -f /run/clamav/clamd.sock

# Fresh databases must be established before the TCP listener starts. Preserve
# TestDatabases; disable only startup notification because clamd is not up yet.
sed '/^NotifyClamd /d' /etc/clamav/freshclam.conf > /run/clamav/freshclam-initial.conf
chmod 0644 /run/clamav/freshclam-initial.conf
timeout -s TERM -k 10 600 freshclam --foreground --stdout --config-file=/run/clamav/freshclam-initial.conf &
freshclam_pid=$!
initial_status=0
wait "$freshclam_pid" || initial_status=$?
freshclam_pid=
if [ "$initial_status" -ne 0 ]; then
  printf '%s\n' 'scanner_unavailable: initial signature update failed' >&2
  exit 1
fi
rm -f /run/clamav/freshclam-initial.conf
clamd --foreground --config-file=/etc/clamav/clamd.conf &
clamd_pid=$!

deadline=$(( $(date +%s) + 240 ))
while ! /usr/local/bin/irb-clamav-health; do
  if ! kill -0 "$clamd_pid" 2>/dev/null || [ "$(date +%s)" -ge "$deadline" ]; then
    printf '%s\n' 'scanner_unavailable: engine startup failed' >&2
    exit 1
  fi
  sleep 3
done
freshclam --daemon --foreground --stdout --config-file=/etc/clamav/freshclam.conf &
freshclam_pid=$!
printf '%s\n' 'scanner_ready: private TCP 3310, fresh signatures'

# Render private-service checks only establish a TCP connection. This watchdog
# removes the listener if the actual engine or signature readiness fails.
failures=0
while :; do
  sleep 15 &
  wait $! || true
  if ! kill -0 "$clamd_pid" 2>/dev/null || ! kill -0 "$freshclam_pid" 2>/dev/null; then
    printf '%s\n' 'scanner_unavailable: required process exited' >&2
    exit 1
  fi
  status=0
  /usr/local/bin/irb-clamav-health || status=$?
  if [ "$status" -eq 0 ]; then
    failures=0
  else
    failures=$((failures + 1))
    if [ "$status" -eq 3 ] || [ "$failures" -ge 2 ]; then
      printf '%s\n' 'scanner_unavailable: readiness failed' >&2
      exit 1
    fi
  fi
done

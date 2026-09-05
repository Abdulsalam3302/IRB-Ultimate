#!/bin/sh
# Local engine/version/signature readiness. Never reads or logs user files.
set -eu
export LC_ALL=C TZ=UTC
port=${CLAMAV_HEALTH_PORT:-3310}
hours=${SIGNATURE_MAX_AGE_HOURS:-48}
case "$port:$hours" in *[!0-9:]*|:*|*:) exit 2 ;; esac
[ "$port" -ge 1 ] && [ "$port" -le 65535 ] || exit 2
[ "$hours" -ge 12 ] && [ "$hours" -le 48 ] || exit 2

# coreutils timeout and OpenBSD nc are already in the pinned Debian runtime.
ping=$(printf 'zPING\000' | timeout 4 nc -w 3 127.0.0.1 "$port" | head -c 4096 | od -An -v -tx1 | tr -d ' \n')
[ "$ping" = 504f4e4700 ] || exit 1
version=$(printf 'zVERSION\000' | timeout 4 nc -w 3 127.0.0.1 "$port" | head -c 4096 | tr -d '\000')
case "$version" in 'ClamAV 1.5.4/'[0-9]*/*) ;; *) exit 1 ;; esac
stamp=${version##*/}
signature_epoch=$(date -u -d "$stamp" +%s 2>/dev/null) || exit 1
now=$(date -u +%s)
age=$((now - signature_epoch))
# Future clocks and stale signatures are unavailable, never a clean verdict.
[ "$age" -ge -300 ] && [ "$age" -le $((hours * 3600)) ] || exit 3

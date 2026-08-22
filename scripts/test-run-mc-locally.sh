#!/usr/bin/env bash
set -euo pipefail

MC_LIB_ONLY=1 source "$(dirname -- "$0")/run-mc-locally.sh"

LOG="$(mktemp)"
trap 'rm -f "$LOG"' EXIT

printf 'CIBot joined the game\nCIBot lost connection\n' > "$LOG"
OFFSET=$(( $(wc -c < "$LOG") + 1 ))

seen_since "$LOG" "CIBot lost connection" || { echo "FAIL: needle not found from start"; exit 1; }
! seen_since "$LOG" "CIBot lost connection" "$OFFSET" || { echo "FAIL: old line leaked past offset"; exit 1; }

sleep 30 & PID=$!
trap 'rm -f "$LOG"; kill "$PID" 2>/dev/null || true' EXIT

wait_for "$LOG" "CIBot joined the game" 2 "$PID" && :
[ $? -eq 0 ] || { echo "FAIL: wait_for missed an already-present line"; exit 1; }

wait_for "$LOG" "CIBot joined the game" 2 "$PID" "$OFFSET" && :
[ $? -eq 2 ] || { echo "FAIL: wait_for should time out (2) for a line before the offset"; exit 1; }

( sleep 1; echo "CIBot joined the game" >> "$LOG" ) &
wait_for "$LOG" "CIBot joined the game" 5 "$PID" "$OFFSET" && :
[ $? -eq 0 ] || { echo "FAIL: wait_for missed a line appended after the offset"; exit 1; }

kill "$PID" 2>/dev/null || true
wait "$PID" 2>/dev/null || true
wait_for "$LOG" "never appears" 5 "$PID" && :
[ $? -eq 1 ] || { echo "FAIL: wait_for should report 1 when the process is gone"; exit 1; }

CLIENT_PID=""
perl -e 'setpgrp(0,0); exec @ARGV' bash -c 'sleep 120 & sleep 120 & wait' &
CLIENT_PID=$!
sleep 1
GROUP="$CLIENT_PID"
kill -0 -- -"$GROUP" 2>/dev/null || { echo "FAIL: test client group never came up"; exit 1; }
kill_client
kill -0 -- -"$GROUP" 2>/dev/null && { echo "FAIL: kill_client left the client group alive"; exit 1; }
[ -z "$CLIENT_PID" ] || { echo "FAIL: kill_client did not clear CLIENT_PID"; exit 1; }

CLIENT_PID=""
REASON=""
fake_attempt() { CLIENT_PID=4242; REASON="boom"; return 1; }
if fake_attempt; then echo "FAIL: attempt result inverted"; exit 1; fi
[ "$CLIENT_PID" = 4242 ] || { echo "FAIL: attempt ran in a subshell, CLIENT_PID lost"; exit 1; }
[ "$REASON" = boom ] || { echo "FAIL: attempt ran in a subshell, REASON lost"; exit 1; }

echo "ok"

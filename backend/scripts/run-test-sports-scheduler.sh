#!/usr/bin/env bash
# Runs the sports resolve job every 15 minutes against the local mock server.
# The mock server must already be running:
#   node backend/scripts/mock-sports-server.mjs
#
# Usage (from repo root):
#   bash backend/scripts/run-test-sports-scheduler.sh
#
# Stop with Ctrl-C.

set -euo pipefail

export FOOTBALL_DATA_BASE_URL=http://localhost:7891
export FOOTBALL_DATA_API_KEY=test-mock-key

INTERVAL=900  # 15 minutes
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

run_once() {
  echo ""
  echo "=========================================="
  echo "[$(date -u '+%Y-%m-%d %H:%M:%S UTC')] Running sports-resolve (TEST)"
  echo "=========================================="
  cd "$SCRIPT_DIR"
  yarn ts-node --project tsconfig.json resolve-test-sports-markets.ts
}

echo "Test Sports Scheduler"
echo "  Mock server: $FOOTBALL_DATA_BASE_URL"
echo "  Interval: ${INTERVAL}s (15 min)"
echo "  Press Ctrl-C to stop."
echo ""

# Run immediately, then loop
run_once

while true; do
  echo ""
  echo "[$(date -u '+%H:%M:%S')] Sleeping ${INTERVAL}s until next run..."
  sleep $INTERVAL
  run_once
done

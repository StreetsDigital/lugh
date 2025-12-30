#!/bin/bash
# Start Remote Coding Agent with Agent Pool Workers
#
# This script starts:
# 1. Main application (API server + coordinat)
# 2. Multiple agent workers (based on AGENT_POOL_SIZE)
#
# Workers run in background and auto-restart on failure.

set -e

echo "[Startup] Starting Remote Coding Agent with Agent Pool..."

# Check if agent pool is enabled
if [ "${FEATURE_AGENT_POOL}" != "true" ]; then
  echo "[Startup] FEATURE_AGENT_POOL not enabled, starting app only"
  exec bun run setup-auth && bun run start
fi

# Get pool size (default: 4)
POOL_SIZE="${AGENT_POOL_SIZE:-4}"
echo "[Startup] Agent pool enabled (size: $POOL_SIZE workers)"

# Function to start a worker
start_worker() {
  local worker_id=$1
  local agent_id="agent-${worker_id}"

  echo "[Startup] Starting worker: $agent_id"

  # Start worker in background with auto-restart
  while true; do
    bun src/scripts/start-worker.ts --agent-id="$agent_id" || {
      echo "[Startup] Worker $agent_id crashed, restarting in 5s..."
      sleep 5
    }
  done &

  # Store PID for cleanup
  echo $! >> /tmp/worker-pids.txt
}

# Cleanup function
cleanup() {
  echo "[Startup] Shutting down workers..."
  if [ -f /tmp/worker-pids.txt ]; then
    while read pid; do
      kill $pid 2>/dev/null || true
    done < /tmp/worker-pids.txt
    rm /tmp/worker-pids.txt
  fi
  exit 0
}

# Register cleanup handler
trap cleanup SIGTERM SIGINT

# Clear old PIDs
rm -f /tmp/worker-pids.txt

# Setup auth first
bun run setup-auth

# Start workers
for i in $(seq 1 $POOL_SIZE); do
  start_worker $i
  sleep 1  # Stagger startup
done

echo "[Startup] All workers started, starting main app..."

# Start main app in foreground
exec bun run start

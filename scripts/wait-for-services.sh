#!/usr/bin/env bash
# Wait for docker-compose services to become healthy.
# Usage: ./scripts/wait-for-services.sh [timeout_seconds]

set -euo pipefail

TIMEOUT="${1:-120}"
SERVICES="postgres azurite servicebus demo-feed-api api"

echo "Waiting for services to become healthy (timeout: ${TIMEOUT}s)..."

for svc in $SERVICES; do
  elapsed=0
  while true; do
    status=$(docker compose ps --format json "$svc" 2>/dev/null | grep -o '"Health":"[^"]*"' | head -1 | cut -d'"' -f4 || echo "unknown")
    if [ "$status" = "healthy" ]; then
      echo "  $svc: healthy"
      break
    fi
    if [ "$elapsed" -ge "$TIMEOUT" ]; then
      echo "  $svc: TIMEOUT after ${TIMEOUT}s (status: $status)"
      docker compose logs --tail=20 "$svc"
      exit 1
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done
done

echo "All services healthy."

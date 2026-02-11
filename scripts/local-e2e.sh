#!/usr/bin/env bash
# ============================================================================
# Local E2E Test Runner
#
# Orchestrates the full pipeline test:
#   1. Starts docker-compose infrastructure + API + demo-feed-api
#   2. Seeds demo data
#   3. Starts pipeline services (scheduler → worker → consolidator)
#   4. Runs integration and E2E tests
#   5. Tears down containers
#
# Usage:
#   npm run local:e2e
#   ./scripts/local-e2e.sh
#   ./scripts/local-e2e.sh --keep    # don't tear down after tests
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

KEEP_RUNNING=false
if [[ "${1:-}" == "--keep" ]]; then
  KEEP_RUNNING=true
fi

cleanup() {
  if [ "$KEEP_RUNNING" = false ]; then
    echo ""
    echo "=== Tearing down docker stack ==="
    docker compose --profile pipeline down -v --remove-orphans 2>/dev/null || true
  else
    echo ""
    echo "=== Stack left running (--keep). Tear down with: docker compose --profile pipeline down -v ==="
  fi
}

trap cleanup EXIT

echo "=== Building docker images ==="
docker compose build

echo ""
echo "=== Starting infrastructure services ==="
docker compose up -d postgres azurite mssql

echo ""
echo "=== Waiting for infrastructure ==="
# Wait for postgres and azurite
for svc in postgres azurite; do
  elapsed=0
  while true; do
    status=$(docker compose ps --format json "$svc" 2>/dev/null | grep -o '"Health":"[^"]*"' | head -1 | cut -d'"' -f4 || echo "unknown")
    if [ "$status" = "healthy" ]; then
      echo "  $svc: healthy"
      break
    fi
    if [ "$elapsed" -ge 60 ]; then
      echo "  $svc: TIMEOUT"
      docker compose logs --tail=20 "$svc"
      exit 1
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done
done

echo ""
echo "=== Starting Service Bus emulator ==="
docker compose up -d servicebus
# Service Bus needs extra time to initialize
elapsed=0
while true; do
  status=$(docker compose ps --format json servicebus 2>/dev/null | grep -o '"Health":"[^"]*"' | head -1 | cut -d'"' -f4 || echo "unknown")
  if [ "$status" = "healthy" ]; then
    echo "  servicebus: healthy"
    break
  fi
  if [ "$elapsed" -ge 120 ]; then
    echo "  servicebus: TIMEOUT"
    docker compose logs --tail=30 servicebus
    exit 1
  fi
  sleep 3
  elapsed=$((elapsed + 3))
done

echo ""
echo "=== Starting demo-feed-api and API ==="
docker compose up -d demo-feed-api api
for svc in demo-feed-api api; do
  elapsed=0
  while true; do
    status=$(docker compose ps --format json "$svc" 2>/dev/null | grep -o '"Health":"[^"]*"' | head -1 | cut -d'"' -f4 || echo "unknown")
    if [ "$status" = "healthy" ]; then
      echo "  $svc: healthy"
      break
    fi
    if [ "$elapsed" -ge 60 ]; then
      echo "  $svc: TIMEOUT"
      docker compose logs --tail=20 "$svc"
      exit 1
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done
done

echo ""
echo "=== Seeding demo feed data (500 records) ==="
curl -sf -X POST http://localhost:4000/api/seed \
  -H 'Content-Type: application/json' \
  -d '{"mode":"full","count":500}' | head -c 200
echo ""

echo ""
echo "=== Starting pipeline services (worker + consolidator) ==="
docker compose --profile pipeline up -d worker consolidator

# Give worker and consolidator a moment to connect
sleep 3

echo ""
echo "=== Triggering scheduler ==="
docker compose --profile pipeline up scheduler
# Scheduler runs once and exits. Wait for it to complete.
echo "  Scheduler completed"

echo ""
echo "=== Running tests ==="
# Set env vars for tests to connect to local stack
export DATABASE_URL="postgres://postgres:postgres@localhost:5432/diamond"
export AZURE_STORAGE_CONNECTION_STRING="DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1"
export AZURE_SERVICE_BUS_CONNECTION_STRING="Endpoint=sb://localhost;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=SAS_KEY_VALUE;UseDevelopmentEmulator=true;"
export API_BASE_URL="http://localhost:3000"
export DEMO_FEED_API_URL="http://localhost:4000"
export HMAC_SECRET="local-test-secret"
export HMAC_CLIENT_ID="local"

npx vitest run --config tests/local/vitest.config.ts

echo ""
echo "=== All tests passed ==="

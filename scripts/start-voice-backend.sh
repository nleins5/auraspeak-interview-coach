#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -f ".env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source ".env"
  set +a
fi

if [[ -f ".env.local" ]]; then
  set -a
  # shellcheck disable=SC1091
  source ".env.local"
  set +a
fi

export DISABLE_DATABASE="${DISABLE_DATABASE:-1}"
export GATEWAY_SECRET="${GATEWAY_SECRET:-}"
export REQUEST_TIMEOUT_S="${REQUEST_TIMEOUT_S:-8}"
export MAX_RETRIES_PER_PROVIDER="${MAX_RETRIES_PER_PROVIDER:-0}"
export ROUTING_MODE="${ROUTING_MODE:-chain}"

python3 -m uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"

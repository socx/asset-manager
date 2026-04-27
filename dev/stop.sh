#!/usr/bin/env bash
set -euo pipefail

echo "Stopping Asset Manager development services..."

# Kill processes on known dev ports
for port in 3000 3443 5173; do
  pid=$(lsof -ti ":${port}" 2>/dev/null || true)
  if [ -n "$pid" ]; then
    echo "  Killing process on port ${port} (PID ${pid})"
    kill -9 "$pid" 2>/dev/null || true
  fi
done

echo "Done. To also stop background services:"
echo "  brew services stop postgresql@16"
echo "  brew services stop redis"
echo "  brew services stop mailpit"

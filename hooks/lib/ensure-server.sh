#!/bin/bash
# Ensures the CodeMap server is running on :5174.
# If not, launches `npm run dev` detached, guarded by flock so only one
# hook wins the cold-start race. Best-effort: never blocks the agent.

ensure_codemap_server() {
  local codemap_root="$1"   # absolute path to the codemap repo (contains package.json)
  local health="http://localhost:5174/api/health"
  local lock="/tmp/codemap-server.lock"

  if /usr/bin/curl -s --connect-timeout 1 --max-time 1 "$health" >/dev/null 2>&1; then
    return 0
  fi

  (
    flock -n 9 || exit 0   # another hook is already starting it
    if /usr/bin/curl -s --connect-timeout 1 --max-time 1 "$health" >/dev/null 2>&1; then
      exit 0
    fi
    # Start ONLY the server (not the client/Vite) to avoid a :5173 port clash.
    nohup npm --prefix "$codemap_root" run dev:server >/tmp/codemap-server.log 2>&1 &
    for _ in 1 2 3 4 5 6 7 8 9 10; do
      sleep 0.5
      /usr/bin/curl -s --connect-timeout 1 --max-time 1 "$health" >/dev/null 2>&1 && break
    done
  ) 9>"$lock"
}

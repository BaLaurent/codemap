#!/bin/bash
# Ensures both the CodeMap server (:5174) and the Vite client (:5173) are
# running, launching whichever is down, detached. Each is guarded by a port
# check + its own flock so only one hook wins the cold-start race and an
# already-running instance is never double-started. Best-effort: never blocks.

ensure_codemap_server() {
  local codemap_root="$1"   # absolute path to the codemap repo (contains package.json)
  local health="http://localhost:5174/api/health"
  local client="http://localhost:5173/"
  local server_lock="/tmp/codemap-server.lock"
  local client_lock="/tmp/codemap-client.lock"

  # Server (:5174) — required to capture agent/activity events. Wait briefly for
  # it to come up since the events that follow this hook need it.
  if ! /usr/bin/curl -s --connect-timeout 1 --max-time 1 "$health" >/dev/null 2>&1; then
    (
      flock -n 9 || exit 0   # another hook is already starting it
      if ! /usr/bin/curl -s --connect-timeout 1 --max-time 1 "$health" >/dev/null 2>&1; then
        nohup npm --prefix "$codemap_root" run dev:server >/tmp/codemap-server.log 2>&1 &
        for _ in 1 2 3 4 5 6 7 8 9 10; do
          sleep 0.5
          /usr/bin/curl -s --connect-timeout 1 --max-time 1 "$health" >/dev/null 2>&1 && break
        done
      fi
    ) 9>"$server_lock"
  fi

  # Client / Vite (:5173) — the visualisation itself; a running server with no
  # client is useless to a human. Started separately and guarded by its own port
  # check + distinct flock so a client already up (e.g. a manual `npm run dev`)
  # is never double-started. No wait loop: nothing downstream depends on it.
  if ! /usr/bin/curl -s --connect-timeout 1 --max-time 1 "$client" >/dev/null 2>&1; then
    (
      flock -n 8 || exit 0
      if ! /usr/bin/curl -s --connect-timeout 1 --max-time 1 "$client" >/dev/null 2>&1; then
        nohup npm --prefix "$codemap_root" run dev:client >/tmp/codemap-client.log 2>&1 &
      fi
    ) 8>"$client_lock"
  fi
}

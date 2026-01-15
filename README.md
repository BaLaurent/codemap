# CodeMap Hotel

Real-time pixel-art visualization of AI coding agents (Claude Code & Cursor).

![CodeMap Hotel Demo](docs/demo.gif)

---

## Quick Start

### Use in Any Project (give this to your agent)

```bash
npx github:JamsusMaximus/codemap
```

This single command installs CodeMap, configures hooks, starts the server, and opens the visualization. Run it from any project directory and watch your AI agent appear in the hotel!

### Develop CodeMap Itself

```bash
git clone https://github.com/JamsusMaximus/codemap && cd codemap && npm install && npm run dev
```

Then open http://localhost:5173/hotel

---

## How It Works

```
AI Agent        →  Hook Scripts  →  Server (:5174)  →  Client (:5173)
(Claude/Cursor)       │                │                   │
  triggers          capture          tracks &           renders
  hooks            events           broadcasts         pixel-art
```

When your AI agent reads files, writes code, or runs commands, CodeMap visualizes it as a character moving around a hotel. Each folder becomes a room, each file becomes a desk.

---

## Features

### Hotel View

- **Multi-floor Layout**: Rooms arranged by git activity (hottest folders on ground floor)
- **Dynamic Layout**: Hotel reorganizes when you make git commits
- **Room Themes**: Different colors based on folder type:
  - Blue: Components, UI, Views
  - Green: Server, API, Routes
  - Lavender: Hooks, Utils, Lib
  - Peach: Tests, Specs
- **Activity Indicators**:
  - Computer screens show current file being read/written
  - Yellow glow = reading, Green glow = writing
- **Multi-agent Support**: See up to 10 agents working simultaneously
- **Agent States**:
  - Thinking indicator above agent
  - Name tags and walking animations
  - Speech bubbles showing current tool and file
- **Cursor-Specific Features**:
  - Model name displayed below agent (e.g., "3.5-sonnet")
  - Completion badges: green (completed), orange (aborted), red (error)
  - Operation duration in speech bubble (e.g., "Bash (2.3s)")

### Navigation

- **Zoom**: Scroll wheel or `Cmd/Ctrl +/-`
- **Pan**: Click and drag, or arrow keys

### Compatibility

- **Claude Code**: Full support via `.claude/settings.local.json`
- **Cursor**: Full support via `.cursor/hooks.json` with enhanced features

---

## Architecture

### Server (`server/` - Port 5174)

- `POST /api/activity` - File read/write events
- `POST /api/thinking` - Agent thinking state
- `GET /api/graph` - File tree data
- `GET /api/hot-folders` - Git-ranked folders
- WebSocket broadcasts real-time updates

### Client (`client/` - Port 5173)

- `/` - Tree view (force-directed graph)
- `/hotel` - Hotel view (pixel-art visualization)

### Hooks (`hooks/`)

- `file-activity-hook.sh` - File operations
- `thinking-hook.sh` - Agent state, model, duration
- `cursor-stop-hook.sh` - Cursor completion status
- `git-post-commit.sh` - Layout refresh on commits

---

## Troubleshooting

### Server Not Starting

```bash
lsof -i :5174  # Check if port in use
curl http://localhost:5174/api/health
```

### Hooks Not Firing

```bash
tail -f /tmp/codemap-hook.log
```

### No Agents Appearing

```bash
curl http://localhost:5174/api/thinking | jq
```

---

## Development

```bash
npm install
npm run dev           # Start both server and client
npm test --workspaces # Run all tests
```

---

## License

MIT

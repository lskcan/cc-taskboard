# cc-taskboard

**Real-time task board for Claude Code's multi-agent execution.**

When Claude Code spawns multiple agents to work in parallel, you get... nothing. Just a wall of text. `cc-taskboard` fixes that — it gives you a live kanban showing exactly which agent is running which task, who spawned whom, and what's done.

![Status](https://img.shields.io/badge/status-alpha-orange) ![License](https://img.shields.io/badge/license-MIT-blue) ![Node](https://img.shields.io/badge/node-%3E%3D18-green)

---

## What it looks like

```
┌─ Agent: 77ab27ff ─────────────────────────────────────┐
│  ↳ spawned by: main session                            │
│                                                        │
│  [in progress]  Implement auth module                  │
│  [completed]    Write unit tests                       │
└────────────────────────────────────────────────────────┘

┌─ Agent: 3c9f12aa ─────────────────────────────────────┐
│  ↳ spawned by: 77ab27ff                                │
│                                                        │
│  [pending]      Review PR diff                         │
└────────────────────────────────────────────────────────┘
```

Live in your browser. Updates the moment a task changes.

---

## Install

Three steps. Takes 60 seconds.

**Step 1 — Register the MCP server:**

```bash
claude mcp add cc-taskboard --command "npx -y cc-taskboard"
```

**Step 2 — Install the hook** (auto-writes to Claude Code's settings.json):

```bash
npx cc-taskboard install-hook
```

**Step 3 — Add the `/board` slash command globally:**

```bash
mkdir -p ~/.claude/commands
curl -s https://raw.githubusercontent.com/lskcan/cc-taskboard/main/.claude/commands/board.md \
  -o ~/.claude/commands/board.md
```

Restart Claude Code. That's it.

---

## Usage

Inside Claude Code, type:

```
/board
```

Your browser opens to the live kanban. Every task update from every agent shows up in real time — no refresh needed.

**MCP tools also available:**

| Tool | What it does |
|------|-------------|
| `get_board_url` | Get the current board URL |
| `get_tasks` | Fetch full task + agent data as JSON |
| `clear_history` | Wipe the board |

---

## How it works

Claude Code's `PostToolUse` hook fires every time an agent calls `TaskCreate`, `TaskUpdate`, `TaskStop`, or `Agent`. cc-taskboard intercepts those events and writes them to a local SQLite database. The MCP server reads from that database and pushes updates to the browser via WebSocket.

```
Claude Code agents
      │
      │ PostToolUse hook (fires on Task* + Agent calls)
      ▼
  hook script ──► SQLite (WAL mode) ◄── MCP Server
                                              │
                                        WebSocket push
                                              │
                                         Browser UI
                                     (swim-lane kanban)
```

Everything runs locally. No data leaves your machine.

**Spike result:** Claude Code's hook payload reliably includes `session_id` — this is how we track which agent owns which task, and reconstruct the spawn tree.

---

## Dev setup

```bash
git clone https://github.com/lskcan/cc-taskboard
cd cc-taskboard
npm install
npm run dev        # start MCP server (port 8472)
```

To test the hook manually:

```bash
echo '{"session_id":"test","tool_name":"TaskCreate","tool_input":{"subject":"hello"},"tool_response":{"task":{"id":"1","subject":"hello"}}}' \
  | npm run hook
```

---

## Stack

- [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk) — MCP server
- [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3) — local storage, WAL mode
- [`ws`](https://github.com/websockets/ws) — WebSocket for real-time push
- Zero frontend dependencies — the UI is a single self-contained HTML file

---

## Roadmap

- [x] Hook → SQLite pipeline
- [x] MCP server + Web UI
- [x] Swim-lane kanban by agent
- [x] Real-time WebSocket updates
- [x] `/board` slash command
- [ ] Agent dependency tree (DAG view)
- [ ] Task timeline view
- [ ] npm publish

---

## Why this exists

Claude Code's multi-agent mode is powerful but invisible. You kick off a task, agents get spawned, subtasks get created — and you have no idea what's happening until it's done (or broken). This tool makes the execution visible.

If you're using Claude Code for serious multi-agent workflows, you want this.

---

## License

MIT — use it, fork it, build on it.

---

If this is useful, a ⭐ helps others find it.

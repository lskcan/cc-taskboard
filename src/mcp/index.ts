#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import net from 'net';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { getDb, getAllTasks, getAllSessions, getAllSessions2, clearAll } from '../db/index.js';

const DATA_DIR = path.join(os.homedir(), '.cc-taskboard');
const PORT_FILE = path.join(DATA_DIR, 'port');
const WEB_PORT_FILE = path.join(DATA_DIR, 'web-port');

fs.mkdirSync(DATA_DIR, { recursive: true });

// --- Find available port starting from preferred ---
function findAvailablePort(preferred: number): Promise<number> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(preferred, '127.0.0.1', () => {
      const addr = server.address() as net.AddressInfo;
      server.close(() => resolve(addr.port));
    });
    server.on('error', () => findAvailablePort(preferred + 1).then(resolve));
  });
}

// --- WebSocket server for real-time push to browser ---
let wss: WebSocketServer | null = null;
let webPort = 0;

function broadcast(data: object): void {
  if (!wss) return;
  const msg = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

// --- TCP notification listener (hook sends updates here) ---
function startNotificationListener(port: number): void {
  const server = net.createServer((socket) => {
    let buf = '';
    socket.on('data', (d) => {
      buf += d.toString();
      if (buf.includes('\n')) {
        try {
          const data = JSON.parse(buf.trim());
          // Fetch fresh data and broadcast to all WebSocket clients
          const db = getDb();
          const tasks = getAllTasks(db);
          const sessions = getAllSessions(db);
          broadcast({ type: 'update', tasks, sessions, sessions2: getAllSessions2(db) });
        } catch {}
        buf = '';
      }
    });
    socket.on('error', () => {});
  });
  server.listen(port, '127.0.0.1', () => {
    fs.writeFileSync(PORT_FILE, String(port));
  });
  server.on('error', () => {});
}

// --- Minimal inline web UI (single HTML file) ---
function getWebUiHtml(wsPort: number): string {
  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CC TaskBoard</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f0f0f; color: #e0e0e0; }
  header { padding: 16px 24px; border-bottom: 1px solid #2a2a2a; display: flex; align-items: center; gap: 12px; }
  header h1 { font-size: 15px; font-weight: 600; letter-spacing: 0.5px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: #666; }
  .dot.connected { background: #22c55e; }
  #status { font-size: 12px; color: #666; margin-left: auto; }
  .board { display: flex; gap: 16px; padding: 20px 24px; overflow-x: auto; min-height: calc(100vh - 57px); }
  .column { min-width: 280px; max-width: 320px; flex-shrink: 0; }
  .col-header { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: #666; margin-bottom: 12px; padding: 0 4px; }
  .cards { display: flex; flex-direction: column; gap: 8px; }
  .card { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 8px; padding: 12px; }
  .card-title { font-size: 13px; font-weight: 500; line-height: 1.4; margin-bottom: 8px; }
  .card-meta { font-size: 11px; color: #555; display: flex; flex-direction: column; gap: 3px; }
  .card-meta span { font-family: monospace; }
  .badge { display: inline-block; font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 4px; margin-bottom: 6px; }
  .badge.pending { background: #1e293b; color: #64748b; }
  .badge.in_progress { background: #1c3a5e; color: #60a5fa; }
  .badge.completed { background: #14532d; color: #4ade80; }
  .badge.active { background: #1c3a5e; color: #60a5fa; }
  .badge.failed { background: #450a0a; color: #f87171; }
  .lane { background: #161616; border: 1px solid #222; border-radius: 10px; padding: 14px; margin-bottom: 16px; }
  .lane-header { font-size: 11px; color: #888; margin-bottom: 10px; }
  .empty { color: #333; font-size: 12px; text-align: center; padding: 40px 0; }
  .tabs { display: flex; gap: 4px; padding: 12px 24px 0; border-bottom: 1px solid #1e1e1e; }
  .tab { font-size: 12px; padding: 6px 14px; border-radius: 6px 6px 0 0; cursor: pointer; color: #555; border: 1px solid transparent; border-bottom: none; margin-bottom: -1px; }
  .tab.active { color: #e0e0e0; background: #161616; border-color: #2a2a2a; }
  .session-card { background: #161616; border: 1px solid #222; border-radius: 8px; padding: 12px 14px; margin-bottom: 8px; }
  .session-prompt { font-size: 13px; color: #ccc; margin-bottom: 8px; line-height: 1.5; white-space: pre-wrap; word-break: break-all; }
  .session-meta { display: flex; gap: 12px; align-items: center; font-size: 11px; color: #555; flex-wrap: wrap; }
  .session-tools { font-family: monospace; }
  .pulse { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #60a5fa; margin-right: 5px; animation: pulse 1.5s infinite; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
</style>
</head>
<body>
<header>
  <div class="dot" id="dot"></div>
  <h1>CC TaskBoard</h1>
  <span id="status">Connecting...</span>
</header>
<div class="tabs">
  <div class="tab active" onclick="switchTab('sessions')" id="tab-sessions">会话</div>
  <div class="tab" onclick="switchTab('tasks')" id="tab-tasks">结构化任务</div>
</div>
<div id="view-sessions" style="padding:20px 24px">
  <div class="empty">等待新的 Claude Code 会话...</div>
</div>
<div id="view-tasks" style="display:none">
  <div class="board" id="board">
    <div class="empty">等待任务...</div>
  </div>
</div>
<script>
const WS_PORT = ${wsPort};
let ws;
let currentTab = 'sessions';

function switchTab(tab) {
  currentTab = tab;
  document.getElementById('view-sessions').style.display = tab === 'sessions' ? '' : 'none';
  document.getElementById('view-tasks').style.display = tab === 'tasks' ? '' : 'none';
  document.getElementById('tab-sessions').className = 'tab' + (tab === 'sessions' ? ' active' : '');
  document.getElementById('tab-tasks').className = 'tab' + (tab === 'tasks' ? ' active' : '');
}

function shortId(id) {
  return id ? id.slice(0, 8) : '?';
}

function timeAgo(ms) {
  if (!ms) return '—';
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.floor(s/60) + 'm ago';
  return Math.floor(s/3600) + 'h ago';
}

function duration(start, end) {
  if (!start) return '—';
  const ms = (end || Date.now()) - start;
  if (ms < 60000) return Math.floor(ms/1000) + 's';
  return Math.floor(ms/60000) + 'm' + Math.floor((ms%60000)/1000) + 's';
}

function renderSessions(sessions2) {
  const el = document.getElementById('view-sessions');
  if (!sessions2 || !sessions2.length) {
    el.innerHTML = '<div class="empty">暂无会话记录。<br>在任意 Claude Code 窗口发消息后会自动出现。</div>';
    return;
  }
  el.innerHTML = sessions2.map(s => {
    const isActive = s.status === 'active';
    const promptText = s.prompt ? s.prompt.replace(/</g,'&lt;').replace(/>/g,'&gt;') : '（无提示词记录）';
    return \`
      <div class="session-card">
        <div class="session-prompt">\${isActive ? '<span class="pulse"></span>' : ''}\${promptText}</div>
        <div class="session-meta">
          <span class="badge \${s.status}">\${s.status === 'active' ? '进行中' : '已完成'}</span>
          <span class="session-tools">🔧 \${s.tool_call_count} 次工具调用</span>
          <span>⏱ \${duration(s.started_at, s.completed_at)}</span>
          <span style="font-family:monospace;color:#333">\${shortId(s.session_id)}</span>
          \${s.parent_session_id ? '<span style="color:#333">↳ 子 Agent</span>' : ''}
        </div>
      </div>
    \`;
  }).join('');
}

function render(tasks, sessions) {
  const board = document.getElementById('board');
  if (!tasks.length) {
    board.innerHTML = '<div class="empty">No tasks yet. Run a Claude Code task to see it here.</div>';
    return;
  }

  // Group tasks by session_id
  const bySession = {};
  tasks.forEach(t => {
    if (!bySession[t.session_id]) bySession[t.session_id] = [];
    bySession[t.session_id].push(t);
  });

  // Build session info map
  const sessionMap = {};
  sessions.forEach(s => { sessionMap[s.session_id] = s; });

  // Columns: pending | in_progress | completed
  const cols = { pending: [], in_progress: [], completed: [], failed: [] };
  tasks.forEach(t => { if (cols[t.status]) cols[t.status].push(t); });

  // Swim lanes by session
  const sessionIds = [...new Set(tasks.map(t => t.session_id))];

  board.innerHTML = '';

  // Swim-lane view
  const lanesCol = document.createElement('div');
  lanesCol.style.flex = '1';
  lanesCol.style.minWidth = '320px';

  const lanesHeader = document.createElement('div');
  lanesHeader.className = 'col-header';
  lanesHeader.textContent = 'Agents & Tasks';
  lanesCol.appendChild(lanesHeader);

  sessionIds.forEach(sid => {
    const sess = sessionMap[sid];
    const sessionTasks = bySession[sid] || [];
    const lane = document.createElement('div');
    lane.className = 'lane';

    const lh = document.createElement('div');
    lh.className = 'lane-header';
    lh.innerHTML = \`
      <div>
        <div style="font-weight:600;font-size:12px;color:#aaa">Agent: <span style="color:#e0e0e0">\${shortId(sid)}</span></div>
        \${sess?.parent_session_id ? '<div style="font-size:10px;color:#555">↳ spawned by ' + shortId(sess.parent_session_id) + '</div>' : ''}
        \${sess?.description ? '<div style="font-size:11px;color:#666;margin-top:4px">' + sess.description.slice(0, 60) + '</div>' : ''}
      </div>
    \`;
    lane.appendChild(lh);

    sessionTasks.forEach(task => {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = \`
        <div class="badge \${task.status}">\${task.status.replace('_', ' ')}</div>
        <div class="card-title">\${task.subject}</div>
        <div class="card-meta">
          <span>ID: \${task.id}</span>
          <span>\${timeAgo(task.updated_at)}</span>
        </div>
      \`;
      lane.appendChild(card);
    });

    if (!sessionTasks.length) {
      const empty = document.createElement('div');
      empty.style.cssText = 'font-size:11px;color:#333;padding:8px 0;';
      empty.textContent = 'No tasks';
      lane.appendChild(empty);
    }

    lanesCol.appendChild(lane);
  });

  board.appendChild(lanesCol);

  // Status columns on the right
  ['pending', 'in_progress', 'completed', 'failed'].forEach(status => {
    const taskList = cols[status];
    if (!taskList.length && status === 'failed') return;
    const col = document.createElement('div');
    col.className = 'column';
    col.innerHTML = \`<div class="col-header">\${status.replace('_', ' ')} (\${taskList.length})</div><div class="cards"></div>\`;
    const cards = col.querySelector('.cards');
    taskList.forEach(task => {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = \`
        <div class="card-title">\${task.subject}</div>
        <div class="card-meta"><span>\${shortId(task.session_id)}</span><span>\${timeAgo(task.updated_at)}</span></div>
      \`;
      cards.appendChild(card);
    });
    if (!taskList.length) {
      cards.innerHTML = '<div style="font-size:11px;color:#333;padding:12px 0;">—</div>';
    }
    board.appendChild(col);
  });
}

function connect() {
  ws = new WebSocket('ws://127.0.0.1:' + WS_PORT);
  ws.onopen = () => {
    document.getElementById('dot').className = 'dot connected';
    document.getElementById('status').textContent = 'Live';
    ws.send(JSON.stringify({ type: 'get_state' }));
  };
  ws.onmessage = (e) => {
    try {
      const d = JSON.parse(e.data);
      if (d.type === 'update' || d.type === 'state') {
        render(d.tasks || [], d.sessions || []);
        renderSessions(d.sessions2 || []);
      }
    } catch {}
  };
  ws.onclose = () => {
    document.getElementById('dot').className = 'dot';
    document.getElementById('status').textContent = 'Reconnecting...';
    setTimeout(connect, 2000);
  };
  ws.onerror = () => ws.close();
}
connect();
</script>
</body>
</html>`;
}

// --- HTTP server for the web UI ---
async function startWebServer(): Promise<number> {
  const port = await findAvailablePort(8472);
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(getWebUiHtml(port + 1)); // WebSocket on port+1
  });
  server.listen(port, '127.0.0.1');

  // WebSocket server on port+1
  wss = new WebSocketServer({ port: port + 1, host: '127.0.0.1' });
  wss.on('connection', (ws) => {
    // Send current state on connect
    const db = getDb();
    ws.send(JSON.stringify({
      type: 'state',
      tasks: getAllTasks(db),
      sessions: getAllSessions(db),
      sessions2: getAllSessions2(db),
    }));
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'get_state') {
          const db2 = getDb();
          ws.send(JSON.stringify({
            type: 'state',
            tasks: getAllTasks(db2),
            sessions: getAllSessions(db2),
            sessions2: getAllSessions2(db2),
          }));
        }
      } catch {}
    });
  });

  webPort = port;
  fs.writeFileSync(WEB_PORT_FILE, String(port));
  return port;
}

// --- MCP Server ---
async function main(): Promise<void> {
  // Start notification listener on a fixed internal port
  const notifPort = await findAvailablePort(19472);
  startNotificationListener(notifPort);

  // Start web server
  const uiPort = await startWebServer();

  const server = new McpServer({
    name: 'cc-taskboard',
    version: '0.1.0',
  });

  server.tool('get_board_url', 'Get the URL of the task board web UI', {}, async () => {
    const url = `http://127.0.0.1:${uiPort}`;
    return { content: [{ type: 'text', text: url }] };
  });

  server.tool('get_tasks', 'Get current task list with agent assignments', {}, async () => {
    const db = getDb();
    const tasks = getAllTasks(db);
    const sessions = getAllSessions(db);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ tasks, sessions }, null, 2),
      }],
    };
  });

  server.tool(
    'clear_history',
    'Clear all task and agent history',
    { confirm: z.boolean().describe('Must be true to confirm clearing') },
    async ({ confirm }) => {
      if (!confirm) return { content: [{ type: 'text', text: 'Pass confirm: true to clear history' }] };
      clearAll(getDb());
      broadcast({ type: 'update', tasks: [], sessions: [] });
      return { content: [{ type: 'text', text: 'History cleared' }] };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);

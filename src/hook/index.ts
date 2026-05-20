import { getDb, upsertTask, upsertSession } from '../db/index.js';
import os from 'os';
import path from 'path';
import fs from 'fs';
import net from 'net';

const PORT_FILE = path.join(os.homedir(), '.cc-taskboard', 'port');
const ERROR_LOG = path.join(os.homedir(), '.cc-taskboard', 'hook-errors.log');

function logError(msg: string): void {
  try {
    fs.appendFileSync(ERROR_LOG, `[${new Date().toISOString()}] ${msg}\n`);
  } catch {}
}

function notifyServer(data: object): void {
  // Fire-and-forget: tell the MCP server something changed
  try {
    const portStr = fs.readFileSync(PORT_FILE, 'utf8').trim();
    const port = parseInt(portStr, 10);
    if (!port) return;

    const msg = JSON.stringify({ type: 'update', ...data });
    const client = net.createConnection({ port, host: '127.0.0.1' });
    client.on('connect', () => {
      client.write(msg + '\n');
      client.destroy();
    });
    client.on('error', () => {}); // server not running, that's fine
  } catch {}
}

async function main(): Promise<void> {
  let raw = '';
  for await (const chunk of process.stdin) {
    raw += chunk;
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw);
  } catch (e) {
    logError(`JSON parse error: ${e}`);
    process.exit(0);
  }

  const toolName = payload.tool_name as string;
  const sessionId = payload.session_id as string;
  const toolInput = payload.tool_input as Record<string, unknown> | undefined;
  const toolResponse = payload.tool_response as Record<string, unknown> | undefined;
  const now = Date.now();

  try {
    const db = getDb();

    if (toolName === 'TaskCreate') {
      const task = toolResponse?.task as { id: string; subject: string } | undefined;
      if (task?.id) {
        upsertTask(db, {
          id: task.id,
          subject: task.subject ?? (toolInput?.subject as string) ?? '',
          description: (toolInput?.description as string) ?? null,
          status: 'pending',
          session_id: sessionId,
        });
        // Register this session if not seen
        upsertSession(db, { session_id: sessionId, parent_session_id: null, description: null, spawned_at: now });
      }
    } else if (toolName === 'TaskUpdate') {
      const taskId = (toolInput?.task_id ?? toolInput?.id) as string | undefined;
      if (taskId) {
        upsertTask(db, {
          id: String(taskId),
          session_id: sessionId,
          status: (toolInput?.status as Task['status']) ?? undefined,
        });
      }
    } else if (toolName === 'TaskStop') {
      const taskId = (toolInput?.task_id ?? toolInput?.id) as string | undefined;
      if (taskId) {
        upsertTask(db, { id: String(taskId), session_id: sessionId, status: 'completed' });
      }
    } else if (toolName === 'TaskOutput') {
      const taskId = (toolInput?.task_id ?? toolInput?.id) as string | undefined;
      const output = (toolInput?.output ?? toolResponse?.output) as string | undefined;
      if (taskId) {
        upsertTask(db, { id: String(taskId), session_id: sessionId, output: output ?? null });
      }
    } else if (toolName === 'Agent') {
      // Child agent spawned: tool_response may contain the child's session_id
      const childSessionId = (toolResponse?.session_id ?? toolResponse?.agent_session_id) as string | undefined;
      const description = (toolInput?.description ?? toolInput?.prompt) as string | undefined;
      upsertSession(db, { session_id: sessionId, parent_session_id: null, description: null, spawned_at: now });
      if (childSessionId) {
        upsertSession(db, {
          session_id: childSessionId,
          parent_session_id: sessionId,
          description: description ?? null,
          spawned_at: now,
        });
      }
    }

    notifyServer({ tool_name: toolName, session_id: sessionId });
  } catch (e) {
    logError(`DB error (${toolName}): ${e}`);
  }

  process.exit(0);
}

// TypeScript needs this import style for the Task type
type Task = import('../db/index.js').Task;

main().catch((e) => {
  logError(`Fatal: ${e}`);
  process.exit(0);
});

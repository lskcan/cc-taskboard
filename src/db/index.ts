import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';

const DATA_DIR = path.join(os.homedir(), '.cc-taskboard');
const DB_PATH = path.join(DATA_DIR, 'tasks.db');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('synchronous = NORMAL');
  initSchema(_db);
  return _db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      subject TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      session_id TEXT NOT NULL,
      parent_session_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      output TEXT
    );

    CREATE TABLE IF NOT EXISTS agent_sessions (
      session_id TEXT PRIMARY KEY,
      parent_session_id TEXT,
      description TEXT,
      spawned_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      tool_input TEXT,
      tool_response TEXT,
      ts INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_session ON tasks(session_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);
  `);
}

export interface Task {
  id: string;
  subject: string;
  description: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  session_id: string;
  parent_session_id: string | null;
  created_at: number;
  updated_at: number;
  output: string | null;
}

export interface AgentSession {
  session_id: string;
  parent_session_id: string | null;
  description: string | null;
  spawned_at: number;
}

export function upsertTask(db: Database.Database, task: Partial<Task> & { id: string; session_id: string }): void {
  const now = Date.now();
  db.prepare(`
    INSERT INTO tasks (id, subject, description, status, session_id, parent_session_id, created_at, updated_at, output)
    VALUES (@id, @subject, @description, @status, @session_id, @parent_session_id, @created_at, @updated_at, @output)
    ON CONFLICT(id) DO UPDATE SET
      subject = COALESCE(@subject, subject),
      description = COALESCE(@description, description),
      status = COALESCE(@status, status),
      updated_at = @updated_at,
      output = COALESCE(@output, output)
  `).run({
    id: task.id,
    subject: task.subject ?? '',
    description: task.description ?? null,
    status: task.status ?? 'pending',
    session_id: task.session_id,
    parent_session_id: task.parent_session_id ?? null,
    created_at: now,
    updated_at: now,
    output: task.output ?? null,
  });
}

export function upsertSession(db: Database.Database, session: AgentSession): void {
  db.prepare(`
    INSERT INTO agent_sessions (session_id, parent_session_id, description, spawned_at)
    VALUES (@session_id, @parent_session_id, @description, @spawned_at)
    ON CONFLICT(session_id) DO NOTHING
  `).run(session);
}

export function getAllTasks(db: Database.Database): Task[] {
  return db.prepare('SELECT * FROM tasks ORDER BY created_at DESC LIMIT 200').all() as Task[];
}

export function getAllSessions(db: Database.Database): AgentSession[] {
  return db.prepare('SELECT * FROM agent_sessions ORDER BY spawned_at DESC').all() as AgentSession[];
}

export function clearAll(db: Database.Database): void {
  db.exec('DELETE FROM tasks; DELETE FROM agent_sessions; DELETE FROM events;');
}

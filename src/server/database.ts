import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {DatabaseSync} from 'node:sqlite';

export const createDatabase = (path: string): DatabaseSync => {
  if (path !== ':memory:') mkdirSync(dirname(path), {recursive: true});
  const database = new DatabaseSync(path);
  database.exec('PRAGMA foreign_keys = ON;');
  database.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      stage TEXT NOT NULL,
      runtime_minutes INTEGER NOT NULL,
      dwell_preset_id TEXT NOT NULL,
      snapshot_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS project_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      snapshot_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      input_hash TEXT NOT NULL,
      attempt INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS jobs_project_status_idx
      ON jobs(project_id, status, created_at);
    CREATE INDEX IF NOT EXISTS jobs_dedupe_idx
      ON jobs(project_id, type, input_hash, status);
  `);
  return database;
};

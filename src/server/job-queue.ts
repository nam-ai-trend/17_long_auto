import {randomUUID} from 'node:crypto';
import type {DatabaseSync} from 'node:sqlite';
import type {Job} from '../shared/contracts';
import {jobSchema} from '../shared/contracts';

type JobRow = {
  id: string;
  project_id: string;
  type: string;
  status: string;
  input_hash: string;
  attempt: number;
  error: string | null;
  created_at: string;
  updated_at: string;
};

const fromRow = (row: JobRow): Job =>
  jobSchema.parse({
    id: row.id,
    projectId: row.project_id,
    type: row.type,
    status: row.status,
    inputHash: row.input_hash,
    attempt: row.attempt,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });

export class JobQueue {
  public constructor(private readonly database: DatabaseSync) {}

  public enqueue(projectId: string, type: string, inputHash: string): Job {
    const existing = this.database
      .prepare(
        `SELECT * FROM jobs
         WHERE project_id = ? AND type = ? AND input_hash = ? AND status = 'succeeded'
         ORDER BY updated_at DESC LIMIT 1`,
      )
      .get(projectId, type, inputHash) as unknown as JobRow | undefined;
    if (existing) return fromRow(existing);

    const now = new Date().toISOString();
    const row: JobRow = {
      id: randomUUID(),
      project_id: projectId,
      type,
      status: 'queued',
      input_hash: inputHash,
      attempt: 0,
      error: null,
      created_at: now,
      updated_at: now,
    };
    this.database
      .prepare(
        `INSERT INTO jobs
         (id, project_id, type, status, input_hash, attempt, error, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(...Object.values(row));
    return fromRow(row);
  }

  public claimNext(): Job | null {
    const row = this.database
      .prepare("SELECT * FROM jobs WHERE status = 'queued' ORDER BY created_at LIMIT 1")
      .get() as unknown as JobRow | undefined;
    if (!row) return null;
    const updatedAt = new Date().toISOString();
    this.database
      .prepare("UPDATE jobs SET status = 'running', attempt = attempt + 1, updated_at = ? WHERE id = ?")
      .run(updatedAt, row.id);
    return this.get(row.id);
  }

  public claim(id: string): Job {
    const job = this.get(id);
    if (job.status !== 'queued') throw new Error('대기 중인 작업만 실행할 수 있습니다.');
    const updatedAt = new Date().toISOString();
    this.database
      .prepare("UPDATE jobs SET status = 'running', attempt = attempt + 1, updated_at = ? WHERE id = ?")
      .run(updatedAt, id);
    return this.get(id);
  }

  public succeed(id: string): Job {
    return this.updateStatus(id, 'succeeded', null);
  }

  public fail(id: string, error: string): Job {
    return this.updateStatus(id, 'failed', error);
  }

  public retry(id: string): Job {
    const job = this.get(id);
    if (job.status !== 'failed') throw new Error('실패한 작업만 다시 시도할 수 있습니다.');
    return this.updateStatus(id, 'queued', null);
  }

  public recoverInterrupted(): number {
    const result = this.database
      .prepare("UPDATE jobs SET status = 'queued', updated_at = ? WHERE status = 'running'")
      .run(new Date().toISOString());
    return Number(result.changes);
  }

  public list(projectId: string): Job[] {
    const rows = this.database
      .prepare('SELECT * FROM jobs WHERE project_id = ? ORDER BY created_at DESC')
      .all(projectId) as unknown as JobRow[];
    return rows.map(fromRow);
  }

  private get(id: string): Job {
    const row = this.database.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as unknown as
      | JobRow
      | undefined;
    if (!row) throw new Error('작업을 찾을 수 없습니다.');
    return fromRow(row);
  }

  private updateStatus(id: string, status: Job['status'], error: string | null): Job {
    this.database
      .prepare('UPDATE jobs SET status = ?, error = ?, updated_at = ? WHERE id = ?')
      .run(status, error, new Date().toISOString(), id);
    return this.get(id);
  }
}

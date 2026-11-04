import {randomUUID} from 'node:crypto';
import type {DatabaseSync} from 'node:sqlite';
import type {CreateProjectInput, Project} from '../shared/contracts';
import {projectSchema} from '../shared/contracts';
import {VISUAL_STYLE} from '../shared/presets';

import {syncProjectOutputs} from './project-outputs';

type ProjectRow = {
  snapshot_json: string;
};

export class ProjectRepository {
  public constructor(
    private readonly database: DatabaseSync,
    private readonly assetRoot?: string,
  ) {}

  public list(): Project[] {
    const rows = this.database
      .prepare('SELECT snapshot_json FROM projects ORDER BY updated_at DESC')
      .all() as unknown as ProjectRow[];
    return rows.map((row) => projectSchema.parse(JSON.parse(row.snapshot_json)));
  }

  public get(id: string): Project | null {
    const row = this.database
      .prepare('SELECT snapshot_json FROM projects WHERE id = ?')
      .get(id) as unknown as ProjectRow | undefined;
    return row ? projectSchema.parse(JSON.parse(row.snapshot_json)) : null;
  }

  public create(input: CreateProjectInput): Project {
    const now = new Date().toISOString();
    const project: Project = {
      id: randomUUID(),
      name: input.name,
      stage: 'story',
      settings: {
        runtimeMinutes: input.runtimeMinutes,
        dwellPresetId: input.dwellPresetId,
        era: '조선 후기',
        styleName: VISUAL_STYLE.name,
      },
      storyInput: null,
      candidates: [],
      selectedCandidateId: null,
      chapters: [],
      scenes: [],
      storyDevelopment: null,
      cues: [],
      visualBible: [],
      sceneData: [],
      mediaSegments: [],
      visualPromptPackages: [],
      createdAt: now,
      updatedAt: now,
    };
    this.insertOrReplace(project);
    if (this.assetRoot) {
      try {
        syncProjectOutputs(project, this.assetRoot);
      } catch {}
    }
    return project;
  }

  public save(project: Project): Project {
    const saved = projectSchema.parse({...project, updatedAt: new Date().toISOString()});
    this.insertOrReplace(saved);
    this.database
      .prepare(
        'INSERT INTO project_snapshots (project_id, snapshot_json, created_at) VALUES (?, ?, ?)',
      )
      .run(saved.id, JSON.stringify(saved), saved.updatedAt);
    if (this.assetRoot) {
      try {
        syncProjectOutputs(saved, this.assetRoot);
      } catch {}
    }
    return saved;
  }

  public delete(id: string): void {
    this.database.prepare('DELETE FROM projects WHERE id = ?').run(id);
    this.database.prepare('DELETE FROM project_snapshots WHERE project_id = ?').run(id);
    this.database.prepare('DELETE FROM jobs WHERE project_id = ?').run(id);
  }

  public exportManifest(id: string): string {
    const project = this.get(id);
    if (!project) throw new Error('내보낼 프로젝트를 찾을 수 없습니다.');
    return JSON.stringify(project, null, 2);
  }

  public importManifest(manifest: string): Project {
    const project = projectSchema.parse(JSON.parse(manifest));
    this.insertOrReplace(project);
    if (this.assetRoot) {
      try {
        syncProjectOutputs(project, this.assetRoot);
      } catch {}
    }
    return project;
  }

  private insertOrReplace(project: Project): void {
    this.database
      .prepare(`
        INSERT INTO projects (
          id, name, stage, runtime_minutes, dwell_preset_id,
          snapshot_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          stage = excluded.stage,
          runtime_minutes = excluded.runtime_minutes,
          dwell_preset_id = excluded.dwell_preset_id,
          snapshot_json = excluded.snapshot_json,
          updated_at = excluded.updated_at
      `)
      .run(
        project.id,
        project.name,
        project.stage,
        project.settings.runtimeMinutes,
        project.settings.dwellPresetId,
        JSON.stringify(project),
        project.createdAt,
        project.updatedAt,
      );
  }
}

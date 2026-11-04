import {describe, expect, it} from 'vitest';
import {createDatabase} from '../src/server/database';
import {ProjectRepository} from '../src/server/project-repository';

describe('project repository', () => {
  it('프로젝트를 만들고 수정한 상태를 다시 연다', () => {
    const database = createDatabase(':memory:');
    const repository = new ProjectRepository(database);
    const project = repository.create({
      name: '장부의 비밀',
      runtimeMinutes: 50,
      dwellPresetId: 'long',
    });

    repository.save({...project, stage: 'script'});
    const reopened = repository.get(project.id);

    expect(reopened?.name).toBe('장부의 비밀');
    expect(reopened?.stage).toBe('script');
    expect(reopened?.settings.runtimeMinutes).toBe(50);
    expect(reopened?.settings.dwellPresetId).toBe('long');
  });

  it('JSON 매니페스트를 내보내고 새 저장소로 가져온다', () => {
    const source = new ProjectRepository(createDatabase(':memory:'));
    const original = source.create({
      name: '나루터의 맹세',
      runtimeMinutes: 40,
      dwellPresetId: 'balanced',
    });
    const manifest = source.exportManifest(original.id);

    const target = new ProjectRepository(createDatabase(':memory:'));
    const imported = target.importManifest(manifest);

    expect(imported).toEqual(original);
    expect(target.list()).toHaveLength(1);
  });
});

import {describe, expect, it, vi} from 'vitest';
import {CliHiggsfieldProvider} from '../src/server/higgsfield-provider';
import {HiggsfieldVisualRunner} from '../src/server/higgsfield-visual-runner';
import {ProjectRepository} from '../src/server/project-repository';
import {createDatabase} from '../src/server/database';
import {buildVisualPromptPackages} from '../src/server/visual-prompt-builder';
import {join} from 'node:path';
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';

describe('CliHiggsfieldProvider', () => {
  it('자격증명 파일이 없고 CLI 실행도 실패하면 disconnected 상태를 반환한다', async () => {
    const provider = new CliHiggsfieldProvider({
      credentialsPath: '/non/existent/path/credentials.json',
      execImpl: (_cmd, _args, _opts, cb) => cb(new Error('CLI not found'), '', ''),
    });

    const status = await provider.status();
    expect(status.name).toBe('Higgsfield');
    expect(status.status).toBe('disconnected');
    expect(status.detail).toContain('higgsfield auth login');
  });

  it('자격증명 파일이 있고 CLI가 워크스페이스 목록을 반환하면 ready 상태와 플랜/크레딧 정보를 반환한다', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'hf-test-'));
    const credPath = join(tempDir, 'credentials.json');
    writeFileSync(
      credPath,
      JSON.stringify({
        access_token: 'test_token',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      }),
    );

    try {
      const mockExec = vi.fn((_cmd, _args, _opts, cb) => {
        cb(
          null,
          JSON.stringify([
            {
              id: 'ws-123',
              name: 'My Workspace',
              plan_type: 'ultra',
              credits: 1250.5,
              is_selected: true,
              user_role: 'owner',
            },
          ]),
          '',
        );
      });

      const provider = new CliHiggsfieldProvider({
        credentialsPath: credPath,
        execImpl: mockExec,
      });

      const status = await provider.status();
      expect(status.name).toBe('Higgsfield');
      expect(status.status).toBe('ready');
      expect(status.detail).toContain('ULTRA 플랜');
      expect(status.detail).toContain('1,250.5');

      // 두 번째 호출 시 캐시가 동작하여 exec이 다시 호출되지 않아야 함
      await provider.status();
      expect(mockExec).toHaveBeenCalledTimes(1);
    } finally {
      rmSync(tempDir, {recursive: true, force: true});
    }
  });

  it('자격증명 파일은 유효하지만 CLI 실행이 실패하면 기본 인증 확인 메시지와 함께 ready를 반환한다', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'hf-test-'));
    const credPath = join(tempDir, 'credentials.json');
    writeFileSync(
      credPath,
      JSON.stringify({
        access_token: 'test_token',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      }),
    );

    try {
      const provider = new CliHiggsfieldProvider({
        credentialsPath: credPath,
        execImpl: (_cmd, _args, _opts, cb) => cb(new Error('CLI spawn failed'), '', ''),
      });

      const status = await provider.status();
      expect(status.name).toBe('Higgsfield');
      expect(status.status).toBe('ready');
      expect(status.detail).toBe('Higgsfield CLI 인증이 확인되었습니다.');
    } finally {
      rmSync(tempDir, {recursive: true, force: true});
    }
  });

  it('cleanupZombies는 비활성 상태에서 남아있는 generating 패키지를 failed로, queued 패키지를 planned로 정리한다', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'hf-runner-test-'));
    try {
      const db = createDatabase(':memory:');
      const repo = new ProjectRepository(db, tempDir);
      const proj = repo.create({name: '좀비 테스트', runtimeMinutes: 30, dwellPresetId: 'balanced'});

      const packages = buildVisualPromptPackages({
        visualBible: [{id: 'char-1', kind: 'character', name: '홍길동', description: '의적', lockedTraits: [], status: 'ready'}],
        sceneData: [{id: 'scene-data-1', storySceneId: 's1', cueIds: [], start: 0, end: 10, timingSource: 'tts', summary: '', characters: [], location: '', timeframe: '', emotion: '', action: '', objectStates: [], previousLink: null, nextLink: null}],
        mediaSegments: [
          {id: 'seg-1', sceneId: 's1', sceneDataId: 'scene-data-1', start: 0, end: 5, type: 'video', prompt: '도입', semanticBreak: null, referenceKeys: [], parallaxRecommended: false, parallaxEnabled: false, motionStages: []},
          {id: 'seg-2', sceneId: 's1', sceneDataId: 'scene-data-1', start: 5, end: 10, type: 'still', prompt: '본편', semanticBreak: null, referenceKeys: [], parallaxRecommended: false, parallaxEnabled: false, motionStages: []},
        ],
      });

      // 0번째는 ready, 1번째는 generating, 2번째는 queued로 설정
      packages[0] = {...packages[0], status: 'ready', assetUrl: '/media/ready.png'};
      packages[1] = {...packages[1], status: 'generating'};
      packages[2] = {...packages[2], status: 'queued'};

      proj.visualPromptPackages = packages;
      repo.save(proj);

      const runner = new HiggsfieldVisualRunner(db, tempDir);
      const cleaned = runner.cleanupZombies(proj.id);

      const p0 = cleaned.visualPromptPackages.find((p) => p.id === packages[0].id);
      const p1 = cleaned.visualPromptPackages.find((p) => p.id === packages[1].id);
      const p2 = cleaned.visualPromptPackages.find((p) => p.id === packages[2].id);

      expect(p0?.status).toBe('ready');
      expect(p0?.assetUrl).toBe('/media/ready.png');
      expect(p1?.status).toBe('failed');
      expect(p1?.error).toContain('중단');
      expect(p2?.status).toBe('planned');
    } finally {
      rmSync(tempDir, {recursive: true, force: true});
    }
  });
});

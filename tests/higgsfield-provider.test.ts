import {describe, expect, it, vi} from 'vitest';
import {CliHiggsfieldProvider} from '../src/server/higgsfield-provider';
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
});

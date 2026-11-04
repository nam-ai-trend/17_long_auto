import {execFile} from 'node:child_process';
import {existsSync, readFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import type {ProviderStatus, VisualProvider} from './providers';

export interface HiggsfieldWorkspace {
  id: string;
  name: string | null;
  plan_type: string;
  credits: number;
  is_selected: boolean;
  user_role: string;
}

interface CredentialsFile {
  access_token?: string;
  expires_at?: number;
  token_type?: string;
}

export interface HiggsfieldProviderOptions {
  credentialsPath?: string;
  cliBinary?: string;
  cacheTtlMs?: number;
  execImpl?: (
    command: string,
    args: string[],
    options: {env: NodeJS.ProcessEnv; timeout: number},
    callback: (error: Error | null, stdout: string, stderr: string) => void,
  ) => void;
}

export class CliHiggsfieldProvider implements VisualProvider {
  private readonly credentialsPath: string;
  private readonly cliBinary: string;
  private readonly cacheTtlMs: number;
  private readonly exec: NonNullable<HiggsfieldProviderOptions['execImpl']>;
  private cachedStatus: ProviderStatus | null = null;
  private cacheExpiresAt = 0;

  public constructor(options: HiggsfieldProviderOptions = {}) {
    this.credentialsPath =
      options.credentialsPath ?? join(homedir(), '.config', 'higgsfield', 'credentials.json');
    this.cliBinary = options.cliBinary ?? 'higgsfield';
    this.cacheTtlMs = options.cacheTtlMs ?? 60_000;
    this.exec = options.execImpl ?? execFile;
  }

  public async status(): Promise<ProviderStatus> {
    const now = Date.now();
    if (this.cachedStatus && now < this.cacheExpiresAt) {
      return this.cachedStatus;
    }

    const nextStatus = await this.checkStatus();
    this.cachedStatus = nextStatus;
    this.cacheExpiresAt = now + this.cacheTtlMs;
    return nextStatus;
  }

  public async generate(): Promise<never> {
    throw new Error('Higgsfield CLI 영상 및 이미지 생성 파이프라인 준비 중입니다.');
  }

  private async checkStatus(): Promise<ProviderStatus> {
    const hasCredentials = this.hasValidCredentialsFile();

    try {
      const workspaces = await this.fetchWorkspaces();
      const active = workspaces.find((item) => item.is_selected) ?? workspaces[0];

      if (active) {
        const planName = active.plan_type ? active.plan_type.toUpperCase() : 'STANDARD';
        const formattedCredits = typeof active.credits === 'number' ? active.credits.toLocaleString() : '0';
        return {
          name: 'Higgsfield',
          status: 'ready',
          detail: `CLI 연결됨 (${planName} 플랜, 크레딧: ${formattedCredits})`,
        };
      }
    } catch {
      // CLI 실행이 실패하더라도 유효한 자격증명 파일이 있으면 ready 상태 유지
      if (hasCredentials) {
        return {
          name: 'Higgsfield',
          status: 'ready',
          detail: 'Higgsfield CLI 인증이 확인되었습니다.',
        };
      }
    }

    if (hasCredentials) {
      return {
        name: 'Higgsfield',
        status: 'ready',
        detail: 'Higgsfield CLI 인증이 확인되었습니다.',
      };
    }

    return {
      name: 'Higgsfield',
      status: 'disconnected',
      detail: '연결 전입니다. higgsfield auth login으로 CLI를 연결할 수 있습니다.',
    };
  }

  private hasValidCredentialsFile(): boolean {
    if (!existsSync(this.credentialsPath)) {
      return false;
    }

    try {
      const raw = readFileSync(this.credentialsPath, 'utf8');
      const data = JSON.parse(raw) as CredentialsFile;
      if (!data.access_token) return false;
      if (data.expires_at && data.expires_at * 1000 < Date.now()) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  private fetchWorkspaces(): Promise<HiggsfieldWorkspace[]> {
    return new Promise((resolve, reject) => {
      const env = {
        ...process.env,
        PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH ?? ''}`,
      };

      this.exec(
        this.cliBinary,
        ['workspace', 'list', '--json'],
        {env, timeout: 3500},
        (error, stdout) => {
          if (error) {
            reject(error);
            return;
          }
          try {
            const parsed = JSON.parse(stdout) as HiggsfieldWorkspace[];
            resolve(parsed);
          } catch (parseError) {
            reject(parseError);
          }
        },
      );
    });
  }
}

export const higgsfieldProvider = new CliHiggsfieldProvider();

import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';

const readProjectFile = (path: string) =>
  readFileSync(join(process.cwd(), path), 'utf8');

describe('브랜드 문서와 전역 타이포그래피', () => {
  it('브라우저 탭 제목을 남다른AI 롱폼으로 설정한다', () => {
    expect(readProjectFile('index.html')).toContain('<title>남다른AI 롱폼</title>');
  });

  it('UI에서 Pretendard를 우선 사용하고 기존 Georgia 지정은 남기지 않는다', () => {
    const styles = readProjectFile('src/client/styles.css');

    expect(styles).toContain('Pretendard Variable');
    expect(styles).not.toContain('Georgia');
  });

  it('회로형 N 심볼을 원본 비율을 보존하는 좌표계로 표시한다', () => {
    const logo = readProjectFile('src/client/assets/namdareun-ai-logo.svg');

    expect(logo).toContain('viewBox="250 250 680 700"');
    expect(logo).toContain('preserveAspectRatio="xMidYMid meet"');
  });
});

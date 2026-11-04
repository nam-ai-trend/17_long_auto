import {describe, expect, it} from 'vitest';
import {buildDemoOutline, generateStoryCandidates} from '../src/server/story-engine';

describe('disconnected story engine', () => {
  it('서로 다른 핵심 구조를 가진 후보를 정확히 세 개 만든다', () => {
    const candidates = generateStoryCandidates({
      mode: 'reference',
      title: '구해 준 여인의 비밀',
      summary: '산길에서 위기에 처한 여인을 구한 사내가 큰 운명의 변화를 맞는다.',
    });

    expect(candidates).toHaveLength(3);
    expect(new Set(candidates.map((item) => item.protagonist)).size).toBe(3);
    expect(new Set(candidates.map((item) => item.location)).size).toBe(3);
    expect(new Set(candidates.map((item) => item.centralObject)).size).toBe(3);
    expect(new Set(candidates.map((item) => item.causalTurn)).size).toBe(3);
    expect(new Set(candidates.map((item) => item.endingPromise)).size).toBe(3);
  });

  it('입력한 제목과 요약문을 후보 본문에 그대로 복사하지 않는다', () => {
    const input = {
      mode: 'reference' as const,
      title: '절대로 복사하면 안 되는 고유 제목',
      summary: '청동 거울을 세 번 두드리자 봉인된 방이 열리는 독특한 사건 배열이다.',
    };
    const candidates = generateStoryCandidates(input);

    for (const candidate of candidates) {
      expect(candidate.title).not.toContain(input.title);
      expect(candidate.premise).not.toContain(input.summary);
    }
  });

  it('선택한 후보에서 다섯 장과 연결된 씬을 만든다', () => {
    const candidate = generateStoryCandidates({
      mode: 'strategy',
      title: '억울한 백성',
      summary: '권세가의 횡포를 지혜로 뒤집는 통쾌한 이야기로 구성한다.',
    })[0];
    const outline = buildDemoOutline(candidate);

    expect(outline.chapters).toHaveLength(5);
    expect(outline.scenes.length).toBeGreaterThanOrEqual(7);
    expect(outline.chapters.flatMap((chapter) => chapter.sceneIds)).toEqual(
      outline.scenes.map((scene) => scene.id),
    );
    expect(outline.scenes[0].text).toContain('세곡 장부가');
    expect(outline.scenes[0].text).not.toContain('세곡 장부이');
  });
});

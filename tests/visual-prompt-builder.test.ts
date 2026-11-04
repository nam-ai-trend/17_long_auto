import {describe, expect, it} from 'vitest';
import {buildVisualPromptPackages} from '../src/server/visual-prompt-builder';
import type {MediaSceneData, MediaSegment, VisualBibleEntry} from '../src/shared/contracts';

const visualBible: VisualBibleEntry[] = [
  {id: 'character-haewon', kind: 'character', name: '해원', description: '스물아홉 약초꾼', lockedTraits: ['왼쪽 눈썹의 흉터', '짙은 갈색 솜옷'], status: 'ready'},
  {id: 'location-mungyeong', kind: 'location', name: '문경 산길', description: '소나무와 눈 덮인 고갯길', lockedTraits: ['굽은 소나무', '좁은 돌길'], status: 'ready'},
  {id: 'object-ledger', kind: 'object', name: '장부', description: '낡은 세곡 장부', lockedTraits: ['푸른 비단끈', '젖은 모서리'], status: 'ready'},
];

const sceneData: MediaSceneData[] = [
  {id: 'media-scene-scene-1', storySceneId: 'scene-1', cueIds: ['cue-1'], start: 0, end: 120, timingSource: 'tts', summary: '해원이 눈길에서 장부를 발견한다.', characters: ['해원'], location: '문경 산길', timeframe: '눈 내리는 밤', emotion: '경계에서 결심', action: '장부를 들어 표지를 살핀다.', objectStates: ['장부: 해원 소유, 눈에 젖음'], previousLink: null, nextLink: '장부를 숨길 곳을 찾는다.'},
];

const mediaSegments: MediaSegment[] = [
  {id: 'intro-1', sceneId: 'scene-1', sceneDataId: 'media-scene-scene-1', start: 0, end: 6, type: 'video', prompt: '도입 영상', semanticBreak: null, referenceKeys: [], parallaxRecommended: false, parallaxEnabled: false, motionStages: []},
  {id: 'still-1', sceneId: 'scene-1', sceneDataId: 'media-scene-scene-1', start: 60, end: 100, type: 'still', prompt: '본편 삽화', semanticBreak: null, referenceKeys: [], parallaxRecommended: true, parallaxEnabled: true, motionStages: []},
];

describe('시각 프롬프트 패키지', () => {
  it('기준팩을 먼저 만들고 도입 키프레임·영상과 본편 삽화를 순서대로 만든다', () => {
    const packages = buildVisualPromptPackages({visualBible, sceneData, mediaSegments});

    expect(packages.slice(0, 3).map((item) => item.kind)).toEqual([
      'character-reference',
      'location-reference',
      'object-reference',
    ]);
    expect(packages.map((item) => item.kind)).toEqual([
      'character-reference',
      'location-reference',
      'object-reference',
      'intro-keyframe',
      'intro-video',
      'scene-still',
    ]);
    expect(packages.find((item) => item.kind === 'intro-video')).toMatchObject({
      model: 'seedance_2_0_fast',
      durationSeconds: 6,
      referenceKeys: ['character-haewon', 'location-mungyeong', 'object-ledger'],
    });
  });

  it('조선 반실사 스타일·구도·조명·모션 여백·고정 특성과 금지 프롬프트를 저장한다', () => {
    const packages = buildVisualPromptPackages({visualBible, sceneData, mediaSegments});
    const still = packages.find((item) => item.kind === 'scene-still');

    expect(still).toMatchObject({
      model: 'seedream_5_0_flash',
      aspectRatio: '16:9',
      cameraDistance: 'medium-wide',
      motionSafeMarginPercent: 12,
    });
    expect(still?.prompt).toContain('Joseon-era');
    expect(still?.prompt).toContain('해원');
    expect(still?.prompt).toContain('문경 산길');
    expect(still?.lockedTraits).toEqual(expect.arrayContaining(['왼쪽 눈썹의 흉터', '굽은 소나무', '푸른 비단끈']));
    expect(still?.negativePrompt).toContain('typography');
    expect(still?.negativePrompt).toContain('watermark');
  });

  it('동일한 입력을 다시 패키징해도 참조 ID와 패키지 ID가 유지된다', () => {
    const first = buildVisualPromptPackages({visualBible, sceneData, mediaSegments});
    const second = buildVisualPromptPackages({visualBible, sceneData, mediaSegments});

    expect(second).toEqual(first);
  });
});

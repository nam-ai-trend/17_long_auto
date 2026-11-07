import {describe, expect, it} from 'vitest';
import {buildVisualPromptPackages, deriveVisualBibleEntries} from '../src/server/visual-prompt-builder';
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

  it('장소 및 오브제 기준팩은 인물이 나오지 않도록 프롬프트와 금지 프롬프트가 설정된다', () => {
    const packages = buildVisualPromptPackages({visualBible, sceneData, mediaSegments});
    const locationPkg = packages.find((item) => item.kind === 'location-reference');
    const objectPkg = packages.find((item) => item.kind === 'object-reference');

    expect(locationPkg?.prompt).toContain('no people');
    expect(locationPkg?.prompt).toContain('no humans');
    expect(locationPkg?.negativePrompt).toContain('people');
    expect(locationPkg?.negativePrompt).toContain('crowd');

    expect(objectPkg?.prompt).toContain('no people');
    expect(objectPkg?.negativePrompt).toContain('people');
    expect(objectPkg?.negativePrompt).toContain('hands');
  });

  it('동일한 입력을 다시 패키징해도 참조 ID와 패키지 ID가 유지된다', () => {
    const first = buildVisualPromptPackages({visualBible, sceneData, mediaSegments});
    const second = buildVisualPromptPackages({visualBible, sceneData, mediaSegments});

    expect(second).toEqual(first);
  });

  it('유명 연예인 실명(김수현 등)이 프롬프트에 들어가면 초상권/저작권 필터 차단 방지를 위해 자동 살균된다', () => {
    const celebrityBible: VisualBibleEntry[] = [
      {id: 'character-kim', kind: 'character', name: '김수현', description: '젊은 선비 Kim Soo-hyun', lockedTraits: ['갓'], status: 'ready'},
    ];
    const celebrityScene: MediaSceneData[] = [
      {
        id: 'media-scene-kim',
        storySceneId: 'scene-kim',
        cueIds: ['cue-kim'],
        start: 0,
        end: 10,
        timingSource: 'tts',
        summary: '김수현이 비밀 서찰을 읽는다.',
        characters: ['김수현'],
        location: '한양 서점',
        timeframe: '낮',
        emotion: '긴장',
        action: '김수현이 서찰을 연다.',
        objectStates: [],
        previousLink: null,
        nextLink: null,
      },
    ];
    const celebritySegments: MediaSegment[] = [
      {id: 'kim-segment', sceneId: 'scene-kim', sceneDataId: 'media-scene-kim', start: 0, end: 5, type: 'video', prompt: '', semanticBreak: null, referenceKeys: [], parallaxRecommended: false, parallaxEnabled: false, motionStages: []},
    ];

    const packages = buildVisualPromptPackages({
      visualBible: celebrityBible,
      sceneData: celebrityScene,
      mediaSegments: celebritySegments,
    });

    for (const pkg of packages) {
      expect(pkg.prompt).not.toContain('김수현');
      expect(pkg.prompt).not.toContain('Kim Soo-hyun');
    }
  });

  it('동일 공간의 세부 위치(한양의 서점, 서점 안, 서점 밖) 중복 기준팩을 하나로 통합하고 소품을 자동 추출한다', () => {
    const duplicateScenes: MediaSceneData[] = [
      {
        id: 'ms-1',
        storySceneId: 's-1',
        cueIds: ['c-1'],
        start: 0,
        end: 30,
        timingSource: 'tts',
        summary: '서점에서 서책을 정리한다.',
        characters: ['도윤'],
        location: '한양의 서점',
        timeframe: '낮',
        emotion: '평온',
        action: '서책을 정리한다.',
        objectStates: ['붉은 비단 서찰: 서책 사이에 숨겨짐'],
        previousLink: null,
        nextLink: null,
      },
      {
        id: 'ms-2',
        storySceneId: 's-2',
        cueIds: ['c-2'],
        start: 30,
        end: 60,
        timingSource: 'tts',
        summary: '서점 안에서 대화를 나눈다.',
        characters: ['도윤'],
        location: '서점 안',
        timeframe: '낮',
        emotion: '긴장',
        action: '대화를 나눈다.',
        objectStates: [],
        previousLink: null,
        nextLink: null,
      },
      {
        id: 'ms-3',
        storySceneId: 's-3',
        cueIds: ['c-3'],
        start: 60,
        end: 90,
        timingSource: 'tts',
        summary: '서점 밖을 살핀다.',
        characters: ['도윤'],
        location: '서점 밖',
        timeframe: '낮',
        emotion: '경계',
        action: '바깥을 살핀다.',
        objectStates: [],
        previousLink: null,
        nextLink: null,
      },
    ];

    const entries = deriveVisualBibleEntries({
      existing: [
        {id: 'loc-1', kind: 'location', name: '한양의 서점', description: '서점 전경', lockedTraits: [], status: 'ready'},
        {id: 'loc-2', kind: 'location', name: '서점 안', description: '서점 내부', lockedTraits: [], status: 'ready'},
        {id: 'loc-3', kind: 'location', name: '서점 밖', description: '서점 외부', lockedTraits: [], status: 'ready'},
      ],
      storyDevelopment: null,
      sceneData: duplicateScenes,
    });

    const locations = entries.filter((e) => e.kind === 'location');
    const objects = entries.filter((e) => e.kind === 'object');
    expect(locations).toHaveLength(1);
    expect(locations[0]?.name).toBe('한양의 서점');
    expect(objects.some((o) => o.name === '붉은 비단 서찰')).toBe(true);
  });

  it('연속된 대사 구간마다 중복 없는 샷 전개·연속성 락을 생성하고 소품 발견 전에는 소품 레퍼런스를 미리 노출하지 않는다', () => {
    const bible: VisualBibleEntry[] = [
      {id: 'character-1', kind: 'character', name: '도윤', description: '서점 주인', lockedTraits: ['쪽빛 한복'], status: 'ready'},
      {id: 'location-bookstore', kind: 'location', name: '한양의 서점', description: '서점 실내', lockedTraits: ['목재 서가'], status: 'ready'},
      {id: 'object-letter', kind: 'object', name: '붉은 비단 서찰', description: '비밀 서찰', lockedTraits: ['붉은 비단'], status: 'ready'},
    ];
    const scenes: MediaSceneData[] = [
      {
        id: 'ms-intro',
        storySceneId: 'scene-1',
        cueIds: ['c1', 'c2', 'c3', 'c4'],
        start: 0,
        end: 20,
        timingSource: 'tts',
        summary: '도윤이 서책을 정리하다가 서찰을 발견한다.',
        characters: ['도윤'],
        location: '한양의 서점',
        timeframe: '낮',
        emotion: '평온에서 호기심',
        action: '서찰을 열어본다.',
        objectStates: ['붉은 비단 서찰: 책장 사이에 숨겨져 있음'],
        previousLink: null,
        nextLink: null,
      },
    ];
    const segments: MediaSegment[] = [
      {id: 'intro-1', sceneId: 'scene-1', sceneDataId: 'ms-intro', start: 0, end: 5, type: 'video', prompt: '', semanticBreak: null, referenceKeys: [], parallaxRecommended: false, parallaxEnabled: false, motionStages: []},
      {id: 'intro-2', sceneId: 'scene-1', sceneDataId: 'ms-intro', start: 5, end: 10, type: 'video', prompt: '', semanticBreak: null, referenceKeys: [], parallaxRecommended: false, parallaxEnabled: false, motionStages: []},
      {id: 'intro-3', sceneId: 'scene-1', sceneDataId: 'ms-intro', start: 10, end: 15, type: 'video', prompt: '', semanticBreak: null, referenceKeys: [], parallaxRecommended: false, parallaxEnabled: false, motionStages: []},
      {id: 'intro-4', sceneId: 'scene-1', sceneDataId: 'ms-intro', start: 15, end: 20, type: 'video', prompt: '', semanticBreak: null, referenceKeys: [], parallaxRecommended: false, parallaxEnabled: false, motionStages: []},
    ];
    const cues = [
      {start: 0, end: 4.8, text: '한양의 작은 서점에서 도윤은 오늘도 묵묵히 서책을 정리하고 있었습니다.'},
      {start: 5, end: 9.8, text: '창문 너머로 들어오는 따사로운 햇살, 조용하고 평화로운 분위기.'},
      {start: 10, end: 14.8, text: '오래된 서책들 사이에서 무언가 이질적인 물체를 발견합니다.'},
      {start: 15, end: 19.8, text: '도윤은 조심스럽게 붉은 비단 서찰을 집어듭니다.'},
    ];

    const packages = buildVisualPromptPackages({
      visualBible: bible,
      sceneData: scenes,
      mediaSegments: segments,
      cues,
    });

    const keyframes = packages.filter((p) => p.kind === 'intro-keyframe');
    expect(keyframes).toHaveLength(4);

    // 1~2번 샷(발견 이전 일상/햇살 묘사)에는 붉은 비단 서찰 레퍼런스가 미리 주입되지 않아야 함
    expect(keyframes[0]?.referenceKeys).toEqual(['character-1', 'location-bookstore']);
    expect(keyframes[1]?.referenceKeys).toEqual(['character-1', 'location-bookstore']);
    expect(keyframes[0]?.prompt).toContain('none visible yet (pre-discovery routine shot)');

    // 3~4번 샷(발견 및 집어들기)에는 인물 + 장소 + 오브제 기준팩이 모두 주입되어야 함
    expect(keyframes[2]?.referenceKeys).toEqual(['character-1', 'location-bookstore', 'object-letter']);
    expect(keyframes[3]?.referenceKeys).toEqual(['character-1', 'location-bookstore', 'object-letter']);

    // 2번 샷 이후부터는 동일 공간 연속성 락(continuity lock)이 적용되어야 함
    expect(keyframes[1]?.prompt).toContain('continuity lock');
    expect(keyframes[2]?.prompt).toContain('continuity lock');

    // 4개 샷의 프롬프트가 모두 서로 달라야 함 (중복 액션 방지)
    const uniquePrompts = new Set(keyframes.map((k) => k.prompt));
    expect(uniquePrompts.size).toBe(4);
  });
});

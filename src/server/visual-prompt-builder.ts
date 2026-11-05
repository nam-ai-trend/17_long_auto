import type {
  MediaSceneData,
  MediaSegment,
  StoryDevelopment,
  VisualBibleEntry,
  VisualPromptPackage,
} from '../shared/contracts';
import {VISUAL_LIMITS, VISUAL_STYLE} from '../shared/presets';

type BuildVisualPromptPackagesInput = {
  visualBible: VisualBibleEntry[];
  sceneData: MediaSceneData[];
  mediaSegments: MediaSegment[];
  cues?: Array<{start: number; end: number; text: string}>;
};

type DeriveVisualBibleInput = {
  existing: VisualBibleEntry[];
  storyDevelopment: StoryDevelopment | null;
  sceneData: MediaSceneData[];
};

const stableToken = (value: string) => {
  let hash = 5381;
  for (const character of value) hash = ((hash << 5) + hash) ^ character.codePointAt(0)!;
  return (hash >>> 0).toString(36);
};

export const deriveVisualBibleEntries = ({
  existing,
  storyDevelopment,
  sceneData,
}: DeriveVisualBibleInput): VisualBibleEntry[] => {
  const additions: VisualBibleEntry[] = [];
  const hasEntry = (kind: VisualBibleEntry['kind'], name: string) =>
    [...existing, ...additions].some((entry) => entry.kind === kind && entry.name === name);

  for (const character of storyDevelopment?.storyBible.characters ?? []) {
    if (additions.filter((entry) => entry.kind === 'character').length
      + existing.filter((entry) => entry.kind === 'character').length >= VISUAL_LIMITS.characters) break;
    if (hasEntry('character', character.name)) continue;
    additions.push({
      id: `character-${character.id}`,
      kind: 'character',
      name: character.name,
      description: `${character.role}. 욕망: ${character.desire}. 말투: ${character.speech}`,
      lockedTraits: [`${character.name}의 얼굴·헤어·체형`, `${character.role}에 맞는 조선 후기 복식`],
      status: 'draft',
    });
  }

  for (const location of [...new Set(sceneData.map((scene) => scene.location))]) {
    if (additions.filter((entry) => entry.kind === 'location').length
      + existing.filter((entry) => entry.kind === 'location').length >= VISUAL_LIMITS.locations) break;
    if (hasEntry('location', location)) continue;
    additions.push({
      id: `location-${stableToken(location)}`,
      kind: 'location',
      name: location,
      description: `이야기에 반복 등장하는 ${location}의 기준 전경`,
      lockedTraits: [`${location}의 지형과 건축 배치`, '처음 승인된 계절·생활 흔적'],
      status: 'draft',
    });
  }

  for (const object of storyDevelopment?.continuityLedger.objects ?? []) {
    if (additions.filter((entry) => entry.kind === 'object').length
      + existing.filter((entry) => entry.kind === 'object').length >= VISUAL_LIMITS.objects) break;
    if (hasEntry('object', object.objectId)) continue;
    additions.push({
      id: `object-${stableToken(object.objectId)}`,
      kind: 'object',
      name: object.objectId,
      description: `${object.significance}. 현재 상태: ${object.condition}`,
      lockedTraits: [`${object.objectId}의 재질·형태`, `손상 상태: ${object.condition}`],
      status: 'draft',
    });
  }

  return [...existing, ...additions];
};

const baseFields = {
  negativePrompt: VISUAL_STYLE.negative,
  aspectRatio: '16:9' as const,
  composition: 'subject on a rule-of-thirds anchor with readable foreground and layered depth',
  cameraDistance: 'medium-wide',
  lighting: 'period-accurate warm practical light with restrained cinematic contrast',
  motionSafeMarginPercent: 12,
  status: 'planned' as const,
  assetUrl: null,
  feedback: null,
  error: null,
  jobId: null,
};

const referenceKind = (kind: VisualBibleEntry['kind']): VisualPromptPackage['kind'] =>
  kind === 'character'
    ? 'character-reference'
    : kind === 'location'
      ? 'location-reference'
      : 'object-reference';

const referenceModel = (kind: VisualBibleEntry['kind']): VisualPromptPackage['model'] =>
  kind === 'character'
    ? 'seedream_5_0_flash'
    : kind === 'location'
      ? 'seedream_5_0_flash'
      : 'seedream_5_0_flash';

const relevantReferences = (
  scene: MediaSceneData,
  entries: VisualBibleEntry[],
): VisualBibleEntry[] =>
  entries.filter((entry) => {
    if (entry.kind === 'character') return scene.characters.includes(entry.name);
    if (entry.kind === 'location') return scene.location.includes(entry.name) || entry.name.includes(scene.location);
    const haystack = `${scene.summary} ${scene.action} ${scene.objectStates.join(' ')}`;
    return haystack.includes(entry.name);
  });

const inferPhysicalAction = (cueText?: string, defaultAction?: string): string => {
  if (!cueText) return defaultAction || 'character in natural expressive motion';
  const text = cueText.trim();

  // 문을 열거나 주저하는 동작
  if (text.includes('문') && (text.includes('열') || text.includes('들어서') || text.includes('주저') || text.includes('숨을 멈췄'))) {
    return 'character pauses with hand on the wooden lattice sliding door, slowly sliding it open with tense, watchful eyes';
  }
  // 복도나 마당을 걷는 이동 동작
  if (text.includes('걸음') || text.includes('향해') || text.includes('발걸음') || text.includes('걸어')) {
    return 'character walks forward with heavy, purposeful steps down the traditional wooden veranda, turning head to check surroundings';
  }
  // 서찰, 서랍, 단서 발견 및 집어드는 신체 동작
  if (text.includes('서랍') || text.includes('서찰') || text.includes('노리개') || text.includes('집어') || text.includes('발견') || text.includes('단서') || text.includes('반짝이는') || text.includes('구석')) {
    return 'character reaches hands out to carefully examine the cracked drawer and pick up the folded parchment letter, eyes wide with discovery';
  }
  // 빈 방의 바람, 적막감, 창문
  if (text.includes('바람') || text.includes('창문') || text.includes('정리하던') || text.includes('자리') || text.includes('아무도')) {
    return 'character stands still before the vacant room as chilly wind drafts through the lattice window, robe fluttering with quiet sorrow';
  }
  // 방 내부를 조심스럽게 둘러보는 동작
  if (text.includes('둘러') || text.includes('살피') || text.includes('조심스럽게') || text.includes('바라보') || text.includes('확인') || text.includes('단정했으나')) {
    return 'character steps cautiously across the wooden floorboards, turning head to scan the quiet, shadowed room with deep unease';
  }
  // 회상과 불안한 결심 (주먹을 쥐거나 멈춰서는 신체 동작)
  if (text.includes('소중한') || text.includes('친구') || text.includes('행동') || text.includes('뇌리') || text.includes('조심스러운')) {
    return 'character slows pace with clenched fists, remembering distant memories as a shadow of dread crosses their face';
  }
  // 고뇌와 의심
  if (text.includes('마음') || text.includes('불길') || text.includes('생각') || text.includes('의심') || text.includes('부재')) {
    return 'character pauses and furrows brow in troubled contemplation, eyes shifting nervously as dark suspicions take hold';
  }
  // 배경 및 분위기
  if (text.includes('공기') || text.includes('아침') || text.includes('집안') || text.includes('대문') || text.includes('마당')) {
    return 'chilly morning breeze sweeping through the grand estate courtyard, fabric banners fluttering as the camera slowly pushes in';
  }

  return defaultAction || 'character in natural expressive motion, breathing and turning with realistic posture';
};

const scenePrompt = (
  scene: MediaSceneData,
  instruction: string,
  dynamicAction?: string,
) => [
  VISUAL_STYLE.prompt,
  `scene: ${scene.summary}`,
  `characters: ${scene.characters.join(', ') || 'no visible character'}`,
  `location: ${scene.location}`,
  `time: ${scene.timeframe}`,
  `emotion: ${scene.emotion}`,
  `action: ${dynamicAction || scene.action}`,
  `objects: ${scene.objectStates.join('; ') || 'none'}`,
  `composition: ${baseFields.composition}`,
  `camera distance: ${baseFields.cameraDistance}`,
  `lighting: ${baseFields.lighting}`,
  instruction,
].join('. ');

export const buildVisualPromptPackages = ({
  visualBible,
  sceneData,
  mediaSegments,
  cues = [],
}: BuildVisualPromptPackagesInput): VisualPromptPackage[] => {
  const cappedEntries = [
    ...visualBible.filter((entry) => entry.kind === 'character').slice(0, VISUAL_LIMITS.characters),
    ...visualBible.filter((entry) => entry.kind === 'location').slice(0, VISUAL_LIMITS.locations),
    ...visualBible.filter((entry) => entry.kind === 'object').slice(0, VISUAL_LIMITS.objects),
  ];
  const packages: VisualPromptPackage[] = cappedEntries.map((entry) => {
    const isCharacter = entry.kind === 'character';
    const isLocation = entry.kind === 'location';

    let promptText = '';
    let negativeText: string = VISUAL_STYLE.negative;

    if (isCharacter) {
      promptText = [
        VISUAL_STYLE.prompt,
        `character reference sheet for ${entry.name}`,
        entry.description,
        `locked traits: ${entry.lockedTraits.join(', ') || 'preserve the approved design'}`,
        'fictional character, no Soul ID, consistent front, profile and expression views, neutral background sheet',
      ].join('. ');
    } else if (isLocation) {
      promptText = [
        'mature semi-realistic Joseon-era architectural and landscape digital illustration, restrained ink contours, tactile painterly brushwork, atmospheric depth, period-accurate warm natural light, Joseon historical atmosphere',
        `location environment reference for ${entry.name}`,
        entry.description,
        `locked traits: ${entry.lockedTraits.join(', ') || 'preserve the approved setting design'}`,
        'pure architectural and natural scenery, completely uninhabited, vacant background, strictly no people, no humans, no crowd, no silhouette of person, empty environment',
      ].join('. ');
      negativeText = `${VISUAL_STYLE.negative}, people, person, human, crowd, man, woman, character, face, silhouette of person, walking people, standing person`;
    } else {
      promptText = [
        'mature semi-realistic Joseon-era historical object illustration, tactile painterly brushwork, exquisite authentic texture and craftsmanship, period-accurate light',
        `canonical prop reference for ${entry.name}`,
        entry.description,
        `locked traits: ${entry.lockedTraits.join(', ') || 'preserve the approved object design'}`,
        'isolated prop still-life study, focused on object detail, strictly no people, no humans, no hands holding',
      ].join('. ');
      negativeText = `${VISUAL_STYLE.negative}, people, person, human, character, face, hands, holding, crowd`;
    }

    return {
      id: `prompt-reference-${entry.id}`,
      kind: referenceKind(entry.kind),
      sourceId: entry.id,
      sceneDataId: null,
      mediaSegmentId: null,
      model: referenceModel(entry.kind),
      ...baseFields,
      prompt: promptText,
      negativePrompt: negativeText,
      referenceKeys: [entry.id],
      durationSeconds: null,
      lockedTraits: entry.lockedTraits,
    };
  });
  const sceneById = new Map(sceneData.map((scene) => [scene.id, scene]));

  for (const segment of mediaSegments) {
    const scene = (segment.sceneDataId && sceneById.get(segment.sceneDataId))
      ?? sceneData.find((item) => item.storySceneId === segment.sceneId);
    if (!scene) continue;
    const references = relevantReferences(scene, cappedEntries);
    const referenceKeys = references.map((entry) => entry.id);
    const lockedTraits = references.flatMap((entry) => entry.lockedTraits);
    const common = {
      sourceId: segment.id,
      sceneDataId: scene.id,
      mediaSegmentId: segment.id,
      referenceKeys,
      lockedTraits,
      ...baseFields,
    };

    const matchingCue = cues.find(
      (c) => Math.abs(c.start - segment.start) < 0.25 || (segment.start >= c.start && segment.start < c.end),
    );
    const dynamicAction = inferPhysicalAction(matchingCue?.text, scene.action);

    if (segment.type === 'video') {
      packages.push({
        id: `prompt-keyframe-${segment.id}`,
        kind: 'intro-keyframe',
        model: 'seedream_5_0_flash',
        prompt: scenePrompt(
          scene,
          `opening keyframe capturing the decisive instant: ${dynamicAction}, clear focal subject`,
          dynamicAction,
        ),
        durationSeconds: null,
        ...common,
      });
      packages.push({
        id: `prompt-video-${segment.id}`,
        kind: 'intro-video',
        model: 'seedance_2_0_fast',
        prompt: scenePrompt(
          scene,
          `cinematic dynamic motion: ${dynamicAction}, smooth cinematic camera tracking, fluid cloth movement, expressive facial acting, deep atmospheric lighting`,
          dynamicAction,
        ),
        durationSeconds: Number((segment.end - segment.start).toFixed(3)),
        ...common,
      });
      continue;
    }

    packages.push({
      id: `prompt-still-${segment.id}`,
      kind: 'scene-still',
      model: 'seedream_5_0_flash',
      prompt: scenePrompt(
        scene,
        `single storytelling illustration with layered depth for cinematic camera motion: ${dynamicAction}`,
        dynamicAction,
      ),
      durationSeconds: null,
      ...common,
    });
  }

  return packages;
};

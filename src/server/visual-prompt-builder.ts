import type {
  MediaSceneData,
  MediaSegment,
  StoryDevelopment,
  VisualBibleEntry,
  VisualPromptPackage,
} from '../shared/contracts';
import {VISUAL_LIMITS, VISUAL_STYLE} from '../shared/presets';
import {sanitizePromptSafety} from './prompt-safety';

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

/**
 * 장소명의 지리적 수식어(한양의, 마을의 등)와 공간 세부 위치어(안, 밖, 내부, 외부, 앞, 뒤 등)를
 * 제거하여 핵심 장소 루트 키워드를 추출한다. (예: '한양의 서점', '서점 안', '서점 밖' -> '서점')
 */
export const normalizeLocationRoot = (rawLocation: string): string => {
  if (!rawLocation) return '';
  let cleaned = rawLocation
    .trim()
    .replace(/^(조선|한양|도성|고을|마을|산골|궁궐|관아|집안|성내|성밖|근교)의?\s+/g, '')
    .replace(/\s+(안|밖|내부|외부|앞|뒤|구석|한켠|근처|주변|입구|복도|마당|건넌방|안방|행랑채)$/g, '')
    .replace(/(안|밖|내부|외부)$/g, (match, _p1, offset, str) => (str.length > match.length + 1 ? '' : match))
    .replace(/^(뒷골목|골목길|골목|길거리|저잣거리|번화가)$/, '거리')
    .trim();
  return cleaned || rawLocation.trim();
};

export const isSameCanonicalLocation = (locA: string, locB: string): boolean => {
  const rootA = normalizeLocationRoot(locA);
  const rootB = normalizeLocationRoot(locB);
  if (!rootA || !rootB) return false;
  return rootA === rootB || rootA.includes(rootB) || rootB.includes(rootA);
};

const isInteriorBuildingLocation = (locationName: string): boolean =>
  /(서점|서재|방|집|사랑채|안채|대청|관아|주막|객주|기방|약방|전각|편전|옥사|감옥|점포|가게|공방|헛간|창고)/.test(
    locationName,
  );

export const deriveVisualBibleEntries = ({
  existing,
  storyDevelopment,
  sceneData,
}: DeriveVisualBibleInput): VisualBibleEntry[] => {
  // 기존 항목 중에서도 핵심 장소 루트가 중복되는 장소 기준팩을 먼저 단일화
  const deduplicatedExisting: VisualBibleEntry[] = [];
  for (const entry of existing) {
    if (entry.kind === 'location') {
      const alreadyHasSameLocation = deduplicatedExisting.some(
        (e) => e.kind === 'location' && isSameCanonicalLocation(e.name, entry.name),
      );
      if (alreadyHasSameLocation) continue;
    }
    deduplicatedExisting.push(entry);
  }

  const additions: VisualBibleEntry[] = [];
  const hasEntry = (kind: VisualBibleEntry['kind'], name: string) =>
    [...deduplicatedExisting, ...additions].some((entry) => {
      if (entry.kind !== kind) return false;
      if (kind === 'location') return isSameCanonicalLocation(entry.name, name);
      return entry.name === name;
    });

  for (const character of storyDevelopment?.storyBible.characters ?? []) {
    if (
      additions.filter((entry) => entry.kind === 'character').length +
        deduplicatedExisting.filter((entry) => entry.kind === 'character').length >=
      VISUAL_LIMITS.characters
    )
      break;
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

  for (const location of [...new Set(sceneData.map((scene) => scene.location).filter(Boolean))]) {
    if (
      additions.filter((entry) => entry.kind === 'location').length +
        deduplicatedExisting.filter((entry) => entry.kind === 'location').length >=
      VISUAL_LIMITS.locations
    )
      break;
    if (hasEntry('location', location)) continue;
    const canonicalName = location.replace(/\s+(안|밖|내부|외부)$/, '').trim() || location;
    additions.push({
      id: `location-${stableToken(canonicalName)}`,
      kind: 'location',
      name: canonicalName,
      description: isInteriorBuildingLocation(canonicalName)
        ? `이야기에 반복 등장하는 ${canonicalName}의 실내 구조·가구 배치·채광 기준 전경`
        : `이야기에 반복 등장하는 ${canonicalName}의 기준 전경`,
      lockedTraits: [
        `${canonicalName}의 지형·실내외 건축 배치와 가구 위치`,
        '처음 승인된 계절·시간대 채광과 생활 흔적',
      ],
      status: 'draft',
    });
  }

  for (const object of storyDevelopment?.continuityLedger.objects ?? []) {
    if (
      additions.filter((entry) => entry.kind === 'object').length +
        deduplicatedExisting.filter((entry) => entry.kind === 'object').length >=
      VISUAL_LIMITS.objects
    )
      break;
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

  // continuityLedger에 누락되었더라도 sceneData.objectStates에 명시된 핵심 소품이 있다면 자동 추출
  for (const rawState of sceneData.flatMap((scene) => scene.objectStates ?? [])) {
    if (
      additions.filter((entry) => entry.kind === 'object').length +
        deduplicatedExisting.filter((entry) => entry.kind === 'object').length >=
      VISUAL_LIMITS.objects
    )
      break;
    const [rawName, rawCondition] = rawState.split(':').map((part) => part.trim());
    if (!rawName || hasEntry('object', rawName)) continue;
    additions.push({
      id: `object-${stableToken(rawName)}`,
      kind: 'object',
      name: rawName,
      description: rawCondition ? `핵심 서사 소품. 상태: ${rawCondition}` : `${rawName} 기준 소품`,
      lockedTraits: [`${rawName}의 고유 재질·형태·색감 고정`, ...(rawCondition ? [`상태: ${rawCondition}`] : [])],
      status: 'draft',
    });
  }

  return [...deduplicatedExisting, ...additions];
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

const extractObjectKeywords = (objectName: string): string[] => {
  const trimmed = objectName.trim();
  if (!trimmed) return [];
  const words = trimmed
    .split(/\s+/)
    .map((w) => w.replace(/[^가-힣a-zA-Z0-9]/g, ''))
    .filter((w) => w.length >= 2);
  return [...new Set([trimmed, ...words])];
};

const DISCOVERY_TRIGGER_REGEX = /(발견|이질적인|물체|끼여|숨겨|눈에\s*띄|찾아|드러나|나타나|놓여\s*있)/;

/**
 * 씬 내부에서 특정 소품(오브제)이 현재 세그먼트 시점에 이미 등장(발견)했는지 판별한다.
 * 초반 일상/배경 묘사 문장(발견 이전)에 소품이 미리 책상 위에 스포일러처럼 놓여있는 현상을 방지한다.
 */
const isObjectActiveInSegment = (
  entry: VisualBibleEntry,
  scene: MediaSceneData,
  segment: MediaSegment,
  cues: Array<{start: number; end: number; text: string}>,
): boolean => {
  const haystack = `${scene.summary} ${scene.action} ${scene.objectStates.join(' ')}`;
  const keywords = extractObjectKeywords(entry.name);
  const matchesScene = keywords.some((kw) => haystack.includes(kw));
  if (!matchesScene) return false;

  if (!cues || cues.length === 0) return true;

  const sceneCues = cues.filter(
    (c) => c.end > scene.start + 0.05 && c.start < scene.end - 0.05,
  );
  if (sceneCues.length <= 1) return true;

  // 씬 내 문장들 중 소품 키워드나 '발견/이질적인 물체'가 처음 등장하는 문장 인덱스 탐색
  const firstMentionIdx = sceneCues.findIndex(
    (c) => keywords.some((kw) => c.text.includes(kw)) || DISCOVERY_TRIGGER_REGEX.test(c.text),
  );

  // 첫 문장(0번)부터 바로 등장하거나 아예 언급이 없으면 씬 전체에서 활성
  if (firstMentionIdx <= 0) return true;

  const firstMentionCue = sceneCues[firstMentionIdx];
  // 현재 세그먼트의 종료 시점이 최초 발견 문장의 시작 시점보다 앞서면 아직 미등장(발견 전 일상/분위기 컷)
  return segment.end > firstMentionCue.start + 0.15;
};

const relevantReferences = (
  scene: MediaSceneData,
  entries: VisualBibleEntry[],
  segment?: MediaSegment,
  cues: Array<{start: number; end: number; text: string}> = [],
): VisualBibleEntry[] =>
  entries.filter((entry) => {
    if (entry.kind === 'character') return scene.characters.includes(entry.name);
    if (entry.kind === 'location') return isSameCanonicalLocation(scene.location, entry.name);
    if (segment) {
      return isObjectActiveInSegment(entry, scene, segment, cues);
    }
    const haystack = `${scene.summary} ${scene.action} ${scene.objectStates.join(' ')}`;
    return extractObjectKeywords(entry.name).some((kw) => haystack.includes(kw));
  });

type NarrativeBeatResult = {
  category: string;
  action: string;
  shotFraming: string;
  isPropFocused: boolean;
};

const SHOT_PROGRESSION_CYCLE = [
  'establishing medium-wide framing showing character within the architectural space',
  'wide atmospheric side angle highlighting natural window light and spatial depth',
  'over-the-shoulder medium framing following the character gaze toward the focal point',
  'tight close-up insert focusing on the key object and surrounding surface texture',
  'medium action shot capturing upper-body posture and cautious hand movement',
  'close-up two-hand tactile shot emphasizing fingers interacting with the object',
  'medium-close portrait capturing subtle eye movement and emotional realization',
  'medium reaction shot showing the character glancing across the room in contemplation',
  'tight dramatic profile close-up capturing tense breathing and inner resolve',
  'climactic medium-close reveal shot capturing the decisive hand action and expression',
];

const analyzeNarrativeBeat = (
  cueText: string | undefined,
  defaultAction: string,
  shotIndexInLocation: number,
  prevCategory: string | null,
): NarrativeBeatResult => {
  const fallbackFraming =
    SHOT_PROGRESSION_CYCLE[shotIndexInLocation % SHOT_PROGRESSION_CYCLE.length];

  if (!cueText || !cueText.trim()) {
    return {
      category: `default_${shotIndexInLocation}`,
      action: defaultAction || 'character in natural expressive motion with realistic posture',
      shotFraming: fallbackFraming,
      isPropFocused: false,
    };
  }

  const text = cueText.trim();
  let category = 'general_acting';
  let baseAction = '';
  let shotFraming = fallbackFraming;
  let isPropFocused = false;

  // 1. 개봉 / 펼치기 / 열람 (서찰·문서·상자 등을 실제로 열어보는 클라이맥스 동작)
  if (/(열어\s*보|열어보|펼쳐|펼치|매듭을\s*풀|봉인을\s*뜯|꺼내어\s*읽|내용을\s*확인)/.test(text)) {
    category = 'unfold_reveal';
    baseAction =
      'character carefully unties the knot and unfolds the item with trembling fingers on the wooden surface, eyes locking onto the revealed contents in tense silence';
    shotFraming = 'climactic medium-close reveal shot focusing on the character hands unfolding the item and their shocked gaze';
  }
  // 2. 독백 / 직접 인용 대사 / 스스로에게 던지는 질문 ("이것은 대체 무엇일까?" 등)
  else if (/["“”'‘’]/.test(text) || /(대체\s*무엇|어찌 된|과연\s*무엇|무슨\s*일|중얼|혼잣말)/.test(text)) {
    category = 'inner_monologue';
    baseAction =
      'character parts lips in a quiet, tense whisper while staring intently at the item held in both hands, taking a steady breath of resolve';
    shotFraming = 'tight dramatic close-up on the character face and murmuring lips with shallow depth of field';
  }
  // 3. 머릿속 고뇌 / 스쳐가는 생각 / 불길한 예감 및 주변 경계
  else if (/(머릿속|생각이\s*스쳐|수많은\s*생각|불길한|의심|고뇌|혼란|뇌리|번뜩)/.test(text)) {
    category = 'troubled_contemplation';
    baseAction =
      'character pauses in deep, troubled contemplation with furrowed brow, eyes shifting warily toward the doorway and lattice window as dark suspicions take hold';
    shotFraming = 'medium reaction shot capturing the character tense posture and watchful glance across the room';
  }
  // 4. 소품의 범상치 않은 가치·정체 직감 (귀한 비단, 평범한 ~이 아니었다 등)
  else if (/(귀한|평범한.*아니|범상치|예사롭지|왕실|비밀|증거|진품|가짜)/.test(text)) {
    category = 'realization_gravity';
    baseAction =
      'character inspects the fine craftsmanship closely and lifts gaze with widened eyes, expression hardening from curiosity into grave realization';
    shotFraming = 'medium-close portrait emphasizing the character shifting facial expression and realization';
  }
  // 5. 손에 쥐고 촉감·질감·무게를 느끼는 동작
  else if (/(손에\s*쥐|질감|촉감|감촉|무게|단단히\s*묶|어루만지|만져\s*보)/.test(text)) {
    category = 'tactile_grasp';
    baseAction =
      'character holds the wrapped item firmly in both hands, fingertips slowly tracing the tight knot and rich fabric weave to feel its tactile texture';
    shotFraming = 'close-up tactile insert shot focusing on the character hands and fingers examining the item';
  }
  // 6. 망설임 끝에 조심스레 손을 뻗는 동작
  else if (/(망설|주저|호기심|손을\s*뻗|조심스레\s*손|다가가\s*손)/.test(text)) {
    category = 'hesitant_reach';
    baseAction =
      'character hesitates for a tense beat, swallowing nervously before slowly extending a cautious hand forward to reach for the item';
    shotFraming = 'medium side-angle shot capturing the character hesitant posture and outstretched hand';
  }
  // 7. 발견된 소품 자체의 외형/정체 단독 묘사 ("그것은 붉은 비단으로 감싸진 ~이었다" 등)
  else if (/^(그것은|그\s*물건은|눈앞에\s*있는\s*것은)/.test(text) || (/(감싸진|묶인|봉해진).*이었다/.test(text) && !/(수현은|그는|그녀는)/.test(text))) {
    category = 'object_closeup';
    baseAction =
      'macro close-up revealing the discovered item resting in place, showcasing its intricate wrapping, knot details, and authentic period texture in warm light';
    shotFraming = 'macro close-up detail shot centered on the mysterious object with softly blurred background';
    isPropFocused = true;
  }
  // 8. 우연한 발견 / 틈새나 더미 속에서 이질적인 물체 포착
  else if (/(발견|이질적인|끼여\s*있|숨겨져\s*있|눈에\s*띄|무언가|포착|찾아냈)/.test(text)) {
    category = 'spot_anomaly';
    baseAction =
      'character stops mid-action and leans in closely, gaze locking onto an unexpected object wedged in a narrow gap with sudden curiosity';
    shotFraming = 'over-the-shoulder medium shot following the character line of sight toward the hidden spot';
  }
  // 9. 따사로운 햇살 / 평화롭고 조용한 실내 분위기 묘사
  else if (/(햇살|따사로운|평화|평온|조용하고|부드럽게\s*비추|온기)/.test(text)) {
    category = 'warm_atmosphere';
    baseAction =
      'warm golden sunlight streams through the traditional wooden lattice windows, illuminating floating dust motes across the tranquil interior as the character pauses serenely';
    shotFraming = 'wide atmospheric angle showcasing sunbeams across the traditional room and quiet character presence';
  }
  // 10. 찬 바람 / 적막 / 어두운 밤 / 긴장된 공간 분위기 묘사
  else if (/(찬\s*바람|냉기|적막|어둠|눈보라|비바람|쓸쓸|공기)/.test(text)) {
    category = 'chilly_atmosphere';
    baseAction =
      'subtle draft moves through the quiet traditional space as shadows lengthen across the wooden floor, heightening the solemn atmosphere around the character';
    shotFraming = 'wide atmospheric shot emphasizing deep shadows and architectural mood';
  }
  // 11. 일상적인 정리 / 손질 / 작업 동작 (책장 정리, 장부 정리, 약초 손질 등)
  else if (/(정리하|정돈하|쓸고|닦고|살피고\s*있었|일상|분주히|정성껏\s*손질)/.test(text)) {
    category = 'routine_work';
    baseAction =
      'character calmly organizes and tends to traditional items on the wooden shelves with practiced, natural hand movements in their workspace';
    shotFraming = 'establishing medium-wide shot showing the character working naturally inside the full room setting';
  }
  // 12. 문을 열거나 출입하는 동작
  else if (/(문을\s*열|문고리|들어서|나서며|안으로\s*발)/.test(text)) {
    category = 'door_transition';
    baseAction =
      'character places a hand on the wooden lattice door and slides it open slowly, stepping across the threshold with watchful eyes';
    shotFraming = 'medium framing through the doorway capturing depth between interior and exterior';
  }
  // 13. 걷기 / 이동 동작
  else if (/(걸음|걸어|향해\s*가|발길|달려|지나가)/.test(text)) {
    category = 'walking_movement';
    baseAction =
      'character walks forward with purposeful strides along the traditional path, hanbok robes swaying naturally with each step';
    shotFraming = 'medium-wide tracking angle following the character movement';
  } else {
    category = `contextual_${shotIndexInLocation}`;
    baseAction =
      'character acts out the narrative moment with expressive gaze, natural breathing, and period-authentic posture';
  }

  // 연속된 두 컷이 동일한 액션 카테고리에 매칭된 경우, 카메라 앵글과 동작 디테일을 다음 단계로 강제 분기하여 중복을 원천 차단
  if (prevCategory && category === prevCategory) {
    category = `${category}_followup_${shotIndexInLocation}`;
    shotFraming = SHOT_PROGRESSION_CYCLE[(shotIndexInLocation + 3) % SHOT_PROGRESSION_CYCLE.length];
    baseAction = `${baseAction}, shifting perspective to a closer angle on the character's subtle hand movement and heightened facial tension`;
  }

  return {
    category,
    action: `${baseAction} (current script beat: "${text}")`,
    shotFraming,
    isPropFocused,
  };
};

const scenePrompt = (
  scene: MediaSceneData,
  instruction: string,
  options: {
    dynamicAction?: string;
    shotFraming?: string;
    activeObjectsText?: string;
    continuityNote?: string;
    canonicalLocation?: string;
  } = {},
) => {
  const effectiveLocation = options.canonicalLocation || scene.location;
  const parts = [
    VISUAL_STYLE.prompt,
    `scene context: ${scene.summary}`,
    `characters: ${scene.characters.join(', ') || 'no visible character'}`,
    `location: ${effectiveLocation}`,
    `time: ${scene.timeframe}`,
    `emotion: ${scene.emotion}`,
    `action: ${options.dynamicAction || scene.action}`,
    `objects in frame: ${options.activeObjectsText ?? (scene.objectStates.join('; ') || 'none')}`,
    `composition: ${options.shotFraming || baseFields.composition}`,
    `camera distance: ${baseFields.cameraDistance}`,
    `lighting: ${baseFields.lighting}`,
  ];
  if (options.continuityNote) {
    parts.push(`continuity lock: ${options.continuityNote}`);
  }
  parts.push(instruction);
  return sanitizePromptSafety(parts.join('. '));
};

export const buildVisualPromptPackages = ({
  visualBible,
  sceneData,
  mediaSegments,
  cues = [],
}: BuildVisualPromptPackagesInput): VisualPromptPackage[] => {
  // 장소 기준팩이 중복 등록되어 있더라도 패키징 시점에 한 번 더 정규화하여 중복 기준팩 생성 방지
  const deduplicatedLocations: VisualBibleEntry[] = [];
  for (const loc of visualBible.filter((entry) => entry.kind === 'location')) {
    if (!deduplicatedLocations.some((existing) => isSameCanonicalLocation(existing.name, loc.name))) {
      deduplicatedLocations.push(loc);
    }
  }

  const cappedEntries = [
    ...visualBible.filter((entry) => entry.kind === 'character').slice(0, VISUAL_LIMITS.characters),
    ...deduplicatedLocations.slice(0, VISUAL_LIMITS.locations),
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
      const interiorHint = isInteriorBuildingLocation(entry.name)
        ? `canonical interior workspace and architectural setting for ${entry.name}, clear wooden bookshelves or period furniture, traditional lattice windows with warm daylight`
        : `location environment reference for ${entry.name}`;
      promptText = [
        'mature semi-realistic Joseon-era architectural and landscape digital illustration, restrained ink contours, tactile painterly brushwork, atmospheric depth, period-accurate warm natural light, Joseon historical atmosphere',
        interiorHint,
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
      prompt: sanitizePromptSafety(promptText),
      negativePrompt: negativeText,
      referenceKeys: [entry.id],
      durationSeconds: null,
      lockedTraits: entry.lockedTraits,
    };
  });

  const sceneById = new Map(sceneData.map((scene) => [scene.id, scene]));
  let prevLocationRoot: string | null = null;
  let shotIndexInLocation = 0;
  let prevBeatCategory: string | null = null;
  let prevCueText: string | null = null;

  for (const segment of mediaSegments) {
    const scene =
      (segment.sceneDataId && sceneById.get(segment.sceneDataId)) ??
      sceneData.find((item) => item.storySceneId === segment.sceneId);
    if (!scene) continue;

    // 현재 세그먼트 시간 구간에 속하는 모든 대사(cues)를 정확하게 매칭
    const overlappingCues = cues.filter(
      (c) => c.end > segment.start + 0.1 && c.start < segment.end - 0.1,
    );
    const fallbackCue =
      overlappingCues.length === 0
        ? cues.find(
            (c) =>
              Math.abs(c.start - segment.start) < 0.35 ||
              (segment.start >= c.start && segment.start < c.end),
          )
        : undefined;
    const matchedCueText =
      overlappingCues.length > 0
        ? overlappingCues.map((c) => c.text.trim()).join(' ')
        : fallbackCue?.text?.trim();

    const currentLocationRoot = normalizeLocationRoot(scene.location);
    if (prevLocationRoot && isSameCanonicalLocation(prevLocationRoot, currentLocationRoot)) {
      shotIndexInLocation += 1;
    } else {
      shotIndexInLocation = 0;
      prevBeatCategory = null;
      prevCueText = null;
    }
    prevLocationRoot = currentLocationRoot;

    const references = relevantReferences(scene, cappedEntries, segment, cues);
    const canonicalLocEntry = references.find((r) => r.kind === 'location');
    const canonicalLocationName = canonicalLocEntry?.name || scene.location;

    const activeObjectEntries = references.filter((r) => r.kind === 'object');
    const activeObjectsText =
      cues.length === 0
        ? scene.objectStates.join('; ') || 'none'
        : activeObjectEntries.length > 0
          ? scene.objectStates.join('; ') || activeObjectEntries.map((o) => o.name).join(', ')
          : 'none visible yet (pre-discovery routine shot)';

    const beat = analyzeNarrativeBeat(
      matchedCueText,
      scene.action,
      shotIndexInLocation,
      prevBeatCategory,
    );

    // 소품 단독 클로즈업 샷인 경우 레퍼런스 우선순위에서 오브제와 장소를 최상단에 배치
    const orderedReferences = beat.isPropFocused
      ? [
          ...references.filter((r) => r.kind === 'object'),
          ...references.filter((r) => r.kind === 'location'),
          ...references.filter((r) => r.kind === 'character'),
        ]
      : [
          ...references.filter((r) => r.kind === 'character'),
          ...references.filter((r) => r.kind === 'location'),
          ...references.filter((r) => r.kind === 'object'),
        ];

    const referenceKeys = orderedReferences.map((entry) => entry.id);
    const lockedTraits = orderedReferences.flatMap((entry) => entry.lockedTraits);
    const continuityNote =
      shotIndexInLocation > 0
        ? `continuous shot #${shotIndexInLocation + 1} in the exact same ${canonicalLocationName} interior/setting as shot #${shotIndexInLocation}, maintaining identical room layout, wooden bookshelves/furniture, window light direction, and character costume${prevCueText ? `; directly following previous beat ("${prevCueText.slice(0, 45)}")` : ''}`
        : `establishing shot #1 setting the canonical spatial layout and lighting of ${canonicalLocationName}`;

    prevBeatCategory = beat.category;
    if (matchedCueText) {
      prevCueText = matchedCueText;
    }

    const common = {
      sourceId: segment.id,
      sceneDataId: scene.id,
      mediaSegmentId: segment.id,
      referenceKeys,
      lockedTraits,
      ...baseFields,
      composition: beat.shotFraming,
    };

    if (segment.type === 'video') {
      packages.push({
        id: `prompt-keyframe-${segment.id}`,
        kind: 'intro-keyframe',
        model: 'seedream_5_0_flash',
        prompt: scenePrompt(
          scene,
          `opening keyframe capturing the decisive instant: ${beat.action}, clear focal subject`,
          {
            dynamicAction: beat.action,
            shotFraming: beat.shotFraming,
            activeObjectsText,
            continuityNote,
            canonicalLocation: canonicalLocationName,
          },
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
          `cinematic dynamic motion: ${beat.action}, smooth cinematic camera tracking, fluid cloth movement, expressive facial acting, deep atmospheric lighting`,
          {
            dynamicAction: beat.action,
            shotFraming: beat.shotFraming,
            activeObjectsText,
            continuityNote,
            canonicalLocation: canonicalLocationName,
          },
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
        `single storytelling illustration with layered depth for cinematic camera motion: ${beat.action}`,
        {
          dynamicAction: beat.action,
          shotFraming: beat.shotFraming,
          activeObjectsText,
          continuityNote,
          canonicalLocation: canonicalLocationName,
        },
      ),
      durationSeconds: null,
      ...common,
    });
  }

  return packages;
};

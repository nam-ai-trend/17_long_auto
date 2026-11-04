import type {
  DwellPresetId,
  MediaSceneData,
  MediaSegment,
  MotionStage,
  NarrationCue,
  RuntimePreset,
} from '../shared/contracts';
import {DWELL_PRESETS, INTRO_DURATION_SECONDS} from '../shared/presets';

type SemanticBreak = {time: number; reason: string};

type BuildMediaPlanInput = {
  totalDuration: number;
  dwellPresetId: DwellPresetId;
  sceneId: string;
  semanticBreaks: SemanticBreak[];
  sceneData?: MediaSceneData[];
  cues?: NarrationCue[];
  existingSegments?: MediaSegment[];
};

const semanticReason = (previous: MediaSceneData, next: MediaSceneData): string => {
  const changes: string[] = [];
  if (previous.location !== next.location) changes.push('장소');
  if (previous.timeframe !== next.timeframe) changes.push('시간');
  if (previous.characters.join('|') !== next.characters.join('|')) changes.push('핵심 인물');
  if (previous.action !== next.action) changes.push('행동');
  if (previous.emotion !== next.emotion) changes.push('감정');
  if (previous.objectStates.join('|') !== next.objectStates.join('|')) changes.push('단서');
  return `${changes.length > 0 ? changes.join('·') : '이야기'} 변화`;
};

const sceneAt = (sceneData: MediaSceneData[], time: number) =>
  sceneData.find((scene) => time >= scene.start && time < scene.end)
  ?? [...sceneData].reverse().find((scene) => time >= scene.start)
  ?? sceneData[0];

export const estimateAssetCount = (
  runtimeMinutes: RuntimePreset,
  dwellPresetId: DwellPresetId,
): number => {
  const preset = DWELL_PRESETS[dwellPresetId];
  const midpoint = (preset.min + preset.max) / 2;
  return Math.max(1, Math.round((runtimeMinutes * 60 - INTRO_DURATION_SECONDS) / midpoint));
};

const motionStage = (
  id: string,
  kind: MotionStage['kind'],
  fromProgress: number,
  toProgress: number,
  scaleFrom: number,
  scaleTo: number,
  xFrom: number,
  xTo: number,
  yFrom: number,
  yTo: number,
): MotionStage => ({
  id,
  kind,
  fromProgress,
  toProgress,
  scaleFrom,
  scaleTo,
  xFrom,
  xTo,
  yFrom,
  yTo,
});

export const buildMotionStages = (index: number): MotionStage[] => {
  const direction = index % 2 === 0 ? 1 : -1;
  return [
    motionStage(`motion-${index}-1`, 'settle', 0, 0.16, 1.05, 1.05, -1 * direction, 0, 0, 0),
    motionStage(`motion-${index}-2`, 'push', 0.16, 0.44, 1.05, 1.12, 0, 2 * direction, 0, -1),
    motionStage(`motion-${index}-3`, direction > 0 ? 'pan-right' : 'pan-left', 0.44, 0.7, 1.12, 1.14, 2 * direction, -2 * direction, -1, 0),
    motionStage(`motion-${index}-4`, 'hold', 0.7, 0.82, 1.14, 1.14, -2 * direction, -2 * direction, 0, 0),
    motionStage(`motion-${index}-5`, 'pull', 0.82, 1, 1.14, 1.08, -2 * direction, 0, 0, 0),
  ];
};

export const buildMediaPlan = ({
  totalDuration,
  dwellPresetId,
  sceneId,
  semanticBreaks,
  sceneData = [],
  cues = [],
  existingSegments = [],
}: BuildMediaPlanInput): MediaSegment[] => {
  if (totalDuration <= 0) return [];
  const segments: MediaSegment[] = [];
  const hasCues = cues.length > 0;

  const introEnd = Math.min(INTRO_DURATION_SECONDS, totalDuration);
  const introCount = Math.min(10, Math.max(1, Math.ceil(introEnd / 6)));
  const clipDuration = introEnd / introCount;

  for (let index = 0; index < introCount; index += 1) {
    let start: number;
    let end: number;

    if (hasCues && cues[index]) {
      start = index === 0 ? 0 : Number(cues[index].start.toFixed(3));
      if (index < introCount - 1 && cues[index + 1]) {
        end = Number(cues[index + 1].start.toFixed(3));
      } else {
        end = Number((cues[index].end + (cues[index].gapAfter ?? 0)).toFixed(3));
      }
    } else {
      start = Number((index * clipDuration).toFixed(3));
      end = Number((index === introCount - 1 ? introEnd : (index + 1) * clipDuration).toFixed(3));
    }

    const activeScene = sceneAt(sceneData, start);
    segments.push({
      id: `intro-${index + 1}`,
      sceneId: activeScene?.storySceneId ?? sceneId,
      sceneDataId: activeScene?.id ?? null,
      start,
      end,
      type: 'video',
      prompt: `도입부 사건 영상 ${index + 1}, 절제된 인물 동작과 명확한 시선`,
      semanticBreak: null,
      referenceKeys: [],
      parallaxRecommended: false,
      parallaxEnabled: false,
      motionStages: [],
    });
  }

  const lastIntro = segments[segments.length - 1];
  const actualIntroEnd = lastIntro ? lastIntro.end : introEnd;

  if (totalDuration <= actualIntroEnd) return segments;

  const preset = DWELL_PRESETS[dwellPresetId];
  const targetDuration = (preset.min + preset.max) / 2;
  let stillIndex = 0;

  // 나레이션 큐가 있고 씬 데이터가 있는 경우: 문장 단위 스냅 분할 (대사 도중 이미지 잘림 0건 보장)
  if (hasCues && sceneData.length > 0) {
    for (const sc of sceneData) {
      const scStart = sc.start;
      const scEnd = sc.end;
      const sceneActualStart = sc.id === sceneData[0]?.id ? actualIntroEnd : scStart;
      if (sceneActualStart >= scEnd) continue;

      const scCues = cues.filter(
        (c) => c.start >= sceneActualStart - 0.05 && c.start < scEnd - 0.05,
      );

      const sceneDur = scEnd - sceneActualStart;
      const existingStillsCount =
        existingSegments?.filter((s) => s.type === 'still' && s.sceneDataId === sc.id).length ?? 0;
      const numStillsForScene =
        existingStillsCount > 0 ? existingStillsCount : Math.max(1, Math.round(sceneDur / targetDuration));

      if (scCues.length === 0) {
        const parallaxRecommended = stillIndex % 7 === 0;
        segments.push({
          id: `still-${stillIndex + 1}`,
          sceneId: sc.storySceneId ?? sceneId,
          sceneDataId: sc.id ?? null,
          start: Number(sceneActualStart.toFixed(3)),
          end: Number(scEnd.toFixed(3)),
          type: 'still',
          prompt: `성인용 반실사 조선시대 삽화, 미디어 구간 ${stillIndex + 1}`,
          semanticBreak: null,
          referenceKeys: [],
          parallaxRecommended,
          parallaxEnabled: parallaxRecommended,
          motionStages: buildMotionStages(stillIndex),
        });
        stillIndex += 1;
        continue;
      }

      // 씬 내 큐들을 균등한 지속 시간으로 최적 분할
      const actualStillsCount = Math.min(numStillsForScene, scCues.length);
      const targetChunkDur = sceneDur / actualStillsCount;

      const cueChunks: NarrationCue[][] = [];
      let currentChunk: NarrationCue[] = [];
      let currentDur = 0;
      let stillsLeft = actualStillsCount;

      for (const cue of scCues) {
        const cueDur = cue.end - cue.start;
        currentChunk.push(cue);
        currentDur += cueDur;

        if (stillsLeft > 1) {
          const remainingCuesCount = scCues.length - scCues.indexOf(cue) - 1;
          if (remainingCuesCount === stillsLeft - 1 || currentDur >= targetChunkDur) {
            cueChunks.push(currentChunk);
            currentChunk = [];
            currentDur = 0;
            stillsLeft -= 1;
          }
        }
      }
      if (currentChunk.length > 0) {
        cueChunks.push(currentChunk);
      }

      for (let i = 0; i < cueChunks.length; i += 1) {
        const chunk = cueChunks[i];
        const segStart = i === 0 ? sceneActualStart : chunk[0].start;
        const segEnd = i === cueChunks.length - 1 ? scEnd : cueChunks[i + 1][0].start;

        const parallaxRecommended = stillIndex % 7 === 0;
        segments.push({
          id: `still-${stillIndex + 1}`,
          sceneId: sc.storySceneId ?? sceneId,
          sceneDataId: sc.id ?? null,
          start: Number(segStart.toFixed(3)),
          end: Number(segEnd.toFixed(3)),
          type: 'still',
          prompt: `성인용 반실사 조선시대 삽화, 미디어 구간 ${stillIndex + 1}`,
          semanticBreak: null,
          referenceKeys: [],
          parallaxRecommended,
          parallaxEnabled: parallaxRecommended,
          motionStages: buildMotionStages(stillIndex),
        });
        stillIndex += 1;
      }
    }

    return segments;
  }

  // 폴백: 큐가 없는 경우
  const sceneBreaks = sceneData.slice(1).map((scene, index) => ({
    time: scene.start,
    reason: semanticReason(sceneData[index], scene),
  }));
  const sortedBreaks = [...semanticBreaks, ...sceneBreaks]
    .filter((item) => item.time > actualIntroEnd && item.time < totalDuration)
    .sort((a, b) => a.time - b.time);
  let cursor = actualIntroEnd;

  while (cursor < totalDuration) {
    let end = Math.min(totalDuration, cursor + targetDuration);
    let semanticBreak: string | null = null;
    const upcomingBreak = sortedBreaks.find((item) => item.time > cursor && item.time < end);
    if (upcomingBreak) {
      end = upcomingBreak.time;
      semanticBreak = upcomingBreak.reason;
    }
    const parallaxRecommended = stillIndex % 7 === 0;
    const activeScene = sceneAt(sceneData, cursor);
    segments.push({
      id: `still-${stillIndex + 1}`,
      sceneId: activeScene?.storySceneId ?? sceneId,
      sceneDataId: activeScene?.id ?? null,
      start: Number(cursor.toFixed(3)),
      end: Number(end.toFixed(3)),
      type: 'still',
      prompt: `성인용 반실사 조선시대 삽화, 미디어 구간 ${stillIndex + 1}`,
      semanticBreak,
      referenceKeys: [],
      parallaxRecommended,
      parallaxEnabled: parallaxRecommended,
      motionStages: buildMotionStages(stillIndex),
    });
    cursor = end;
    stillIndex += 1;
  }

  return segments;
};

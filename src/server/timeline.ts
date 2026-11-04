import type {GapReason, NarrationCue} from '../shared/contracts';
import {GAP_PRESETS} from '../shared/presets';

export type NarrationSentence = {
  sceneId: string;
  text: string;
  gapReason?: GapReason;
};

export const splitSentences = (text: string): string[] => {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  return (
    normalized.match(/[^.!?。！？]+[.!?。！？]+[”’"'」』)]*|[^.!?。！？]+$/g) ?? [normalized]
  )
    .map((sentence) => sentence.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
};

export const estimateSpeechDuration = (text: string, charsPerSecond = 4.15): number => {
  const spokenCharacters = text.replace(/[\s.,!?。！？“”‘’"']/g, '').length;
  return Number(Math.max(0.8, spokenCharacters / charsPerSecond).toFixed(3));
};

export const gapFor = (reason: GapReason): number => GAP_PRESETS[reason];

export const buildNarrationCues = (
  sentences: NarrationSentence[],
  charsPerSecond = 4.15,
): NarrationCue[] => {
  const raw = sentences.map((sentence, index) => {
    const duration = estimateSpeechDuration(sentence.text, charsPerSecond);
    const reason = sentence.gapReason ?? 'sentence';
    return {
      id: `cue-${String(index + 1).padStart(3, '0')}`,
      sceneId: sentence.sceneId,
      text: sentence.text,
      start: 0,
      end: duration,
      sourceAudioDuration: duration,
      gapAfter: gapFor(reason),
      gapReason: reason,
      manualGap: null,
      ttsStatus: 'estimated',
      audioPath: null,
      leadingSilence: 0,
      trailingSilence: 0,
      ttsError: null,
    } satisfies NarrationCue;
  });

  return recalculateCueTimes(raw);
};

export const recalculateCueTimes = (cues: NarrationCue[]): NarrationCue[] => {
  let cursor = 0;
  return cues.map((cue) => {
    const start = Number(cursor.toFixed(3));
    const end = Number((start + cue.sourceAudioDuration).toFixed(3));
    cursor = end + (cue.manualGap ?? cue.gapAfter);
    return {...cue, start, end};
  });
};

export const timelineDuration = (cues: NarrationCue[]): number => {
  if (cues.length === 0) return 0;
  const last = cues[cues.length - 1];
  return Number((last.end + (last.manualGap ?? last.gapAfter)).toFixed(3));
};

import type {Caption} from '@remotion/captions';
import type {MediaSegment, NarrationCue} from '../shared/contracts';

export const compositionDurationFrames = (
  cues: NarrationCue[],
  segments: MediaSegment[],
  fps: number,
): number => {
  const cueEnd = cues.length > 0 ? Math.max(...cues.map((cue) => cue.end + (cue.manualGap ?? cue.gapAfter))) : 0;
  const segmentEnd = segments.length > 0 ? Math.max(...segments.map((segment) => segment.end)) : 0;
  return Math.max(1, Math.ceil(Math.max(cueEnd, segmentEnd) * fps));
};

export const toCaptions = (cues: NarrationCue[]): Caption[] =>
  cues.map((cue) => ({
    text: cue.text,
    startMs: Math.round(cue.start * 1000),
    endMs: Math.round(cue.end * 1000),
    timestampMs: Math.round(((cue.start + cue.end) / 2) * 1000),
    confidence: null,
    pageBreakAfter: true,
  }));

export const segmentAtTime = (segments: MediaSegment[], time: number): MediaSegment | null =>
  segments.find((segment) => time >= segment.start && time < segment.end) ?? null;

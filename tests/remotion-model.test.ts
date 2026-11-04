import {describe, expect, it} from 'vitest';
import type {MediaSegment, NarrationCue} from '../src/shared/contracts';
import {compositionDurationFrames, segmentAtTime, toCaptions} from '../src/remotion/model';

const cues: NarrationCue[] = [
  {
    id: 'cue-1',
    sceneId: 'scene-1',
    text: '문이 열렸습니다.',
    start: 0,
    end: 2.5,
    sourceAudioDuration: 2.5,
    gapAfter: 0.5,
    gapReason: 'sentence',
    manualGap: null,
    ttsStatus: 'estimated',
    audioPath: null,
    leadingSilence: 0,
    trailingSilence: 0,
    ttsError: null,
  },
  {
    id: 'cue-2',
    sceneId: 'scene-1',
    text: '그 안에는 아무도 없었습니다.',
    start: 3,
    end: 6.2,
    sourceAudioDuration: 3.2,
    gapAfter: 1.05,
    gapReason: 'scene',
    manualGap: null,
    ttsStatus: 'estimated',
    audioPath: null,
    leadingSilence: 0,
    trailingSilence: 0,
    ttsError: null,
  },
];

const segments: MediaSegment[] = [
  {
    id: 'intro-1', sceneId: 'scene-1', sceneDataId: null, start: 0, end: 6, type: 'video', prompt: '', semanticBreak: null, referenceKeys: [],
    parallaxRecommended: false, parallaxEnabled: false, motionStages: [],
  },
  {
    id: 'still-1', sceneId: 'scene-1', sceneDataId: null, start: 6, end: 40, type: 'still', prompt: '', semanticBreak: null, referenceKeys: [],
    parallaxRecommended: true, parallaxEnabled: true, motionStages: [],
  },
];

describe('Remotion timeline model', () => {
  it('마지막 미디어 구간을 기준으로 전체 프레임을 계산한다', () => {
    expect(compositionDurationFrames(cues, segments, 30)).toBe(1200);
  });

  it('내레이션 큐를 밀리초 단위 Caption JSON으로 바꾼다', () => {
    expect(toCaptions(cues)).toEqual([
      {text: '문이 열렸습니다.', startMs: 0, endMs: 2500, timestampMs: 1250, confidence: null, pageBreakAfter: true},
      {text: '그 안에는 아무도 없었습니다.', startMs: 3000, endMs: 6200, timestampMs: 4600, confidence: null, pageBreakAfter: true},
    ]);
  });

  it('현재 시각에 해당하는 미디어 구간을 찾는다', () => {
    expect(segmentAtTime(segments, 2)?.id).toBe('intro-1');
    expect(segmentAtTime(segments, 12)?.id).toBe('still-1');
    expect(segmentAtTime(segments, 41)).toBeNull();
  });
});

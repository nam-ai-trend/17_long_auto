import {describe, expect, it} from 'vitest';
import {
  additionalGapAfterTrailingSilence,
  parseFfprobeDuration,
  parseSilenceBoundaries,
} from '../src/server/audio-analysis';

describe('audio analysis', () => {
  it('FFprobe JSON에서 실제 재생시간을 읽는다', () => {
    expect(parseFfprobeDuration('{"format":{"duration":"4.630000"}}')).toBe(4.63);
  });

  it('전체 길이를 기준으로 앞·뒤 무음 구간을 계산한다', () => {
    const stderr = [
      '[silencedetect] silence_start: 0',
      '[silencedetect] silence_end: 0.18 | silence_duration: 0.18',
      '[silencedetect] silence_start: 4.2',
      '[silencedetect] silence_end: 4.63 | silence_duration: 0.43',
    ].join('\n');

    expect(parseSilenceBoundaries(stderr, 4.63)).toEqual({leading: 0.18, trailing: 0.43});
  });

  it('원본 뒤 무음을 제외하고 필요한 호흡만 추가한다', () => {
    expect(additionalGapAfterTrailingSilence(0.55, 0.2)).toBe(0.35);
    expect(additionalGapAfterTrailingSilence(0.55, 0.8)).toBe(0);
  });
});

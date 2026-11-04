import {describe, expect, it} from 'vitest';
import {
  buildNarrationCues,
  estimateSpeechDuration,
  gapFor,
  recalculateCueTimes,
  splitSentences,
} from '../src/server/timeline';
import {narrationCueSchema} from '../src/shared/contracts';

describe('narration timeline', () => {
  it('문장부호와 인용부호를 보존하며 한국어 문장을 나눈다', () => {
    expect(
      splitSentences('눈이 내렸습니다. “대감, 살려 주십시오!” 그러나 문은 열리지 않았습니다.'),
    ).toEqual([
      '눈이 내렸습니다.',
      '“대감, 살려 주십시오!”',
      '그러나 문은 열리지 않았습니다.',
    ]);
  });

  it('짧은 문장도 양수인 최소 낭독시간을 가진다', () => {
    expect(estimateSpeechDuration('예.', 4)).toBe(0.8);
    expect(estimateSpeechDuration('돌쇠는 장터로 달려갔습니다.', 4)).toBeGreaterThan(1);
  });

  it('씬 전환 간격은 일반 문장 간격보다 길다', () => {
    expect(gapFor('scene')).toBeGreaterThan(gapFor('sentence'));
  });

  it('수동 간격을 바꾸면 뒤따르는 모든 큐 시각을 다시 계산한다', () => {
    const cues = buildNarrationCues([
      {sceneId: 'scene-1', text: '첫 문장입니다.', gapReason: 'sentence'},
      {sceneId: 'scene-1', text: '둘째 문장입니다.', gapReason: 'scene'},
      {sceneId: 'scene-2', text: '새 장면입니다.', gapReason: 'sentence'},
    ]);
    const originalThirdStart = cues[2].start;
    const edited = cues.map((cue, index) => (index === 0 ? {...cue, manualGap: 1.5} : cue));
    const recalculated = recalculateCueTimes(edited);

    expect(recalculated[0].start).toBe(0);
    expect(recalculated[1].start).toBeCloseTo(cues[0].end + 1.5, 5);
    expect(recalculated[2].start).toBeGreaterThan(originalThirdStart);
  });

  it('예상 타이밍 cue는 실제 TTS가 생성되기 전 상태를 명시한다', () => {
    const [cue] = buildNarrationCues([{sceneId: 'scene-1', text: '장터에 낯선 선비가 나타났습니다.'}]);

    expect(cue.ttsStatus).toBe('estimated');
    expect(cue.audioPath).toBeNull();
    expect(cue.leadingSilence).toBe(0);
    expect(cue.trailingSilence).toBe(0);
  });

  it('기존 스냅샷 cue를 읽을 때 새 TTS 필드를 기본값으로 복원한다', () => {
    const cue = narrationCueSchema.parse({
      id: 'cue-old',
      sceneId: 'scene-1',
      text: '오래된 프로젝트 문장입니다.',
      start: 0,
      end: 2,
      sourceAudioDuration: 2,
      gapAfter: 0.55,
      gapReason: 'sentence',
      manualGap: null,
    });

    expect(cue).toMatchObject({
      ttsStatus: 'estimated',
      audioPath: null,
      leadingSilence: 0,
      trailingSilence: 0,
      ttsError: null,
    });
  });
});

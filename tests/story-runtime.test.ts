import {describe, expect, it} from 'vitest';
import {findSceneRuntimeAdjustments} from '../src/server/story-validator';

describe('story runtime validation', () => {
  it('허용 오차를 벗어난 씬만 확장 또는 압축 대상으로 고른다', () => {
    const adjustments = findSceneRuntimeAdjustments({
      sceneContracts: [
        {id: 'scene-1', chapterId: 'chapter-1', title: '짧은 씬', location: '산길', timeframe: '밤', characters: ['a'], objective: '단서를 찾는다.', obstacle: '비', action: '살핀다.', result: '단서를 얻는다.', nextQuestion: '누구 것인가?', emotionalShift: '불안에서 결심', realismAnchor: '장부', foreshadowingActions: [], targetSeconds: 100},
        {id: 'scene-2', chapterId: 'chapter-1', title: '적정 씬', location: '관아', timeframe: '낮', characters: ['a'], objective: '확인한다.', obstacle: '아전', action: '대조한다.', result: '확인한다.', nextQuestion: '왜 숨겼나?', emotionalShift: '결심에서 분노', realismAnchor: '문서고', foreshadowingActions: [], targetSeconds: 100},
        {id: 'scene-3', chapterId: 'chapter-2', title: '긴 씬', location: '장터', timeframe: '저녁', characters: ['a'], objective: '증언을 얻는다.', obstacle: '침묵', action: '기다린다.', result: '증언을 얻는다.', nextQuestion: '어떻게 밝힐까?', emotionalShift: '분노에서 확신', realismAnchor: '장시', foreshadowingActions: [], targetSeconds: 100},
      ],
      cues: [
        {id: 'cue-1', sceneId: 'scene-1', text: '짧다.', start: 0, end: 60, sourceAudioDuration: 60, gapAfter: 1, gapReason: 'scene', manualGap: null, ttsStatus: 'ready', audioPath: 'a.wav', leadingSilence: 0, trailingSilence: 0, ttsError: null},
        {id: 'cue-2', sceneId: 'scene-2', text: '적정하다.', start: 61, end: 156, sourceAudioDuration: 95, gapAfter: 1, gapReason: 'scene', manualGap: null, ttsStatus: 'ready', audioPath: 'b.wav', leadingSilence: 0, trailingSilence: 0, ttsError: null},
        {id: 'cue-3', sceneId: 'scene-3', text: '길다.', start: 157, end: 287, sourceAudioDuration: 130, gapAfter: 1, gapReason: 'scene', manualGap: null, ttsStatus: 'ready', audioPath: 'c.wav', leadingSilence: 0, trailingSilence: 0, ttsError: null},
      ],
      tolerance: 0.12,
    });

    expect(adjustments).toEqual([
      expect.objectContaining({sceneId: 'scene-1', action: 'expand', actualSeconds: 61}),
      expect.objectContaining({sceneId: 'scene-3', action: 'compress', actualSeconds: 131}),
    ]);
  });
});

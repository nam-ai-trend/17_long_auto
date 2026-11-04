import {describe, expect, it} from 'vitest';
import {buildMediaPlan, estimateAssetCount} from '../src/server/media-planner';

describe('media planner', () => {
  it('모든 길이와 체류 프리셋에서 양수인 예상 이미지 수를 계산한다', () => {
    for (const runtime of [30, 40, 50, 60] as const) {
      for (const dwell of ['short', 'balanced', 'long', 'immersive'] as const) {
        expect(estimateAssetCount(runtime, dwell)).toBeGreaterThan(0);
      }
    }
    expect(estimateAssetCount(30, 'short')).toBe(57);
    expect(estimateAssetCount(60, 'immersive')).toBe(52);
  });

  it('첫 60초를 8~12개의 영상 구간으로만 구성한다', () => {
    const plan = buildMediaPlan({
      totalDuration: 30 * 60,
      dwellPresetId: 'balanced',
      sceneId: 'scene-1',
      semanticBreaks: [],
    });
    const intro = plan.filter((segment) => segment.start < 60);

    expect(intro.length).toBeGreaterThanOrEqual(8);
    expect(intro.length).toBeLessThanOrEqual(12);
    expect(intro.every((segment) => segment.type === 'video')).toBe(true);
    expect(intro.at(-1)?.end).toBe(60);
  });

  it('일반 정지 구간은 프리셋 범위에 있고 3~5개 모션 단계를 가진다', () => {
    const plan = buildMediaPlan({
      totalDuration: 12 * 60,
      dwellPresetId: 'long',
      sceneId: 'scene-1',
      semanticBreaks: [],
    });
    const stills = plan.filter((segment) => segment.type === 'still');

    for (const segment of stills.slice(0, -1)) {
      expect(segment.end - segment.start).toBeGreaterThanOrEqual(46);
      expect(segment.end - segment.start).toBeLessThanOrEqual(60);
      expect(segment.motionStages.length).toBeGreaterThanOrEqual(3);
      expect(segment.motionStages.length).toBeLessThanOrEqual(5);
    }
  });

  it('의미 변화 지점에서는 최소 체류시간 전이라도 이미지를 교체한다', () => {
    const plan = buildMediaPlan({
      totalDuration: 240,
      dwellPresetId: 'immersive',
      sceneId: 'scene-1',
      semanticBreaks: [{time: 80, reason: '장소 변경'}],
    });
    const firstStill = plan.find((segment) => segment.type === 'still');

    expect(firstStill?.start).toBe(60);
    expect(firstStill?.end).toBe(80);
    expect(firstStill?.semanticBreak).toBe('장소 변경');
  });
});

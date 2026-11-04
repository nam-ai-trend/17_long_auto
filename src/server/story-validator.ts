import type {
  NarrationCue,
  SceneContract,
  StoryBible,
  StoryScene,
  StoryValidationIssue,
} from '../shared/contracts';

export type SceneRuntimeAdjustment = {
  sceneId: string;
  targetSeconds: number;
  actualSeconds: number;
  ratio: number;
  action: 'expand' | 'compress';
};

export const findSceneRuntimeAdjustments = ({
  sceneContracts,
  cues,
  tolerance = 0.12,
}: {
  sceneContracts: SceneContract[];
  cues: NarrationCue[];
  tolerance?: number;
}): SceneRuntimeAdjustment[] => {
  return sceneContracts.flatMap((contract) => {
    const sceneCues = cues.filter((cue) => cue.sceneId === contract.id);
    if (sceneCues.length === 0 || sceneCues.some((cue) => cue.ttsStatus !== 'ready')) return [];
    const actualSeconds = Number(
      sceneCues
        .reduce(
          (sum, cue) => sum + cue.sourceAudioDuration + (cue.manualGap ?? cue.gapAfter),
          0,
        )
        .toFixed(3),
    );
    const ratio = actualSeconds / contract.targetSeconds;
    if (ratio >= 1 - tolerance && ratio <= 1 + tolerance) return [];
    return [{
      sceneId: contract.id,
      targetSeconds: contract.targetSeconds,
      actualSeconds,
      ratio: Number(ratio.toFixed(3)),
      action: ratio < 1 ? ('expand' as const) : ('compress' as const),
    }];
  });
};

type ValidateStoryDraftInput = {
  storyBible: StoryBible;
  sceneContracts: SceneContract[];
  scenes: StoryScene[];
};

export const validateStoryDraft = ({
  storyBible,
  sceneContracts,
  scenes,
}: ValidateStoryDraftInput): StoryValidationIssue[] => {
  const issues: StoryValidationIssue[] = [];
  const firstScene = scenes[0];
  if (!firstScene || !firstScene.text.includes(storyBible.hookQuestion.replace(/[?？]$/, ''))) {
    issues.push({
      code: 'opening-hook',
      severity: 'warning',
      message: '첫 씬에 설계된 핵심 질문이 분명히 드러나지 않습니다.',
      sceneIds: firstScene ? [firstScene.id] : [],
    });
  }
  for (let index = 0; index < sceneContracts.length - 1; index += 1) {
    const current = sceneContracts[index];
    const next = sceneContracts[index + 1];
    if (!current.nextQuestion.trim() || !next.objective.trim()) {
      issues.push({
        code: 'transition',
        severity: 'error',
        message: `${current.id}의 결과가 ${next.id}의 행동으로 이어지는 정보가 부족합니다.`,
        sceneIds: [current.id, next.id],
      });
    }
  }
  return issues;
};

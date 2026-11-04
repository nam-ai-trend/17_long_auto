import type {
  MediaSceneData,
  NarrationCue,
  StoryDevelopment,
  StoryScene,
} from '../shared/contracts';

type BuildSceneDataInput = {
  scenes: StoryScene[];
  cues: NarrationCue[];
  storyDevelopment: StoryDevelopment | null;
};

const cueEndWithGap = (cue: NarrationCue) => cue.end + (cue.manualGap ?? cue.gapAfter);

export const buildSceneData = ({
  scenes,
  cues,
  storyDevelopment,
}: BuildSceneDataInput): MediaSceneData[] => {
  const characterNames = new Map(
    storyDevelopment?.storyBible.characters.map((character) => [character.id, character.name]) ?? [],
  );
  const contracts = new Map(
    storyDevelopment?.sceneContracts.map((contract) => [contract.id, contract]) ?? [],
  );
  const objectStates =
    storyDevelopment?.continuityLedger.objects.map(
      (object) =>
        `${object.objectId}: ${object.owner} 소유, ${object.condition}, 의미: ${object.significance}`,
    ) ?? [];

  const result: MediaSceneData[] = [];
  for (const scene of scenes) {
    const sceneCues = cues
      .filter((cue) => cue.sceneId === scene.id)
      .sort((left, right) => left.start - right.start);
    if (sceneCues.length === 0) continue;
    const contract = contracts.get(scene.id);
    const previousContract = storyDevelopment?.sceneContracts[
      storyDevelopment.sceneContracts.findIndex((item) => item.id === scene.id) - 1
    ];
    const lastCue = sceneCues.at(-1)!;
    result.push({
      id: `media-scene-${scene.id}`,
      storySceneId: scene.id,
      cueIds: sceneCues.map((cue) => cue.id),
      start: sceneCues[0].start,
      end: cueEndWithGap(lastCue),
      timingSource: sceneCues.every((cue) => cue.ttsStatus === 'ready') ? 'tts' : 'estimated',
      summary: `${scene.objective} ${scene.change}`.trim(),
      characters: (contract?.characters ?? []).map((id) => characterNames.get(id) ?? id),
      location: contract?.location ?? scene.location,
      timeframe: contract?.timeframe ?? '시간대 미정',
      emotion: contract?.emotionalShift ?? '감정 변화 미정',
      action: contract?.action ?? scene.objective,
      objectStates,
      previousLink: previousContract?.result ?? null,
      nextLink: contract?.nextQuestion ?? null,
    });
  }

  return result;
};

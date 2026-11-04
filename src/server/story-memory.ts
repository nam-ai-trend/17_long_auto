import {
  handoffPacketSchema,
  type ChapterSummary,
  type ContinuityLedger,
  type HandoffPacket,
  type SceneContract,
  type StoryBible,
  type StoryScene,
} from '../shared/contracts';

type CreateHandoffPacketInput = {
  storyBible: StoryBible;
  chapterSummaries: ChapterSummary[];
  continuityLedger: ContinuityLedger;
  completedScenes: StoryScene[];
  nextSceneContracts: SceneContract[];
};

const endingOf = (scene: StoryScene | undefined): string => {
  if (!scene) return '';
  const paragraphs = scene.text.trim().split(/\n\s*\n/).filter(Boolean);
  return (paragraphs.at(-1) ?? '').slice(-1200);
};

export const createHandoffPacket = ({
  storyBible,
  chapterSummaries,
  continuityLedger,
  completedScenes,
  nextSceneContracts,
}: CreateHandoffPacketInput): HandoffPacket => {
  const selectedContracts = nextSceneContracts.slice(0, 3);
  if (selectedContracts.length === 0) {
    throw new Error('인수인계 패킷에는 다음 씬 계약이 최소 한 개 필요합니다.');
  }
  const nextChapterId = selectedContracts[0].chapterId;
  const recentSceneSummaries = completedScenes.map(
    (scene, idx) => `[씬 ${idx + 1}: ${scene.title}] ${scene.change || scene.objective}`,
  );
  return handoffPacketSchema.parse({
    storyBible,
    currentChapterSummary:
      chapterSummaries.find((summary) => summary.chapterId === nextChapterId) ?? null,
    recentSceneSummaries,
    continuityLedger,
    previousEnding: endingOf(completedScenes.at(-1)),
    nextSceneContracts: selectedContracts,
  });
};

export const mergeChapterSummaries = (
  current: ChapterSummary[],
  incoming: ChapterSummary[],
): ChapterSummary[] => {
  const merged = new Map(current.map((summary) => [summary.chapterId, summary]));
  for (const summary of incoming) {
    const previous = merged.get(summary.chapterId);
    merged.set(summary.chapterId, {
      ...summary,
      completedSceneIds: Array.from(
        new Set([...(previous?.completedSceneIds ?? []), ...summary.completedSceneIds]),
      ),
    });
  }
  return [...merged.values()];
};

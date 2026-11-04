import {
  continuityLedgerSchema,
  sceneContractsResultSchema,
  storyBibleSchema,
  storyDraftBatchSchema,
  storyGlobalReviewSchema,
  storyStructureSchema,
  type ChapterSummary,
  type ProjectSettings,
  type SceneContract,
  type StoryCandidate,
  type StoryDevelopment,
  type StoryInput,
  type StoryScene,
} from '../shared/contracts';
import type {StructuredLlmProvider} from './llm-provider';
import {createHandoffPacket, mergeChapterSummaries} from './story-memory';

type RunStoryPipelineInput = {
  candidate: StoryCandidate;
  storyInput: StoryInput;
  runtimeMinutes: ProjectSettings['runtimeMinutes'];
  era: string;
};

export type StoryPipelineResult = {
  chapters: ReturnType<typeof storyStructureSchema.parse>['chapters'];
  scenes: StoryScene[];
  storyDevelopment: StoryDevelopment;
};

export type StoryPipelineOptions = {
  batchSize?: number;
  onCheckpoint?: (checkpoint: StoryPipelineResult) => void | Promise<void>;
};

const PASS_INSTRUCTIONS = {
  hook: [
    '제목의 약속, 첫 문장 위기, 첫 60초 미해결 질문, 주인공의 즉시 목표와 실패 위험을 설계하세요.',
    '레퍼런스의 고유 인물·직업·배경·오브제·사건 인과·반전·결말과 문장을 복제하지 마세요.',
    '조선 후기의 생활·생업·신분·법·이동·화폐에 맞추고 한 명의 이야기꾼이 낭독하기 좋은 규칙을 만드세요.',
  ].join('\n'),
  structure: [
    '30~60분 롱폼 라디오 야담의 장·씬 구조와 목표 시간을 설계하세요.',
    '【필수 씬 개수 규칙】 서사의 깊이와 롱폼 러닝타임을 위해 목표 시간별로 다음 씬 개수를 엄격히 준수하세요:',
    '- 30분: 장 4~5개, 씬 총 12~14개 (씬당 목표시간 120~150초, 목표 분량 800~1,100자)',
    '- 40분: 장 5~6개, 씬 총 15~18개 (씬당 목표시간 120~160초, 목표 분량 800~1,100자)',
    '- 50분: 장 5~6개, 씬 총 18~22개 (씬당 목표시간 130~170초, 목표 분량 800~1,100자)',
    '- 60분: 장 6~7개, 씬 총 22~26개 (씬당 목표시간 130~170초, 목표 분량 800~1,100자)',
    '※ 씬이 10개 미만이면 30분 롱폼의 서사 밀도를 채울 수 없으므로 절대로 10개 미만으로 작성하지 마세요.',
    '각 씬은 목표, 방해, 선택/행동, 결과, 다음 질문, 감정 전환, 리얼리즘 앵커를 명확히 설계하세요.',
    '긴장과 완화를 파동처럼 배치하고 첫 씬은 긴 배경 설명 없이 사건 한가운데서 시작하세요.',
  ].join('\n'),
  continuity: [
    '인물별 위치·지식·감정·관계, 핵심 오브제 소유·손상, 복선 상태와 미해결 질문을 장부로 만드세요.',
    '아직 일어나지 않은 사건을 인물이 알고 있다고 기록하지 마세요.',
  ].join('\n'),
  'scene-contracts': [
    '전체 구조를 씬별 집필 계약으로 정교화하세요.',
    '각 씬 마지막 결과가 다음 씬 첫 행동이나 질문을 직접 일으키게 하세요.',
    '감정 수치보다 새 정보·위험·선택·관계 변화가 실제로 발생하도록 하세요.',
  ].join('\n'),
  drafting: [
    '인수인계 패킷에 있는 씬을 깊이 있고 생생한 완성형 시나리오로 집필하세요. 절대로 요약하거나 줄거리를 압축하지 마세요.',
    '【분량 필수 지침】 이 씬은 실제 낭독 시 1분 30초~2분 30초 이상 지속되는 풍성한 본문이어야 합니다. 반드시 최소 800자에서 1,200자 이상(12~18문장 이상)의 충실한 분량으로 길게 작성하세요.',
    '【묘사 및 대사 지침】 단순 행동 나열을 금지합니다. 인물 간의 대화와 호흡, 눈빛과 표정, 조선시대 배경 감각(바람 소리, 어둠의 농도, 등불 불빛, 옷자락, 흙과 종이의 질감), 인물의 내면 갈등을 생생하게 묘사하세요.',
    '【씬 연결 지침】 인수인계 패킷의 앞선 씬 요약(recentSceneSummaries)과 직전 씬 종결부(previousEnding)를 이어받아, 직전 씬의 감정과 결과에서 자연스럽고 매끄럽게 다음 행동이 시작되도록 첫 문장을 여세요.',
    '【문체 지침】 현대 시니어가 옛이야기 라디오처럼 편안하고 몰입감 있게 들을 수 있는 표준어 해설과 이야기꾼의 차분한 운율을 사용하세요.',
    '【결과 출력】 씬 본문(text)과 함께, 이 씬에서 일어난 핵심 사실 변화를 1~2문장의 change 요약으로 정리하고, 연속성 장부(continuityLedger)를 최신 상태로 갱신하세요.',
  ].join('\n'),
  'local-review': [
    '초고의 인과성, 씬 연결, 인물 지식, 오브제 상태, 반복, 시대착오를 검사해 필요한 문단만 고치세요.',
    '씬 ID와 계약의 사건 결과를 바꾸지 마세요.',
  ].join('\n'),
  'global-review': [
    '전체 초고에서 첫 60초 약속, 장기 복선, 동기, 씬 경계, 반복, 결말 보상을 검수하세요.',
    '경계마다 이전 씬 마지막과 다음 씬 첫 문단을 함께 보고 감정 리셋과 돌연한 시공간 이동을 고치세요.',
    '문제가 남으면 issues에 구체적인 씬 ID와 수정 이유를 기록하세요.',
  ].join('\n'),
} as const;

const chunksOf = <T>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
};

export class StoryPipeline {
  public constructor(private readonly provider: StructuredLlmProvider) {}

  public async run(
    input: RunStoryPipelineInput,
    options: StoryPipelineOptions = {},
  ): Promise<StoryPipelineResult> {
    const storyBible = await this.provider.generate({
      pass: 'hook',
      instructions: PASS_INSTRUCTIONS.hook,
      input,
      schema: storyBibleSchema,
    });
    const structure = await this.provider.generate({
      pass: 'structure',
      instructions: PASS_INSTRUCTIONS.structure,
      input: {...input, storyBible},
      schema: storyStructureSchema,
    });
    let continuityLedger = await this.provider.generate({
      pass: 'continuity',
      instructions: PASS_INSTRUCTIONS.continuity,
      input: {...input, storyBible, structure},
      schema: continuityLedgerSchema,
    });
    const contractResult = await this.provider.generate({
      pass: 'scene-contracts',
      instructions: PASS_INSTRUCTIONS['scene-contracts'],
      input: {...input, storyBible, structure, continuityLedger},
      schema: sceneContractsResultSchema,
    });

    const sceneContracts: SceneContract[] = contractResult.sceneContracts;
    const completedScenes: StoryScene[] = [];
    let chapterSummaries: ChapterSummary[] = [];
    let lastHandoff = null;

    const batchSize = options.batchSize ?? 1;
    for (const batch of chunksOf(sceneContracts, batchSize)) {
      const handoff = createHandoffPacket({
        storyBible,
        chapterSummaries,
        continuityLedger,
        completedScenes,
        nextSceneContracts: batch,
      });
      const draft = await this.provider.generate({
        pass: 'drafting',
        instructions: PASS_INSTRUCTIONS.drafting,
        input: {handoff},
        schema: storyDraftBatchSchema,
      });
      const reviewed = await this.provider.generate({
        pass: 'local-review',
        instructions: PASS_INSTRUCTIONS['local-review'],
        input: {handoff, draft},
        schema: storyDraftBatchSchema,
      });
      completedScenes.push(...reviewed.scenes);
      chapterSummaries = mergeChapterSummaries(chapterSummaries, reviewed.chapterSummaries);
      continuityLedger = reviewed.continuityLedger;
      lastHandoff = handoff;
      await options.onCheckpoint?.({
        chapters: structure.chapters,
        scenes: [...completedScenes],
        storyDevelopment: {
          currentPass: 'drafting',
          storyBible,
          sceneContracts,
          chapterSummaries,
          continuityLedger,
          lastHandoff,
          validationIssues: [],
        },
      });
    }

    const runGlobalReview = (
      scenes: StoryScene[],
      summaries: ChapterSummary[],
      ledger: typeof continuityLedger,
    ) => this.provider.generate({
      pass: 'global-review' as const,
      instructions: PASS_INSTRUCTIONS['global-review'],
      input: {
        storyBible,
        chapters: structure.chapters,
        sceneContracts,
        scenes,
        chapterSummaries: summaries,
        continuityLedger: ledger,
        runtimeMinutes: input.runtimeMinutes,
      },
      schema: storyGlobalReviewSchema,
    });

    let globalReview = await runGlobalReview(completedScenes, chapterSummaries, continuityLedger);
    if (globalReview.issues.length > 0) {
      const affectedIds = Array.from(
        new Set(globalReview.issues.flatMap((issue) => issue.sceneIds)),
      );
      let targetedScenes = [...globalReview.scenes];
      let targetedSummaries = [...globalReview.chapterSummaries];
      let targetedLedger = globalReview.continuityLedger;
      const affectedContracts = sceneContracts.filter((contract) => affectedIds.includes(contract.id));

      for (const contracts of chunksOf(affectedContracts, 3)) {
        const contractIds = new Set(contracts.map((contract) => contract.id));
        const firstIndex = Math.min(
          ...contracts.map((contract) => sceneContracts.findIndex((item) => item.id === contract.id)),
        );
        const handoff = createHandoffPacket({
          storyBible,
          chapterSummaries: targetedSummaries,
          continuityLedger: targetedLedger,
          completedScenes: targetedScenes.slice(0, Math.max(0, firstIndex)),
          nextSceneContracts: contracts,
        });
        const relevantIssues = globalReview.issues.filter((issue) =>
          issue.sceneIds.some((sceneId) => contractIds.has(sceneId)),
        );
        const reviewed = await this.provider.generate({
          pass: 'local-review',
          instructions: PASS_INSTRUCTIONS['local-review'],
          input: {
            handoff,
            issues: relevantIssues,
            draft: {
              scenes: targetedScenes.filter((scene) => contractIds.has(scene.id)),
              chapterSummaries: targetedSummaries,
              continuityLedger: targetedLedger,
            },
          },
          schema: storyDraftBatchSchema,
        });
        const reviewedById = new Map(reviewed.scenes.map((scene) => [scene.id, scene]));
        targetedScenes = targetedScenes.map((scene) => reviewedById.get(scene.id) ?? scene);
        targetedSummaries = mergeChapterSummaries(targetedSummaries, reviewed.chapterSummaries);
        targetedLedger = reviewed.continuityLedger;
      }
      globalReview = await runGlobalReview(targetedScenes, targetedSummaries, targetedLedger);
    }

    const result: StoryPipelineResult = {
      chapters: structure.chapters,
      scenes: globalReview.scenes,
      storyDevelopment: {
        currentPass: 'complete',
        storyBible,
        sceneContracts,
        chapterSummaries: globalReview.chapterSummaries,
        continuityLedger: globalReview.continuityLedger,
        lastHandoff,
        validationIssues: globalReview.issues,
      },
    };
    await options.onCheckpoint?.(result);
    return result;
  }
}

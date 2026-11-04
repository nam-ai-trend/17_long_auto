import {z} from 'zod';
import {
  storyCandidateSchema,
  sceneSchema,
  type ProjectSettings,
  type StoryCandidate,
  type StoryDevelopment,
  type StoryInput,
  type StoryScene,
  type Chapter,
} from '../shared/contracts';
import {analyzeAudio} from './audio-analysis';
import {InterviewEngine} from './interview-engine';
import {
  llmConfigFromEnvironment,
  OpenAiCompatibleLlmProvider,
  type StructuredLlmProvider,
} from './llm-provider';
import {QwenTtsClient} from './qwen-tts-client';
import {
  buildDemoOutline,
  buildDemoStoryDevelopment,
  generateStoryCandidates,
} from './story-engine';
import {StoryPipeline, type StoryPipelineResult} from './story-pipeline';
import type {SceneRuntimeAdjustment} from './story-validator';
import {higgsfieldProvider} from './higgsfield-provider';

export type ProviderReadiness = 'ready' | 'disconnected' | 'error';
export type ProviderStatus = {
  name: string;
  status: ProviderReadiness;
  detail: string;
};

export type StoryProvider = {
  status: () => ProviderStatus;
  generateCandidates: (input: StoryInput) => Promise<StoryCandidate[]>;
  buildStory: (input: {
    candidate: StoryCandidate;
    storyInput: StoryInput;
    runtimeMinutes: ProjectSettings['runtimeMinutes'];
    era: string;
    onCheckpoint?: (checkpoint: StoryPipelineResult) => void | Promise<void>;
  }) => Promise<{
    chapters: Chapter[];
    scenes: StoryScene[];
    storyDevelopment: StoryDevelopment | null;
  }>;
  rebalanceScenes: (input: {
    scenes: StoryScene[];
    storyDevelopment: StoryDevelopment;
    adjustments: SceneRuntimeAdjustment[];
  }) => Promise<StoryScene[]>;
};

export type TtsProvider = {
  status: () => Promise<ProviderStatus>;
  synthesize: (input: {text: string; destinationPath: string}) => Promise<{
    audioPath: string;
    duration: number;
    leadingSilence: number;
    trailingSilence: number;
  }>;
};

export type VisualProvider = {
  status: () => ProviderStatus | Promise<ProviderStatus>;
  generate: () => Promise<never>;
};

export const disconnectedStoryProvider: StoryProvider = {
  status: () => ({
    name: '구조 설계 엔진',
    status: 'ready',
    detail: '오프라인 데모 후보를 생성합니다. 실제 LLM은 설정에서 연결합니다.',
  }),
  generateCandidates: async (input) => generateStoryCandidates(input),
  buildStory: async ({candidate, runtimeMinutes, onCheckpoint}) => {
    const outline = buildDemoOutline(candidate);
    const result = {
      ...outline,
      storyDevelopment: buildDemoStoryDevelopment(candidate, outline, runtimeMinutes),
    };
    await onCheckpoint?.(result);
    return result;
  },
  rebalanceScenes: async ({scenes}) => scenes,
};

const candidateResultSchema = z.object({candidates: z.array(storyCandidateSchema).length(3)});
const runtimeRevisionResultSchema = z.object({scenes: z.array(sceneSchema).min(1)});

export class LlmStoryProvider implements StoryProvider {
  private readonly pipeline: StoryPipeline;

  public constructor(private readonly llm: StructuredLlmProvider) {
    this.pipeline = new StoryPipeline(llm);
  }

  public status(): ProviderStatus {
    return this.llm.status();
  }

  public async generateCandidates(input: StoryInput): Promise<StoryCandidate[]> {
    const result = await this.llm.generate({
      pass: 'candidates',
      instructions: [
        '입력에서 흥행 기능만 추출하여, 서로 소재·인물·사건·반전이 완전히 다른 30분 장편 조선시대 야담 기획안 3개를 작성하세요.',
        '세 후보는 인물, 직업, 장소, 핵심 오브제, 사건 인과, 반전과 결말이 서로 겹치지 않아야 합니다.',
        '원본의 고유 표현이나 사건 배열을 복제하지 마세요.',
        '',
        '【절대 금지: 두루뭉술한 한 줄 요약 및 추상적 표현 엄격 금지】',
        '- "마을의 비밀을 알게 된다", "이상한 사건이 일어난다", "진실을 밝혀낸다", "문제를 해결한다" 같은 알맹이 없는 뜬구름 잡는 표현은 절대 쓰지 마세요.',
        '- 어떤 비밀인지, 적대자가 누구이며 무슨 죄를 지었는지, 진실이 무엇인지 구체적인 명사와 사건으로 정확히 서술하세요.',
        '',
        '【각 후보의 필수 항목 작성 지침】',
        '1. hook (첫 60초 후킹): 청자의 등골을 서늘하게 만들거나 호기심을 폭발시키는 첫 60초의 기괴한 미스터리나 사건.',
        '2. protagonist (주인공): 이름, 구체적 신분과 직업(예: 관노 출신 지필장이, 산골 약초꾼 등), 내면의 결핍과 절박한 목표.',
        '3. antagonist (적대자): 주인공과 맞서는 권세가, 탐관오리, 혹은 위선적인 악인의 이름/직책 및 탐욕.',
        '4. location (배경): 단순 지역명이 아닌 구체적인 생활 무대 (예: 담양 대숲 인쇄방, 문경 조령 산골 약방과 고을 관아).',
        '5. centralObject (핵심 오브제): 손에 잡히는 구체적인 물건이자 사건의 단서 (예: 붉은 섬유가 박힌 한지, 반으로 쪼개진 나루패).',
        '6. premise (기승전결 상세 줄거리 - 최소 4~6문장):',
        '   - [발단]: 주인공이 어떤 구체적인 계기와 오브제로 사건에 휘말리는가.',
        '   - [전개]: 적대자의 위협과 사건의 확산, 주인공이 겪는 억울한 누명이나 한계.',
        '   - [위기]: 절체절명의 위기에서 발견한 새로운 단서.',
        '   - 사용자가 읽고 이야기의 흐름을 완전히 파악할 수 있도록 구체적인 서사로 작성하세요.',
        '7. causalTurn (핵심 반전의 전말 - 최소 2~3문장):',
        '   - 숨겨진 진실이 무엇이고, 어떤 단서를 통해 판도가 뒤집히는지 구체적으로 밝히세요. (예: "알고 보니 처녀가 도둑이 아니라 사또가 조작한 족보의 진짜 종손이었으며, 주인공의 특수 한지 감별법으로 위조 인장이 탄로 난다.")',
        '8. endingPromise (사이다 응징과 결말 보상 - 최소 2~3문장):',
        '   - 악인이 관군과 백성들 앞에서 어떻게 통쾌하게 몰락하는지, 주인공이 무엇을 되찾고 어떤 깊은 여운을 남기는지 구체적 행동으로 서술하세요.',
        '9. strategy (30분 장편 서사 전략 - 최소 2~3문장):',
        '   - 30분 동안 초반 미스터리 ➔ 중반의 긴박한 추적과 방해 ➔ 후반 공개 폭로의 3막 구조를 어떻게 배분하고 어떤 복선을 심을 것인지 연출 전략을 제시하세요.',
      ].join('\n'),
      input,
      schema: candidateResultSchema,
    });
    return result.candidates;
  }

  public buildStory(input: {
    candidate: StoryCandidate;
    storyInput: StoryInput;
    runtimeMinutes: ProjectSettings['runtimeMinutes'];
    era: string;
    onCheckpoint?: (checkpoint: StoryPipelineResult) => void | Promise<void>;
  }) {
    const {onCheckpoint, ...pipelineInput} = input;
    return this.pipeline.run(pipelineInput, {onCheckpoint});
  }

  public async rebalanceScenes(input: {
    scenes: StoryScene[];
    storyDevelopment: StoryDevelopment;
    adjustments: SceneRuntimeAdjustment[];
  }): Promise<StoryScene[]> {
    const targetIds = new Set(input.adjustments.map((adjustment) => adjustment.sceneId));
    const targetScenes = input.scenes.filter((scene) => targetIds.has(scene.id));
    const result = await this.llm.generate({
      pass: 'runtime-revision',
      instructions: [
        '실제 TTS 시간과 씬 계약 목표 시간의 차이를 보정하세요.',
        'expand는 새 설명을 반복하지 말고 행동·감각·의미 있는 장애물을 보강하세요.',
        'compress는 사건 인과, 결정적 단서, 마지막 연결문을 유지하며 중복 설명만 줄이세요.',
        '입력으로 받은 씬만 반환하고 씬 ID, 장 ID, 결과와 다음 씬 연결은 바꾸지 마세요.',
      ].join('\n'),
      input: {
        adjustments: input.adjustments,
        scenes: targetScenes,
        storyBible: input.storyDevelopment.storyBible,
        sceneContracts: input.storyDevelopment.sceneContracts.filter((contract) => targetIds.has(contract.id)),
        continuityLedger: input.storyDevelopment.continuityLedger,
      },
      schema: runtimeRevisionResultSchema,
    });
    return result.scenes;
  }
}

export const createStoryProvider = (
  environment: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
): StoryProvider => {
  const llm = new OpenAiCompatibleLlmProvider(llmConfigFromEnvironment(environment), fetchImpl);
  return llm.status().status === 'ready' ? new LlmStoryProvider(llm) : disconnectedStoryProvider;
};

export class DynamicStoryProvider implements StoryProvider {
  public constructor(
    private readonly environment: () => Record<string, string | undefined> = () => process.env,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private getProvider(): StoryProvider {
    return createStoryProvider(this.environment(), this.fetchImpl);
  }

  public status(): ProviderStatus {
    return this.getProvider().status();
  }

  public generateCandidates(input: StoryInput): Promise<StoryCandidate[]> {
    return this.getProvider().generateCandidates(input);
  }

  public buildStory(input: Parameters<StoryProvider['buildStory']>[0]) {
    return this.getProvider().buildStory(input);
  }

  public rebalanceScenes(input: Parameters<StoryProvider['rebalanceScenes']>[0]) {
    return this.getProvider().rebalanceScenes(input);
  }
}

export const storyProvider: StoryProvider = new DynamicStoryProvider();

type QwenClientContract = Pick<QwenTtsClient, 'checkReady' | 'generate'>;
type AnalyzeAudio = typeof analyzeAudio;

export class QwenTtsProvider implements TtsProvider {
  public constructor(
    private readonly client: QwenClientContract = new QwenTtsClient(),
    private readonly analyze: AnalyzeAudio = analyzeAudio,
  ) {}

  public async status(): Promise<ProviderStatus> {
    try {
      const ready = await this.client.checkReady();
      return ready
        ? {
            name: 'Qwen3 TTS',
            status: 'ready',
            detail: 'Pinokio Qwen3-TTS의 한국어 CustomVoice 엔드포인트가 준비되었습니다.',
          }
        : {
            name: 'Qwen3 TTS',
            status: 'disconnected',
            detail: 'Pinokio에서 Qwen3-TTS를 실행하면 실제 음성을 생성할 수 있습니다.',
          };
    } catch (error) {
      return {
        name: 'Qwen3 TTS',
        status: 'error',
        detail: `Qwen3-TTS 연결 점검 오류: ${error instanceof Error ? error.message : '원인 불명'}`,
      };
    }
  }

  public async synthesize(input: {text: string; destinationPath: string}) {
    const generated = await this.client.generate(input);
    const analysis = await this.analyze(generated.path);
    return {
      audioPath: generated.path,
      duration: analysis.duration,
      leadingSilence: analysis.leading,
      trailingSilence: analysis.trailing,
    };
  }
}

export const qwenTtsProvider = new QwenTtsProvider();

export const disconnectedHiggsfieldProvider: VisualProvider = {
  status: () => ({
    name: 'Higgsfield',
    status: 'disconnected',
    detail: '연결 전입니다. 생성 요청을 외부로 보내지 않습니다.',
  }),
  generate: async () => {
    throw new Error('Higgsfield가 연결되지 않았습니다. 로컬 자산을 가져와 계속할 수 있습니다.');
  },
};

export const localMotionStatus = (): ProviderStatus => ({
  name: '로컬 2D 모션',
  status: 'ready',
  detail: '확대·축소·이동 모션 계획을 로컬에서 생성합니다.',
});

export const providerStatuses = async (
  ttsProvider: TtsProvider = qwenTtsProvider,
  currentStoryProvider: StoryProvider = storyProvider,
  visualProvider: VisualProvider = higgsfieldProvider,
) => ({
  story: currentStoryProvider.status(),
  qwen: await ttsProvider.status(),
  higgsfield: await visualProvider.status(),
  motion: localMotionStatus(),
});

export const createInterviewEngine = (
  environment: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
): InterviewEngine => {
  const llm = new OpenAiCompatibleLlmProvider(llmConfigFromEnvironment(environment), fetchImpl);
  return new InterviewEngine(llm.status().status === 'ready' ? llm : undefined);
};

export const defaultInterviewEngine: InterviewEngine = createInterviewEngine();

import {
  interviewQuestionSchema,
  interviewResultSchema,
  type InterviewQuestion,
  type InterviewResult,
  type InterviewStepInput,
} from '../shared/contracts';
import type {StructuredLlmProvider} from './llm-provider';

// 테마별 오프라인/대체 템플릿 질문 풀 (LLM 비연결 또는 실패 시 즉각 활용)
const FALLBACK_TEMPLATES: Record<
  string,
  Array<{
    category: string;
    question: string;
    suggestions: Array<{label: string; detail: string; recommended?: boolean}>;
  }>
> = {
  '권선징악 & 사이다 복수': [
    {
      category: '인물과 동기',
      question: '어떤 주인공이 탐관오리나 악덕 권세가에 맞서게 되나요?',
      suggestions: [
        {
          label: '억울하게 가족을 잃고 붓을 든 서생',
          detail: '법전과 글재주를 무기로 관아의 비리를 낱낱이 파헤칩니다.',
          recommended: true,
        },
        {
          label: '관아의 뒷골목을 꿰뚫고 있는 손재주 좋은 장인',
          detail: '현장의 냄새와 도구를 이용해 은밀한 약점을 쥐어챕니다.',
        },
        {
          label: '오랜 세월 침묵하며 기회를 엿보던 충직한 노비',
          detail: '상전의 집안 내부에서부터 서서히 숨통을 죄어갑니다.',
        },
      ],
    },
    {
      category: '핵심 위기와 갈등',
      question: '적대자가 주인공을 옥죄기 위해 파놓은 잔혹한 함정은 무엇인가요?',
      suggestions: [
        {
          label: '도둑 누명을 씌워 옥사에 가두기',
          detail: '주인공뿐 아니라 주변 조력자들까지 한꺼번에 엮어 넣으려 합니다.',
          recommended: true,
        },
        {
          label: '마을 사람들의 생계를 볼모로 한 협박',
          detail: '주인공이 침묵하지 않으면 이웃 전체가 굶주리게 만듭니다.',
        },
        {
          label: '가짜 장부와 뇌물로 주인공의 편을 매수',
          detail: '가장 믿었던 오랜 동료가 돌아서는 위기를 맞이합니다.',
        },
      ],
    },
    {
      category: '클라이맥스와 반전',
      question: '사람들 앞에서 적대자의 죄상이 만천하에 드러나는 결정적 반전은 무엇인가요?',
      suggestions: [
        {
          label: '적대자가 스스로 서명한 비밀 장부의 공개',
          detail: '완벽하다고 믿었던 알리바이가 본인의 탐욕으로 깨집니다.',
          recommended: true,
        },
        {
          label: '죽은 줄 알았던 핵심 증인의 법정 등장',
          detail: '현장에서 사또의 낯빛이 사색이 되며 전세가 역전됩니다.',
        },
        {
          label: '암행어사 출도와 함께 펼쳐지는 증거물 압수',
          detail: '조용히 지켜보던 관찰자들의 통쾌한 결탁이 밝혀집니다.',
        },
      ],
    },
  ],
  '기이한 요괴·원혼 괴담': [
    {
      category: '인물과 동기',
      question: '기이한 존재와 마주하게 되는 주인공은 어떤 사연을 품고 있나요?',
      suggestions: [
        {
          label: '밤길을 떠돌며 약을 파는 시골 의원',
          detail: '괴이한 환자를 치료하러 깊은 산속 사당으로 향합니다.',
          recommended: true,
        },
        {
          label: '귀향길에 흉가에 묵게 된 몰락 양반',
          detail: '과거 낙방 후 돌아가던 중 피할 수 없는 시험에 듭니다.',
        },
        {
          label: '물건을 찾아 산 넘던 우직한 보부상',
          detail: '눈보라 치는 고갯길에서 낯선 여인의 부탁을 받습니다.',
        },
      ],
    },
    {
      category: '핵심 위기와 갈등',
      question: '밤마다 나타나는 존재가 감추고 있는 섬뜩한 비밀은 무엇인가요?',
      suggestions: [
        {
          label: '살아있는 사람이 아닌 원혼의 억울한 하소연',
          detail: '가장 다정해 보였던 인물이 사실 이미 목숨을 잃은 상태였습니다.',
          recommended: true,
        },
        {
          label: '인간의 가죽을 뒤집어쓰고 사람 흉내를 내는 둔갑 요괴',
          detail: '마을 주민들 사이에 섞여 살며 사람의 간을 노립니다.',
        },
        {
          label: '가문의 번영을 위해 사당 밑에 묻어둔 끔찍한 저주',
          detail: '은혜를 갚으려던 존재가 사실은 피의 대가를 요구하고 있습니다.',
        },
      ],
    },
    {
      category: '클라이맥스와 반전',
      question: '공포와 혼란 속에서 드러나는 진정한 진실은 무엇인가요?',
      suggestions: [
        {
          label: '요괴보다 더 잔혹했던 마을 양반의 탐욕',
          detail: '괴물로 여겨진 존재가 사실은 그 탐욕의 가장 큰 피해자였습니다.',
          recommended: true,
        },
        {
          label: '주인공이 품고 있던 낡은 부적의 정체',
          detail: '어머니의 유품이라 믿었던 물건이 원혼을 묶어둔 봉인이었습니다.',
        },
        {
          label: '새벽닭이 울며 풀리는 저주와 영원한 안식',
          detail: '한을 풀어준 주인공에게 요괴가 마지막 보물을 건네고 사라집니다.',
        },
      ],
    },
  ],
};

const DEFAULT_FALLBACK_QUESTIONS = [
  {
    category: '인물과 동기',
    question: '이 이야기의 주인공은 어떤 사람이며, 무엇을 간절히 바라고 있나요?',
    suggestions: [
      {
        label: '재주를 숨기고 밑바닥에서 살아온 인물',
        detail: '겉으로는 어리숙해 보이지만 남다른 관찰력과 손재주를 품고 있습니다.',
        recommended: true,
      },
      {
        label: '신분과 체면의 굴레에 갇힌 몰락 양반',
        detail: '가문의 명예와 당장의 생계 사이에서 치열하게 번민합니다.',
      },
      {
        label: '억울한 누명을 벗고 제 이름을 찾으려는 도망자',
        detail: '진실을 증명할 수 있는 단 하나의 단서를 찾아 헤맵니다.',
      },
    ],
  },
  {
    category: '핵심 위기와 갈등',
    question: '주인공의 목적을 가로막는 가장 위험하고 치명적인 장애물은 무엇인가요?',
    suggestions: [
      {
        label: '권세가의 집요한 추적과 증거 인멸',
        detail: '주인공이 다가설수록 주변 증인들이 하나둘씩 사라집니다.',
        recommended: true,
      },
      {
        label: '신분의 벽과 관아의 철저한 은폐',
        detail: '진실을 말해도 천한 자의 말이라며 아무도 믿어주지 않습니다.',
      },
      {
        label: '목숨보다 소중한 사람을 향한 인질 협박',
        detail: '한 걸음만 더 나아가면 소중한 이가 다치게 되는 딜레마에 빠집니다.',
      },
    ],
  },
  {
    category: '클라이맥스와 반전',
    question: '사건이 해결되거나 결말을 맺을 때 가장 크게 울려 퍼질 카타르시스는 무엇인가요?',
    suggestions: [
      {
        label: '적대자가 놓은 덫에 스스로 걸려드는 지략의 승리',
        detail: '무력이 아닌 두뇌와 단서의 역이용으로 권세가를 무너뜨립니다.',
        recommended: true,
      },
      {
        label: '모든 사람이 지켜보는 자리에서의 극적인 공개 폭로',
        detail: '감춰졌던 증좌가 드러나며 그 자리에 있던 모두가 숨을 삼킵니다.',
      },
      {
        label: '오랜 한이 풀리며 남는 묵직하고 따스한 보은의 여운',
        detail: '복수를 넘어선 관계의 회복과 깊은 감동을 안겨줍니다.',
      },
    ],
  },
];

export class InterviewEngine {
  public constructor(private readonly llm?: StructuredLlmProvider) {}

  public async getNextQuestion(input: InterviewStepInput): Promise<InterviewQuestion> {
    const step = input.history.length + 1;
    const totalSteps = 3;

    if (this.llm && this.llm.status().status === 'ready') {
      try {
        const stepContext =
          step === 1
            ? '인물과 발단 동기 (주인공의 신분/성격/상황 및 사건에 뛰어든 이유)'
            : step === 2
              ? '핵심 위기와 갈등 (적대자 또는 거대한 장애물의 음모와 주인공의 위기)'
              : '클라이맥스와 반전/결말 (진실이 밝혀지는 결정적 계기와 사건의 통쾌하거나 뭉클한 매듭)';

        const instructions = [
          '당신은 조선시대 야담 전문 스토리 디렉터입니다.',
          `현재 단계는 총 ${totalSteps}단계 중 [제 ${step}단계: ${stepContext}]입니다.`,
          '사용자가 선택한 대주제와 세부 소재, 그리고 지금까지 나눈 문답 내역을 바탕으로 이야기를 구체화할 다음 질문 1개와 매력적인 추천 답변 3개를 작성하세요.',
          '',
          '【작성 지침】',
          '1. 질문(question): 기계적이지 않고, 마치 능숙한 시나리오 작가가 동료 작가에게 묻듯 상상력을 자극하는 흥미진진한 질문으로 작성하세요.',
          '2. 추천 답변(suggestions): 3개를 제시하며, 그중 1개는 recommended: true로 설정하세요.',
          '3. 각 추천 답변은 구체적인 조선 후기 생활상, 직업, 소품, 인간 군상의 냄새가 나도록 디테일하게 작성하세요.',
          '4. category에는 현재 질문의 핵심 카테고리(예: "인물과 동기", "위기와 갈등", "반전과 결말" 등)를 기입하세요.',
          '5. step은 현재 스텝 번호, totalSteps는 3을 기입하세요.',
        ].join('\n');

        const result = await this.llm.generate({
          pass: 'interview',
          instructions,
          input: {
            step,
            totalSteps,
            theme: input.theme,
            topic: input.topic,
            history: input.history,
          },
          schema: interviewQuestionSchema,
        });

        return result;
      } catch (err) {
        process.stderr.write(
          `[InterviewEngine] LLM 질문 생성 오류: ${err instanceof Error ? err.message : String(err)}. 대체 템플릿을 사용합니다.\n`,
        );
      }
    }

    // Fallback: 템플릿 사용
    const themePool = FALLBACK_TEMPLATES[input.theme] ?? DEFAULT_FALLBACK_QUESTIONS;
    const template = themePool[Math.min(step - 1, themePool.length - 1)];

    return {
      step,
      totalSteps,
      category: template.category,
      question: template.question,
      suggestions: template.suggestions,
    };
  }

  public async getSummary(input: InterviewStepInput): Promise<InterviewResult> {
    if (this.llm && this.llm.status().status === 'ready') {
      try {
        const instructions = [
          '당신은 조선시대 야담 전문 스토리 디렉터입니다.',
          '사용자와의 전략 인터뷰 문답 전체를 종합하여, 30분 롱폼 영상 제작에 적합한 완성도 높은 이야기 기획안을 도출하세요.',
          '',
          '【반환 항목】',
          '1. title: 유튜브 야담 시청자의 클릭을 유발하는 흡입력 있고 서정적인 제목 (예: "과거 시험을 뒤흔든 노비의 비밀 붓")',
          '2. summary: 30분 장편 서사의 뼈대를 이루는 3~4문장의 시놉시스 (인물, 사건 발단, 위기, 반전)',
          '3. strategy: 30분 동안 시청자를 붙잡아 둘 구체적인 서사 및 복선 연출 전략 (초반 미스터리 배분, 중반 추적과 갈등, 후반 공개 폭로의 3막 구성)',
        ].join('\n');

        const result = await this.llm.generate({
          pass: 'interview',
          instructions,
          input: {
            theme: input.theme,
            topic: input.topic,
            history: input.history,
          },
          schema: interviewResultSchema,
        });

        return result;
      } catch (err) {
        process.stderr.write(
          `[InterviewEngine] LLM 요약 생성 오류: ${err instanceof Error ? err.message : String(err)}. 대체 요약을 사용합니다.\n`,
        );
      }
    }

    // Fallback 요약
    const h = input.history;
    const ans1 = h[0]?.answer ?? '미천한 신분의 지략가';
    const ans2 = h[1]?.answer ?? '권세가의 거대한 음모';
    const ans3 = h[2]?.answer ?? '공개적인 반전과 진실 규명';

    const shortTheme = input.theme.split('&')[0]?.trim() || input.theme;
    return {
      title: `${shortTheme}: ${input.topic ? input.topic : ans1.slice(0, 15)}의 비밀`,
      summary: `조선 후기, ${ans1}을 품은 주인공이 ${ans2}라는 절체절명의 위기에 부딪힌다. 치열한 암투 끝에 ${ans3}을 통해 가려졌던 진실을 밝혀내며 통쾌한 카타르시스와 깊은 여운을 남긴다.`,
      strategy: `초반 10분은 인물의 은밀한 처지와 사건의 단초를 감각적으로 제시하고, 중반 10분은 적대자와의 숨 막히는 추적과 위기를 다루며, 종반 10분은 감춰진 복선을 폭발시키며 반전 결말로 마무리한다.`,
    };
  }
}


import type {
  Chapter,
  RuntimePreset,
  StoryCandidate,
  StoryDevelopment,
  StoryInput,
  StoryScene,
} from '../shared/contracts';

const candidates: Omit<StoryCandidate, 'id'>[] = [
  {
    title: '달빛 아래 묻힌 장부',
    premise:
      '산골 약초꾼 해원이 굶주린 아이를 살리려 내어 준 한 줌의 약초 때문에 고을의 세곡 비리를 마주한다.',
    hook: '목이 잘릴 죄인의 품에서, 이미 죽은 아버지의 필체가 적힌 장부가 떨어진다.',
    protagonist: '산골 약초꾼 해원',
    location: '문경 깊은 산촌과 관아 약방',
    centralObject: '먹물이 번진 세곡 장부',
    causalTurn: '선행으로 살린 아이가 탐관오리의 비밀 창고를 본 유일한 목격자로 드러난다.',
    endingPromise: '글을 모르는 백성이 장부의 거짓을 몸으로 증명해 원통한 죽음을 갚는다.',
  },
  {
    title: '검은 나룻배의 맹세',
    premise:
      '떠돌이 옹기장이 무진이 홍수에 떠내려온 노파를 구한 뒤 물길을 독점한 객주의 덫에 들어간다.',
    hook: '새벽 강물에 빈 나룻배가 돌아왔는데, 밧줄에는 산 사람의 머리카락이 매여 있었다.',
    protagonist: '떠돌이 옹기장이 무진',
    location: '남한강 나루와 옹기 장터',
    centralObject: '반으로 갈라진 나루패',
    causalTurn: '노파가 건넨 반쪽 패가 사라진 뱃사공들의 이름을 밝히는 열쇠가 된다.',
    endingPromise: '깨지기 쉬운 옹기와 물의 흔적을 이용해 권세가의 거짓 증언을 뒤집는다.',
  },
  {
    title: '대숲에 울린 빈 목탁',
    premise:
      '관노 출신 지필장이가 버려진 절에서 종이를 훔치는 처녀를 붙잡으며 양반가의 위조 족보 사건에 휘말린다.',
    hook: '아무도 없는 폐사에서 목탁이 세 번 울릴 때마다 한 사람의 이름이 족보에서 사라졌다.',
    protagonist: '관노 출신 지필장이 만복',
    location: '담양 대숲과 폐사 인쇄방',
    centralObject: '붉은 섬유가 박힌 한지',
    causalTurn: '도둑으로 몰린 처녀가 사실은 지워진 집안의 마지막 생존자임이 밝혀진다.',
    endingPromise: '천한 장인의 손기술이 가짜 혈통을 벗겨 내고 빼앗긴 이름을 되찾는다.',
  },
];

export const generateStoryCandidates = (_input: StoryInput): StoryCandidate[] =>
  candidates.map((candidate, index) => ({...candidate, id: `candidate-${index + 1}`}));

const chapterPurposes = [
  ['피할 수 없는 발견', '위험과 질문을 즉시 세운다.'],
  ['닫힌 입들', '생활 세계를 보여 주며 적의 힘을 확인한다.'],
  ['뒤집힌 증거', '주인공의 오해와 숨은 관계를 뒤집는다.'],
  ['사람들 앞의 시험', '기술과 복선을 공개된 자리에서 증명한다.'],
  ['되찾은 이름', '응징 뒤 인물의 삶이 어떻게 달라졌는지 남긴다.'],
] as const;

const withSubjectParticle = (word: string): string => {
  const lastCode = word.charCodeAt(word.length - 1);
  const isHangulSyllable = lastCode >= 0xac00 && lastCode <= 0xd7a3;
  const hasFinalConsonant = isHangulSyllable && (lastCode - 0xac00) % 28 !== 0;
  return `${word}${hasFinalConsonant ? '이' : '가'}`;
};

export const buildDemoOutline = (
  candidate: StoryCandidate,
): {chapters: Chapter[]; scenes: StoryScene[]} => {
  const scenes: StoryScene[] = chapterPurposes.flatMap((chapter, chapterIndex) => {
    const chapterId = `chapter-${chapterIndex + 1}`;
    return [0, 1].map((sceneIndex) => {
      const id = `scene-${chapterIndex * 2 + sceneIndex + 1}`;
      const isOpening = chapterIndex === 0 && sceneIndex === 0;
      const isEnding = chapterIndex === 4 && sceneIndex === 1;
      return {
        id,
        chapterId,
        title: isOpening
          ? '피 묻은 물건이 떨어지다'
          : isEnding
            ? '사람들이 오래 기억한 밤'
            : `${chapter[0]} ${sceneIndex + 1}`,
        location: candidate.location,
        objective: isOpening
          ? '눈앞의 사람을 살리고 물건의 정체를 확인한다.'
          : `${candidate.protagonist}이 다음 증거와 행동할 이유를 얻는다.`,
        change: isEnding ? candidate.endingPromise : `${candidate.centralObject}의 의미가 한 단계 달라진다.`,
        text: isOpening
          ? `${candidate.hook} ${candidate.protagonist}은 도망치지 않았습니다. 손에 쥔 ${withSubjectParticle(candidate.centralObject)} 오늘 밤 누군가의 목숨을 가를 것임을 알았기 때문입니다.`
          : `${candidate.protagonist}은 ${candidate.location}에서 물러서지 않았습니다. 작은 선택 하나가 감춰진 진실을 끌어냈고, 사람들은 서로 다른 표정으로 그 결과를 지켜보았습니다.`,
      };
    });
  });

  const chapters: Chapter[] = chapterPurposes.map(([title, purpose], chapterIndex) => ({
    id: `chapter-${chapterIndex + 1}`,
    title,
    purpose,
    sceneIds: scenes
      .filter((scene) => scene.chapterId === `chapter-${chapterIndex + 1}`)
      .map((scene) => scene.id),
  }));

  return {chapters, scenes};
};

export const buildDemoStoryDevelopment = (
  candidate: StoryCandidate,
  outline: {chapters: Chapter[]; scenes: StoryScene[]},
  runtimeMinutes: RuntimePreset,
): StoryDevelopment => {
  const targetSeconds = (runtimeMinutes * 60) / outline.scenes.length;
  return {
    currentPass: 'complete',
    storyBible: {
      titlePromise: candidate.title,
      hookQuestion: candidate.hook,
      protagonistGoal: candidate.premise,
      failureRisk: `${candidate.protagonist}이 진실을 밝히지 못하면 삶의 터전과 명예를 잃는다.`,
      endingPromise: candidate.endingPromise,
      era: '조선 후기',
      voiceRules: [
        '한 명의 이야기꾼이 해설과 대사를 모두 낭독한다.',
        '현대 시니어가 이해하기 쉬운 표준어와 절제된 옛이야기 운율을 사용한다.',
      ],
      characters: [
        {
          id: 'protagonist',
          name: candidate.protagonist,
          role: '주인공',
          desire: candidate.endingPromise,
          lack: '권세 앞에서 자신의 기술과 판단을 믿지 못한다.',
          speech: '차분하고 짧지만 결정적인 순간에는 물러서지 않는다.',
        },
      ],
      foreshadowing: [
        {
          id: 'central-object',
          setup: `${candidate.centralObject}이 초반 위기에서 발견된다.`,
          payoff: `${candidate.centralObject}의 물성과 흔적이 결말의 증거가 된다.`,
        },
      ],
    },
    sceneContracts: outline.scenes.map((scene, index) => ({
      id: scene.id,
      chapterId: scene.chapterId,
      title: scene.title,
      location: scene.location,
      timeframe: index % 3 === 0 ? '밤' : index % 3 === 1 ? '이튿날 아침' : '낮',
      characters: ['protagonist'],
      objective: scene.objective,
      obstacle: '권세와 침묵이 진실을 가린다.',
      action: `${candidate.protagonist}이 ${candidate.centralObject}의 흔적을 직접 확인한다.`,
      result: scene.change,
      nextQuestion: index === outline.scenes.length - 1 ? '이 선택은 사람들의 삶에 무엇을 남겼는가?' : '이 변화 때문에 다음에는 누가 움직이는가?',
      emotionalShift: '망설임에서 결심으로 이동한다.',
      realismAnchor: `${candidate.location}의 생업과 문서 처리 방식`,
      foreshadowingActions: [`central-object:${index === outline.scenes.length - 1 ? 'payoff' : 'reinforce'}`],
      targetSeconds: Number(targetSeconds.toFixed(3)),
    })),
    chapterSummaries: outline.chapters.map((chapter) => ({
      chapterId: chapter.id,
      summary: chapter.purpose,
      completedSceneIds: [...chapter.sceneIds],
    })),
    continuityLedger: {
      characters: [
        {
          characterId: 'protagonist',
          location: candidate.location,
          knowledge: ['핵심 오브제가 사건의 증거라는 사실을 안다.'],
          emotion: '결말을 향해 결심이 굳어졌다.',
          relationshipState: ['마을 사람들과 진실을 공유한다.'],
        },
      ],
      objects: [
        {
          objectId: 'central-object',
          owner: candidate.protagonist,
          condition: '사건의 흔적이 남아 있다.',
          significance: candidate.causalTurn,
        },
      ],
      foreshadowing: [
        {id: 'central-object', status: 'paid-off', lastSceneId: outline.scenes.at(-1)?.id ?? 'scene-1'},
      ],
      unresolvedQuestions: [],
      repeatedFacts: [candidate.premise],
    },
    lastHandoff: null,
    validationIssues: [],
  };
};

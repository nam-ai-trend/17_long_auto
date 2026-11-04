import {z} from 'zod';
import {DWELL_PRESETS, RUNTIME_PRESETS} from './presets';

export const runtimePresetSchema = z.union([
  z.literal(RUNTIME_PRESETS[0]),
  z.literal(RUNTIME_PRESETS[1]),
  z.literal(RUNTIME_PRESETS[2]),
  z.literal(RUNTIME_PRESETS[3]),
]);
export type RuntimePreset = z.infer<typeof runtimePresetSchema>;

export const dwellPresetIdSchema = z.enum(['short', 'balanced', 'long', 'immersive']);
export type DwellPresetId = z.infer<typeof dwellPresetIdSchema>;

export const startModeSchema = z.enum(['reference', 'strategy']);
export type StartMode = z.infer<typeof startModeSchema>;

export const projectStageSchema = z.enum(['story', 'script', 'production']);
export type ProjectStage = z.infer<typeof projectStageSchema>;

export const storyInputSchema = z.object({
  mode: startModeSchema,
  title: z.string().trim().min(1),
  summary: z.string().trim().min(10),
});
export type StoryInput = z.infer<typeof storyInputSchema>;

export const storyCandidateSchema = z.object({
  id: z.string(),
  title: z.string(),
  premise: z.string(),
  hook: z.string(),
  protagonist: z.string(),
  antagonist: z.string().optional(),
  location: z.string(),
  centralObject: z.string(),
  causalTurn: z.string(),
  endingPromise: z.string(),
  strategy: z.string().optional(),
});
export type StoryCandidate = z.infer<typeof storyCandidateSchema>;

export const chapterSchema = z.object({
  id: z.string(),
  title: z.string(),
  purpose: z.string(),
  sceneIds: z.array(z.string()),
});
export type Chapter = z.infer<typeof chapterSchema>;

export const sceneSchema = z.object({
  id: z.string(),
  chapterId: z.string(),
  title: z.string(),
  location: z.string(),
  objective: z.string(),
  change: z.string(),
  text: z.string(),
});
export type StoryScene = z.infer<typeof sceneSchema>;

export const storyPassSchema = z.enum([
  'candidates',
  'hook',
  'structure',
  'continuity',
  'scene-contracts',
  'drafting',
  'local-review',
  'global-review',
  'runtime-revision',
  'complete',
]);
export type StoryPass = z.infer<typeof storyPassSchema>;

export const storyCharacterSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  role: z.string().min(1),
  desire: z.string().min(1),
  lack: z.string().min(1),
  speech: z.string().min(1),
});
export type StoryCharacter = z.infer<typeof storyCharacterSchema>;

export const foreshadowingPlanSchema = z.object({
  id: z.string().min(1),
  setup: z.string().min(1),
  payoff: z.string().min(1),
});
export type ForeshadowingPlan = z.infer<typeof foreshadowingPlanSchema>;

export const storyBibleSchema = z.object({
  titlePromise: z.string().min(1),
  hookQuestion: z.string().min(1),
  protagonistGoal: z.string().min(1),
  failureRisk: z.string().min(1),
  endingPromise: z.string().min(1),
  era: z.string().min(1),
  voiceRules: z.array(z.string().min(1)).min(1),
  characters: z.array(storyCharacterSchema).min(1),
  foreshadowing: z.array(foreshadowingPlanSchema),
});
export type StoryBible = z.infer<typeof storyBibleSchema>;

export const sceneContractSchema = z.object({
  id: z.string().min(1),
  chapterId: z.string().min(1),
  title: z.string().min(1),
  location: z.string().min(1),
  timeframe: z.string().min(1),
  characters: z.array(z.string().min(1)).min(1),
  objective: z.string().min(1),
  obstacle: z.string().min(1),
  action: z.string().min(1),
  result: z.string().min(1),
  nextQuestion: z.string().min(1),
  emotionalShift: z.string().min(1),
  realismAnchor: z.string().min(1),
  foreshadowingActions: z.array(z.string()),
  targetSeconds: z.number().positive(),
});
export type SceneContract = z.infer<typeof sceneContractSchema>;

export const chapterSummarySchema = z.object({
  chapterId: z.string().min(1),
  summary: z.string().min(1),
  completedSceneIds: z.array(z.string()),
});
export type ChapterSummary = z.infer<typeof chapterSummarySchema>;

export const characterContinuitySchema = z.object({
  characterId: z.string().min(1),
  location: z.string().min(1),
  knowledge: z.array(z.string()),
  emotion: z.string().min(1),
  relationshipState: z.array(z.string()),
});

export const objectContinuitySchema = z.object({
  objectId: z.string().min(1),
  owner: z.string().min(1),
  condition: z.string().min(1),
  significance: z.string().min(1),
});

export const foreshadowingStateSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['planned', 'planted', 'reinforced', 'paid-off']),
  lastSceneId: z.string().min(1),
});

export const continuityLedgerSchema = z.object({
  characters: z.array(characterContinuitySchema),
  objects: z.array(objectContinuitySchema),
  foreshadowing: z.array(foreshadowingStateSchema),
  unresolvedQuestions: z.array(z.string()),
  repeatedFacts: z.array(z.string()),
});
export type ContinuityLedger = z.infer<typeof continuityLedgerSchema>;

export const handoffPacketSchema = z.object({
  storyBible: storyBibleSchema,
  currentChapterSummary: chapterSummarySchema.nullable(),
  recentSceneSummaries: z.array(z.string()).default([]),
  continuityLedger: continuityLedgerSchema,
  previousEnding: z.string(),
  nextSceneContracts: z.array(sceneContractSchema).min(1).max(3),
});
export type HandoffPacket = z.infer<typeof handoffPacketSchema>;

export const storyValidationIssueSchema = z.object({
  code: z.enum([
    'opening-hook',
    'transition',
    'continuity',
    'repetition',
    'foreshadowing',
    'era',
    'runtime',
  ]),
  severity: z.enum(['warning', 'error']),
  message: z.string().min(1),
  sceneIds: z.array(z.string()),
});
export type StoryValidationIssue = z.infer<typeof storyValidationIssueSchema>;

export const storyDevelopmentSchema = z.object({
  currentPass: storyPassSchema,
  storyBible: storyBibleSchema,
  sceneContracts: z.array(sceneContractSchema),
  chapterSummaries: z.array(chapterSummarySchema),
  continuityLedger: continuityLedgerSchema,
  lastHandoff: handoffPacketSchema.nullable(),
  validationIssues: z.array(storyValidationIssueSchema),
});
export type StoryDevelopment = z.infer<typeof storyDevelopmentSchema>;

export const storyStructureSchema = z.object({
  chapters: z.array(chapterSchema).min(1),
  sceneContracts: z.array(sceneContractSchema).min(1),
});
export type StoryStructure = z.infer<typeof storyStructureSchema>;

export const sceneContractsResultSchema = z.object({
  sceneContracts: z.array(sceneContractSchema).min(1),
});

export const storyDraftBatchSchema = z.object({
  scenes: z.array(sceneSchema).min(1).max(3),
  chapterSummaries: z.array(chapterSummarySchema),
  continuityLedger: continuityLedgerSchema,
});
export type StoryDraftBatch = z.infer<typeof storyDraftBatchSchema>;

export const storyGlobalReviewSchema = z.object({
  scenes: z.array(sceneSchema).min(1),
  chapterSummaries: z.array(chapterSummarySchema),
  continuityLedger: continuityLedgerSchema,
  issues: z.array(storyValidationIssueSchema),
});
export type StoryGlobalReview = z.infer<typeof storyGlobalReviewSchema>;

export const gapReasonSchema = z.enum(['comma', 'sentence', 'paragraph', 'speaker', 'emotion', 'scene']);
export type GapReason = z.infer<typeof gapReasonSchema>;

export const narrationCueSchema = z.object({
  id: z.string(),
  sceneId: z.string(),
  text: z.string(),
  start: z.number().nonnegative(),
  end: z.number().nonnegative(),
  sourceAudioDuration: z.number().positive(),
  gapAfter: z.number().nonnegative(),
  gapReason: gapReasonSchema,
  manualGap: z.number().nonnegative().nullable(),
  ttsStatus: z.enum(['estimated', 'queued', 'generating', 'ready', 'failed']).default('estimated'),
  audioPath: z.string().nullable().default(null),
  leadingSilence: z.number().nonnegative().default(0),
  trailingSilence: z.number().nonnegative().default(0),
  ttsError: z.string().nullable().default(null),
});
export type NarrationCue = z.infer<typeof narrationCueSchema>;

export const motionStageSchema = z.object({
  id: z.string(),
  kind: z.enum(['settle', 'push', 'pull', 'pan-left', 'pan-right', 'pan-up', 'pan-down', 'focus', 'hold']),
  fromProgress: z.number().min(0).max(1),
  toProgress: z.number().min(0).max(1),
  scaleFrom: z.number().positive(),
  scaleTo: z.number().positive(),
  xFrom: z.number(),
  xTo: z.number(),
  yFrom: z.number(),
  yTo: z.number(),
});
export type MotionStage = z.infer<typeof motionStageSchema>;

export const mediaSegmentSchema = z.object({
  id: z.string(),
  sceneId: z.string(),
  sceneDataId: z.string().nullable().default(null),
  start: z.number().nonnegative(),
  end: z.number().positive(),
  type: z.enum(['video', 'still']),
  prompt: z.string(),
  semanticBreak: z.string().nullable(),
  referenceKeys: z.array(z.string()).default([]),
  parallaxRecommended: z.boolean(),
  parallaxEnabled: z.boolean(),
  motionStages: z.array(motionStageSchema),
});
export type MediaSegment = z.infer<typeof mediaSegmentSchema>;

export const mediaSceneDataSchema = z.object({
  id: z.string(),
  storySceneId: z.string(),
  cueIds: z.array(z.string()).min(1),
  start: z.number().nonnegative(),
  end: z.number().positive(),
  timingSource: z.enum(['tts', 'estimated']),
  summary: z.string().min(1),
  characters: z.array(z.string()),
  location: z.string().min(1),
  timeframe: z.string().min(1),
  emotion: z.string().min(1),
  action: z.string().min(1),
  objectStates: z.array(z.string()),
  previousLink: z.string().nullable(),
  nextLink: z.string().nullable(),
});
export type MediaSceneData = z.infer<typeof mediaSceneDataSchema>;

export const RECOMMENDED_VISUAL_MODELS = [
  {id: 'seedream_5_0_flash', label: 'Seedream 5.0 Flash (기본 추천 · 0.5크레딧 초가성비 일관성)', category: 'character'},
  {id: 'seedream_v5_pro', label: 'Seedream 5.0 Pro (고해상도 2K · 인물·복식 일관성 특화)', category: 'character'},
  {id: 'nano_banana_flash', label: 'Nano Banana 2 (조선 수묵채색 삽화 화풍 특화)', category: 'character'},
  {id: 'text2image_soul_v2', label: 'Higgsfield Soul 2.0 (실사형 인물 특화)', category: 'character'},
  {id: 'soul_location', label: 'Soul Location (조선 한옥·마을·자연 배경 특화)', category: 'location'},
  {id: 'gpt_image_2_5', label: 'GPT Image 2.5 (고해상도 디테일·오브제 특화)', category: 'location'},
  {id: 'flux_3_image', label: 'FLUX 3 Image (차세대 고화질 시대극 풍경)', category: 'location'},
  {id: 'seedance_2_0_fast', label: 'Seedance 2.0 Fast (기본 추천 · 경제적인 고속 영상)', category: 'video'},
  {id: 'seedance_2_0_mini', label: 'Seedance 2.0 Mini (초경량 고속 영상)', category: 'video'},
  {id: 'seedance_2_5', label: 'Seedance 2.5 (시네마틱 고화질 영상)', category: 'video'},
  {id: 'kling3_0_turbo', label: 'Kling 3.0 Turbo (빠른 영상 모션 생성)', category: 'video'},
] as const;

export type RecommendedVisualModel = (typeof RECOMMENDED_VISUAL_MODELS)[number]['id'];

export const visualPromptPackageSchema = z.object({
  id: z.string(),
  kind: z.enum([
    'character-reference',
    'location-reference',
    'object-reference',
    'intro-keyframe',
    'intro-video',
    'scene-still',
  ]),
  sourceId: z.string(),
  sceneDataId: z.string().nullable(),
  mediaSegmentId: z.string().nullable(),
  model: z.string().default('seedream_5_0_flash'),
  prompt: z.string().min(1),
  negativePrompt: z.string().min(1),
  referenceKeys: z.array(z.string()),
  aspectRatio: z.enum(['16:9', '1:1']),
  durationSeconds: z.number().positive().nullable(),
  composition: z.string().min(1),
  cameraDistance: z.string().min(1),
  lighting: z.string().min(1),
  motionSafeMarginPercent: z.number().min(0).max(40),
  lockedTraits: z.array(z.string()),
  status: z.enum(['planned', 'queued', 'generating', 'ready', 'failed']),
  assetUrl: z.string().nullable().default(null),
  feedback: z.string().nullable().default(null),
  error: z.string().nullable().default(null),
  jobId: z.string().nullable().default(null),
});
export type VisualPromptPackage = z.infer<typeof visualPromptPackageSchema>;

export const visualBibleEntrySchema = z.object({
  id: z.string(),
  kind: z.enum(['character', 'location', 'object']),
  name: z.string().trim().min(1),
  description: z.string(),
  lockedTraits: z.array(z.string()),
  status: z.enum(['draft', 'ready', 'needs-review']),
});
export type VisualBibleEntry = z.infer<typeof visualBibleEntrySchema>;

export const jobSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  type: z.string(),
  status: z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']),
  inputHash: z.string(),
  attempt: z.number().int().nonnegative(),
  error: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Job = z.infer<typeof jobSchema>;

export const projectSettingsSchema = z.object({
  runtimeMinutes: runtimePresetSchema,
  dwellPresetId: dwellPresetIdSchema,
  era: z.string(),
  styleName: z.string(),
});
export type ProjectSettings = z.infer<typeof projectSettingsSchema>;

export const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  stage: projectStageSchema,
  settings: projectSettingsSchema,
  storyInput: storyInputSchema.nullable(),
  candidates: z.array(storyCandidateSchema),
  selectedCandidateId: z.string().nullable(),
  chapters: z.array(chapterSchema),
  scenes: z.array(sceneSchema),
  storyDevelopment: storyDevelopmentSchema.nullable().default(null),
  cues: z.array(narrationCueSchema),
  visualBible: z.array(visualBibleEntrySchema),
  sceneData: z.array(mediaSceneDataSchema).default([]),
  mediaSegments: z.array(mediaSegmentSchema),
  visualPromptPackages: z.array(visualPromptPackageSchema).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Project = z.infer<typeof projectSchema>;

export const createProjectSchema = z.object({
  name: z.string().trim().min(1),
  runtimeMinutes: runtimePresetSchema,
  dwellPresetId: dwellPresetIdSchema,
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const dwellPresetById = (id: DwellPresetId) => DWELL_PRESETS[id];

export const interviewSuggestionSchema = z.object({
  label: z.string(),
  detail: z.string(),
  recommended: z.boolean().optional(),
});
export type InterviewSuggestion = z.infer<typeof interviewSuggestionSchema>;

export const interviewQuestionSchema = z.object({
  step: z.number(),
  totalSteps: z.number(),
  category: z.string(),
  question: z.string(),
  suggestions: z.array(interviewSuggestionSchema),
});
export type InterviewQuestion = z.infer<typeof interviewQuestionSchema>;

export const interviewStepInputSchema = z.object({
  theme: z.string(),
  topic: z.string().optional().default(''),
  history: z.array(
    z.object({
      step: z.number(),
      question: z.string(),
      answer: z.string(),
    }),
  ).default([]),
});
export type InterviewStepInput = z.infer<typeof interviewStepInputSchema>;

export const interviewResultSchema = z.object({
  title: z.string(),
  summary: z.string(),
  strategy: z.string(),
});
export type InterviewResult = z.infer<typeof interviewResultSchema>;


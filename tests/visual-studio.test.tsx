import {cleanup, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {VisualStudio} from '../src/client/components/VisualStudio';
import type {YadamApi} from '../src/client/api';
import type {Project} from '../src/shared/contracts';

afterEach(cleanup);

const mockProject: Project = {
  id: 'project-visual-test',
  name: '비주얼 테스트 야담',
  stage: 'production',
  settings: {runtimeMinutes: 30, dwellPresetId: 'short', era: '조선 후기', styleName: '성인용 반실사 조선시대 삽화풍'},
  storyInput: {mode: 'reference', title: '테스트', summary: '테스트 이야기입니다.'},
  candidates: [],
  selectedCandidateId: 'cand-1',
  chapters: [{id: 'chap-1', title: '도입', purpose: '후킹', sceneIds: ['scene-1']}],
  scenes: [
    {
      id: 'scene-1',
      chapterId: 'chap-1',
      title: '첫 장면',
      location: '산길',
      objective: '목표',
      change: '변화',
      text: '대본 텍스트',
    },
  ],
  storyDevelopment: null,
  cues: [],
  visualBible: [
    {
      id: 'vb-char-1',
      kind: 'character',
      name: '해원',
      description: '약초꾼',
      lockedTraits: ['눈썹 흉터'],
      status: 'ready',
    },
  ],
  sceneData: [],
  mediaSegments: [
    {
      id: 'seg-1',
      sceneId: 'scene-1',
      sceneDataId: 'sd-1',
      start: 0,
      end: 6,
      type: 'video',
      prompt: '도입 영상',
      semanticBreak: null,
      referenceKeys: [],
      parallaxRecommended: false,
      parallaxEnabled: false,
      motionStages: [],
    },
    {
      id: 'seg-2',
      sceneId: 'scene-1',
      sceneDataId: 'sd-1',
      start: 6,
      end: 36,
      type: 'still',
      prompt: '본편 삽화',
      semanticBreak: null,
      referenceKeys: [],
      parallaxRecommended: true,
      parallaxEnabled: true,
      motionStages: [],
    },
  ],
  visualPromptPackages: [
    {
      id: 'pkg-char-1',
      kind: 'character-reference',
      sourceId: 'vb-char-1',
      sceneDataId: null,
      mediaSegmentId: null,
      model: 'seedream_v5_pro',
      prompt: 'Joseon character portrait',
      negativePrompt: 'modern, low quality',
      referenceKeys: [],
      aspectRatio: '1:1',
      durationSeconds: null,
      composition: 'portrait',
      cameraDistance: 'medium',
      lighting: 'natural',
      motionSafeMarginPercent: 10,
      lockedTraits: ['눈썹 흉터'],
      status: 'planned',
      assetUrl: null,
      feedback: null,
      error: null,
      jobId: null,
    },
    {
      id: 'pkg-still-1',
      kind: 'scene-still',
      sourceId: 'seg-2',
      sceneDataId: 'sd-1',
      mediaSegmentId: 'seg-2',
      model: 'seedream_v5_pro',
      prompt: 'Joseon snowy scene',
      negativePrompt: 'modern, low quality',
      referenceKeys: [],
      aspectRatio: '16:9',
      durationSeconds: null,
      composition: 'cinematic',
      cameraDistance: 'wide',
      lighting: 'snow light',
      motionSafeMarginPercent: 12,
      lockedTraits: [],
      status: 'planned',
      assetUrl: null,
      feedback: null,
      error: null,
      jobId: null,
    },
    {
      id: 'pkg-intro-1',
      kind: 'intro-video',
      sourceId: 'seg-1',
      sceneDataId: 'sd-1',
      mediaSegmentId: 'seg-1',
      model: 'seedance_2_5',
      prompt: 'Joseon intro video',
      negativePrompt: 'modern, low quality',
      referenceKeys: [],
      aspectRatio: '16:9',
      durationSeconds: 6,
      composition: 'cinematic',
      cameraDistance: 'wide',
      lighting: 'snow light',
      motionSafeMarginPercent: 12,
      lockedTraits: [],
      status: 'planned',
      assetUrl: null,
      feedback: null,
      error: null,
      jobId: null,
    },
  ],
  createdAt: '2026-10-31T00:00:00.000Z',
  updatedAt: '2026-10-31T00:00:00.000Z',
};

describe('VisualStudio batch model change', () => {
  it('모델 일괄 변경 드롭다운에서 선택 후 전체 일괄 적용을 실행한다', async () => {
    const user = userEvent.setup();
    const onProject = vi.fn();
    const updateVisualBatchModels = vi.fn().mockImplementation(async (_id, options) => {
      return {
        ...mockProject,
        visualPromptPackages: mockProject.visualPromptPackages.map((pkg) => ({
          ...pkg,
          model: options.model ?? pkg.model,
        })),
      };
    });

    const api = {
      updateVisualBatchModels,
      updateParallax: vi.fn(),
      addVisualBibleEntry: vi.fn(),
      startVisualBatch: vi.fn(),
      getVisualBatchStatus: vi.fn().mockResolvedValue({isBatchRunning: false}),
      generateVisualPrompt: vi.fn(),
      updateVisualPrompt: vi.fn().mockResolvedValue(mockProject),
      getProject: vi.fn().mockResolvedValue(mockProject),
    } as unknown as YadamApi;

    render(<VisualStudio project={mockProject} api={api} onProject={onProject} />);

    // 일괄 변경 툴바 요소 확인
    expect(screen.getByText('모델 일괄 변경')).toBeInTheDocument();
    const select = screen.getByLabelText('일괄 변경할 AI 모델 선택');
    expect(select).toBeInTheDocument();

    // 모델 변경 선택
    await user.selectOptions(select, 'nano_banana_flash');

    // 전체 일괄 변경 버튼 클릭
    const applyAllBtn = screen.getByRole('button', {name: /전체 \(3개\) 일괄 변경/});
    expect(applyAllBtn).not.toBeDisabled();
    await user.click(applyAllBtn);

    expect(updateVisualBatchModels).toHaveBeenCalledWith('project-visual-test', {
      model: 'nano_banana_flash',
      ids: undefined,
    });
    expect(onProject).toHaveBeenCalled();
  });

  it('첫 60초 영상만 생성 버튼을 누르면 인트로 패키지만 배치 생성 요청하고 인트로 탭으로 전환한다', async () => {
    const user = userEvent.setup();
    const onProject = vi.fn();
    const startVisualBatch = vi.fn().mockResolvedValue({queuedCount: 1});

    const api = {
      updateVisualBatchModels: vi.fn(),
      updateParallax: vi.fn(),
      addVisualBibleEntry: vi.fn(),
      startVisualBatch,
      getVisualBatchStatus: vi.fn().mockResolvedValue({isBatchRunning: false}),
      generateVisualPrompt: vi.fn(),
      updateVisualPrompt: vi.fn().mockResolvedValue(mockProject),
      getProject: vi.fn().mockResolvedValue(mockProject),
    } as unknown as YadamApi;

    render(<VisualStudio project={mockProject} api={api} onProject={onProject} />);

    const introBtn = screen.getByRole('button', {name: /첫 60초 영상만 생성/});
    expect(introBtn).toBeInTheDocument();
    await user.click(introBtn);

    expect(startVisualBatch).toHaveBeenCalledWith('project-visual-test', {
      ids: ['pkg-intro-1'],
    });

    // 탭이 첫 60초 영상으로 활성화되었는지 확인
    const introTab = screen.getByRole('button', {name: /🎬 첫 60초 영상/});
    expect(introTab).toHaveClass('is-active');
  });

  it('기준팩만 일괄 생성 버튼을 누르면 기준팩 패키지만 배치 생성 요청하고 기준팩 탭으로 전환한다', async () => {
    const user = userEvent.setup();
    const onProject = vi.fn();
    const startVisualBatch = vi.fn().mockResolvedValue({queuedCount: 1});

    const api = {
      updateVisualBatchModels: vi.fn(),
      updateParallax: vi.fn(),
      addVisualBibleEntry: vi.fn(),
      startVisualBatch,
      getVisualBatchStatus: vi.fn().mockResolvedValue({isBatchRunning: false}),
      generateVisualPrompt: vi.fn(),
      updateVisualPrompt: vi.fn().mockResolvedValue(mockProject),
      getProject: vi.fn().mockResolvedValue(mockProject),
    } as unknown as YadamApi;

    render(<VisualStudio project={mockProject} api={api} onProject={onProject} />);

    const refBtn = screen.getByRole('button', {name: /기준팩만 일괄 생성/});
    expect(refBtn).toBeInTheDocument();
    await user.click(refBtn);

    expect(startVisualBatch).toHaveBeenCalledWith('project-visual-test', {
      ids: ['pkg-char-1'],
    });

    // 탭이 기준팩으로 활성화되었는지 확인
    const refTab = screen.getByRole('button', {name: /기준팩 \(1\)/});
    expect(refTab).toHaveClass('is-active');
  });

  it('추천 프리셋 칩을 클릭하면 카테고리별 모델 매핑이 적용된다', async () => {
    const user = userEvent.setup();
    const onProject = vi.fn();
    const updateVisualBatchModels = vi.fn().mockResolvedValue(mockProject);

    const api = {
      updateVisualBatchModels,
      updateParallax: vi.fn(),
      addVisualBibleEntry: vi.fn(),
      startVisualBatch: vi.fn(),
      getVisualBatchStatus: vi.fn().mockResolvedValue({isBatchRunning: false}),
      generateVisualPrompt: vi.fn(),
      updateVisualPrompt: vi.fn().mockResolvedValue(mockProject),
      getProject: vi.fn().mockResolvedValue(mockProject),
    } as unknown as YadamApi;

    render(<VisualStudio project={mockProject} api={api} onProject={onProject} />);

    // 수묵화풍 프리셋 칩 클릭
    const presetBtn = screen.getByRole('button', {name: /조선 수묵화풍 세트/});
    await user.click(presetBtn);

    expect(updateVisualBatchModels).toHaveBeenCalledWith('project-visual-test', {
      categoryModels: {
        character: 'nano_banana_flash',
        location: 'soul_location',
        object: 'gpt_image_2_5',
        intro: 'nano_banana_flash',
        still: 'nano_banana_flash',
        video: 'seedance_2_0_fast',
      },
    });
  });
});

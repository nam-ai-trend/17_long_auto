import {
  Aperture,
  ArrowClockwise,
  CheckCircle,
  CubeFocus,
  Eye,
  FilmStrip,
  ImageSquare,
  Lightning,
  Plus,
  SlidersHorizontal,
  Sparkle,
  X,
} from '@phosphor-icons/react';
import {useEffect, useState} from 'react';
import {
  RECOMMENDED_VISUAL_MODELS,
  type Project,
  type ProjectStage,
  type VisualBibleEntry,
  type VisualPromptPackage,
} from '../../shared/contracts';
import {VISUAL_LIMITS} from '../../shared/presets';
import type {YadamApi} from '../api';

type Props = {
  project: Project;
  api: YadamApi;
  onProject: (project: Project) => void;
  onNavigate?: (stage: ProjectStage) => void;
};

const kinds = [
  {id: 'character' as const, label: '핵심 인물', limit: VISUAL_LIMITS.characters},
  {id: 'location' as const, label: '핵심 장소', limit: VISUAL_LIMITS.locations},
  {id: 'object' as const, label: '핵심 오브제', limit: VISUAL_LIMITS.objects},
];

const kindLabel = (kind: VisualPromptPackage['kind']) => {
  switch (kind) {
    case 'character-reference':
      return '인물 기준팩';
    case 'location-reference':
      return '장소 기준팩';
    case 'object-reference':
      return '오브제 기준팩';
    case 'intro-keyframe':
      return '도입 키프레임';
    case 'intro-video':
      return '도입 영상 (Seedance)';
    case 'scene-still':
      return '본편 삽화';
    default:
      return kind;
  }
};

export const VisualStudio = ({project, api, onProject, onNavigate}: Props) => {
  const [activeKind, setActiveKind] = useState<VisualBibleEntry['kind']>('character');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [feedbackMap, setFeedbackMap] = useState<Record<string, string>>({});
  const [modelMap, setModelMap] = useState<Record<string, string>>({});
  const [filterTab, setFilterTab] = useState<string>('all');
  const [previewMedia, setPreviewMedia] = useState<{url: string; isVideo: boolean} | null>(null);
  const [batchTargetModel, setBatchTargetModel] = useState<string>('');
  const [isUpdatingBatchModels, setIsUpdatingBatchModels] = useState(false);
  const [batchSuccessMessage, setBatchSuccessMessage] = useState<string | null>(null);

  const intro = project.mediaSegments.filter((segment) => segment.type === 'video');
  const stills = project.mediaSegments.filter((segment) => segment.type === 'still');
  const parallax = stills.filter((segment) => segment.parallaxEnabled);
  const referenceRequests = project.visualPromptPackages.filter((item) => item.kind.endsWith('reference'));
  const introPackages = project.visualPromptPackages.filter(
    (item) => item.kind === 'intro-keyframe' || item.kind === 'intro-video',
  );
  const sceneRequests = project.visualPromptPackages.filter((item) => !item.kind.endsWith('reference'));

  const ungeneratedPackages = project.visualPromptPackages.filter(
    (item) => !(item.status === 'ready' && item.assetUrl),
  );
  const readyPackages = project.visualPromptPackages.filter(
    (item) => item.status === 'ready' && item.assetUrl,
  );
  const ungeneratedReferences = referenceRequests.filter(
    (item) => !(item.status === 'ready' && item.assetUrl),
  );
  const ungeneratedIntro = introPackages.filter(
    (item) => !(item.status === 'ready' && item.assetUrl),
  );

  // 일괄 생성 진행 시 폴링 감지
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isBatchRunning) {
      timer = setInterval(async () => {
        try {
          const [updatedProject, status] = await Promise.all([
            api.getProject(project.id),
            api.getVisualBatchStatus(project.id),
          ]);
          onProject(updatedProject);
          if (!status.isBatchRunning) {
            setIsBatchRunning(false);
          }
        } catch {
          setIsBatchRunning(false);
        }
      }, 3500);
    }
    return () => clearInterval(timer);
  }, [api, isBatchRunning, onProject, project.id]);

  const addEntry = async () => {
    if (!name.trim()) return;
    setError('');
    try {
      onProject(
        await api.addVisualBibleEntry(project.id, {
          id: `${activeKind}-${Date.now()}`,
          kind: activeKind,
          name: name.trim(),
          description: activeKind === 'character' ? '얼굴·의상·표정 기준팩' : '반복 장면의 고정 기준',
          lockedTraits: [],
          status: 'draft',
        }),
      );
      setName('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '기준 항목을 추가하지 못했습니다.');
    }
  };

  const toggleParallax = async (segmentId: string, enabled: boolean) => {
    setError('');
    try {
      onProject(await api.updateParallax(project.id, segmentId, enabled));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '2.5D 설정을 바꾸지 못했습니다.');
    }
  };

  const handleGenerateSingle = async (pkg: VisualPromptPackage) => {
    setActionError('');
    setGeneratingIds((prev) => new Set(prev).add(pkg.id));
    try {
      const updated = await api.generateVisualPrompt(project.id, pkg.id, {
        model: modelMap[pkg.id] || pkg.model,
        feedback: feedbackMap[pkg.id] || pkg.feedback || undefined,
      });
      onProject(updated);
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : '생성에 실패했습니다.');
    } finally {
      setGeneratingIds((prev) => {
        const next = new Set(prev);
        next.delete(pkg.id);
        return next;
      });
    }
  };

  const handleStartBatch = async (scope: 'all' | 'filtered' = 'all') => {
    setActionError('');
    try {
      const targetIds = scope === 'filtered' ? filteredPackages.map((p) => p.id) : undefined;
      const res = await api.startVisualBatch(project.id, {ids: targetIds});
      if (res.queuedCount > 0) {
        setIsBatchRunning(true);
      }
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : '일괄 생성 요청에 실패했습니다.');
    }
  };

  const handleStartBatchTarget = async (ids: string[]) => {
    setActionError('');
    try {
      const res = await api.startVisualBatch(project.id, {ids});
      if (res.queuedCount > 0) {
        setIsBatchRunning(true);
      }
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : '일괄 생성 요청에 실패했습니다.');
    }
  };

  const handleApplyBatchModel = async (scope: 'all' | 'filtered') => {
    if (!batchTargetModel) return;
    setActionError('');
    setIsUpdatingBatchModels(true);
    try {
      const targetIds = scope === 'filtered' ? filteredPackages.map((p) => p.id) : undefined;
      const count = targetIds ? targetIds.length : project.visualPromptPackages.length;
      const updated = await api.updateVisualBatchModels(project.id, {
        model: batchTargetModel,
        ids: targetIds,
      });
      onProject(updated);

      const newModelMap = {...modelMap};
      for (const pkg of updated.visualPromptPackages) {
        if (!targetIds || targetIds.includes(pkg.id)) {
          newModelMap[pkg.id] = pkg.model;
        }
      }
      setModelMap(newModelMap);

      const modelInfo = RECOMMENDED_VISUAL_MODELS.find((m) => m.id === batchTargetModel);
      const modelName = modelInfo ? modelInfo.label : batchTargetModel;
      setBatchSuccessMessage(`✓ ${count}개 항목의 AI 모델이 '${modelName}'(으)로 일괄 변경되었습니다.`);
      setTimeout(() => {
        setBatchSuccessMessage(null);
      }, 4000);
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : '모델 일괄 변경에 실패했습니다.');
    } finally {
      setIsUpdatingBatchModels(false);
    }
  };

  const handleApplyPreset = async (preset: {
    name: string;
    character: string;
    location: string;
    object: string;
    intro: string;
    still: string;
    video: string;
  }) => {
    setActionError('');
    setIsUpdatingBatchModels(true);
    try {
      const updated = await api.updateVisualBatchModels(project.id, {
        categoryModels: {
          character: preset.character,
          location: preset.location,
          object: preset.object,
          intro: preset.intro,
          still: preset.still,
          video: preset.video,
        },
      });
      onProject(updated);

      const newModelMap: Record<string, string> = {};
      for (const pkg of updated.visualPromptPackages) {
        newModelMap[pkg.id] = pkg.model;
      }
      setModelMap(newModelMap);

      setBatchSuccessMessage(`✓ '${preset.name}' 추천 세트로 모든 항목의 모델이 재구성되었습니다.`);
      setTimeout(() => {
        setBatchSuccessMessage(null);
      }, 4000);
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : '프리셋 적용에 실패했습니다.');
    } finally {
      setIsUpdatingBatchModels(false);
    }
  };

  // 필터링된 패키지 목록
  const filteredPackages = project.visualPromptPackages.filter((pkg) => {
    if (filterTab === 'all') return true;
    if (filterTab === 'reference') return pkg.kind.endsWith('reference');
    if (filterTab === 'intro') return pkg.kind === 'intro-keyframe' || pkg.kind === 'intro-video';
    // 씬 필터 (예: 'scene-0', 'scene-1')
    if (filterTab.startsWith('scene-')) {
      if (pkg.kind === 'intro-keyframe' || pkg.kind === 'intro-video') return false;
      const sceneIndex = Number(filterTab.replace('scene-', ''));
      const scene = project.scenes[sceneIndex];
      if (!scene) return true;
      return (
        pkg.sceneDataId?.includes(scene.id) ||
        pkg.mediaSegmentId?.includes(scene.id) ||
        pkg.prompt.includes(scene.title)
      );
    }
    return true;
  });

  return (
    <section className="visual-studio">
      <header className="workspace-heading studio-title">
        <span className="eyebrow">STEP 03 · PRODUCTION</span>
        <h1>화면 설계 및 AI 생성</h1>
        <p>인물·배경 기준팩을 고정하고, 씬별 삽화와 첫 60초 도입 영상을 Higgsfield AI로 생성합니다.</p>
      </header>

      <div className="production-metrics">
        <article><FilmStrip size={22} weight="light" /><span><strong>{intro.length}</strong>개</span><small>도입 영상</small></article>
        <article><ImageSquare size={22} weight="light" /><span><strong>{stills.length}</strong>장</span><small>본편 삽화</small></article>
        <article><CubeFocus size={22} weight="light" /><span><strong>{parallax.length}</strong>장</span><small>2.5D 추천</small></article>
        <article><Aperture size={22} weight="light" /><span><strong>{readyPackages.length}/{project.visualPromptPackages.length}</strong>개</span><small>생성 완료</small></article>
      </div>

      <div className="studio-columns production-columns">
        <section className="bezel-shell bible-panel">
          <div className="bezel-core">
            <header className="section-heading compact"><div><span className="eyebrow">VISUAL BIBLE</span><h2>반복 기준</h2></div></header>
            <div className="tab-row" role="tablist" aria-label="비주얼 바이블 분류">
              {kinds.map((kind) => {
                const count = project.visualBible.filter((entry) => entry.kind === kind.id).length;
                return <button key={kind.id} type="button" className={activeKind === kind.id ? 'is-active' : ''} onClick={() => setActiveKind(kind.id)}>{kind.label}<small>{count}/{kind.limit}</small></button>;
              })}
            </div>
            <div className="bible-list">
              {project.visualBible.filter((entry) => entry.kind === activeKind).map((entry) => (
                <article key={entry.id}><span className="asset-avatar">{entry.name.slice(0, 1)}</span><div><strong>{entry.name}</strong><small>{entry.description}</small></div><span className="status-dot">초안</span></article>
              ))}
              {project.visualBible.filter((entry) => entry.kind === activeKind).length === 0 && <p className="inline-empty">아직 기준팩이 없습니다. 대본에서 자동 추출하거나 직접 추가하세요.</p>}
            </div>
            <div className="inline-add">
              <input aria-label="기준 항목 이름" value={name} onChange={(event) => setName(event.target.value)} placeholder="이름 입력" />
              <button type="button" onClick={addEntry}><Plus size={16} weight="light" />추가</button>
            </div>
            {error && <p className="error-banner" role="alert">{error}</p>}
          </div>
        </section>

        <section className="bezel-shell timeline-panel">
          <div className="bezel-core">
            <header className="section-heading compact"><div><span className="eyebrow">MEDIA MAP</span><h2>시각 타임라인</h2></div><span className="count-pill">{project.mediaSegments.length}</span></header>
            <div className="media-timeline">
              {project.mediaSegments.slice(0, 16).map((segment) => (
                <article key={segment.id} className={segment.type === 'video' ? 'is-video' : ''}>
                  <span className="media-kind">{segment.type === 'video' ? '영상' : '삽화'}</span>
                  <div><strong>{segment.start.toFixed(0)}–{segment.end.toFixed(0)}초</strong><small>{segment.semanticBreak ?? `${segment.motionStages.length || 1}단계 화면 변화`}</small></div>
                  {segment.type === 'still' && (
                    <button
                      className={`parallax-pill ${segment.parallaxEnabled ? 'is-on' : ''}`}
                      type="button"
                      aria-label={`${segment.id} 2.5D ${segment.parallaxEnabled ? '끄기' : '켜기'}`}
                      onClick={() => toggleParallax(segment.id, !segment.parallaxEnabled)}
                    >
                      {segment.parallaxEnabled ? '2.5D 켬' : '2D'}
                    </button>
                  )}
                </article>
              ))}
              {project.mediaSegments.length > 16 && <p className="timeline-more">외 {project.mediaSegments.length - 16}개 구간은 렌더 타임라인에 이어집니다.</p>}
            </div>
          </div>
        </section>
      </div>

      <section className="bezel-shell prompt-panel">
        <div className="bezel-core">
          <header className="section-heading compact prompt-heading">
            <div>
              <span className="eyebrow">GENERATION QUEUE & BATCH</span>
              <h2>AI 생성 및 피드백 수정</h2>
              <p className="prompt-order-note">
                씬 1, 씬 2를 각각 생성하여 품질을 확인하고, 마음에 안 들 경우 피드백을 넣어 재생성하세요.
                이미 생성된 것은 보존하고 미생성 항목만 한 번에 생성할 수도 있습니다.
              </p>
            </div>
            <div className="batch-action-group">
              <span className="count-pill">
                완료 {readyPackages.length} · 미생성 {ungeneratedPackages.length}
              </span>

              {/* 1. 기준팩만 일괄 생성 */}
              <button
                type="button"
                className={`batch-generate-btn is-reference-batch ${isBatchRunning ? 'is-running' : ''}`}
                onClick={() => {
                  setFilterTab('reference');
                  handleStartBatchTarget(referenceRequests.map((p) => p.id));
                }}
                disabled={isBatchRunning || ungeneratedReferences.length === 0}
                title="인물·장소·오브제 기준팩만 먼저 생성합니다"
              >
                <CheckCircle size={15} />
                기준팩만 일괄 생성 ({ungeneratedReferences.length}개)
              </button>

              {/* 2. 첫 60초 영상만 생성 */}
              <button
                type="button"
                className={`batch-generate-btn is-intro-batch ${isBatchRunning ? 'is-running' : ''}`}
                onClick={() => {
                  setFilterTab('intro');
                  handleStartBatchTarget(introPackages.map((p) => p.id));
                }}
                disabled={isBatchRunning || ungeneratedIntro.length === 0}
                title="첫 60초 도입 키프레임과 Seedance 영상을 생성합니다"
              >
                <FilmStrip size={15} />
                첫 60초 영상만 생성 ({ungeneratedIntro.length}개)
              </button>

              {/* 3. 씬 탭에 있을 때의 씬 전용 생성 버튼 */}
              {filterTab.startsWith('scene-') && (
                <button
                  type="button"
                  className={`batch-generate-btn is-filter-batch ${isBatchRunning ? 'is-running' : ''}`}
                  onClick={() => handleStartBatch('filtered')}
                  disabled={
                    isBatchRunning ||
                    filteredPackages.filter((item) => !(item.status === 'ready' && item.assetUrl))
                      .length === 0
                  }
                >
                  <Lightning size={15} weight="fill" />
                  현재 씬만 생성 (
                  {
                    filteredPackages.filter((item) => !(item.status === 'ready' && item.assetUrl))
                      .length
                  }
                  개)
                </button>
              )}

              {/* 4. 미생성 전체 일괄 생성 */}
              <button
                type="button"
                className={`batch-generate-btn is-all-batch ${isBatchRunning ? 'is-running' : ''}`}
                onClick={() => handleStartBatch('all')}
                disabled={isBatchRunning || ungeneratedPackages.length === 0}
              >
                {isBatchRunning ? (
                  <>
                    <ArrowClockwise size={16} className="spin-icon" />
                    순차 생성 중...
                  </>
                ) : ungeneratedPackages.length === 0 ? (
                  <>
                    <CheckCircle size={16} />
                    모든 이미지 생성 완료
                  </>
                ) : (
                  <>
                    <Lightning size={16} weight="fill" />
                    미생성 전체 일괄 생성 ({ungeneratedPackages.length}개)
                  </>
                )}
              </button>
            </div>
          </header>

          {/* 씬 필터 탭 */}
          <div className="scene-filter-row" role="tablist" aria-label="씬 및 기준팩 필터">
            <button
              type="button"
              className={filterTab === 'all' ? 'is-active' : ''}
              onClick={() => setFilterTab('all')}
            >
              전체 보기 ({project.visualPromptPackages.length})
            </button>
            <button
              type="button"
              className={filterTab === 'reference' ? 'is-active' : ''}
              onClick={() => setFilterTab('reference')}
            >
              기준팩 ({referenceRequests.length})
            </button>
            <button
              type="button"
              className={filterTab === 'intro' ? 'is-active' : ''}
              onClick={() => setFilterTab('intro')}
            >
              🎬 첫 60초 영상 ({introPackages.length})
            </button>
            {project.scenes.slice(0, 10).map((scene, idx) => (
              <button
                key={scene.id}
                type="button"
                className={filterTab === `scene-${idx}` ? 'is-active' : ''}
                onClick={() => setFilterTab(`scene-${idx}`)}
              >
                씬 {idx + 1}
              </button>
            ))}
          </div>

          {actionError && <p className="error-banner" role="alert">{actionError}</p>}

          {/* 모델 일괄 변경 툴바 */}
          <div className="batch-model-toolbar">
            <div className="batch-model-main">
              <div className="batch-model-title-wrap">
                <SlidersHorizontal size={16} weight="bold" className="batch-model-icon" />
                <span className="batch-model-title">모델 일괄 변경</span>
              </div>
              <div className="batch-model-control">
                <select
                  aria-label="일괄 변경할 AI 모델 선택"
                  className="batch-model-select"
                  value={batchTargetModel}
                  disabled={isUpdatingBatchModels}
                  onChange={(e) => setBatchTargetModel(e.target.value)}
                >
                  <option value="">변경할 AI 모델을 선택하세요...</option>
                  <optgroup label="👤 캐릭터 일관성 추천">
                    {RECOMMENDED_VISUAL_MODELS.filter((m) => m.category === 'character').map((m) => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </optgroup>
                  <optgroup label="🏞️ 배경·공간 추천">
                    {RECOMMENDED_VISUAL_MODELS.filter((m) => m.category === 'location').map((m) => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </optgroup>
                  <optgroup label="🎥 영상·모션 추천">
                    {RECOMMENDED_VISUAL_MODELS.filter((m) => m.category === 'video').map((m) => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </optgroup>
                </select>

                <div className="batch-model-buttons">
                  {filterTab !== 'all' && (
                    <button
                      type="button"
                      className="batch-model-btn is-filter"
                      disabled={!batchTargetModel || isUpdatingBatchModels}
                      onClick={() => handleApplyBatchModel('filtered')}
                    >
                      <Sparkle size={13} weight="fill" />
                      현재 탭 ({filteredPackages.length}개) 변경
                    </button>
                  )}
                  <button
                    type="button"
                    className="batch-model-btn is-primary"
                    disabled={!batchTargetModel || isUpdatingBatchModels}
                    onClick={() => handleApplyBatchModel('all')}
                  >
                    <Sparkle size={13} weight="fill" />
                    전체 ({project.visualPromptPackages.length}개) 일괄 변경
                  </button>
                </div>
              </div>
            </div>

            {/* 빠른 추천 세트 프리셋 */}
            <div className="batch-model-presets">
              <span className="preset-label">추천 세트:</span>
              <button
                type="button"
                className="preset-chip"
                disabled={isUpdatingBatchModels}
                onClick={() =>
                  handleApplyPreset({
                    name: '조선 수묵화풍',
                    character: 'nano_banana_flash',
                    location: 'soul_location',
                    object: 'gpt_image_2_5',
                    intro: 'nano_banana_flash',
                    still: 'nano_banana_flash',
                    video: 'seedance_2_0_fast',
                  })
                }
              >
                🎨 조선 수묵화풍 세트
              </button>
              <button
                type="button"
                className="preset-chip"
                disabled={isUpdatingBatchModels}
                onClick={() =>
                  handleApplyPreset({
                    name: '반실사 극화 Flash',
                    character: 'seedream_5_0_flash',
                    location: 'seedream_5_0_flash',
                    object: 'seedream_5_0_flash',
                    intro: 'seedream_5_0_flash',
                    still: 'seedream_5_0_flash',
                    video: 'seedance_2_0_fast',
                  })
                }
              >
                📷 반실사 극화 Flash (0.5c 기본)
              </button>
              <button
                type="button"
                className="preset-chip"
                disabled={isUpdatingBatchModels}
                onClick={() =>
                  handleApplyPreset({
                    name: '반실사 극화 Pro',
                    character: 'seedream_v5_pro',
                    location: 'seedream_v5_pro',
                    object: 'seedream_v5_pro',
                    intro: 'seedream_v5_pro',
                    still: 'seedream_v5_pro',
                    video: 'seedance_2_0_fast',
                  })
                }
              >
                💎 반실사 극화 Pro (2.5c 고화질)
              </button>
              <button
                type="button"
                className="preset-chip"
                disabled={isUpdatingBatchModels}
                onClick={() =>
                  handleApplyPreset({
                    name: '고화질 디테일',
                    character: 'seedream_5_0_flash',
                    location: 'flux_3_image',
                    object: 'gpt_image_2_5',
                    intro: 'seedream_5_0_flash',
                    still: 'gpt_image_2_5',
                    video: 'seedance_2_0_fast',
                  })
                }
              >
                ⚡ 고화질 디테일 세트
              </button>
            </div>

            {batchSuccessMessage && (
              <div className="batch-success-banner" role="status">
                <CheckCircle size={15} weight="fill" />
                {batchSuccessMessage}
              </div>
            )}
          </div>

          <div className="prompt-cards-container">
            {filteredPackages.map((item, index) => {
              const isItemGenerating = generatingIds.has(item.id) || item.status === 'generating';
              const isReady = item.status === 'ready' && !!item.assetUrl;
              const currentModel = modelMap[item.id] || item.model || 'seedream_5_0_flash';
              const feedbackValue = feedbackMap[item.id] !== undefined ? feedbackMap[item.id] : (item.feedback ?? '');

              return (
                <article key={item.id} className={`visual-card bezel-shell ${isReady ? 'is-ready' : ''}`}>
                  <div className="visual-card-header">
                    <span className="card-number-badge">#{index + 1}</span>
                    <strong className="card-kind-badge">{kindLabel(item.kind)}</strong>
                    <span className={`status-pill ${item.status}`}>
                      {isItemGenerating ? '생성 중...' : isReady ? '완료' : item.status === 'failed' ? '실패' : '대기'}
                    </span>
                  </div>

                  {/* 미디어 썸네일 (완료된 경우) */}
                  {isReady && item.assetUrl && (
                    <div
                      className="visual-thumbnail-wrapper"
                      onClick={() =>
                        setPreviewMedia({url: item.assetUrl!, isVideo: item.kind === 'intro-video'})
                      }
                    >
                      {item.kind === 'intro-video' ? (
                        <video
                          src={item.assetUrl}
                          className="visual-thumb-media"
                          muted
                          autoPlay
                          loop
                          playsInline
                          preload="metadata"
                        />
                      ) : (
                        <img src={item.assetUrl} alt={item.id} className="visual-thumb-media" />
                      )}
                      <span className="thumb-hover-overlay">
                        <Eye size={18} />
                        확대 보기
                      </span>
                    </div>
                  )}

                  <div className="visual-card-body">
                    <p className="card-prompt-snippet" title={item.prompt}>
                      {item.prompt.slice(0, 120)}...
                    </p>

                    {/* 모델 선택 드롭다운 */}
                    <div className="card-field-row">
                      <label htmlFor={`model-${item.id}`}>AI 모델</label>
                      <select
                        id={`model-${item.id}`}
                        value={currentModel}
                        disabled={isItemGenerating}
                        onChange={(e) => {
                          const newModel = e.target.value;
                          setModelMap((prev) => ({...prev, [item.id]: newModel}));
                          api.updateVisualPrompt(project.id, item.id, {model: newModel}).catch(() => {});
                        }}
                      >
                        <optgroup label="👤 캐릭터 일관성 추천">
                          {RECOMMENDED_VISUAL_MODELS.filter((m) => m.category === 'character').map((m) => (
                            <option key={m.id} value={m.id}>{m.label}</option>
                          ))}
                        </optgroup>
                        <optgroup label="🏞️ 배경·공간 추천">
                          {RECOMMENDED_VISUAL_MODELS.filter((m) => m.category === 'location').map((m) => (
                            <option key={m.id} value={m.id}>{m.label}</option>
                          ))}
                        </optgroup>
                        <optgroup label="🎥 영상·모션 추천">
                          {RECOMMENDED_VISUAL_MODELS.filter((m) => m.category === 'video').map((m) => (
                            <option key={m.id} value={m.id}>{m.label}</option>
                          ))}
                        </optgroup>
                      </select>
                    </div>

                    {/* 수정 피드백 입력창 */}
                    <div className="card-field-row">
                      <label htmlFor={`feedback-${item.id}`}>수정 피드백</label>
                      <input
                        id={`feedback-${item.id}`}
                        placeholder="예: 인물 표정을 더 비장하게, 배경에 눈보라 추가"
                        value={feedbackValue}
                        disabled={isItemGenerating}
                        onChange={(e) => setFeedbackMap({...feedbackMap, [item.id]: e.target.value})}
                      />
                    </div>

                    {item.error && <p className="card-error-text">⚠️ {item.error}</p>}
                  </div>

                  <div className="visual-card-footer">
                    <button
                      type="button"
                      className={`generate-card-btn ${isReady ? 'is-regenerate' : 'is-primary'}`}
                      disabled={isItemGenerating}
                      onClick={() => handleGenerateSingle(item)}
                    >
                      {isItemGenerating ? (
                        <>
                          <ArrowClockwise size={15} className="spin-icon" />
                          생성 중...
                        </>
                      ) : isReady ? (
                        <>
                          <ArrowClockwise size={15} />
                          피드백 반영 재생성
                        </>
                      ) : (
                        <>
                          <Sparkle size={15} weight="fill" />
                          생성하기
                        </>
                      )}
                    </button>
                  </div>
                </article>
              );
            })}

            {filteredPackages.length === 0 && (
              <p className="inline-empty prompt-empty-note">
                해당 씬에 해당하는 생성 요청 패키지가 없습니다.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* 미디어 확대 모달 */}
      {previewMedia && (
        <div className="media-modal-backdrop" onClick={() => setPreviewMedia(null)}>
          <div className="media-modal-content" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="modal-close-btn"
              onClick={() => setPreviewMedia(null)}
              aria-label="닫기"
            >
              <X size={20} />
            </button>
            {previewMedia.isVideo ? (
              <video src={previewMedia.url} controls autoPlay loop className="modal-media-elem" />
            ) : (
              <img src={previewMedia.url} alt="확대 미리보기" className="modal-media-elem" />
            )}
          </div>
        </div>
      )}
    </section>
  );
};

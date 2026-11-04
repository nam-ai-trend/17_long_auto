import {
  ArrowClockwise,
  CheckCircle,
  Circle,
  DownloadSimple,
  FilmStrip,
  PlayCircle,
  Plug,
  Spinner,
  VideoCamera,
  WarningCircle,
} from '@phosphor-icons/react';
import {lazy, Suspense, useEffect, useState} from 'react';
import type {Job, Project} from '../../shared/contracts';
import type {ProviderMap, RenderState, YadamApi} from '../api';

const PreviewPlayer = lazy(() =>
  import('./PreviewPlayer').then((module) => ({default: module.PreviewPlayer})),
);

type Props = {project: Project; api: YadamApi};

const StatusIcon = ({status}: {status: string}) =>
  status === 'ready' ? (
    <CheckCircle size={18} weight="fill" />
  ) : status === 'error' ? (
    <WarningCircle size={18} weight="fill" />
  ) : (
    <Circle size={18} weight="regular" />
  );

export const RenderStudio = ({project, api}: Props) => {
  const [providers, setProviders] = useState<ProviderMap | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [previewState, setPreviewState] = useState<RenderState | null>(null);
  const [fullState, setFullState] = useState<RenderState | null>(null);
  const [activeRenderingMode, setActiveRenderingMode] = useState<'preview-60s' | 'full' | null>(null);
  const [activeViewMode, setActiveViewMode] = useState<'preview-60s' | 'full'>('full');
  const [isStartingRender, setIsStartingRender] = useState(false);

  // 초기 상태 로드 (60초와 전체 렌더 상태 모두 로드)
  useEffect(() => {
    void Promise.all([
      api.providerStatus(),
      api.listJobs(project.id),
      api.getRenderStatus(project.id, 'preview-60s'),
      api.getRenderStatus(project.id, 'full'),
    ]).then(([nextProviders, nextJobs, pState, fState]) => {
      setProviders(nextProviders);
      setJobs(nextJobs);
      setPreviewState(pState);
      setFullState(fState);
      if (fState?.isRendering) setActiveRenderingMode('full');
      else if (pState?.isRendering) setActiveRenderingMode('preview-60s');

      if (fState?.status === 'completed') {
        setActiveViewMode('full');
      } else if (pState?.status === 'completed') {
        setActiveViewMode('preview-60s');
      }
    });
  }, [api, project.id]);

  // 렌더링 진행 중일 때 상태 폴링
  useEffect(() => {
    if (!activeRenderingMode) return;

    const timer = setInterval(() => {
      void api.getRenderStatus(project.id, activeRenderingMode).then((status) => {
        if (activeRenderingMode === 'full') {
          setFullState(status);
        } else {
          setPreviewState(status);
        }
        if (!status.isRendering) {
          setActiveRenderingMode(null);
          setActiveViewMode(status.mode);
        }
      });
    }, 1500);

    return () => clearInterval(timer);
  }, [api, project.id, activeRenderingMode]);

  const handleStartRender = async (mode: 'preview-60s' | 'full') => {
    try {
      setIsStartingRender(true);
      setActiveRenderingMode(mode);
      setActiveViewMode(mode);
      const next = await api.startRender(project.id, {mode});
      if (mode === 'full') setFullState(next);
      else setPreviewState(next);
    } catch (err) {
      alert(err instanceof Error ? err.message : '렌더링 시작 실패');
      setActiveRenderingMode(null);
    } finally {
      setIsStartingRender(false);
    }
  };

  const retry = async (job: Job) => {
    const next = await api.retryJob(project.id, job.id);
    setJobs((items) => items.map((item) => (item.id === next.id ? next : item)));
  };

  const currentRenderState = activeRenderingMode
    ? (activeRenderingMode === 'full' ? fullState : previewState)
    : (activeViewMode === 'full' ? fullState : previewState);

  const hasFullVideo = fullState?.status === 'completed' && fullState.videoUrl;
  const hasPreviewVideo = previewState?.status === 'completed' && previewState.videoUrl;

  return (
    <section className="render-section">
      <header className="section-heading">
        <div>
          <span className="eyebrow">RENDER READINESS</span>
          <h2>영상 렌더링 및 완성</h2>
        </div>
        <p style={{whiteSpace: 'nowrap', maxWidth: 'none'}}>타임라인에 연결된 영상과 삽화를 Remotion 엔진으로 최종 비디오 파일로 출력합니다.</p>
      </header>

      {/* 1. 타임라인 라이브 프리뷰 */}
      <div className="preview-shell bezel-shell">
        <div className="bezel-core">
          <div className="preview-heading">
            <div>
              <span className="eyebrow">LIVE PREVIEW</span>
              <strong>영상 타임라인 미리보기</strong>
            </div>
            <small>1920×1080 · 30fps</small>
          </div>
          <Suspense fallback={<div className="preview-loading">미리보기를 준비하는 중…</div>}>
            <PreviewPlayer project={project} />
          </Suspense>
        </div>
      </div>

      {/* 2. 최종 렌더링 제어 패널 */}
      <div className="render-control-card bezel-shell">
        <div className="bezel-core">
          <div className="render-control-header">
            <div>
              <span className="eyebrow">FINAL RENDER & EXPORT</span>
              <strong>MP4 영상 렌더링 및 내보내기</strong>
              <p>
                생성 완료된 첫 60초 도입 비디오 10개와 삽화, 자막을 결합하여 고화질 MP4 파일로 변환합니다.
              </p>
            </div>
            <div className="render-action-group">
              <button
                type="button"
                className="secondary-button render-button"
                disabled={isStartingRender || !!activeRenderingMode}
                onClick={() => handleStartRender('preview-60s')}
              >
                {activeRenderingMode === 'preview-60s' ? (
                  <>
                    <Spinner size={16} className="spin" />
                    <span>60초 영상 렌더링 중 ({previewState?.progressPercent ?? 0}%)</span>
                  </>
                ) : (
                  <>
                    <FilmStrip size={17} weight="bold" />
                    <span>🎬 첫 60초 렌더링 (빠름)</span>
                  </>
                )}
              </button>
              <button
                type="button"
                className="primary-button render-button-secondary"
                disabled={isStartingRender || !!activeRenderingMode}
                onClick={() => handleStartRender('full')}
              >
                {activeRenderingMode === 'full' ? (
                  <>
                    <Spinner size={16} className="spin" />
                    <span>전체 렌더링 중 ({fullState?.progressPercent ?? 0}%)</span>
                  </>
                ) : (
                  <>
                    <VideoCamera size={17} weight="bold" />
                    <span>🎞️ 전체 영상 렌더링 (Full HD)</span>
                  </>
                )}
              </button>

              {/* 렌더 완료 시 상단 빠른 다운로드 버튼 */}
              {hasFullVideo && (
                <a
                  href={`/api/projects/${project.id}/render-video?mode=full&download=true`}
                  className="primary-button"
                  style={{
                    backgroundColor: '#1b6b3e',
                    color: '#fff',
                    textDecoration: 'none',
                    boxShadow: '0 4px 14px rgba(27, 107, 62, 0.35)',
                  }}
                  title="렌더링 완료된 전체 영상 MP4 다운로드"
                >
                  <DownloadSimple size={18} weight="bold" />
                  <span>📥 전체 완성본 MP4 다운로드 ({(fullState!.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB)</span>
                </a>
              )}
              {hasPreviewVideo && !hasFullVideo && (
                <a
                  href={`/api/projects/${project.id}/render-video?mode=preview-60s&download=true`}
                  className="secondary-button"
                  style={{textDecoration: 'none'}}
                  title="첫 60초 도입본 MP4 다운로드"
                >
                  <DownloadSimple size={18} weight="bold" />
                  <span>🎬 60초 도입본 MP4 다운로드 ({(previewState!.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB)</span>
                </a>
              )}
            </div>
          </div>

          {/* 렌더링 진행률 표시 바 */}
          {activeRenderingMode && currentRenderState?.isRendering && (
            <div className="render-progress-wrap">
              <div className="render-progress-info">
                <span>
                  <Spinner size={14} className="spin" /> Remotion {activeRenderingMode === 'full' ? '전체 영상' : '60초 도입 영상'} 인코딩 렌더링 중…
                </span>
                <strong>{currentRenderState.progressPercent}%</strong>
              </div>
              <div className="render-progress-bar">
                <div
                  className="render-progress-fill"
                  style={{width: `${Math.max(4, currentRenderState.progressPercent)}%`}}
                />
              </div>
            </div>
          )}

          {/* 렌더링 실패 알림 */}
          {currentRenderState?.status === 'failed' && (
            <div className="render-error-box">
              <WarningCircle size={18} weight="fill" />
              <div>
                <strong>렌더링 오류가 발생했습니다.</strong>
                <p>{currentRenderState.error}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3. 렌더링 완료된 비디오 전용 재생기 & 다운로드 영역 */}
      {(hasFullVideo || hasPreviewVideo) && (
        <div className="rendered-output-card bezel-shell">
          <div className="bezel-core">
            <div className="rendered-output-header">
              <div>
                <span className="eyebrow" style={{color: 'var(--green)'}}>
                  RENDER COMPLETE
                </span>
                <div style={{display: 'flex', alignItems: 'center', gap: 12, marginTop: 4}}>
                  <strong>🎉 렌더링 완료된 영상</strong>
                  <div className="segmented" style={{fontSize: 13}}>
                    {hasFullVideo && (
                      <button
                        type="button"
                        className={activeViewMode === 'full' ? 'is-active' : ''}
                        onClick={() => setActiveViewMode('full')}
                        style={{
                          padding: '4px 12px',
                          borderRadius: 8,
                          border: 'none',
                          cursor: 'pointer',
                          fontWeight: activeViewMode === 'full' ? 700 : 500,
                          backgroundColor: activeViewMode === 'full' ? 'var(--ink)' : 'transparent',
                          color: activeViewMode === 'full' ? '#fff' : 'inherit',
                        }}
                      >
                        전체 완성본 ({(fullState!.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB)
                      </button>
                    )}
                    {hasPreviewVideo && (
                      <button
                        type="button"
                        className={activeViewMode === 'preview-60s' ? 'is-active' : ''}
                        onClick={() => setActiveViewMode('preview-60s')}
                        style={{
                          padding: '4px 12px',
                          borderRadius: 8,
                          border: 'none',
                          cursor: 'pointer',
                          fontWeight: activeViewMode === 'preview-60s' ? 700 : 500,
                          backgroundColor: activeViewMode === 'preview-60s' ? 'var(--ink)' : 'transparent',
                          color: activeViewMode === 'preview-60s' ? '#fff' : 'inherit',
                        }}
                      >
                        60초 도입본 ({(previewState!.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB)
                      </button>
                    )}
                  </div>
                </div>
                <small style={{marginTop: 6, display: 'block'}}>
                  선택된 영상: {activeViewMode === 'full' ? '전체 롱폼 완성본' : '첫 60초 도입본'} · 1920×1080 Full HD · 30fps
                </small>
              </div>

              {/* 다운로드 버튼 */}
              <a
                href={`/api/projects/${project.id}/render-video?mode=${activeViewMode}&download=true`}
                download={`${(project.name || 'yadam').replace(/[\\/:*?"<>|]/g, '_')}_${activeViewMode === 'full' ? '전체완성본' : '도입60초'}.mp4`}
                className="primary-button download-button"
                style={{
                  backgroundColor: '#1b6b3e',
                  color: '#fff',
                  textDecoration: 'none',
                  boxShadow: '0 4px 14px rgba(27, 107, 62, 0.35)',
                }}
              >
                <DownloadSimple size={18} weight="bold" />
                <span>MP4 파일 다운로드 ({activeViewMode === 'full' ? '전체본' : '60초본'})</span>
              </a>
            </div>

            <div className="rendered-video-frame">
              <video
                key={activeViewMode}
                controls
                src={`/api/projects/${project.id}/render-video?mode=${activeViewMode}`}
                style={{width: '100%', borderRadius: 12, backgroundColor: '#000'}}
                preload="metadata"
              />
            </div>
          </div>
        </div>
      )}

      {/* 4. 서비스 연결 상태 */}
      <div className="provider-grid">
        {providers &&
          Object.entries(providers).map(([id, provider]) => (
            <article className="bezel-shell" key={id}>
              <div className="bezel-core">
                <StatusIcon status={provider.status} />
                <div>
                  <strong>{provider.name}</strong>
                  <small>{provider.detail}</small>
                </div>
                <span className={`provider-status ${provider.status}`}>
                  {provider.status === 'ready' ? '준비됨' : '연결 전'}
                </span>
              </div>
            </article>
          ))}
      </div>

      {/* 5. 로컬 작업 큐 */}
      <div className="job-strip bezel-shell">
        <div className="bezel-core">
          <span className="job-icon">
            <Plug size={21} weight="light" />
          </span>
          <div>
            <strong>로컬 작업 큐</strong>
            <small>
              {jobs.length === 0
                ? '아직 실행된 작업이 없습니다.'
                : `${jobs.length}개 작업의 상태를 저장했습니다.`}
            </small>
          </div>
          <div className="job-actions">
            {jobs
              .filter((job) => job.status === 'failed')
              .map((job) => (
                <button type="button" key={job.id} onClick={() => retry(job)}>
                  <ArrowClockwise size={15} />
                  재시도
                </button>
              ))}
          </div>
        </div>
      </div>
    </section>
  );
};

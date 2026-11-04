import {ArrowRight, CircleNotch, MagicWand, Sparkle} from '@phosphor-icons/react';
import {useEffect, useRef, useState} from 'react';
import type {
  DwellPresetId,
  Project,
  RuntimePreset,
  StartMode,
  StoryCandidate,
  StoryInput,
} from '../../shared/contracts';
import {DWELL_PRESETS, RUNTIME_PRESETS} from '../../shared/presets';
import type {YadamApi} from '../api';
import {StrategyInterview} from './StrategyInterview';

type Props = {
  api: YadamApi;
  initialProject?: Project | null;
  onProject: (project: Project) => void;
  onBack: () => void;
};

type DraftingProgress = {
  phase: 'planning' | 'drafting' | 'reviewing' | 'complete';
  completedScenes: number;
  totalScenes: number;
  latestSceneTitle?: string;
  percent: number;
  statusText: string;
};

export const StoryStart = ({api, initialProject, onProject, onBack}: Props) => {
  const [mode, setMode] = useState<StartMode>(initialProject?.storyInput?.mode ?? 'reference');
  const [title, setTitle] = useState(initialProject?.storyInput?.title ?? '');
  const [summary, setSummary] = useState(initialProject?.storyInput?.summary ?? '');
  const [runtime, setRuntime] = useState<RuntimePreset>(initialProject?.settings.runtimeMinutes ?? 40);
  const [dwell, setDwell] = useState<DwellPresetId>(initialProject?.settings.dwellPresetId ?? 'balanced');
  const [strategy, setStrategy] = useState('');
  const [project, setProject] = useState<Project | null>(initialProject ?? null);
  const [candidates, setCandidates] = useState<StoryCandidate[]>(initialProject?.candidates ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [shouldRevealCandidates, setShouldRevealCandidates] = useState(false);
  const [draftingCandidate, setDraftingCandidate] = useState<StoryCandidate | null>(null);
  const [draftingProgress, setDraftingProgress] = useState<DraftingProgress | null>(null);
  const candidateSectionRef = useRef<HTMLElement>(null);
  const pollingRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, []);

  // 이전에 집필 중이던 프로젝트로 진입했을 때 복구
  useEffect(() => {
    if (!initialProject || initialProject.stage !== 'story' || !initialProject.selectedCandidateId) return;
    const selected = initialProject.candidates.find((c) => c.id === initialProject.selectedCandidateId);
    if (!selected) return;

    if (initialProject.storyDevelopment?.currentPass === 'complete' || initialProject.cues.length > 0) {
      onProject({...initialProject, stage: 'script'});
      return;
    }

    setDraftingCandidate(selected);
    setBusy(true);
    startPolling(initialProject.id, selected);
  }, [initialProject?.id]);

  useEffect(() => {
    if (!shouldRevealCandidates || candidates.length === 0) return;
    candidateSectionRef.current?.scrollIntoView({behavior: 'smooth', block: 'start'});
    setShouldRevealCandidates(false);
  }, [candidates.length, shouldRevealCandidates]);

  const startPolling = (projectId: string, candidate: StoryCandidate) => {
    if (pollingRef.current) clearInterval(pollingRef.current);

    pollingRef.current = window.setInterval(async () => {
      try {
        const latest = await api.getProject(projectId);
        if (!latest) return;

        // 최종 완료 감지
        if (latest.stage === 'script' || latest.storyDevelopment?.currentPass === 'complete') {
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
          setDraftingProgress({
            phase: 'complete',
            completedScenes: latest.scenes.length,
            totalScenes: latest.scenes.length || 14,
            percent: 100,
            statusText: '30분 장편 대본 집필 및 검수 완료! 대본 제작실로 이동합니다…',
          });
          setTimeout(() => {
            onProject({...latest, stage: 'script'});
          }, 600);
          return;
        }

        // 진행 중 상태 계산
        const contracts = latest.storyDevelopment?.sceneContracts ?? [];
        const totalScenes = contracts.length > 0 ? contracts.length : 14;
        const completedScenes = latest.scenes?.length ?? 0;
        const latestScene = completedScenes > 0 ? latest.scenes[completedScenes - 1] : undefined;

        let phase: DraftingProgress['phase'] = 'planning';
        let percent = 10;
        let statusText = 'Pass 1~4: 스토리 바이블 및 씬 거시 구조 설계 중…';

        if (completedScenes === 0 && contracts.length > 0) {
          phase = 'planning';
          percent = 15;
          statusText = `총 ${totalScenes}개 씬 구조 및 연속성 장부 체결 완료…`;
        } else if (completedScenes > 0 && completedScenes < totalScenes) {
          phase = 'drafting';
          percent = Math.min(92, Math.round(15 + (completedScenes / totalScenes) * 75));
          statusText = `Pass 5: ${completedScenes} / ${totalScenes}번째 씬 릴레이 집필 완료`;
        } else if (completedScenes >= totalScenes && completedScenes > 0) {
          phase = 'reviewing';
          percent = 95;
          statusText = 'Pass 6~7: 전체 복선 회수 검수 및 나레이션 큐 타임라인 계산 중…';
        }

        setDraftingProgress({
          phase,
          completedScenes,
          totalScenes,
          latestSceneTitle: latestScene?.title,
          percent,
          statusText,
        });
      } catch (pollErr) {
        console.warn('대본 집필 폴링 중 일시적 오류:', pollErr);
      }
    }, 2000);
  };

  const generate = async () => {
    setBusy(true);
    setError('');
    try {
      const current =
        project ??
        (await api.createProject({
          name: title.trim() || '새 야담',
          runtimeMinutes: runtime,
          dwellPresetId: dwell,
        }));
      const finalSummary =
        mode === 'strategy' && strategy
          ? `${summary.trim()}\n\n[30분 서사 연출 전략]: ${strategy.trim()}`
          : summary.trim() || '억울한 사연과 지혜로운 반전, 따뜻한 여운이 있는 조선 후기 야담을 만든다.';
      const input: StoryInput = {
        mode,
        title: title.trim() || 'AI가 제안하는 야담',
        summary: finalSummary,
      };
      const nextCandidates = await api.generateCandidates(current.id, input);
      const next = {...current, storyInput: input, candidates: nextCandidates};
      setProject(next);
      setCandidates(nextCandidates);
      setShouldRevealCandidates(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '후보를 만들지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const select = async (candidateId: string) => {
    if (!project) return;
    const targetCandidate = candidates.find((c) => c.id === candidateId);
    if (!targetCandidate) return;

    setBusy(true);
    setError('');
    setDraftingCandidate(targetCandidate);
    setDraftingProgress({
      phase: 'planning',
      completedScenes: 0,
      totalScenes: 14,
      percent: 8,
      statusText: 'Pass 1~4: 30분 스토리 바이블 및 씬 구조 설계 시작…',
    });

    // 2초 간격 실시간 폴링 가동
    startPolling(project.id, targetCandidate);

    try {
      const finished = await api.selectCandidate(project.id, candidateId);
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      setDraftingProgress({
        phase: 'complete',
        completedScenes: finished.scenes.length,
        totalScenes: finished.scenes.length || 14,
        percent: 100,
        statusText: '30분 장편 대본 집필 완료! 대본 제작실로 이동합니다…',
      });
      setTimeout(() => {
        onProject(finished);
      }, 500);
    } catch (caught) {
      console.warn('selectCandidate HTTP 연결 종료 (폴링으로 계속 모니터링):', caught);
    }
  };

  return (
    <main className="workspace enter-up">
      <header className="workspace-heading">
        <span className="eyebrow">STEP 01 · STORY</span>
        <h1>어떤 이야기를 들려드릴까요?</h1>
        <p>복잡한 설계는 안쪽에서 처리합니다. 지금은 출발점과 호흡만 정하세요.</p>
      </header>

      <section className="mode-grid" aria-label="이야기 시작 방식">
        <button className={`mode-card bezel-shell ${mode === 'reference' ? 'is-selected' : ''}`} type="button" onClick={() => setMode('reference')}>
          <span className="bezel-core">
            <MagicWand size={25} weight="light" />
            <strong>레퍼런스 재구성</strong>
            <small>흥행 구조만 분석하고 인물·사건·반전은 새로 만듭니다.</small>
          </span>
        </button>
        <button className={`mode-card bezel-shell ${mode === 'strategy' ? 'is-selected' : ''}`} type="button" onClick={() => setMode('strategy')}>
          <span className="bezel-core">
            <Sparkle size={25} weight="light" />
            <strong>전략 인터뷰</strong>
            <small>한 번에 하나씩 답하면 다음 질문이 이야기와 함께 달라집니다.</small>
          </span>
        </button>
      </section>

      <section className="form-panel bezel-shell">
        <div className="bezel-core form-core">
          {mode === 'reference' ? (
            <div className="field-grid">
              <label>
                <span>레퍼런스 제목</span>
                <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="예: 눈보라 속에서 구한 여인의 비밀" />
              </label>
              <label className="wide-field">
                <span>레퍼런스 요약</span>
                <textarea value={summary} onChange={(event) => setSummary(event.target.value)} rows={5} placeholder="원본 문장을 붙이지 말고 핵심 사건과 재미를 요약해 주세요." />
              </label>
            </div>
          ) : summary ? (
            <div className="strategy-result enter-up">
              <span className="eyebrow">STRATEGY READY</span>
              <h3>{title}</h3>
              <p>{summary}</p>
              {strategy && (
                <div className="strategy-meta-box">
                  <strong>⚡ 30분 서사 연출 전략</strong>
                  <p>{strategy}</p>
                </div>
              )}
              <button
                className="quiet-button"
                type="button"
                onClick={() => {
                  setTitle('');
                  setSummary('');
                  setStrategy('');
                }}
              >
                인터뷰 다시 하기
              </button>
            </div>
          ) : (
            <StrategyInterview
              onComplete={(result) => {
                setTitle(result.title);
                setSummary(result.summary);
                setStrategy(result.strategy);
              }}
            />
          )}

          <div className="preset-section">
            <div><strong>목표 길이</strong><small>실제 TTS 시간으로 다시 맞춥니다.</small></div>
            <div className="segmented" role="radiogroup" aria-label="목표 길이">
              {RUNTIME_PRESETS.map((value) => (
                <label key={value} className={runtime === value ? 'is-checked' : ''}>
                  <input type="radio" name="runtime" aria-label={`${value}분`} checked={runtime === value} onChange={() => setRuntime(value)} />
                  <span>{value}분</span>
                </label>
              ))}
            </div>
          </div>

          <div className="preset-section">
            <div><strong>이미지 체류</strong><small>의미가 바뀌면 범위보다 먼저 교체합니다.</small></div>
            <div className="segmented dwell" role="radiogroup" aria-label="이미지 체류">
              {Object.values(DWELL_PRESETS).map((preset) => (
                <label key={preset.id} className={dwell === preset.id ? 'is-checked' : ''}>
                  <input type="radio" name="dwell" aria-label={preset.label} checked={dwell === preset.id} onChange={() => setDwell(preset.id)} />
                  <span>{preset.label}</span>
                </label>
              ))}
            </div>
          </div>

          {error && <p className="error-banner" role="alert">{error}</p>}
          <div className="form-actions">
            <p>후보끼리 인물·장소·오브제·반전·결말이 겹치지 않습니다.</p>
            <button className="primary-button group" type="button" disabled={busy || (mode === 'strategy' && !summary)} onClick={generate}>
              <span>{busy ? '구조를 설계하는 중…' : '이야기 후보 3개 만들기'}</span>
              <span className="button-orb"><ArrowRight size={18} weight="bold" /></span>
            </button>
          </div>
        </div>
      </section>

      {candidates.length > 0 && (
        <section ref={candidateSectionRef} className="candidate-section enter-up">
          <header className="section-heading">
            <div><span className="eyebrow">THREE DIRECTIONS</span><h2>서로 다른 세 갈래</h2></div>
            <p>기승전결 줄거리와 반전·결말 전개 전략을 꼼꼼히 비교해보고 선택하세요.</p>
          </header>
          <div className="candidate-grid">
            {candidates.map((candidate, index) => (
              <article className="candidate-card bezel-shell" key={candidate.id}>
                <div className="bezel-core">
                  <div className="candidate-card-top">
                    <span className="candidate-number">0{index + 1}</span>
                    <h3>{candidate.title}</h3>
                  </div>
                  <p className="candidate-hook">“{candidate.hook}”</p>

                  <div className="candidate-synopsis-box">
                    <span className="candidate-box-label">상세 줄거리 (시놉시스)</span>
                    <p className="candidate-synopsis">{candidate.premise}</p>
                  </div>

                  <div className="candidate-strategy-box">
                    <div className="strategy-row">
                      <strong>핵심 반전</strong>
                      <span>{candidate.causalTurn}</span>
                    </div>
                    <div className="strategy-row">
                      <strong>결말 보상</strong>
                      <span>{candidate.endingPromise}</span>
                    </div>
                    {candidate.strategy && (
                      <div className="strategy-row">
                        <strong>전개 전략</strong>
                        <span>{candidate.strategy}</span>
                      </div>
                    )}
                  </div>

                  <dl className="candidate-meta">
                    <div><dt>주인공</dt><dd>{candidate.protagonist}</dd></div>
                    {candidate.antagonist && <div><dt>적대자</dt><dd>{candidate.antagonist}</dd></div>}
                    <div><dt>장소</dt><dd>{candidate.location}</dd></div>
                    <div><dt>단서</dt><dd>{candidate.centralObject}</dd></div>
                  </dl>
                  <button className="secondary-button" type="button" disabled={busy} onClick={() => select(candidate.id)}>
                    {busy ? '장편 대본 순차 집필 중…' : '이 이야기 선택'} <ArrowRight size={16} weight="light" />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {draftingCandidate && draftingProgress && (
        <div className="drafting-modal-backdrop" role="dialog" aria-modal="true" aria-label="장편 대본 집필 진행 상황">
          <div className="drafting-modal-card bezel-shell">
            <div className="bezel-core">
              <div className="drafting-header">
                <span className="eyebrow">PASS 5 · NARRATIVE PIPELINE</span>
                <h2>30분 장편 야담 릴레이 집필 중</h2>
                <p className="drafting-candidate-title">《{draftingCandidate.title}》</p>
              </div>

              <div className="drafting-progress-box">
                <div className="drafting-progress-top">
                  <span className="drafting-phase-badge">
                    {draftingProgress.phase === 'planning'
                      ? '설계 단계'
                      : draftingProgress.phase === 'drafting'
                        ? `릴레이 집필 (${draftingProgress.completedScenes}/${draftingProgress.totalScenes}씬)`
                        : draftingProgress.phase === 'reviewing'
                          ? '최종 검수 & 싱크'
                          : '집필 완료'}
                  </span>
                  <strong className="drafting-percent">{draftingProgress.percent}%</strong>
                </div>

                <div className="drafting-progress-track">
                  <div className="drafting-progress-bar" style={{width: `${draftingProgress.percent}%`}} />
                </div>

                <div className="drafting-status-desc">
                  <p className="drafting-main-status">
                    {draftingProgress.phase !== 'complete' && (
                      <CircleNotch size={16} className="spin-inline" style={{marginRight: 6, verticalAlign: -2}} />
                    )}
                    {draftingProgress.statusText}
                  </p>
                  {draftingProgress.latestSceneTitle && (
                    <small className="drafting-sub-status">
                      방금 작성된 씬: <strong>{draftingProgress.latestSceneTitle}</strong>
                    </small>
                  )}
                </div>
              </div>

              <div className="drafting-notice-box">
                <p>
                  💡 30분 분량(12~14씬, 1만~1.5만 자)을 씬 단위로 꼼꼼히 집필하므로 약 8~10분이 소요됩니다. 
                  브라우저를 새로고침하거나 닫아도 백그라운드에서 안전하게 계속 작성됩니다.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};

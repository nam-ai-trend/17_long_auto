import {ArrowClockwise, ArrowRight, CheckCircle, Clock, SpeakerHigh, Waveform} from '@phosphor-icons/react';
import {useEffect, useMemo, useState} from 'react';
import type {Project, ProjectStage} from '../../shared/contracts';
import {DWELL_PRESETS} from '../../shared/presets';
import {estimateAssetCount} from '../../server/media-planner';
import type {YadamApi} from '../api';

type Props = {
  project: Project;
  api: YadamApi;
  onProject: (project: Project) => void;
  onNavigate?: (stage: ProjectStage) => void;
};

const passes = [
  '후킹 약속',
  '장·씬 구조',
  '인물·복선 상태',
  '씬 계약',
  '순차 집필',
  '연속성·시대 검수',
  '전체 리듬·결말',
];

export const ScriptStudio = ({project, api, onProject, onNavigate}: Props) => {
  const [busy, setBusy] = useState(false);
  const [ttsBusy, setTtsBusy] = useState(false);
  const [rebalanceBusy, setRebalanceBusy] = useState(false);
  const [busyCue, setBusyCue] = useState<string | null>(null);
  const [error, setError] = useState('');
  const totalSeconds = project.cues.at(-1)?.end ?? 0;
  const estimatedImages = useMemo(
    () => estimateAssetCount(project.settings.runtimeMinutes, project.settings.dwellPresetId),
    [project.settings],
  );
  const readyCues = project.cues.filter((cue) => cue.ttsStatus === 'ready').length;
  const failedCues = project.cues.filter((cue) => cue.ttsStatus === 'failed').length;
  const isGeneratingAny = useMemo(
    () => project.cues.some((cue) => cue.ttsStatus === 'generating'),
    [project.cues],
  );
  const isTtsActive = ttsBusy || isGeneratingAny;

  // 마운트 시 서버의 백그라운드 TTS 작업 실행 여부 확인
  useEffect(() => {
    let unmounted = false;
    if (typeof api.getTtsStatus === 'function') {
      api.getTtsStatus(project.id)
        .then((status) => {
          if (!unmounted && status.isRunning) {
            setTtsBusy(true);
          }
        })
        .catch(() => {});
    }
    return () => {
      unmounted = true;
    };
  }, [project.id, api]);

  // TTS 작업 진행 중일 때 1.5초마다 최신 프로젝트 상태 폴링
  useEffect(() => {
    if (!isTtsActive) return;

    const interval = setInterval(async () => {
      try {
        const [latest, status] = await Promise.all([
          api.getProject(project.id),
          typeof api.getTtsStatus === 'function'
            ? api.getTtsStatus(project.id).catch(() => ({isRunning: false}))
            : Promise.resolve({isRunning: false}),
        ]);
        onProject(latest);
        const hasUnfinished = latest.cues.some(
          (cue) => cue.ttsStatus !== 'ready' && cue.ttsStatus !== 'failed',
        );
        if (!status.isRunning && !latest.cues.some((c) => c.ttsStatus === 'generating') && (!hasUnfinished || !status.isRunning)) {
          setTtsBusy(false);
        }
      } catch {}
    }, 1500);

    return () => clearInterval(interval);
  }, [project.id, isTtsActive, api, onProject]);

  const generateAllTts = async () => {
    setTtsBusy(true);
    setError('');
    try {
      await api.generateAllTts(project.id);
      const latest = await api.getProject(project.id);
      onProject(latest);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '전체 음성을 생성하지 못했습니다.');
      setTtsBusy(false);
    }
  };

  const generateCueTts = async (cueId: string) => {
    setBusyCue(cueId);
    setError('');
    try {
      onProject(await api.generateCueTts(project.id, cueId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '문장 음성을 생성하지 못했습니다.');
    } finally {
      setBusyCue(null);
    }
  };

  const rebalanceStory = async () => {
    setRebalanceBusy(true);
    setError('');
    try {
      onProject(await api.rebalanceStory(project.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '실제 음성 시간에 맞춰 대본을 보정하지 못했습니다.');
    } finally {
      setRebalanceBusy(false);
    }
  };

  const changeGap = async (cueId: string, value: string) => {
    try {
      const manualGap = value === '' ? null : Number(value);
      onProject(await api.updateCueGap(project.id, cueId, manualGap));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '호흡을 수정하지 못했습니다.');
    }
  };

  const plan = async () => {
    setBusy(true);
    setError('');
    try {
      const updated = await api.buildMediaPlan(project.id);
      onProject(updated);
      onNavigate?.('production');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '시각 설계를 만들지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="workspace studio-layout enter-up">
      <header className="workspace-heading studio-title">
        <span className="eyebrow">STEP 02 · SCRIPT</span>
        <h1>대본 제작실</h1>
        <p>장면은 자연스럽게 잇고, 문장 사이에는 들을 수 있는 숨을 남깁니다.</p>
        <div className="metric-row">
          <span><Clock size={16} weight="light" />{project.settings.runtimeMinutes}분</span>
          <span><Waveform size={16} weight="light" />{DWELL_PRESETS[project.settings.dwellPresetId].label}</span>
          <span>예상 이미지 {estimatedImages}장</span>
        </div>
      </header>

      <section className="pass-strip" aria-label="내부 집필 단계">
        {passes.map((pass, index) => (
          <span key={pass}><CheckCircle size={15} weight="fill" /><small>{index + 1}</small>{pass}</span>
        ))}
      </section>

      <div className="studio-columns">
        <section className="bezel-shell script-document">
          <div className="bezel-core">
            <header className="section-heading compact">
              <div><span className="eyebrow">STORY MAP</span><h2>장과 씬</h2></div>
              <span className="count-pill">{project.scenes.length}</span>
            </header>
            <div className="chapter-list">
              {project.chapters.map((chapter) => (
                <article key={chapter.id}>
                  <div className="chapter-index">{String(project.chapters.indexOf(chapter) + 1).padStart(2, '0')}</div>
                  <div>
                    <h3>{chapter.title}</h3>
                    <p>{chapter.purpose}</p>
                    {project.scenes.filter((scene) => scene.chapterId === chapter.id).map((scene) => (
                      <div className="scene-line" key={scene.id}>
                        <strong>{scene.title}</strong><span>{scene.change}</span>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="bezel-shell cue-panel">
          <div className="bezel-core">
            <header className="section-heading compact">
              <div><span className="eyebrow">VOICE TIMELINE</span><h2>문장별 호흡</h2></div>
              <div className="voice-summary">
                <span className="time-total">{totalSeconds.toFixed(1)}초</span>
                <button type="button" disabled={isTtsActive} onClick={generateAllTts}>
                  <SpeakerHigh size={15} weight="light" />
                  {isTtsActive ? '음성 생성 중…' : '전체 음성 생성'}
                </button>
              </div>
            </header>
            <div className="voice-progress" aria-label="음성 생성 현황">
              <div className="voice-progress-info">
                <span>
                  실제 음성 <strong>{readyCues}</strong> / {project.cues.length} (
                  {((readyCues / Math.max(1, project.cues.length)) * 100).toFixed(1)}%)
                </span>
                {isTtsActive && (
                  <span className="tts-live-tag">
                    <Waveform size={14} weight="bold" /> AI 음성 합성 진행 중…
                  </span>
                )}
              </div>
              <div className="voice-progress-track">
                <div
                  className="voice-progress-bar"
                  style={{
                    width: `${(readyCues / Math.max(1, project.cues.length)) * 100}%`,
                  }}
                />
              </div>
              {failedCues > 0 && <span className="is-error">실패 {failedCues}</span>}
              {readyCues === 0 && <small>현재 시간은 글자 수 기반 예상값입니다.</small>}
              {project.storyDevelopment && project.cues.length > 0 && readyCues === project.cues.length && (
                <button
                  className="quiet-button"
                  type="button"
                  disabled={rebalanceBusy || ttsBusy}
                  onClick={rebalanceStory}
                >
                  {rebalanceBusy ? '분량 보정 중…' : '실제 시간으로 대본 보정'}
                </button>
              )}
            </div>
            <div className="cue-list">
              {project.cues.map((cue, index) => (
                <article className="cue-row" key={cue.id}>
                  <span className="cue-number">{String(index + 1).padStart(2, '0')}</span>
                  <div className="cue-copy">
                    <p>{cue.text}</p>
                    <small>{cue.start.toFixed(2)} → {cue.end.toFixed(2)}초 · {cue.gapReason}</small>
                    <div className="cue-audio-row">
                      <span className={`tts-state ${cue.ttsStatus ?? 'estimated'}`}>
                        {cue.ttsStatus === 'ready'
                          ? '실제 음성'
                          : cue.ttsStatus === 'failed'
                            ? '생성 실패'
                            : cue.ttsStatus === 'generating'
                              ? '생성 중'
                              : '예상 시간'}
                      </span>
                      {cue.ttsStatus === 'ready' && (
                        <audio controls preload="none" src={api.cueAudioUrl(project.id, cue.id)}>
                          <track kind="captions" />
                        </audio>
                      )}
                      <button
                        type="button"
                        aria-label={`${index + 1}번 문장 음성 재생성`}
                        disabled={ttsBusy || busyCue === cue.id}
                        onClick={() => generateCueTts(cue.id)}
                      >
                        <ArrowClockwise size={13} />
                        {busyCue === cue.id ? '생성 중' : cue.ttsStatus === 'ready' ? '다시 생성' : '이 문장 생성'}
                      </button>
                    </div>
                    {cue.ttsStatus === 'ready' && (
                      <small className="silence-meta">
                        원본 무음 앞 {(cue.leadingSilence ?? 0).toFixed(2)}초 · 뒤 {(cue.trailingSilence ?? 0).toFixed(2)}초
                      </small>
                    )}
                    {cue.ttsError && <small className="cue-error">{cue.ttsError}</small>}
                  </div>
                  <label className="gap-control">
                    <span>뒤 호흡</span>
                    <input
                      aria-label={`${index + 1}번 문장 뒤 호흡`}
                      type="number"
                      min="0"
                      max="10"
                      step="0.05"
                      value={cue.manualGap ?? cue.gapAfter}
                      onChange={(event) => changeGap(cue.id, event.target.value)}
                    />
                  </label>
                </article>
              ))}
            </div>
          </div>
        </section>
      </div>

      {error && <p className="error-banner" role="alert">{error}</p>}
      <footer className="stage-footer">
        <div><strong>다음 단계</strong><span>첫 60초 영상과 이후 삽화 구간을 자동으로 나눕니다.</span></div>
        <div className="stage-footer-actions">
          {onNavigate && project.mediaSegments.length > 0 && (
            <button
              className="stage-footer-btn stage-footer-btn-nav"
              type="button"
              disabled={busy || ttsBusy}
              onClick={() => onNavigate('production')}
            >
              <span>화면 제작·렌더로 이동</span>
            </button>
          )}
          <button
            className="stage-footer-btn stage-footer-btn-primary"
            type="button"
            disabled={busy || ttsBusy}
            onClick={plan}
          >
            <span>{busy ? '타임라인 계산 중…' : '시각 설계 만들기'}</span>
            <ArrowRight size={17} weight="bold" />
          </button>
        </div>
      </footer>
    </main>
  );
};

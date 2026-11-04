import {
  ArrowLeft,
  ArrowRight,
  ChatCircleText,
  CheckCircle,
  Lightbulb,
  SealCheck,
  Sparkle,
} from '@phosphor-icons/react';
import {useState} from 'react';
import {api} from '../api';
import type {
  InterviewQuestion,
  InterviewResult,
  InterviewStepInput,
  InterviewSuggestion,
} from '../../shared/contracts';

const PRESET_THEMES = [
  {id: '권선징악 & 사이다 복수', desc: '탐관오리와 악덕 권세가를 지략으로 무너뜨리는 통쾌함'},
  {id: '기이한 요괴·원혼 괴담', desc: '밤마다 나타나는 존재와 봉인된 한을 푸는 서늘한 미스터리'},
  {id: '암행어사 & 지략 수사', desc: '잠행과 치열한 단서 추적으로 거대한 비리를 폭로'},
  {id: '신분 초월 & 뭉클한 보은', desc: '목숨 걸고 은혜를 갚는 인연과 깊은 인간적 감동'},
  {id: '가문의 비밀 & 뒤바뀐 운명', desc: '숨겨진 족보, 뒤바뀐 아이, 세대를 건넌 숙명'},
];

type Props = {
  onComplete: (result: InterviewResult) => void;
};

export const StrategyInterview = ({onComplete}: Props) => {
  const [phase, setPhase] = useState<'setup' | 'interview' | 'finishing'>('setup');
  const [selectedTheme, setSelectedTheme] = useState(PRESET_THEMES[0].id);
  const [isCustomTheme, setIsCustomTheme] = useState(false);
  const [customThemeInput, setCustomThemeInput] = useState('');
  const [topic, setTopic] = useState('');

  const [currentQuestion, setCurrentQuestion] = useState<InterviewQuestion | null>(null);
  const [history, setHistory] = useState<Array<{step: number; question: string; answer: string}>>([]);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState<number | null>(null);
  const [answerInput, setAnswerInput] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const finalTheme = isCustomTheme ? customThemeInput.trim() || '자유 테마 야담' : selectedTheme;

  // 추천 문구를 입력창에 자연스럽게 채우는 헬퍼 (중복 방지)
  const formatSuggestion = (s: InterviewSuggestion): string => {
    if (!s.detail) return s.label;
    if (s.detail.startsWith(s.label)) return s.detail;
    return `${s.label} — ${s.detail}`;
  };

  // 인터뷰 시작: 첫 번째 질문 요청
  const handleStart = async () => {
    if (isCustomTheme && !customThemeInput.trim()) {
      setError('큰 주제를 직접 입력해 주세요.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const stepInput: InterviewStepInput = {
        theme: finalTheme,
        topic: topic.trim(),
        history: [],
      };
      const question = await api.interviewNextQuestion(stepInput);
      setCurrentQuestion(question);
      setHistory([]);
      setPhase('interview');
      // 첫 질문 시 기본 추천 보기 텍스트 자동 프리필
      const recIndex = question.suggestions.findIndex((s) => s.recommended);
      const defaultIndex = recIndex >= 0 ? recIndex : 0;
      setSelectedSuggestionIndex(defaultIndex);
      const chosen = question.suggestions[defaultIndex];
      setAnswerInput(chosen ? formatSuggestion(chosen) : '');
    } catch (err) {
      setError(err instanceof Error ? err.message : '첫 번째 질문을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 추천 보기 클릭 시: 텍스트에리어에 내용 반영 + 선택 강조
  const handleSelectSuggestion = (suggestion: InterviewSuggestion, index: number) => {
    setSelectedSuggestionIndex(index);
    setAnswerInput(formatSuggestion(suggestion));
  };

  // 다음 질문으로 이동 or 최종 요약 생성
  const handleNext = async () => {
    if (!currentQuestion) return;
    const finalAnswer = answerInput.trim();
    if (!finalAnswer) {
      setError('의견을 작성하거나 추천 보기를 선택해 주세요.');
      return;
    }

    setError('');
    setLoading(true);

    const newHistory = [
      ...history,
      {
        step: currentQuestion.step,
        question: currentQuestion.question,
        answer: finalAnswer,
      },
    ];
    setHistory(newHistory);

    try {
      const stepInput: InterviewStepInput = {
        theme: finalTheme,
        topic: topic.trim(),
        history: newHistory,
      };

      if (currentQuestion.step >= currentQuestion.totalSteps) {
        // 모든 문답 완료 -> 요약 생성
        setPhase('finishing');
        const summary = await api.interviewSummary(stepInput);
        onComplete(summary);
      } else {
        // 다음 질문 로드
        const nextQ = await api.interviewNextQuestion(stepInput);
        setCurrentQuestion(nextQ);
        const recIndex = nextQ.suggestions.findIndex((s) => s.recommended);
        const defaultIndex = recIndex >= 0 ? recIndex : 0;
        setSelectedSuggestionIndex(defaultIndex);
        const chosen = nextQ.suggestions[defaultIndex];
        setAnswerInput(chosen ? formatSuggestion(chosen) : '');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '다음 질문 처리에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 이전 질문으로 돌아가기
  const handlePrevious = () => {
    if (history.length === 0) {
      setPhase('setup');
      return;
    }
    const previousHistory = history.slice(0, -1);
    setHistory(previousHistory);
    // 이전 질문 복원 로직
    setLoading(true);
    api
      .interviewNextQuestion({
        theme: finalTheme,
        topic: topic.trim(),
        history: previousHistory,
      })
      .then((prevQ) => {
        setCurrentQuestion(prevQ);
        const lastAnswer = history[history.length - 1]?.answer || '';
        setAnswerInput(lastAnswer);
        setSelectedSuggestionIndex(null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : '이전 질문 복원에 실패했습니다.');
      })
      .finally(() => {
        setLoading(false);
      });
  };

  // 1단계: 테마 및 세부 소재 설정 뷰
  if (phase === 'setup') {
    return (
      <section className="strategy-interview-setup enter-up" aria-label="전략 인터뷰 준비">
        <header className="setup-header">
          <span className="eyebrow"><Sparkle size={15} weight="fill" /> DYNAMIC INTERVIEW SETUP</span>
          <h3>어떤 색깔의 야담을 만들고 싶으신가요?</h3>
          <p>큰 주제를 고르고 떠오르는 소재를 적어주시면, AI가 이야기에 살을 붙일 맞춤형 질문을 던집니다.</p>
        </header>

        <div className="theme-selection-block">
          <label className="section-sublabel">1. 큰 주제 (장르 & 테마)</label>
          <div className="theme-chips-grid">
            {PRESET_THEMES.map((theme) => {
              const selected = !isCustomTheme && selectedTheme === theme.id;
              return (
                <button
                  type="button"
                  key={theme.id}
                  className={`theme-chip-card ${selected ? 'is-active' : ''}`}
                  onClick={() => {
                    setIsCustomTheme(false);
                    setSelectedTheme(theme.id);
                  }}
                >
                  <div className="chip-card-top">
                    {selected ? <CheckCircle size={18} weight="fill" /> : <div className="chip-radio" />}
                    <strong>{theme.id}</strong>
                  </div>
                  <p>{theme.desc}</p>
                </button>
              );
            })}
            <button
              type="button"
              className={`theme-chip-card custom-chip ${isCustomTheme ? 'is-active' : ''}`}
              onClick={() => setIsCustomTheme(true)}
            >
              <div className="chip-card-top">
                {isCustomTheme ? <CheckCircle size={18} weight="fill" /> : <div className="chip-radio" />}
                <strong>직접 테마 입력</strong>
              </div>
              <p>원하는 독특한 분위기나 야담 장르를 직접 지정합니다.</p>
            </button>
          </div>

          {isCustomTheme && (
            <div className="custom-theme-input-wrap enter-up">
              <input
                type="text"
                placeholder="예: 조선 팔도 보부상들의 목숨 건 장터 첩보전"
                value={customThemeInput}
                onChange={(e) => setCustomThemeInput(e.target.value)}
                autoFocus
              />
            </div>
          )}
        </div>

        <div className="topic-input-block">
          <label className="section-sublabel">
            2. 세부 소재나 떠오르는 상황 <small>(선택 사항)</small>
          </label>
          <textarea
            rows={2}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="예: 과거 시험장에서 답안지가 뒤바뀐 천재 유생 / 밤마다 눈보라를 뚫고 산에 오르는 사냥꾼의 비밀"
          />
          <small className="field-hint">비워두셔도 AI가 테마에 꼭 맞는 흥미진진한 질문으로 이야기를 풀어갑니다.</small>
        </div>

        {error && <p className="error-banner" role="alert">{error}</p>}

        <div className="setup-actions">
          <button
            type="button"
            className="primary-button group"
            disabled={loading}
            onClick={handleStart}
          >
            <span>{loading ? '질문을 설계하는 중…' : '맞춤 질문 시작하기'}</span>
            <span className="button-orb"><ArrowRight size={18} weight="bold" /></span>
          </button>
        </div>
      </section>
    );
  }

  // 3단계: 최종 완성 중 뷰
  if (phase === 'finishing' || (loading && !currentQuestion)) {
    return (
      <section className="strategy-interview-loading enter-up">
        <div className="pulse-indicator">
          <Sparkle size={32} weight="fill" className="spinning-sparkle" />
        </div>
        <h3>대화 내용을 종합하여 30분 서사 전략을 완성하고 있습니다…</h3>
        <p>인물의 숨은 동기, 치밀한 위기, 짜릿한 반전을 엮어 매력적인 기획안을 도출합니다.</p>
      </section>
    );
  }

  // 2단계: 동적 질문 & 하이브리드 입력 인터랙션 뷰
  const step = currentQuestion?.step ?? 1;
  const totalSteps = currentQuestion?.totalSteps ?? 3;
  const progressPercent = (step / totalSteps) * 100;

  return (
    <section className="strategy-interview enter-up" aria-live="polite">
      <div className="interview-top-nav">
        <button type="button" className="nav-back-button" onClick={handlePrevious} disabled={loading}>
          <ArrowLeft size={16} weight="bold" /> 이전
        </button>
        <div className="interview-theme-badge">
          <span>{finalTheme}</span>
          {topic && <small>· {topic.slice(0, 16)}...</small>}
        </div>
      </div>

      <div className="interview-progress">
        <span style={{width: `${progressPercent}%`}} />
      </div>

      <div className="question-header">
        <div className="question-meta">
          <span className="eyebrow">QUESTION {step} / {totalSteps}</span>
          {currentQuestion?.category && (
            <span className="category-pill">{currentQuestion.category}</span>
          )}
        </div>
        <h3>{currentQuestion?.question}</h3>
      </div>

      {/* 추천 선택지 목록 */}
      <div className="suggestions-section">
        <label className="section-sublabel">
          <Lightbulb size={16} weight="fill" /> AI 추천 선택지 <small>(클릭하면 아래 의견창에 자동 입력됩니다)</small>
        </label>
        <div className="answer-list">
          {currentQuestion?.suggestions.map((suggestion, index) => {
            const isSelected = selectedSuggestionIndex === index;
            return (
              <button
                type="button"
                key={suggestion.label}
                className={`suggestion-card ${isSelected ? 'is-selected' : ''}`}
                onClick={() => handleSelectSuggestion(suggestion, index)}
              >
                <span>
                  {suggestion.recommended && <SealCheck size={16} weight="fill" />}
                  <strong>{suggestion.label}</strong>
                  {suggestion.recommended && <small>추천</small>}
                </span>
                <p>{suggestion.detail}</p>
                <div className="card-click-hint">
                  {isSelected ? <CheckCircle size={18} weight="fill" /> : <ArrowRight size={17} weight="bold" />}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 사용자의 의견 직접 입력 및 덧붙이기 폼 */}
      <div className="custom-opinion-section enter-up">
        <label className="section-sublabel">
          <ChatCircleText size={16} weight="fill" /> 나의 답변 및 추가 의견 <small>(자유롭게 수정하거나 살을 덧붙여 보세요)</small>
        </label>
        <div className="opinion-box">
          <textarea
            rows={3}
            value={answerInput}
            onChange={(e) => {
              setAnswerInput(e.target.value);
              setSelectedSuggestionIndex(null); // 사용자가 직접 수정 시 선택지 인덱스 해제
            }}
            placeholder="추천 선택지를 누르거나, 내 생각과 연출 의도를 직접 적어주세요."
          />
        </div>
      </div>

      {error && <p className="error-banner" role="alert">{error}</p>}

      <div className="interview-bottom-actions">
        <div className="history-trail">
          {history.length > 0 && (
            <small>
              이전 기록: {history.map((h) => h.answer.split('(')[0].trim()).join(' ➔ ')}
            </small>
          )}
        </div>
        <button
          type="button"
          className="primary-button group"
          disabled={loading || !answerInput.trim()}
          onClick={handleNext}
        >
          <span>
            {loading
              ? '생각을 정리하는 중…'
              : step === totalSteps
                ? '전략 완성하기'
                : '다음 질문으로'}
          </span>
          <span className="button-orb"><ArrowRight size={18} weight="bold" /></span>
        </button>
      </div>
    </section>
  );
};

# 남다른AI 야담 롱폼 자동 제작 스튜디오 (Yadam Studio)

조선시대 야담 롱폼 콘텐츠를 **기획부터 장편 대본 집필, 문장별 AI 음성 합성(TTS), 시각 프롬프트 설계, Remotion 영상 합성 및 완성본 MP4 비디오 다운로드**까지 한 흐름으로 자동화하는 로컬 스튜디오 프로그램입니다.

---

## 🌟 주요 기능 및 파이프라인

### 1단계: 이야기 시작 (Story Planning)
- **레퍼런스 재구성 모드:** 성공한 이야기 레퍼런스의 기승전결 구조와 서사적 뼈대만 분석하고, 인물·사건·반전은 새롭게 창작
- **전략 인터뷰 모드:** AI의 인터뷰 질문에 답변하며 서사 구조, 주인공 결핍, 갈등, 반전을 순차적으로 구체화
- **이야기 후보 추천:** 분석 결과를 토대로 서로 다른 매력과 훅을 가진 3가지 야담 시놉시스 후보 자동 생성

### 2단계: 7패스 장편 집필 (Script Studio)
- **체계적인 7패스 집필 파이프라인:**
  1. 기획 성경 (Story Bible & 연속성 장부)
  2. 씬 계약 및 사건 인과 설계 (Scene Contracts)
  3. 초고 집필 (2~3개 씬 단위의 메모리 기반 순차 집필)
  4. 로컬 인과 및 호흡 검수
  5. 복선 및 반전 회수 검수
  6. 역사적 개연성 및 어휘 다듬기
  7. 최종 탈고 및 낭독 내레이션 큐(Cue) 분할
- **실시간 집필 현황 모달:** 대본 작성 과정을 1.5초 간격으로 실시간 모니터링

### 3단계: AI 음성 합성 & 호흡 조율 (TTS & Timeline)
- **Pinokio Qwen3-TTS 연동:** 한국어 전문 프리셋 화자(`Sohee`, 1.7B) 기반 고음질 내레이션 생성
- **실시간 생성 모니터링 및 정지:** 백그라운드 워커를 통한 순차 생성, 실시간 진행률 카운트업, 작업 중지 기능
- **Sentence-Boundary Snapping & 침묵 분석:** FFmpeg/FFprobe 기반으로 실제 음성의 시작·종료 및 앞뒤 무음을 밀리초 단위로 측정하여 문장 사이에 자연스러운 숨(Gap) 자동 배치
- **실제 시간 기반 대본 보정:** 생성된 실제 음성 길이와 목표 러닝타임(30~60분)의 오차를 분석하여 대본을 선택적으로 보정

### 4단계: 시각 설계 & AI 생성 (Visual Studio)
- **비주얼 바이블 기준팩:** 핵심 캐릭터(앞모습·옆모습·표정), 중요 장소, 핵심 오브제의 시각 기준을 먼저 고정
- **동적 카메라 & 모션 연출:**
  - **도입부 첫 60초:** Higgsfield 영상 모델(`Seedance 2.0 Fast / Seedance 2.5`)을 통한 역동적인 10개 도입 시네마틱 씬 생성 (캐릭터 시트 주입으로 얼굴·복식 일관성 유지)
  - **본편 삽화:** `Seedream 5.0 Flash / Pro`를 통한 고화질 한복 반실사 삽화 생성
  - **2.5D 패럴랙스 및 포토 모션:** 이미지 컷에 시네마틱 줌인/팬 모션 자동 적용
- **일괄 생성(Batch) 및 모델 선택:** 인물·배경·오브제·영상별 최적 모델을 선택하여 백그라운드 일괄 생성

### 5단계: 영상 렌더링 & 다운로드 (Render Studio)
- **Remotion 기반 고화질(1080p, 30fps) 합성:**
  - 음성 호흡에 맞춘 가변 배속(`playbackRate`) 및 컷 전환 크로스페이드(디졸브) 적용
  - 대사 잘림 방지 (무음 갭 구간에만 컷 전환)
- **미리보기 & 전체 렌더링 지원:**
  - 첫 60초 빠른 검수용 미리보기 렌더링
  - 전체 러닝타임 풀버전 MP4 렌더링 및 원클릭 다운로드

---

## 🚀 빠른 시작 가이드

### 1. 요구 사항
- **Node.js:** `v22.5.0` 이상
- **패키지 매니저:** `pnpm`
- **미디어 도구:** `ffmpeg`, `ffprobe` (시스템 PATH에 설치되어 있어야 함)
- **TTS 엔진 (선택):** [Pinokio](https://pinokio.computer/) `Qwen3-TTS` 앱 실행 권장 (미실행 시 글자 수 기반 예상 타이밍으로 동작)

### 2. 설치
```bash
# 저장소 복제 및 의존성 설치
pnpm install
```

### 3. 환경 변수 설정
프로젝트 루트에 `.env` 파일을 생성하고 필요한 값을 입력합니다:

```bash
cp .env.example .env
```

`.env` 설정 예시:
```env
# 장편 집필 LLM (OpenAI 호환 API)
LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=your_openai_api_key_here
LLM_MODEL=gpt-4o

# (선택) Pinokio Qwen3-TTS 설정 (기본값)
QWEN_TTS_BASE_URL=http://127.0.0.1:7860
QWEN_TTS_SPEAKER=Sohee
QWEN_TTS_MODEL_SIZE=1.7B
QWEN_TTS_SEED=42

# (선택) Higgsfield API / CLI
HIGGSFIELD_API_KEY=your_higgsfield_api_key_here
```

### 4. 개발 서버 실행
```bash
pnpm dev
```
- **웹 UI:** `http://127.0.0.1:4318`
- **로컬 API 서버:** `http://127.0.0.1:4317`

---

## 🛠️ 검증 및 빌드 명령어

```bash
# 단위 테스트 실행 (24개 파일, 65개 테스트)
pnpm test

# TypeScript 타입 점검
pnpm typecheck

# 프로덕션 빌드
pnpm build

# Remotion 독립 스튜디오 실행
pnpm studio
```

---

## 📂 프로젝트 구조

```text
├── audio-library/      # BGM, 환경음, 효과음 공용 카탈로그
├── outputs/            # 내보낸 대본, 프롬프트 요약 문서 저장 폴더
├── src/
│   ├── client/         # React 19 기반 웹 UI (스튜디오 인터페이스)
│   ├── remotion/       # Remotion 비디오 컴포지션 및 트랜지션
│   ├── server/         # Express API, SQLite 저장소, LLM/TTS/Higgsfield 파이프라인
│   └── shared/         # 공용 타입 및 프리셋 정의
├── tests/              # Vitest 기반 단위/통합 테스트
├── data/               # (로컬 실행 시 생성) SQLite 데이터베이스
└── projects/           # (로컬 실행 시 생성) 프로젝트별 음성/이미지/영상 에셋
```

---

## 🔒 데이터 보안 및 로컬 저장
- 프로젝트 데이터와 생성된 음성·영상 파일은 로컬 머신(`data/`, `projects/`)에만 저장되며 외부 저장소에 커밋되지 않습니다.
- 프로젝트 목록 화면에서 언제든지 프로젝트 데이터를 JSON 형식으로 내보내거나 가져올 수 있습니다.

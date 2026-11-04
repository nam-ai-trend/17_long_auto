import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {describe, expect, it, vi} from 'vitest';
import {StrategyInterview} from '../src/client/components/StrategyInterview';
import {api} from '../src/client/api';

vi.mock('../src/client/api', () => ({
  api: {
    interviewNextQuestion: vi.fn(),
    interviewSummary: vi.fn(),
  },
}));

describe('StrategyInterview', () => {
  it('큰 주제와 세부 소재를 설정하고 AI 맞춤 질문에 따라 의견을 덧붙이며 완료한다', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();

    vi.mocked(api.interviewNextQuestion)
      .mockResolvedValueOnce({
        step: 1,
        totalSteps: 2,
        category: '인물과 동기',
        question: '어떤 주인공이 사건을 시작하나요?',
        suggestions: [
          {label: '손재주 좋은 장인', detail: '비밀 도구를 만듭니다.', recommended: true},
          {label: '몰락한 양반', detail: '가문의 명예를 찾으려 합니다.'},
        ],
      })
      .mockResolvedValueOnce({
        step: 2,
        totalSteps: 2,
        category: '반전과 결말',
        question: '결말은 어떻게 맺어지나요?',
        suggestions: [
          {label: '비밀 장부 폭로', detail: '사람들 앞에서 밝혀집니다.', recommended: true},
        ],
      });

    vi.mocked(api.interviewSummary).mockResolvedValueOnce({
      title: '장인의 비밀 도구',
      summary: '손재주 좋은 장인이 비밀 장부를 폭로하는 이야기다.',
      strategy: '초반 도구 제작, 후반 공개 폭로의 3막 구성.',
    });

    render(<StrategyInterview onComplete={onComplete} />);

    // 1단계: 테마 선택 화면 확인
    expect(screen.getByText('어떤 색깔의 야담을 만들고 싶으신가요?')).toBeVisible();
    expect(screen.getByText('권선징악 & 사이다 복수')).toBeVisible();

    // 세부 소재 입력
    const topicTextarea = screen.getByPlaceholderText(/과거 시험장에서 답안지가 뒤바뀐/);
    await user.type(topicTextarea, '비밀 장부를 숨긴 상자');

    // 맞춤 질문 시작
    await user.click(screen.getByRole('button', {name: /맞춤 질문 시작하기/}));

    // 2단계: 첫 번째 질문 도착 확인
    expect(await screen.findByText('어떤 주인공이 사건을 시작하나요?')).toBeVisible();
    expect(screen.getByText('인물과 동기')).toBeVisible();

    // 추천 보기 클릭 시 의견창에 자동 반영 확인
    const opinionTextarea = screen.getByPlaceholderText(/추천 선택지를 누르거나/);
    expect(opinionTextarea).toHaveValue('손재주 좋은 장인 — 비밀 도구를 만듭니다.');

    // 사용자가 직접 의견 덧붙이기
    await user.type(opinionTextarea, ' - 특히 자물쇠를 잘 땁니다.');
    expect(opinionTextarea).toHaveValue(
      '손재주 좋은 장인 — 비밀 도구를 만듭니다. - 특히 자물쇠를 잘 땁니다.',
    );

    // 다음 질문으로
    await user.click(screen.getByRole('button', {name: /다음 질문으로/}));

    // 3단계: 두 번째 질문 도착 확인
    expect(await screen.findByText('결말은 어떻게 맺어지나요?')).toBeVisible();

    // 마지막 질문에서 '전략 완성하기' 클릭
    await user.click(screen.getByRole('button', {name: /전략 완성하기/}));

    // 완료 콜백 호출 확인
    expect(onComplete).toHaveBeenCalledOnce();
    expect(onComplete.mock.calls[0][0].title).toBe('장인의 비밀 도구');
    expect(onComplete.mock.calls[0][0].summary).toContain('비밀 장부를 폭로');
    expect(onComplete.mock.calls[0][0].strategy).toContain('공개 폭로');
  });
});

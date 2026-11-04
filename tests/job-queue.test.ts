import {describe, expect, it} from 'vitest';
import {createDatabase} from '../src/server/database';
import {JobQueue} from '../src/server/job-queue';

describe('local job queue', () => {
  it('대기 작업을 실행하고 성공 상태로 끝낸다', () => {
    const queue = new JobQueue(createDatabase(':memory:'));
    const queued = queue.enqueue('project-1', 'mock-tts', 'hash-a');
    const running = queue.claimNext();

    expect(queued.status).toBe('queued');
    expect(running?.status).toBe('running');
    expect(running?.attempt).toBe(1);
    expect(queue.succeed(queued.id).status).toBe('succeeded');
  });

  it('실패 작업만 다시 대기 상태로 돌린다', () => {
    const queue = new JobQueue(createDatabase(':memory:'));
    const queued = queue.enqueue('project-1', 'image-plan', 'hash-b');
    queue.claimNext();
    queue.fail(queued.id, '참조 이미지가 없습니다.');

    const retried = queue.retry(queued.id);
    expect(retried.status).toBe('queued');
    expect(retried.error).toBeNull();
  });

  it('같은 입력의 성공 결과를 중복 생성하지 않는다', () => {
    const queue = new JobQueue(createDatabase(':memory:'));
    const first = queue.enqueue('project-1', 'mock-tts', 'same-hash');
    queue.claimNext();
    queue.succeed(first.id);

    const reused = queue.enqueue('project-1', 'mock-tts', 'same-hash');
    expect(reused.id).toBe(first.id);
    expect(reused.status).toBe('succeeded');
  });

  it('앱 재시작 시 실행 중 작업을 다시 대기 상태로 복구한다', () => {
    const queue = new JobQueue(createDatabase(':memory:'));
    queue.enqueue('project-1', 'render-preview', 'hash-c');
    queue.claimNext();

    expect(queue.recoverInterrupted()).toBe(1);
    expect(queue.list('project-1')[0].status).toBe('queued');
  });

  it('지정한 문장 작업만 실행 상태로 바꾼다', () => {
    const queue = new JobQueue(createDatabase(':memory:'));
    const first = queue.enqueue('project-1', 'tts:cue-001', 'hash-1');
    const second = queue.enqueue('project-1', 'tts:cue-002', 'hash-2');

    expect(queue.claim(second.id).id).toBe(second.id);
    expect(queue.list('project-1').find((job) => job.id === first.id)?.status).toBe('queued');
  });
});

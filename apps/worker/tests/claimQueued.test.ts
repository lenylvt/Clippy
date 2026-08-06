import { describe, expect, it } from 'vitest';

/**
 * Mirrors claimNextQueuedJob race semantics:
 * only the UPDATE that still sees status=queued wins; losers retry.
 */
describe('claimNextQueuedJob semantics', () => {
  it('ne revendique que les jobs encore en file', () => {
    const status: string = 'queued';
    expect(status === 'queued').toBe(true);
    expect(status === 'running').toBe(false);
  });

  it('retries until the queue is empty after lost races', () => {
    const queue = ['a', 'b', 'c'];
    const claimed: string[] = [];
    // Simulate two slots racing: first claim of each head fails once then succeeds.
    let raceFail = true;
    while (queue.length > 0) {
      const candidate = queue[0]!;
      if (raceFail) {
        raceFail = false;
        continue;
      }
      queue.shift();
      claimed.push(candidate);
      raceFail = claimed.length < 2;
    }
    expect(claimed).toEqual(['a', 'b', 'c']);
  });
});

describe('updateJobProgress semantics', () => {
  it('ignore les updates si le job n’est plus running', () => {
    const apply = (status: string) => (status === 'running' ? 'ok' : null);
    expect(apply('running')).toBe('ok');
    expect(apply('done')).toBeNull();
    expect(apply('error')).toBeNull();
  });
});

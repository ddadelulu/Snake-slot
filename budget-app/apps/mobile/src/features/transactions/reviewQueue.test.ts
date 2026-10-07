import { mergeQueue, nextOpenPosition } from './reviewQueue';

const a = { id: 'a' };
const b = { id: 'b' };
const c = { id: 'c' };
const d = { id: 'd' };

describe('mergeQueue', () => {
  it('takes the first load as it is', () => {
    expect(mergeQueue(null, [a, b])).toEqual([a, b]);
  });

  it('keeps the order and adds only transactions it has not seen, at the end', () => {
    expect(mergeQueue([a, b, c], [b, d, c])).toEqual([a, b, c, d]);
    expect(mergeQueue([a, b], [b])).toEqual([a, b]);
  });
});

describe('nextOpenPosition', () => {
  it('passes over transactions that no longer need review', () => {
    const queue = [a, b, c, d];
    expect(nextOpenPosition(queue, 1, new Set(['a', 'b', 'c', 'd']))).toBe(1);
    expect(nextOpenPosition(queue, 1, new Set(['d']))).toBe(3);
    expect(nextOpenPosition(queue, 0, new Set())).toBe(4);
  });
});

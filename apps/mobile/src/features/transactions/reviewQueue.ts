/**
 * The review questions (US-3.3) are asked one at a time. The order is fixed when the list first
 * loads, so answering one does not reshuffle the others; transactions that show up later (the
 * next page, or ones moved up after an answer) are added at the end.
 */
export function mergeQueue<T extends { id: string }>(
  queue: readonly T[] | null,
  loaded: readonly T[],
): T[] {
  if (queue === null) return [...loaded];
  const known = new Set(queue.map((item) => item.id));
  const added = loaded.filter((item) => !known.has(item.id));
  return added.length > 0 ? [...queue, ...added] : [...queue];
}

/**
 * The position of the next question from `index` on, passing over transactions that no longer
 * need review (a rule answered earlier placed them). Returns `queue.length` when none is left.
 */
export function nextOpenPosition<T extends { id: string }>(
  queue: readonly T[],
  index: number,
  open: ReadonlySet<string>,
): number {
  let position = index;
  while (position < queue.length && !open.has(queue[position]?.id ?? '')) position += 1;
  return position;
}

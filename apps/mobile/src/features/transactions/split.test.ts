import {
  MIN_SPLIT_PARTS,
  assignedRappen,
  checkSplit,
  newSplitPart,
  partsFromSplits,
  remainingRappen,
  removePart,
  startSplit,
  updatePart,
} from './split';

describe('split drafts', () => {
  it('starts with two parts, the first in the current category', () => {
    const parts = startSplit('c-groceries');
    expect(parts).toHaveLength(MIN_SPLIT_PARTS);
    expect(parts[0]).toMatchObject({ categoryId: 'c-groceries', amountText: '' });
    expect(parts[1]).toMatchObject({ categoryId: null, amountText: '' });
    expect(parts[0]?.key).not.toBe(parts[1]?.key);
  });

  it('prefills an existing split with sizes and notes', () => {
    const parts = partsFromSplits([
      { id: 's-1', categoryId: 'c-groceries', amountRappen: -6400, note: 'Food' },
      { id: 's-2', categoryId: 'c-gifts', amountRappen: -2000, note: null },
    ]);
    expect(
      parts.map(({ categoryId, amountText, note }) => ({ categoryId, amountText, note })),
    ).toEqual([
      { categoryId: 'c-groceries', amountText: '64.00', note: 'Food' },
      { categoryId: 'c-gifts', amountText: '20.00', note: null },
    ]);
  });

  it('updates one part by key and never removes below two parts', () => {
    const parts = [newSplitPart(), newSplitPart(), newSplitPart()];
    const [first, second, third] = parts;
    const changed = updatePart(parts, second?.key ?? '', { amountText: '20' });
    expect(changed[1]?.amountText).toBe('20');
    expect(changed[0]).toBe(first);
    const two = removePart(parts, third?.key ?? '');
    expect(two).toHaveLength(2);
    expect(removePart(two, first?.key ?? '')).toHaveLength(2);
  });

  it('adds up what is assigned and what is left, ignoring parts that cannot be read', () => {
    const parts = [
      newSplitPart(null, '64'),
      newSplitPart(null, 'abc'),
      newSplitPart(null, '10.50'),
    ];
    expect(assignedRappen(parts)).toBe(7450);
    expect(remainingRappen(8400, parts)).toBe(950);
    expect(remainingRappen(7000, parts)).toBe(-450);
  });
});

describe('checkSplit', () => {
  it('returns the parts with the transaction’s sign when they add up exactly', () => {
    const parts = [newSplitPart('c-groceries', '64', 'Food'), newSplitPart('c-gifts', '20')];
    expect(checkSplit(8400, -1, parts)).toEqual({
      ok: true,
      parts: [
        { categoryId: 'c-groceries', amountRappen: -6400, note: 'Food' },
        { categoryId: 'c-gifts', amountRappen: -2000, note: null },
      ],
    });
    expect(checkSplit(8400, 1, parts)).toMatchObject({
      ok: true,
      parts: [{ amountRappen: 6400 }, { amountRappen: 2000 }],
    });
  });

  it('needs at least two parts', () => {
    expect(checkSplit(8400, -1, [newSplitPart('c-groceries', '84')])).toMatchObject({
      ok: false,
      problem: 'too_few',
    });
  });

  it('names the parts without a category or a readable amount', () => {
    const missing = newSplitPart(null, '64');
    const bad = newSplitPart('c-gifts', 'x');
    const result = checkSplit(8400, -1, [missing, bad]);
    expect(result).toEqual({
      ok: false,
      problem: 'parts',
      partProblems: {
        [missing.key]: { category: 'required' },
        [bad.key]: { amount: 'invalid' },
      },
    });
  });

  it('refuses parts that do not add up to the total', () => {
    const parts = [newSplitPart('c-groceries', '64'), newSplitPart('c-gifts', '19.95')];
    expect(checkSplit(8400, -1, parts)).toEqual({
      ok: false,
      problem: 'not_exact',
      partProblems: {},
    });
  });
});

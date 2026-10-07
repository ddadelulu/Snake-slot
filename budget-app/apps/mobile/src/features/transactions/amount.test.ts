import { parseAmountInput, rappenToInput } from './amount';

describe('parseAmountInput', () => {
  it.each([
    ['12', 1200],
    ['12.5', 1250],
    ['12,50', 1250],
    ["1'240.50", 124050],
    ['1’240', 124000],
    ['12.–', 1200],
    ['  4.40 ', 440],
    ['.50', 50],
  ])('reads "%s" as %i Rappen', (text, rappen) => {
    expect(parseAmountInput(text)).toEqual({ ok: true, rappen });
  });

  it('asks for an amount when the field is empty', () => {
    expect(parseAmountInput('')).toEqual({ ok: false, problem: 'required' });
    expect(parseAmountInput('   ')).toEqual({ ok: false, problem: 'required' });
  });

  it.each(['abc', '0', '0.00', '-12', '+12', '12.505', '1,2,3'])('refuses "%s"', (text) => {
    expect(parseAmountInput(text)).toEqual({ ok: false, problem: 'invalid' });
  });
});

describe('rappenToInput', () => {
  it.each([
    [1250, '12.50'],
    [-124050, '1240.50'],
    [5, '0.05'],
    [100, '1.00'],
  ])('%i becomes "%s", which reads back the same size', (rappen, text) => {
    expect(rappenToInput(rappen)).toBe(text);
    expect(parseAmountInput(text)).toEqual({ ok: true, rappen: Math.abs(rappen) });
  });
});

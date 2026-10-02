import { describe, expect, it } from 'vitest';

import * as core from '../index';
import * as cover from './cover';
import * as dates from './dates';
import * as engine from './index';
import * as hours from './hours';
import * as integer from './integer';
import * as leftover from './leftover';
import * as overview from './overview';
import * as pace from './pace';
import * as period from './period';
import * as plan from './plan';
import * as suggest from './suggest';

describe('engine exports', () => {
  it('re-exports every engine module, and the package re-exports the engine', () => {
    const modules = [dates, period, leftover, integer, plan, suggest, pace, overview, hours, cover];
    const expected = modules.flatMap((module) => Object.keys(module)).sort();
    expect(Object.keys(engine).sort()).toEqual(expected);
    for (const name of expected) {
      expect(core).toHaveProperty(name, (engine as Record<string, unknown>)[name]);
    }
  });

  it('keeps the functions the database parity tests import from @budget/core', () => {
    expect(core.periodContaining('2026-10-02', 25)).toEqual({
      startsOn: '2026-09-25',
      endsOn: '2026-10-25',
    });
    expect(core.settleLeftover('savings', 1500).toSavingsRappen).toBe(1500);
    expect(core.localDateIn(new Date('2026-10-24T22:30:00Z'), 'Europe/Zurich')).toBe('2026-10-25');
  });

  it('exposes the budget engine API', () => {
    for (const name of [
      'spendableOf',
      'sumFixedCosts',
      'checkAllocation',
      'suggestBudgets',
      'forecastPace',
      'buildOverview',
      'minutesOfWork',
      'coverOverspend',
      'ceilDiv',
    ]) {
      expect(typeof (core as Record<string, unknown>)[name]).toBe('function');
    }
  });
});

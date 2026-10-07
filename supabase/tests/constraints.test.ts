/**
 * Domain constraints: money bounds, currency, value ranges, category naming, rule shape, budget
 * periods and data-source consent. Writes run as the signed-in owner, like the app's would
 * (budget periods as the owner role: clients cannot write them, D-036).
 */
import { MAX_ABS_RAPPEN } from '@budget/core';
import { describe, expect, it } from 'vitest';
import {
  type Db,
  type Row,
  SQLSTATE,
  type SqlState,
  asPostgres,
  asUser,
  attempt,
  createUser,
  make,
  queryOne,
  quoteTable,
  withRollback,
} from './db';

/** What a statement led to: OK, or the SQLSTATE it failed with. */
const OK = 'ok';
type Outcome = typeof OK | SqlState | string;

/** Inserts a row as the current role; returns OK or the SQLSTATE of the failure. */
async function tryInsert(db: Db, table: string, values: Row): Promise<Outcome> {
  const columns = Object.keys(values);
  const outcome = await attempt(
    db,
    `insert into ${quoteTable(table)} (${columns.join(', ')})
     values (${columns.map((_, i) => `$${i + 1}`).join(', ')})`,
    Object.values(values),
  );
  return outcome.ok ? OK : (outcome.error.code ?? 'unknown');
}

/** Updates the user's own profile; returns OK or the SQLSTATE of the failure. */
async function tryProfileUpdate(db: Db, userId: string, values: Row): Promise<Outcome> {
  const columns = Object.keys(values);
  const outcome = await attempt(
    db,
    `update public.profiles set ${columns.map((c, i) => `${c} = $${i + 2}`).join(', ')} where id = $1`,
    [userId, ...Object.values(values)],
  );
  return outcome.ok ? OK : (outcome.error.code ?? 'unknown');
}

/** Runs `fn` as a fresh signed-in user. */
function asNewUser(fn: (db: Db, user: string) => Promise<void>): Promise<void> {
  return withRollback(async (db) => {
    const user = await createUser(db);
    await asUser(db, user);
    await fn(db, user);
  });
}

function transactionRow(user: string, values: Row): Row {
  return {
    user_id: user,
    booked_at: '2026-10-01T10:00:00Z',
    source: 'manual',
    amount_rappen: -100,
    ...values,
  };
}

describe('money', () => {
  it.each([MAX_ABS_RAPPEN, -MAX_ABS_RAPPEN, 1, -1])(
    'a transaction of %i Rappen is accepted',
    async (amount) => {
      await asNewUser(async (db, user) => {
        expect(
          await tryInsert(
            db,
            'public.transactions',
            transactionRow(user, { amount_rappen: amount }),
          ),
        ).toBe(OK);
      });
    },
  );

  it.each([MAX_ABS_RAPPEN + 1, -MAX_ABS_RAPPEN - 1, 0])(
    'a transaction of %i Rappen is rejected (23514)',
    async (amount) => {
      await asNewUser(async (db, user) => {
        expect(
          await tryInsert(
            db,
            'public.transactions',
            transactionRow(user, { amount_rappen: amount }),
          ),
        ).toBe(SQLSTATE.checkViolation);
      });
    },
  );

  it.each([
    [0, OK],
    [MAX_ABS_RAPPEN, OK],
    [MAX_ABS_RAPPEN + 1, SQLSTATE.checkViolation],
    [-1, SQLSTATE.checkViolation],
  ])('a budget of %i Rappen gives %s', async (amount, expected) => {
    await withRollback(async (db) => {
      const user = await createUser(db);
      const period = await make.period(db, user);
      const category = await make.category(db, user);
      await asUser(db, user);
      expect(
        await tryInsert(db, 'public.budgets', {
          user_id: user,
          period_id: period,
          category_id: category,
          amount_rappen: amount,
        }),
      ).toBe(expected);
    });
  });

  it.each([
    [-MAX_ABS_RAPPEN, OK],
    [-MAX_ABS_RAPPEN - 1, SQLSTATE.checkViolation],
  ])('a budget rollover of %i Rappen gives %s', async (rollover, expected) => {
    await withRollback(async (db) => {
      const user = await createUser(db);
      const period = await make.period(db, user);
      const category = await make.category(db, user);
      await asUser(db, user);
      expect(
        await tryInsert(db, 'public.budgets', {
          user_id: user,
          period_id: period,
          category_id: category,
          amount_rappen: 0,
          rollover_rappen: rollover,
        }),
      ).toBe(expected);
    });
  });

  it('a negative fixed cost is rejected (23514)', async () => {
    await asNewUser(async (db, user) => {
      expect(
        await tryInsert(db, 'public.fixed_costs', {
          user_id: user,
          kind: 'rent',
          amount_rappen: -1,
        }),
      ).toBe(SQLSTATE.checkViolation);
    });
  });

  it.each([
    [MAX_ABS_RAPPEN, OK],
    [MAX_ABS_RAPPEN + 1, SQLSTATE.checkViolation],
    [-1, SQLSTATE.checkViolation],
  ])('a net income of %i Rappen gives %s', async (income, expected) => {
    await asNewUser(async (db, user) => {
      expect(await tryProfileUpdate(db, user, { net_income_rappen: income })).toBe(expected);
    });
  });

  it.each([
    [MAX_ABS_RAPPEN + 1, SQLSTATE.checkViolation],
    [0, SQLSTATE.checkViolation],
  ])('a split part of %i Rappen gives %s', async (amount, expected) => {
    await asNewUser(async (db, user) => {
      const tx = await make.transaction(db, user);
      expect(
        await tryInsert(db, 'public.transaction_splits', {
          user_id: user,
          transaction_id: tx,
          amount_rappen: amount,
        }),
      ).toBe(expected);
    });
  });
});

describe('transactions', () => {
  it('currency CHF is the default', async () => {
    await asNewUser(async (db, user) => {
      const tx = await make.transaction(db, user);
      const row = await queryOne<{ currency: string }>(
        db,
        'select currency from public.transactions where id = $1',
        [tx],
      );
      expect(row.currency).toBe('CHF');
    });
  });

  it('a currency other than CHF is rejected (23514)', async () => {
    await asNewUser(async (db, user) => {
      expect(
        await tryInsert(db, 'public.transactions', transactionRow(user, { currency: 'EUR' })),
      ).toBe(SQLSTATE.checkViolation);
    });
  });

  it('an original amount with its currency is accepted', async () => {
    await asNewUser(async (db, user) => {
      expect(
        await tryInsert(
          db,
          'public.transactions',
          transactionRow(user, { original_amount_minor: -1_099, original_currency: 'EUR' }),
        ),
      ).toBe(OK);
    });
  });

  it('an original amount without its currency is rejected (23514)', async () => {
    await asNewUser(async (db, user) => {
      expect(
        await tryInsert(
          db,
          'public.transactions',
          transactionRow(user, { original_amount_minor: -1_099 }),
        ),
      ).toBe(SQLSTATE.checkViolation);
    });
  });

  it('an original currency without its amount is rejected (23514)', async () => {
    await asNewUser(async (db, user) => {
      expect(
        await tryInsert(
          db,
          'public.transactions',
          transactionRow(user, { original_currency: 'EUR' }),
        ),
      ).toBe(SQLSTATE.checkViolation);
    });
  });

  it('an original currency that is not three capital letters is rejected (23514)', async () => {
    await asNewUser(async (db, user) => {
      expect(
        await tryInsert(
          db,
          'public.transactions',
          transactionRow(user, { original_amount_minor: -1_099, original_currency: 'eur' }),
        ),
      ).toBe(SQLSTATE.checkViolation);
    });
  });

  it.each([
    [0, OK],
    [5411, OK],
    [9999, OK],
    [-1, SQLSTATE.checkViolation],
    [10000, SQLSTATE.checkViolation],
  ])('mcc %i gives %s', async (mcc, expected) => {
    await asNewUser(async (db, user) => {
      expect(await tryInsert(db, 'public.transactions', transactionRow(user, { mcc }))).toBe(
        expected,
      );
    });
  });

  it('a transaction cannot be merged into itself (23514)', async () => {
    await asNewUser(async (db, user) => {
      const tx = await make.transaction(db, user);
      const outcome = await attempt(
        db,
        'update public.transactions set merged_into_id = id where id = $1',
        [tx],
      );
      expect(outcome.ok ? OK : outcome.error.code).toBe(SQLSTATE.checkViolation);
    });
  });
});

describe('profiles', () => {
  it.each([
    [1, OK],
    [31, OK],
    [0, SQLSTATE.checkViolation],
    [32, SQLSTATE.checkViolation],
  ])('payday %i gives %s', async (payday, expected) => {
    await asNewUser(async (db, user) => {
      expect(await tryProfileUpdate(db, user, { payday })).toBe(expected);
    });
  });

  it.each([
    [60, OK],
    [2_550, OK],
    [6_720, OK],
    [59, SQLSTATE.checkViolation],
    [6_721, SQLSTATE.checkViolation],
  ])('weekly_work_minutes %i gives %s', async (minutes, expected) => {
    await asNewUser(async (db, user) => {
      expect(await tryProfileUpdate(db, user, { weekly_work_minutes: minutes })).toBe(expected);
    });
  });

  it('payment methods from the list are accepted', async () => {
    await asNewUser(async (db, user) => {
      expect(await tryProfileUpdate(db, user, { payment_methods: ['twint', 'card', 'cash'] })).toBe(
        OK,
      );
    });
  });

  it('a payment method outside the list is rejected (23514)', async () => {
    await asNewUser(async (db, user) => {
      expect(await tryProfileUpdate(db, user, { payment_methods: ['twint', 'paypal'] })).toBe(
        SQLSTATE.checkViolation,
      );
    });
  });

  it('a language outside the list is rejected (23514)', async () => {
    await asNewUser(async (db, user) => {
      expect(await tryProfileUpdate(db, user, { language: 'fr' })).toBe(SQLSTATE.checkViolation);
    });
  });
});

describe('categories', () => {
  it('a category needs a default_key or a name (23514)', async () => {
    await asNewUser(async (db, user) => {
      expect(await tryInsert(db, 'public.categories', { user_id: user, icon: 'star' })).toBe(
        SQLSTATE.checkViolation,
      );
    });
  });

  it('a default category without a name is accepted', async () => {
    await asNewUser(async (db, user) => {
      expect(
        await tryInsert(db, 'public.categories', { user_id: user, default_key: 'groceries' }),
      ).toBe(OK);
    });
  });

  it('the same default_key twice for one user is rejected (23505)', async () => {
    await asNewUser(async (db, user) => {
      await make.category(db, user, { name: null, default_key: 'eating_out' });
      expect(
        await tryInsert(db, 'public.categories', { user_id: user, default_key: 'eating_out' }),
      ).toBe(SQLSTATE.uniqueViolation);
    });
  });

  it('two users may both have the same default_key', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      const b = await createUser(db);
      await make.category(db, a, { name: null, default_key: 'eating_out' });
      await asUser(db, b);
      expect(
        await tryInsert(db, 'public.categories', { user_id: b, default_key: 'eating_out' }),
      ).toBe(OK);
    });
  });

  it('a custom name that differs only in case and spaces is rejected (23505)', async () => {
    await asNewUser(async (db, user) => {
      await make.category(db, user, { name: 'Velo' });
      expect(await tryInsert(db, 'public.categories', { user_id: user, name: '  vELO ' })).toBe(
        SQLSTATE.uniqueViolation,
      );
    });
  });

  it('a custom name may be reused once the earlier category is archived', async () => {
    await asNewUser(async (db, user) => {
      await make.category(db, user, { name: 'Velo', archived_at: '2026-09-01T00:00:00Z' });
      expect(await tryInsert(db, 'public.categories', { user_id: user, name: 'velo' })).toBe(OK);
    });
  });

  it('a blank name is rejected (23514)', async () => {
    await asNewUser(async (db, user) => {
      expect(await tryInsert(db, 'public.categories', { user_id: user, name: '   ' })).toBe(
        SQLSTATE.checkViolation,
      );
    });
  });
});

describe('categorization rules', () => {
  async function tryRule(db: Db, user: string, values: Row): Promise<Outcome> {
    await asPostgres(db);
    const category = await make.category(db, user);
    await asUser(db, user);
    return tryInsert(db, 'public.categorization_rules', {
      user_id: user,
      category_id: category,
      ...values,
    });
  }

  it('an mcc rule with four digits and match type equals is accepted', async () => {
    await asNewUser(async (db, user) => {
      expect(
        await tryRule(db, user, { match_field: 'mcc', match_type: 'equals', pattern: '5411' }),
      ).toBe(OK);
    });
  });

  it.each([
    ['contains', '5411'],
    ['equals', '541'],
    ['equals', '54111'],
    ['equals', 'abcd'],
  ])(
    'an mcc rule with match type %s and pattern %s is rejected (23514)',
    async (matchType, pattern) => {
      await asNewUser(async (db, user) => {
        expect(
          await tryRule(db, user, { match_field: 'mcc', match_type: matchType, pattern }),
        ).toBe(SQLSTATE.checkViolation);
      });
    },
  );

  it('a merchant rule may use contains with any text', async () => {
    await asNewUser(async (db, user) => {
      expect(
        await tryRule(db, user, {
          match_field: 'merchant',
          match_type: 'contains',
          pattern: 'Manor',
        }),
      ).toBe(OK);
    });
  });

  it('the same rule twice (case and spaces aside) is rejected (23505)', async () => {
    await asNewUser(async (db, user) => {
      await tryRule(db, user, { match_field: 'merchant', match_type: 'equals', pattern: 'Coop' });
      expect(
        await tryRule(db, user, {
          match_field: 'merchant',
          match_type: 'equals',
          pattern: ' coop ',
        }),
      ).toBe(SQLSTATE.uniqueViolation);
    });
  });
});

describe('budget periods', () => {
  /**
   * Runs `fn` with a fresh user while acting as the owner role: clients cannot write periods
   * (D-036), onboarding and the payday reset write them with owner rights.
   */
  function asOwnerForNewUser(fn: (db: Db, user: string) => Promise<void>): Promise<void> {
    return withRollback(async (db) => {
      const user = await createUser(db);
      await fn(db, user);
    });
  }

  function period(user: string, startsOn: string, endsOn: string, values: Row = {}): Row {
    return {
      user_id: user,
      starts_on: startsOn,
      ends_on: endsOn,
      income_rappen: 500_000,
      fixed_costs_rappen: 200_000,
      savings_rappen: 0,
      ...values,
    };
  }

  it('an overlapping period for the same user is rejected (23P01)', async () => {
    await asOwnerForNewUser(async (db, user) => {
      expect(
        await tryInsert(db, 'public.budget_periods', period(user, '2026-09-25', '2026-10-25')),
      ).toBe(OK);
      expect(
        await tryInsert(db, 'public.budget_periods', period(user, '2026-10-24', '2026-11-25')),
      ).toBe(SQLSTATE.exclusionViolation);
    });
  });

  it('the next period may start on the day the previous one ends (ends_on is exclusive)', async () => {
    await asOwnerForNewUser(async (db, user) => {
      expect(
        await tryInsert(db, 'public.budget_periods', period(user, '2026-09-25', '2026-10-25')),
      ).toBe(OK);
      expect(
        await tryInsert(db, 'public.budget_periods', period(user, '2026-10-25', '2026-11-25')),
      ).toBe(OK);
    });
  });

  it('periods of different users may overlap', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      const b = await createUser(db);
      await make.period(db, a, { starts_on: '2026-09-25', ends_on: '2026-10-25' });
      expect(
        await tryInsert(db, 'public.budget_periods', period(b, '2026-09-25', '2026-10-25')),
      ).toBe(OK);
    });
  });

  it.each([
    ['equal to', '2026-09-25'],
    ['before', '2026-09-24'],
  ])('ends_on %s starts_on is rejected (23514)', async (_label, endsOn) => {
    await asOwnerForNewUser(async (db, user) => {
      expect(await tryInsert(db, 'public.budget_periods', period(user, '2026-09-25', endsOn))).toBe(
        SQLSTATE.checkViolation,
      );
    });
  });

  it('a closed period with closed_at, leftover_action and leftover_rappen is accepted', async () => {
    await asOwnerForNewUser(async (db, user) => {
      expect(
        await tryInsert(
          db,
          'public.budget_periods',
          period(user, '2026-08-25', '2026-09-25', {
            closed_at: '2026-09-25T00:00:00Z',
            leftover_action: 'savings',
            leftover_rappen: 12_345,
          }),
        ),
      ).toBe(OK);
    });
  });

  it.each([
    ['only closed_at', { closed_at: '2026-09-25T00:00:00Z' }],
    ['only leftover_action', { leftover_action: 'rollover' }],
    ['only leftover_rappen', { leftover_rappen: 100 }],
    [
      'closed_at and leftover_action',
      { closed_at: '2026-09-25T00:00:00Z', leftover_action: 'reset' },
    ],
  ])('a period with %s is rejected (23514)', async (_label, closing) => {
    await asOwnerForNewUser(async (db, user) => {
      expect(
        await tryInsert(
          db,
          'public.budget_periods',
          period(user, '2026-08-25', '2026-09-25', closing),
        ),
      ).toBe(SQLSTATE.checkViolation);
    });
  });
});

describe('data sources', () => {
  function source(user: string, values: Row): Row {
    return { user_id: user, kind: 'bank', consent_version: 'v1', ...values };
  }

  it('status revoked with consent_revoked_at is accepted', async () => {
    await asNewUser(async (db, user) => {
      expect(
        await tryInsert(
          db,
          'public.data_sources',
          source(user, { status: 'revoked', consent_revoked_at: '2026-10-01T08:00:00Z' }),
        ),
      ).toBe(OK);
    });
  });

  it('status revoked without consent_revoked_at is rejected (23514)', async () => {
    await asNewUser(async (db, user) => {
      expect(await tryInsert(db, 'public.data_sources', source(user, { status: 'revoked' }))).toBe(
        SQLSTATE.checkViolation,
      );
    });
  });

  it('consent_revoked_at on a source that is not revoked is rejected (23514)', async () => {
    await asNewUser(async (db, user) => {
      expect(
        await tryInsert(
          db,
          'public.data_sources',
          source(user, { status: 'active', consent_revoked_at: '2026-10-01T08:00:00Z' }),
        ),
      ).toBe(SQLSTATE.checkViolation);
    });
  });

  it('revoking an active source without setting consent_revoked_at is rejected (23514)', async () => {
    await asNewUser(async (db, user) => {
      const id = await make.dataSource(db, user, { status: 'active' });
      const outcome = await attempt(
        db,
        `update public.data_sources set status = 'revoked' where id = $1`,
        [id],
      );
      expect(outcome.ok ? OK : outcome.error.code).toBe(SQLSTATE.checkViolation);
    });
  });

  it('settings must be a JSON object (23514)', async () => {
    await asNewUser(async (db, user) => {
      expect(
        await tryInsert(db, 'public.data_sources', source(user, { settings: '["token"]' })),
      ).toBe(SQLSTATE.checkViolation);
    });
  });
});

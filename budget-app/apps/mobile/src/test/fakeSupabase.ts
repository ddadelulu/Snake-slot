import type { Session } from '@supabase/supabase-js';

import type { Tables } from '@budget/core';

import { createFakeAuthClient, fakeSession } from './appHarness';

/**
 * An in-memory stand-in for the Supabase client, covering exactly what the app calls: auth
 * (through createFakeAuthClient), `from('profiles')` select/update, and `rpc(...)`. Screens and
 * data hooks run unchanged against it, so route tests exercise the real React Query code paths.
 */

export function profileRow(overrides: Partial<Tables<'profiles'>> = {}): Tables<'profiles'> {
  return {
    id: fakeSession().user.id,
    display_name: null,
    language: 'en',
    timezone: 'Europe/Zurich',
    net_income_rappen: null,
    payday: null,
    irregular_income: false,
    weekly_work_minutes: null,
    savings_monthly_rappen: 0,
    savings_goal_name: null,
    savings_goal_rappen: null,
    savings_goal_date: null,
    leftover_policy: 'rollover',
    pain_level: 'normal',
    sound_enabled: true,
    payment_methods: [],
    onboarding_completed_at: null,
    created_at: '2026-10-01T12:00:00.000000+00:00',
    updated_at: '2026-10-01T12:00:00.000000+00:00',
    ...overrides,
  };
}

export type RpcHandler = (args: unknown) => {
  data: unknown;
  error: { message: string; code?: string } | null;
};

export type FakeRow = Record<string, unknown>;

export type FakeSupabaseState = {
  profile: Tables<'profiles'>;
  rpc: Record<string, RpcHandler>;
  /** Rows of other tables, read and deleted through `from(table)` (see FakeQuery). */
  tables: Record<string, FakeRow[]>;
  /** Makes every request to a table fail with this error. */
  tableErrors: Record<string, { message: string; code?: string }>;
};

/**
 * A chainable stand-in for postgrest-js queries on a table: `select`, `insert`, `update`,
 * `delete`, the filters `eq`, `neq`, `is`, `in`, then `order` and `limit`. Awaiting it runs the
 * query against `state.tables`. Inserted rows get an `id` and `created_at` when they have none.
 */
class FakeQuery implements PromiseLike<{ data: unknown; error: unknown; status: number }> {
  private operation: 'select' | 'delete' | 'insert' | 'update' = 'select';
  private payload: FakeRow[] = [];
  private readonly filters: ((row: FakeRow) => boolean)[] = [];
  private sort: { column: string; ascending: boolean }[] = [];
  private max: number | null = null;

  constructor(
    private readonly state: FakeSupabaseState,
    private readonly table: string,
  ) {}

  select() {
    return this;
  }
  delete() {
    this.operation = 'delete';
    return this;
  }
  insert(rows: FakeRow | FakeRow[]) {
    this.operation = 'insert';
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  update(patch: FakeRow) {
    this.operation = 'update';
    this.payload = [patch];
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }
  neq(column: string, value: unknown) {
    this.filters.push((row) => row[column] !== value);
    return this;
  }
  is(column: string, value: null | boolean) {
    this.filters.push((row) => (row[column] ?? null) === value);
    return this;
  }
  in(column: string, values: readonly unknown[]) {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }
  order(column: string, options: { ascending?: boolean } = {}) {
    this.sort.push({ column, ascending: options.ascending ?? true });
    return this;
  }
  limit(count: number) {
    this.max = count;
    return this;
  }

  private run() {
    const failure = this.state.tableErrors[this.table];
    if (failure) return { data: null, error: failure, status: 400 };
    const rows = this.state.tables[this.table] ?? [];
    if (this.operation === 'insert') {
      const added = this.payload.map((row, index) => ({
        id: `${this.table}-new-${rows.length + index + 1}`,
        created_at: new Date().toISOString(),
        ...row,
      }));
      this.state.tables[this.table] = [...rows, ...added];
      return { data: null, error: null, status: 201 };
    }
    const matches = rows.filter((row) => this.filters.every((filter) => filter(row)));
    if (this.operation === 'delete') {
      this.state.tables[this.table] = rows.filter((row) => !matches.includes(row));
      return { data: null, error: null, status: 204 };
    }
    if (this.operation === 'update') {
      this.state.tables[this.table] = rows.map((row) =>
        matches.includes(row) ? { ...row, ...this.payload[0] } : row,
      );
      return { data: null, error: null, status: 204 };
    }
    const sorted = [...matches].sort((a, b) => {
      for (const { column, ascending } of this.sort) {
        const left = String(a[column] ?? '');
        const right = String(b[column] ?? '');
        const order =
          typeof a[column] === 'number' && typeof b[column] === 'number'
            ? (a[column] as number) - (b[column] as number)
            : left.localeCompare(right);
        if (order !== 0) return ascending ? order : -order;
      }
      return 0;
    });
    const data = (this.max === null ? sorted : sorted.slice(0, this.max)).map((row) => ({
      ...row,
    }));
    return { data, error: null, status: 200 };
  }

  then<TResult1 = { data: unknown; error: unknown; status: number }, TResult2 = never>(
    onfulfilled?:
      | ((value: {
          data: unknown;
          error: unknown;
          status: number;
        }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected);
  }
}

export function createFakeSupabase(options: {
  session: Session | null;
  profile?: Partial<Tables<'profiles'>>;
  rpc?: Record<string, RpcHandler>;
  tables?: Record<string, FakeRow[]>;
}) {
  const auth = createFakeAuthClient(options.session);
  const state: FakeSupabaseState = {
    profile: profileRow(options.profile),
    // Every signed-in start asks for payment moments (spec section 8); none unless a test says so.
    rpc: { pending_moments: () => ({ data: [], error: null }), ...options.rpc },
    tables: options.tables ?? {},
    tableErrors: {},
  };

  const ok = (data: unknown) => ({ data, error: null, status: 200 });

  const client = {
    auth: auth.client.auth,
    from: jest.fn((table: string) => {
      if (table !== 'profiles') {
        if (!(table in state.tables) && !(table in state.tableErrors)) {
          throw new Error(`fake supabase: unexpected table ${table}`);
        }
        return new FakeQuery(state, table);
      }
      return {
        select: () => ({
          eq: () => ({ single: async () => ok({ ...state.profile }) }),
        }),
        update: (patch: Partial<Tables<'profiles'>>) => ({
          eq: () => ({
            select: () => ({
              single: async () => {
                state.profile = {
                  ...state.profile,
                  ...patch,
                  updated_at: new Date().toISOString(),
                };
                return ok({ ...state.profile });
              },
            }),
          }),
        }),
      };
    }),
    rpc: jest.fn(async (name: string, args?: unknown) => {
      const handler = state.rpc[name];
      if (!handler) throw new Error(`fake supabase: unexpected rpc ${name}`);
      const { data, error } = handler(args);
      return { data, error, status: error ? 400 : 200 };
    }),
  };

  return { client, state, emit: auth.emit };
}

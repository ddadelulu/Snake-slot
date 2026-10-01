/**
 * The vocabularies and money bounds in @budget/core are mirrored by CHECK constraints. These tests
 * read the constraints from the catalog, so the app and the database cannot drift apart silently.
 */
import {
  AI_MESSAGE_ROLES,
  ALERT_TYPES,
  CATEGORIZED_BY,
  CONSENT_KINDS,
  DATA_SOURCE_KINDS,
  DATA_SOURCE_STATUSES,
  DEFAULT_CATEGORY_KEYS,
  DEFAULT_LANGUAGE,
  FIXED_COST_KINDS,
  LANGUAGES,
  LEFTOVER_POLICIES,
  MAX_ABS_RAPPEN,
  PAIN_LEVELS,
  PAYMENT_METHODS,
  RULE_MATCH_FIELDS,
  RULE_MATCH_TYPES,
  SUBSCRIPTION_STATUSES,
  SUBSCRIPTION_STORES,
  TRANSACTION_SOURCES,
} from '@budget/core';
import { describe, expect, it } from 'vitest';
import { type Db, queryOne, queryRows, withRollback } from './db';

/** Text literals of the single-column CHECK on `table.column` that lists its allowed values. */
async function checkVocabulary(db: Db, table: string, column: string): Promise<string[]> {
  const rows = await queryRows<{ def: string }>(
    db,
    `select pg_get_constraintdef(c.oid) as def
       from pg_constraint c
       join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      where c.contype = 'c'
        and c.conrelid = $1::regclass
        and cardinality(c.conkey) = 1
        and a.attname = $2`,
    [`public.${table}`, column],
  );
  const lists = rows.filter((row) => row.def.includes('ARRAY['));
  if (lists.length !== 1) {
    throw new Error(`expected one vocabulary CHECK on ${table}.${column}, found ${lists.length}`);
  }
  const [list] = lists;
  return [...(list?.def ?? '').matchAll(/'((?:[^']|'')*)'::text/g)].map((match) =>
    (match[1] ?? '').replaceAll("''", "'"),
  );
}

/** Integer literals in a constraint definition (identifiers here contain no digits). */
function integerLiterals(definition: string): number[] {
  return [...definition.matchAll(/(?<![A-Za-z_])-?\d+/g)].map((match) => Number(match[0]));
}

function sorted(values: readonly string[]): string[] {
  return [...values].sort();
}

const VOCABULARIES: ReadonlyArray<readonly [string, string, string, readonly string[]]> = [
  ['LANGUAGES', 'profiles', 'language', LANGUAGES],
  ['PAIN_LEVELS', 'profiles', 'pain_level', PAIN_LEVELS],
  ['LEFTOVER_POLICIES', 'profiles', 'leftover_policy', LEFTOVER_POLICIES],
  ['LEFTOVER_POLICIES', 'budget_periods', 'leftover_action', LEFTOVER_POLICIES],
  ['PAYMENT_METHODS', 'profiles', 'payment_methods', PAYMENT_METHODS],
  ['FIXED_COST_KINDS', 'fixed_costs', 'kind', FIXED_COST_KINDS],
  ['DEFAULT_CATEGORY_KEYS', 'categories', 'default_key', DEFAULT_CATEGORY_KEYS],
  ['DATA_SOURCE_KINDS', 'data_sources', 'kind', DATA_SOURCE_KINDS],
  ['DATA_SOURCE_STATUSES', 'data_sources', 'status', DATA_SOURCE_STATUSES],
  ['TRANSACTION_SOURCES', 'transactions', 'source', TRANSACTION_SOURCES],
  ['CATEGORIZED_BY', 'transactions', 'categorized_by', CATEGORIZED_BY],
  ['RULE_MATCH_FIELDS', 'categorization_rules', 'match_field', RULE_MATCH_FIELDS],
  ['RULE_MATCH_TYPES', 'categorization_rules', 'match_type', RULE_MATCH_TYPES],
  ['ALERT_TYPES', 'alerts', 'type', ALERT_TYPES],
  ['SUBSCRIPTION_STATUSES', 'subscriptions', 'status', SUBSCRIPTION_STATUSES],
  ['SUBSCRIPTION_STORES', 'subscriptions', 'store', SUBSCRIPTION_STORES],
  ['AI_MESSAGE_ROLES', 'ai_messages', 'role', AI_MESSAGE_ROLES],
  ['CONSENT_KINDS', 'consent_events', 'kind', CONSENT_KINDS],
];

describe('vocabularies match @budget/core', () => {
  it.each(VOCABULARIES)('%s equals the CHECK on %s.%s', async (_name, table, column, expected) => {
    const allowed = await withRollback((db) => checkVocabulary(db, table, column));
    expect(new Set(allowed).size).toBe(allowed.length);
    expect(sorted(allowed)).toEqual(sorted(expected));
  });

  it('profiles.language defaults to DEFAULT_LANGUAGE', async () => {
    const row = await withRollback((db) =>
      queryOne<{ value: string }>(
        db,
        `select column_default as value from information_schema.columns
          where table_schema = 'public' and table_name = 'profiles' and column_name = 'language'`,
      ),
    );
    expect(row.value).toBe(`'${DEFAULT_LANGUAGE}'::text`);
  });
});

interface MoneyColumn {
  table: string;
  column: string;
  type: string;
  definitions: string[];
}

/** Every *_rappen column in schema public with its type and the CHECKs on that column alone. */
async function moneyColumns(db: Db): Promise<MoneyColumn[]> {
  return queryRows<MoneyColumn>(
    db,
    `select c.relname as table, a.attname as column, format_type(a.atttypid, a.atttypmod) as type,
            coalesce(array_agg(pg_get_constraintdef(k.oid)) filter (where k.oid is not null), '{}')
              as definitions
       from pg_attribute a
       join pg_class c on c.oid = a.attrelid
       left join pg_constraint k
         on k.conrelid = c.oid and k.contype = 'c' and k.conkey = array[a.attnum]
      where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
        and a.attnum > 0 and not a.attisdropped and a.attname like '%\\_rappen'
      group by c.relname, a.attname, a.atttypid, a.atttypmod
      order by 1, 2`,
  );
}

/** Money columns that hold signed amounts (the rest are never negative). */
const SIGNED_MONEY: ReadonlyArray<readonly [string, string]> = [
  ['transactions', 'amount_rappen'],
  ['transaction_splits', 'amount_rappen'],
  ['budget_periods', 'carried_over_rappen'],
  ['budget_periods', 'leftover_rappen'],
  ['budgets', 'rollover_rappen'],
];

const UNSIGNED_MONEY: ReadonlyArray<readonly [string, string]> = [
  ['profiles', 'net_income_rappen'],
  ['profiles', 'savings_monthly_rappen'],
  ['profiles', 'savings_goal_rappen'],
  ['fixed_costs', 'amount_rappen'],
  ['budget_periods', 'income_rappen'],
  ['budget_periods', 'fixed_costs_rappen'],
  ['budget_periods', 'savings_rappen'],
  ['budgets', 'amount_rappen'],
];

async function bounds(table: string, column: string): Promise<{ min: number; max: number }> {
  const columns = await withRollback(moneyColumns);
  const found = columns.find((entry) => entry.table === table && entry.column === column);
  if (found === undefined) throw new Error(`no money column ${table}.${column}`);
  const literals = found.definitions.flatMap(integerLiterals);
  return { min: Math.min(...literals), max: Math.max(...literals) };
}

describe('money bounds match MAX_ABS_RAPPEN', () => {
  it('every *_rappen column is bigint with a CHECK that reaches but never exceeds MAX_ABS_RAPPEN', async () => {
    const columns = await withRollback(moneyColumns);
    expect(columns.length).toBeGreaterThanOrEqual(SIGNED_MONEY.length + UNSIGNED_MONEY.length);
    const problems = columns.flatMap(({ table, column, type, definitions }) => {
      const literals = definitions.flatMap(integerLiterals);
      const issues: string[] = [];
      if (type !== 'bigint') issues.push(`${table}.${column} is ${type}, not bigint`);
      if (literals.length === 0) issues.push(`${table}.${column} has no bounding CHECK`);
      else if (Math.max(...literals) !== MAX_ABS_RAPPEN) {
        issues.push(`${table}.${column} upper bound is ${Math.max(...literals)}`);
      } else if (literals.some((value) => Math.abs(value) > MAX_ABS_RAPPEN)) {
        issues.push(`${table}.${column} allows more than ±${MAX_ABS_RAPPEN}`);
      }
      return issues;
    });
    expect(problems).toEqual([]);
  });

  it.each(SIGNED_MONEY)('%s.%s is bounded by ±MAX_ABS_RAPPEN', async (table, column) => {
    expect(await bounds(table, column)).toEqual({ min: -MAX_ABS_RAPPEN, max: MAX_ABS_RAPPEN });
  });

  it.each(UNSIGNED_MONEY)('%s.%s is bounded by 0..MAX_ABS_RAPPEN', async (table, column) => {
    const { min, max } = await bounds(table, column);
    expect(max).toBe(MAX_ABS_RAPPEN);
    expect([0, 1]).toContain(min);
  });
});

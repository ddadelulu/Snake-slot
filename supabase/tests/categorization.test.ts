/**
 * Categorization in the database (docs/CATEGORIZATION.md):
 *   - internal.merchant_key / key_contains equal merchantKey / keyContains from @budget/core on a
 *     corpus (the documented examples, the core unit-test cases, apostrophes, ae/oe/ue words and
 *     seeded pseudo-random text);
 *   - the reference lists and word lists equal the tables in CATEGORIZATION.md (patterns,
 *     categories, fixed-cost kinds, confidences, "not spending" names, MCC ranges, generic,
 *     payment and month words) and their vocabularies equal @budget/core;
 *   - same_merchant, hint words and learned hints, the proposed rule (suggest_rule);
 *   - internal.categorize: money out (the person's rules and their precedence, known merchants
 *     with longest pattern, fall-through, fixed-cost providers and their 20-day guard, names that
 *     are not spending, MCC ranges) and money in (never by rules, list or MCC), other users' data.
 */
import { readFileSync } from 'node:fs';
import {
  DEFAULT_CATEGORY_KEYS,
  type DefaultCategoryKey,
  FIXED_COST_KINDS,
  MERCHANT_STOPWORDS,
  keyContains,
  merchantKey,
} from '@budget/core';
import { describe, expect, it } from 'vitest';
import {
  type Db,
  type Row,
  SQLSTATE,
  asAnon,
  asPostgres,
  asUser,
  createUser,
  expectSqlError,
  make,
  queryOne,
  queryRows,
  withRollback,
} from './db';

const CATEGORIZATION_MD = readFileSync(
  new URL('../../docs/CATEGORIZATION.md', import.meta.url),
  'utf8',
);

/** The part of the document between two headings. */
function section(start: string, end: string): string {
  const from = CATEGORIZATION_MD.indexOf(start);
  const to = CATEGORIZATION_MD.indexOf(end, from + 1);
  if (from < 0 || to < 0) throw new Error(`section ${start} not found in CATEGORIZATION.md`);
  return CATEGORIZATION_MD.slice(from, to);
}

/** Cells of the body rows of the Markdown table(s) in `text`. */
function tableRows(text: string): string[][] {
  return text
    .split('\n')
    .filter((line) => line.startsWith('|') && !/^\|\s*-/.test(line))
    .map((line) =>
      line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim()),
    )
    .slice(1);
}

const CATEGORY_LABELS: Readonly<Record<string, DefaultCategoryKey>> = {
  Groceries: 'groceries',
  'Eating out': 'eating_out',
  'Going out': 'going_out',
  Transport: 'transport',
  Clothes: 'clothes',
  'Personal care': 'personal_care',
  Hobbies: 'hobbies',
  Gifts: 'gifts',
  'Shopping/Electronics': 'shopping_electronics',
  Other: 'other',
};

const FIXED_COST_LABELS: Readonly<Record<string, string>> = {
  'health insurance': 'health_insurance',
  'phone/internet': 'phone_internet',
  'other insurance': 'other_insurance',
  tax: 'tax_provision',
  'leasing/debts': 'leasing_debts',
};

type KnownMerchant = {
  pattern: string;
  category_key: string | null;
  fixed_cost_kind: string | null;
  confidence: number | null;
};

/** The known-merchant list as CATEGORIZATION.md documents it. */
function documentedKnownMerchants(): KnownMerchant[] {
  const entries: KnownMerchant[] = [];
  for (const [label = '', patterns = ''] of tableRows(
    section('## Known merchants', '## MCC ranges'),
  )) {
    if (label === 'Not spending') {
      for (const pattern of patterns.split(',').map((p) => p.trim())) {
        entries.push({ pattern, category_key: null, fixed_cost_kind: null, confidence: null });
      }
      continue;
    }
    if (label === 'Fixed costs only') {
      for (const group of patterns.split('·')) {
        const [kindLabel = '', list = ''] = group.split(':').map((part) => part.trim());
        const kind = FIXED_COST_LABELS[kindLabel];
        if (kind === undefined) throw new Error(`unknown fixed-cost label "${kindLabel}"`);
        for (const pattern of list.split(',').map((p) => p.trim())) {
          entries.push({ pattern, category_key: null, fixed_cost_kind: kind, confidence: null });
        }
      }
      continue;
    }
    const category = CATEGORY_LABELS[label.replace(' + fixed', '')];
    if (category === undefined) throw new Error(`unknown category label "${label}"`);
    for (const group of patterns.split(';').map((g) => g.trim())) {
      const match = /^(.*)\((\d+)(?:, fixed: ([a-z_]+))?\)$/.exec(group);
      if (match === null) throw new Error(`cannot read "${group}"`);
      for (const pattern of (match[1] ?? '').split(',').map((p) => p.trim())) {
        entries.push({
          pattern,
          category_key: category,
          fixed_cost_kind: match[3] ?? null,
          confidence: Number(match[2]),
        });
      }
    }
  }
  return entries;
}

/** The word lists as CATEGORIZATION.md documents them, by list name. */
function documentedWordLists(): Record<string, string[]> {
  const lists: Record<string, string[]> = {};
  for (const [label = '', words = ''] of tableRows(section('## Word lists', '## The steps'))) {
    lists[label] = words.split(',').map((word) => word.trim());
  }
  return lists;
}

type CodeRange = { mcc_from: number; mcc_to: number; category_key: string; confidence: number };

/** The MCC table as CATEGORIZATION.md documents it, one entry per code or range. */
function documentedMccRanges(): CodeRange[] {
  const ranges: CodeRange[] = [];
  for (const [codes = '', label = '', confidence = ''] of tableRows(
    section('## MCC ranges', 'Both lists live'),
  )) {
    const category = CATEGORY_LABELS[label];
    if (category === undefined) throw new Error(`unknown category label "${label}"`);
    for (const code of codes.replace(/\(.*\)/, '').split(',')) {
      const [from = '', to = from] = code.trim().split('–');
      ranges.push({
        mcc_from: Number(from),
        mcc_to: Number(to),
        category_key: category,
        confidence: Number(confidence),
      });
    }
  }
  return ranges;
}

function byPattern(a: { pattern: string }, b: { pattern: string }): number {
  return a.pattern < b.pattern ? -1 : 1;
}

// ---------------------------------------------------------------------------------------------
// Merchant keys: the database equals @budget/core
// ---------------------------------------------------------------------------------------------

/** The examples in CATEGORIZATION.md ("Printed by the source | Key"). */
function documentedKeyExamples(): Array<[string, string]> {
  return tableRows(section('## Merchant keys', 'A pattern **matches**')).map(
    ([printed = '', key = '']) => [printed.replaceAll('`', ''), key.replaceAll('`', '')],
  );
}

/** The cases of packages/core/src/merchant.test.ts. */
const CORE_TEST_CASES: Array<[string, string]> = [
  ['COOP-4567 ZÜRICH', 'coop zurich'],
  ['TWINT *Coop Pronto', 'twint coop pronto'],
  ['Migros M Zürich HB', 'migros m zurich hb'],
  ['Digitec Galaxus AG', 'digitec galaxus'],
  ['Bäckerei Hug GmbH, 8001 Zürich', 'backerei hug zurich'],
  ['Crêperie Café Brûlée Sàrl', 'creperie cafe brulee'],
  ['Straße & Œuvre Æsch', 'strasse ouvre asch'],
  ['Čokolada Šumava Žilina Ÿ', 'cokolada sumava zilina y'],
  ['www.zalando.ch', 'zalando'],
  ['XXXX1234 MANOR 0815', 'manor'],
  ['ÑANDÚ ÌSOLA ÒRO', 'nandu isola oro'],
  ['', ''],
  ['  -- 1234 --  ', ''],
  ["McDonald's Bern", 'mcdonalds bern'],
  ['McDonald’s', 'mcdonalds'],
  ['MCDONALD´S', 'mcdonalds'],
  ['Levi`s', 'levis'],
  ["L'Osteria", 'losteria'],
  ['H&M', 'h m'],
  ['Bäckerei', 'backerei'],
  ['BAECKEREI', 'backerei'],
  ['Müller', 'muller'],
  ['MUELLER', 'muller'],
  ['Sprüngli', 'sprungli'],
  ['SPRUENGLI', 'sprungli'],
  ['Orell Füssli', 'orell fussli'],
  ['ORELL FUESSLI', 'orell fussli'],
  ['Vögele', 'vogele'],
  ['VOEGELE', 'vogele'],
  ['Zürich', 'zurich'],
  ['ZUERICH', 'zurich'],
  ['Coop Mineralöl', 'coop mineralol'],
  ['COOP MINERALOEL', 'coop mineralol'],
  ['Michael', 'michal'],
  ['Queen', 'quen'],
  ['Blue Cinema', 'blu cinema'],
  ['Noël', 'nol'],
  ['aee', 'ae'],
  ['uee oee', 'ue oe'],
  ['Zu\u0308rich', 'zu rich'],
  ['Coop AG Co Sàrl', 'coop'],
];

/** Deterministic pseudo-random numbers (mulberry32), so a failure can be reproduced. */
function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ACCENTED = 'ÀÁÂÃÄÅàáâãäåÇçĆćČčÈÉÊËèéêëÌÍÎÏìíîïÑñÒÓÔÕÖØòóôõöøÙÚÛÜùúûüÝýÿŸŠšŞşŽžŹźŻżßÆæŒœ';
const APOSTROPHES = "'’´`";
const PIECES: readonly string[] = [
  ...ACCENTED,
  ...APOSTROPHES,
  // The fold: e after a, o or u, in both cases and next to accents and apostrophes.
  'ae',
  'oe',
  'ue',
  'AE',
  'Oe',
  'uE',
  'aee',
  'äe',
  "a'e",
  'Michael',
  'Queen',
  'Blue',
  'MUELLER',
  'Bäckerei',
  "McDonald's",
  // Decomposed accents (NFD): the combining mark is a separator in both implementations.
  'u\u0308',
  'Zu\u0308rich',
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
  ...'0123456789',
  ...` -*.,/&'()#+_:;!?@|"`,
  ' ',
  '  ',
  '\t',
  '\n',
  ' ',
  // Letters outside the table: never part of a key in either implementation.
  'İ',
  'ı',
  'ſ',
  'ẞ',
  'Ł',
  'ł',
  'Ａ',
  'ﬁ',
  'ǅ',
  '€',
  '😀',
  '̈',
  // Stopwords in several spellings, and words that look like them.
  'AG',
  'GmbH',
  'sa',
  'SA',
  'Sàrl',
  'SAGL',
  'Ltd',
  'LLC',
  'Inc',
  'KG',
  'Co',
  'cie',
  'www',
  '.com',
  '.ch',
  'agb',
  'coop',
  'COOP-4567',
  'Zürich',
  'Bäckerei',
  'Straße',
  'X1Y',
  '8001',
];

function randomCorpus(count: number, seed: number): string[] {
  const next = random(seed);
  const corpus: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const length = Math.floor(next() * 12);
    let text = '';
    for (let j = 0; j < length; j += 1) {
      text += PIECES[Math.floor(next() * PIECES.length)] ?? '';
      if (next() < 0.3) text += ' ';
    }
    corpus.push(text);
  }
  return corpus;
}

async function databaseKeys(db: Db, inputs: string[]): Promise<string[]> {
  const rows = await queryRows<{ key: string }>(
    db,
    `select internal.merchant_key(input) as key
       from unnest($1::text[]) with ordinality as listed(input, ordinal)
      order by ordinal`,
    [inputs],
  );
  return rows.map((row) => row.key);
}

describe('internal.merchant_key equals merchantKey() from @budget/core', () => {
  it('on every example in CATEGORIZATION.md, with the documented key', async () => {
    const examples = documentedKeyExamples();
    expect(examples.length).toBeGreaterThanOrEqual(4);
    const keys = await withRollback((db) =>
      databaseKeys(
        db,
        examples.map(([input]) => input),
      ),
    );
    expect(keys).toEqual(examples.map(([, key]) => key));
    expect(examples.map(([input]) => merchantKey(input))).toEqual(examples.map(([, key]) => key));
  });

  it('on every case of the core unit tests', async () => {
    const keys = await withRollback((db) =>
      databaseKeys(
        db,
        CORE_TEST_CASES.map(([input]) => input),
      ),
    );
    expect(keys).toEqual(CORE_TEST_CASES.map(([, key]) => key));
  });

  it('on 600 seeded pseudo-random strings of accents, apostrophes, ae/oe/ue, digits, punctuation and stopwords', async () => {
    const corpus = randomCorpus(600, 20261007);
    const keys = await withRollback((db) => databaseKeys(db, corpus));
    const differences = corpus
      .map((input, index) => ({ input, database: keys[index], core: merchantKey(input) }))
      .filter((entry) => entry.database !== entry.core);
    expect(differences).toEqual([]);
    // The corpus is not trivial: most strings keep some words, some lose all of them.
    expect(keys.filter((key) => key !== '').length).toBeGreaterThan(400);
    expect(keys.filter((key) => key === '').length).toBeGreaterThan(10);
  });

  it('on 600 long texts (statement-length, mixed ASCII and accents)', async () => {
    const corpus = randomCorpus(600, 19700101).map((text, index) =>
      index % 2 === 0 ? text.repeat(20) : `${text} KAUF/DIENSTLEISTUNG VOM 03.10.2026 ${text}`,
    );
    const keys = await withRollback((db) => databaseKeys(db, corpus));
    expect(
      corpus.filter((input, index) => keys[index] !== merchantKey(input)).map((input) => input),
    ).toEqual([]);
  });

  it('every accented letter, ligature and apostrophe maps like the core table', async () => {
    const letters = [...ACCENTED, ...APOSTROPHES];
    const inputs = letters.map((letter) => `x${letter}x`);
    const keys = await withRollback((db) => databaseKeys(db, inputs));
    expect(keys).toEqual(inputs.map((input) => merchantKey(input)));
  });

  it('drops every core stopword', async () => {
    const keys = await withRollback((db) => databaseKeys(db, [MERCHANT_STOPWORDS.join(' ')]));
    expect(keys).toEqual(['']);
  });

  it('null gives the empty key', async () => {
    const row = await withRollback((db) =>
      queryOne<{ key: string }>(db, 'select internal.merchant_key(null) as key'),
    );
    expect(row.key).toBe('');
  });
});

describe('internal.key_contains equals keyContains() from @budget/core', () => {
  it('on pairs of keys', async () => {
    const pairs: Array<[string, string]> = [
      ['coop pronto zurich', 'coop'],
      ['coop pronto zurich', 'coop pronto'],
      ['coop pronto zurich', 'pronto zurich'],
      ['coop pronto zurich', 'coop zurich'],
      ['coopers', 'coop'],
      ['coop', 'coop'],
      ['coop', ''],
      ['', 'coop'],
      ['', ''],
      ['twint coop', 'twint coop pronto'],
      ['h m zurich', 'h m'],
      ['hm zurich', 'h m'],
    ];
    const rows = await withRollback((db) =>
      queryRows<{ contains: boolean }>(
        db,
        `select internal.key_contains(a, b) as contains
           from unnest($1::text[], $2::text[]) with ordinality as listed(a, b, ordinal)
          order by ordinal`,
        [pairs.map(([a]) => a), pairs.map(([, b]) => b)],
      ),
    );
    expect(rows.map((row) => row.contains)).toEqual(pairs.map(([a, b]) => keyContains(a, b)));
  });

  it('is false for null keys', async () => {
    const row = await withRollback((db) =>
      queryOne<Row>(
        db,
        `select internal.key_contains(null, 'coop') as a, internal.key_contains('coop', null) as b`,
      ),
    );
    expect(row).toEqual({ a: false, b: false });
  });
});

describe('internal.same_merchant (deduplication, D-040)', () => {
  it.each([
    ['coop zurich', 'coop', true], // one contains the other
    ['coop pronto', 'coop city', true], // first words equal, not generic
    ['kauf coop zurich', 'coop', true], // one contains the other
    ['twint coop pronto', 'coop pronto bahnhof', false],
    ['coopers', 'coop', false],
    ['restaurant krone', 'restaurant sonne', false], // generic first word
    ['backerei hug', 'backerei muller', false],
    ['the kitchen', 'the dubliner', false],
    ['twint coop', 'twint migros', false], // payment word first
    ['kauf migros', 'kauf denner', false],
    ['restaurant', 'restaurant sonne', true], // contained
    ['backerei hug bern', 'backerei hug', true],
    ['mcdonalds bern', 'mcdonalds', true],
    ['muller drogerie zurich', 'muller drogerie', true],
    ['', '', false],
    ['coop', '', false],
  ])('%s / %s → %s', async (a, b, expected) => {
    const row = await withRollback((db) =>
      queryOne<{ same: boolean; reverse: boolean }>(
        db,
        'select internal.same_merchant($1, $2) as same, internal.same_merchant($2, $1) as reverse',
        [a, b],
      ),
    );
    expect(row).toEqual({ same: expected, reverse: expected });
  });
});

// ---------------------------------------------------------------------------------------------
// The reference lists equal CATEGORIZATION.md
// ---------------------------------------------------------------------------------------------

describe('internal.known_merchants', () => {
  it('holds exactly the documented list (patterns, categories, kinds, confidences)', async () => {
    const documented = documentedKnownMerchants();
    const seeded = await withRollback((db) =>
      queryRows<KnownMerchant>(
        db,
        `select pattern, category_key, fixed_cost_kind, confidence
           from internal.known_merchants`,
      ),
    );
    expect([...seeded].sort(byPattern)).toEqual([...documented].sort(byPattern));
  });

  it('every documented pattern is a merchant key, so it can match at all', () => {
    const documented = documentedKnownMerchants();
    expect(documented.filter(({ pattern }) => merchantKey(pattern) !== pattern)).toEqual([]);
  });

  it('every pattern is its own merchant key, as the core computes it', async () => {
    const patterns = await withRollback((db) =>
      queryRows<{ pattern: string }>(db, 'select pattern from internal.known_merchants'),
    );
    expect(patterns.filter(({ pattern }) => merchantKey(pattern) !== pattern)).toEqual([]);
  });

  it.each([
    ['category_key', DEFAULT_CATEGORY_KEYS],
    ['fixed_cost_kind', FIXED_COST_KINDS],
  ] as const)('the %s CHECK equals the vocabulary in @budget/core', async (column, expected) => {
    const allowed = await withRollback((db) =>
      checkVocabulary(db, 'internal.known_merchants', column),
    );
    expect([...allowed].sort()).toEqual([...expected].sort());
  });

  it.each([
    [
      'a pattern that is not a merchant key',
      { pattern: 'Coop', category_key: 'groceries', confidence: 90 },
    ],
    ['an empty pattern', { pattern: '', category_key: 'groceries', confidence: 90 }],
    [
      'a pattern of five words',
      { pattern: 'a b c d e', category_key: 'groceries', confidence: 90 },
    ],
    ['a confidence without category', { pattern: 'nowhere', confidence: 90 }],
    ['a category without confidence', { pattern: 'nowhere', category_key: 'groceries' }],
    ['confidence 0', { pattern: 'nowhere', category_key: 'groceries', confidence: 0 }],
    ['an unknown category', { pattern: 'nowhere', category_key: 'yachts', confidence: 50 }],
  ])('rejects %s (23514)', async (_label, values) => {
    await withRollback(async (db) => {
      await expectSqlError(
        db,
        SQLSTATE.checkViolation,
        `insert into internal.known_merchants (pattern, category_key, fixed_cost_kind, confidence)
         values ($1, $2, $3, $4)`,
        [
          values.pattern,
          'category_key' in values ? values.category_key : null,
          null,
          'confidence' in values ? values.confidence : null,
        ],
      );
    });
  });
});

describe('word lists (generic, payment and month words)', () => {
  const FUNCTIONS: Readonly<Record<string, string>> = {
    Generic: 'internal.generic_words()',
    Payment: 'internal.payment_words()',
    Months: 'internal.month_words()',
  };

  it.each(Object.entries(FUNCTIONS))('%s equals %s', async (label, fn) => {
    const documented = documentedWordLists()[label];
    expect(documented?.length).toBeGreaterThan(10);
    const row = await withRollback((db) =>
      queryOne<{ words: string[] }>(db, `select ${fn} as words`),
    );
    expect([...row.words].sort()).toEqual([...(documented ?? [])].sort());
    expect(new Set(row.words).size).toBe(row.words.length);
  });

  it('documents exactly these three lists', () => {
    expect(Object.keys(documentedWordLists()).sort()).toEqual(Object.keys(FUNCTIONS).sort());
  });

  it('every word is its own merchant key (database and core)', async () => {
    const rows = await withRollback((db) =>
      queryRows<{ word: string; key: string }>(
        db,
        `select w as word, internal.merchant_key(w) as key
           from unnest(internal.generic_words() || internal.payment_words() || internal.month_words()) w`,
      ),
    );
    expect(rows.filter(({ word, key }) => word !== key || merchantKey(word) !== word)).toEqual([]);
  });
});

describe('hint words and the learned merchant hint (D-031, QA M7)', () => {
  it.each([
    ['Swisscom (Schweiz) AG', null, 'swisscom schweiz', 'swisscom schweiz'],
    [
      null,
      'Dauerauftrag Mietzins Verwaltung Muster AG Oktober',
      'mietzins verwaltung muster',
      'mietzins verwaltung muster',
    ],
    [
      null,
      'DAUERAUFTRAG MIETZINS VERWALTUNG MUSTER AG NOV.',
      'mietzins verwaltung muster',
      'mietzins verwaltung muster',
    ],
    [null, 'LSV Swisscom Rechnung Oktober 2026', 'swisscom', 'swisscom'],
    [
      null,
      'KAUF/DIENSTLEISTUNG VOM 03.10.2026 KARTEN NR. XXXX1234 BAECKEREI HUG BERN',
      'backerei hug bern',
      'backerei hug bern',
    ],
    [
      'TWINT',
      'Prélèvement loyer Régie Dupont Septembre',
      'loyer regie dupont',
      'loyer regie dupont',
    ],
    ['Affitto Gennaio', null, 'affitto', 'affitto'],
    ['Oktober', 'Mai', '', null],
    [null, null, '', null],
  ])('%s / %s → words "%s", hint %s', async (merchant, rawText, words, hint) => {
    const row = await withRollback((db) =>
      queryOne<{ words: string; hint: string | null }>(
        db,
        `select internal.hint_words($1, $2) as words, internal.fixed_cost_hint($1, $2) as hint`,
        [merchant, rawText],
      ),
    );
    expect(row).toEqual({ words, hint });
  });

  it('a hint is at most 120 characters (fewer words when three are longer)', async () => {
    const long = 'a'.repeat(70);
    const row = await withRollback((db) =>
      queryOne<{ two: string; none: string | null }>(
        db,
        `select internal.fixed_cost_hint($1, null) as two, internal.fixed_cost_hint($2, null) as none`,
        [`${long} ${'b'.repeat(40)} ${'c'.repeat(40)}`, 'x'.repeat(130)],
      ),
    );
    expect(row).toEqual({ two: `${long} ${'b'.repeat(40)}`, none: null });
  });
});

describe('internal.suggest_rule (D-042)', () => {
  it.each([
    ['Coop Vitality Apotheke', 'coop vitality'],
    ['Manor Food Basel', 'manor food'],
    ['MIGROS RESTAURANT ZUERICH', 'migros restaurant'],
    ['Migros Bank AG', 'migros bank'],
    ['TWINT *Coop Pronto', 'coop pronto'],
    ["McDonald's Bern", 'mcdonalds'],
    ['Mc Donalds Bern', 'mc donalds'],
    ['H&M Zürich', 'h m'],
    ['MANOR AG ZUERICH 1234', 'manor'],
    ['Restaurant Krone', 'krone'],
    ['Bäckerei Hug', 'hug'],
    ['Garage Meier', 'meier'],
    ['TWINT von Peter Müller', 'peter'],
    ['Zahnarzt Dr. Hug', 'zahnarzt'],
    ['AB Laden Luzern', 'ab luzern'],
    ['AB Laden', null],
    ['TWINT', null],
    ['Kauf/Dienstleistung Karte Visa', null],
    ['Bar', null],
    ['ZKB', null],
    ['1234', null],
    [null, null],
  ])('%s → %s', async (merchant, pattern) => {
    const row = await withRollback((db) =>
      queryOne<{ rule: Row | null }>(db, 'select internal.suggest_rule($1) as rule', [merchant]),
    );
    expect(row.rule).toEqual(
      pattern === null ? null : { match_field: 'merchant', match_type: 'contains', pattern },
    );
  });

  it('never proposes a single generic or payment word, even when it is a known merchant', async () => {
    const rows = await withRollback((db) =>
      queryRows<{ pattern: string }>(
        db,
        `select k.pattern from internal.known_merchants k
          where internal.suggest_rule(k.pattern) is not null
            and internal.suggest_rule(k.pattern) ->> 'pattern' = any (internal.generic_words() || internal.payment_words())`,
      ),
    );
    expect(rows).toEqual([]);
  });
});

describe('internal.mcc_categories', () => {
  it('holds exactly the documented ranges', async () => {
    const seeded = await withRollback((db) =>
      queryRows<CodeRange>(
        db,
        'select mcc_from, mcc_to, category_key, confidence from internal.mcc_categories',
      ),
    );
    const order = (a: CodeRange, b: CodeRange) => a.mcc_from - b.mcc_from;
    expect([...seeded].sort(order)).toEqual(documentedMccRanges().sort(order));
  });

  it('the category_key CHECK equals DEFAULT_CATEGORY_KEYS', async () => {
    const allowed = await withRollback((db) =>
      checkVocabulary(db, 'internal.mcc_categories', 'category_key'),
    );
    expect([...allowed].sort()).toEqual([...DEFAULT_CATEGORY_KEYS].sort());
  });

  it('rejects overlapping ranges (23P01)', async () => {
    await withRollback(async (db) => {
      await expectSqlError(
        db,
        SQLSTATE.exclusionViolation,
        `insert into internal.mcc_categories values (3299, 3300, 'other', 10)`,
      );
    });
  });
});

/** Text literals of the CHECK on `table.column` that lists its allowed values. */
async function checkVocabulary(db: Db, table: string, column: string): Promise<string[]> {
  const rows = await queryRows<{ def: string }>(
    db,
    `select pg_get_constraintdef(c.oid) as def
       from pg_constraint c
       join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      where c.contype = 'c' and c.conrelid = $1::regclass
        and cardinality(c.conkey) = 1 and a.attname = $2`,
    [table, column],
  );
  const lists = rows.filter((row) => row.def.includes('ARRAY['));
  expect(lists).toHaveLength(1);
  return [...(lists[0]?.def ?? '').matchAll(/'((?:[^']|'')*)'::text/g)].map((m) => m[1] ?? '');
}

// ---------------------------------------------------------------------------------------------
// internal.categorize: steps 6-8
// ---------------------------------------------------------------------------------------------

type Placement = {
  category_id: string | null;
  categorized_by: string;
  category_confidence: number | null;
  fixed_cost_id: string | null;
};

/** A user with the given default categories (created as postgres); returns key → id. */
async function userWithCategories(
  db: Db,
  keys: readonly DefaultCategoryKey[] = DEFAULT_CATEGORY_KEYS,
): Promise<{ user: string; ids: Record<string, string> }> {
  const user = await createUser(db);
  const ids: Record<string, string> = {};
  for (const key of keys) {
    ids[key] = await make.category(db, user, { default_key: key, name: undefined });
  }
  return { user, ids };
}

async function categorize(
  db: Db,
  userId: string,
  merchant: string | null,
  options: { rawText?: string | null; mcc?: number | null; amount?: number; at?: string } = {},
): Promise<Placement> {
  await asUser(db, userId);
  const placement = await queryOne<Placement>(
    db,
    `select c.category_id::text, c.categorized_by, c.category_confidence, c.fixed_cost_id::text
       from internal.categorize($1, $2, $3, $4, $5) as c`,
    [
      merchant,
      options.rawText ?? null,
      options.mcc ?? null,
      options.amount ?? -2_000,
      options.at ?? '2026-10-05T10:00:00Z',
    ],
  );
  await asPostgres(db);
  return placement;
}

const NONE: Placement = {
  category_id: null,
  categorized_by: 'none',
  category_confidence: null,
  fixed_cost_id: null,
};

function placed(categoryId: string | undefined, by: string, confidence: number): Placement {
  if (categoryId === undefined) throw new Error('category missing in the fixture');
  return {
    category_id: categoryId,
    categorized_by: by,
    category_confidence: confidence,
    fixed_cost_id: null,
  };
}

describe('known merchants (step 7)', () => {
  it('places a known merchant in its category with the entry’s confidence', async () => {
    await withRollback(async (db) => {
      const { user, ids } = await userWithCategories(db);
      expect(await categorize(db, user, 'COOP-4567 ZÜRICH')).toEqual(
        placed(ids.groceries, 'merchant_list', 90),
      );
      expect(await categorize(db, user, 'Avec Bahnhof')).toEqual(
        placed(ids.groceries, 'merchant_list', 60),
      );
      expect(await categorize(db, user, 'SBB CFF FFS')).toEqual(
        placed(ids.transport, 'merchant_list', 95),
      );
      expect(await categorize(db, user, 'H&M Zürich')).toEqual(
        placed(ids.clothes, 'merchant_list', 90),
      );
      expect(await categorize(db, user, 'McDonald’s Bern')).toEqual(
        placed(ids.eating_out, 'merchant_list', 90),
      );
    });
  });

  it('the longest matching pattern wins', async () => {
    await withRollback(async (db) => {
      const { user, ids } = await userWithCategories(db);
      expect(await categorize(db, user, 'Coop Restaurant Zürich')).toEqual(
        placed(ids.eating_out, 'merchant_list', 90),
      );
      expect(await categorize(db, user, 'Coop City St. Gallen')).toEqual(
        placed(ids.groceries, 'merchant_list', 60),
      );
      expect(await categorize(db, user, 'Manor Food Basel')).toEqual(
        placed(ids.groceries, 'merchant_list', 90),
      );
      expect(await categorize(db, user, 'Manor Basel')).toEqual(
        placed(ids.clothes, 'merchant_list', 50),
      );
      expect(await categorize(db, user, 'Migros Take Away')).toEqual(
        placed(ids.eating_out, 'merchant_list', 80),
      );
      expect(await categorize(db, user, 'Too Good To Go')).toEqual(
        placed(ids.eating_out, 'merchant_list', 70),
      );
    });
  });

  it('between equally long patterns, the higher confidence, then the earlier one wins', async () => {
    await withRollback(async (db) => {
      const { user, ids } = await userWithCategories(db);
      // kfc (eating out, 90) and pub (going out, 70) are both three letters long.
      expect(await categorize(db, user, 'Pub KFC')).toEqual(
        placed(ids.eating_out, 'merchant_list', 90),
      );
      // cafe (eating out, 75) and kino (going out, 80).
      expect(await categorize(db, user, 'Cafe Kino')).toEqual(
        placed(ids.going_out, 'merchant_list', 80),
      );
      // tcs (transport, 70) and pub (going out, 70): the one earlier in the key.
      expect(await categorize(db, user, 'TCS Pub')).toEqual(
        placed(ids.transport, 'merchant_list', 70),
      );
      expect(await categorize(db, user, 'Pub TCS')).toEqual(
        placed(ids.going_out, 'merchant_list', 70),
      );
    });
  });

  it('matches whole words only', async () => {
    await withRollback(async (db) => {
      const { user, ids } = await userWithCategories(db);
      // "coopers" is not "coop"; "pub" is a whole word.
      expect(await categorize(db, user, 'Coopers Pub Supplies')).toEqual(
        placed(ids.going_out, 'merchant_list', 70),
      );
      expect(await categorize(db, user, 'Barbara Muster')).toEqual(NONE);
      expect(await categorize(db, user, 'Libero Shop')).toEqual(NONE);
    });
  });

  it('uses the statement text when the merchant is missing or has no key', async () => {
    await withRollback(async (db) => {
      const { user, ids } = await userWithCategories(db);
      expect(await categorize(db, user, null, { rawText: 'KAUF DENNER 1234 ZUG' })).toEqual(
        placed(ids.groceries, 'merchant_list', 90),
      );
      expect(await categorize(db, user, '4711', { rawText: 'LIDL SCHWEIZ' })).toEqual(
        placed(ids.groceries, 'merchant_list', 90),
      );
      // A merchant with a key is used, not the statement text.
      expect(await categorize(db, user, 'Denner', { rawText: 'ZARA ZURICH' })).toEqual(
        placed(ids.groceries, 'merchant_list', 90),
      );
    });
  });

  it('falls through to the MCC when the person lacks the category (not to a shorter pattern)', async () => {
    await withRollback(async (db) => {
      const { user, ids } = await userWithCategories(db, ['groceries', 'transport']);
      expect(await categorize(db, user, 'Coop Restaurant', { mcc: 4111 })).toEqual(
        placed(ids.transport, 'mcc', 90),
      );
      expect(await categorize(db, user, 'Coop Restaurant')).toEqual(NONE);
      expect(await categorize(db, user, 'Manor', { mcc: 5411 })).toEqual(
        placed(ids.groceries, 'mcc', 80),
      );
    });
  });

  it('skips an archived category', async () => {
    await withRollback(async (db) => {
      const { user, ids } = await userWithCategories(db, ['groceries', 'eating_out']);
      await db.query('update public.categories set archived_at = now() where id = $1', [
        ids.groceries,
      ]);
      expect(await categorize(db, user, 'Migros', { mcc: 5812 })).toEqual(
        placed(ids.eating_out, 'mcc', 85),
      );
    });
  });

  it('a fixed-cost provider is that fixed cost’s payment when the amount is within ±20 %', async () => {
    await withRollback(async (db) => {
      const { user } = await userWithCategories(db);
      const insurance = await make.fixedCost(db, user, {
        kind: 'health_insurance',
        amount_rappen: 40_000,
      });
      const linked = { ...NONE, fixed_cost_id: insurance };
      expect(await categorize(db, user, 'Helsana Versicherungen AG', { amount: -40_000 })).toEqual(
        linked,
      );
      expect(await categorize(db, user, 'Helsana', { amount: -48_000 })).toEqual(linked);
      expect(await categorize(db, user, 'Helsana', { amount: -32_000 })).toEqual(linked);
      expect(await categorize(db, user, 'Helsana', { amount: -48_001 })).toEqual(NONE);
      expect(await categorize(db, user, 'Helsana', { amount: -31_999 })).toEqual(NONE);
      // Money coming back from the insurer is not a payment.
      expect(await categorize(db, user, 'Helsana', { amount: 40_000 })).toEqual(NONE);
    });
  });

  it('a fixed-cost-only entry never sets a category: without its fixed cost it goes on to the MCC', async () => {
    await withRollback(async (db) => {
      const { user, ids } = await userWithCategories(db);
      expect(await categorize(db, user, 'Swisscom (Schweiz) AG')).toEqual(NONE);
      expect(await categorize(db, user, 'Swisscom Shop', { mcc: 4812 })).toEqual(
        placed(ids.shopping_electronics, 'mcc', 75),
      );
      // Inactive fixed costs and other kinds do not count.
      await make.fixedCost(db, user, {
        kind: 'phone_internet',
        amount_rappen: 6_000,
        active: false,
      });
      await make.fixedCost(db, user, { kind: 'other', amount_rappen: 6_000 });
      expect(await categorize(db, user, 'Swisscom', { amount: -6_000 })).toEqual(NONE);
    });
  });

  it('a subscription is the subscription fixed cost when it fits, otherwise a hobby', async () => {
    await withRollback(async (db) => {
      const { user, ids } = await userWithCategories(db);
      const netflix = await make.fixedCost(db, user, {
        kind: 'subscriptions',
        amount_rappen: 1_590,
      });
      expect(await categorize(db, user, 'NETFLIX.COM', { amount: -1_590 })).toEqual({
        ...NONE,
        fixed_cost_id: netflix,
      });
      expect(await categorize(db, user, 'NETFLIX.COM', { amount: -2_500 })).toEqual(
        placed(ids.hobbies, 'merchant_list', 70),
      );
      expect(await categorize(db, user, 'Disney Plus', { amount: -1_000 })).toEqual(
        placed(ids.hobbies, 'merchant_list', 70),
      );
    });
  });

  it('among several fitting fixed costs of the kind, the closest amount wins', async () => {
    await withRollback(async (db) => {
      const { user } = await userWithCategories(db);
      await make.fixedCost(db, user, { kind: 'health_insurance', amount_rappen: 10_000 });
      const closer = await make.fixedCost(db, user, {
        kind: 'health_insurance',
        amount_rappen: 11_000,
      });
      // Both are within ±20 % of 109.00; 110.00 is closer.
      expect(await categorize(db, user, 'CSS Versicherung', { amount: -10_900 })).toEqual({
        ...NONE,
        fixed_cost_id: closer,
      });
    });
  });
});

describe('MCC (step 8)', () => {
  it.each([
    [5411, 'groceries', 80],
    [5499, 'groceries', 70],
    [5814, 'eating_out', 85],
    [7832, 'going_out', 85],
    [3000, 'transport', 60],
    [3150, 'transport', 60],
    [3299, 'transport', 60],
    [4111, 'transport', 90],
    [5311, 'clothes', 40],
    [7230, 'personal_care', 90],
    [5816, 'hobbies', 60],
    [5992, 'gifts', 75],
    [5732, 'shopping_electronics', 85],
    [5999, 'other', 30],
  ] as const)('MCC %s → %s (%s)', async (mcc, key, confidence) => {
    await withRollback(async (db) => {
      const { user, ids } = await userWithCategories(db);
      expect(await categorize(db, user, 'Laden Muster', { mcc })).toEqual(
        placed(ids[key], 'mcc', confidence),
      );
    });
  });

  it.each([2999, 3300, 6011, 0, 9999])('MCC %s is in no range', async (mcc) => {
    await withRollback(async (db) => {
      const { user } = await userWithCategories(db);
      expect(await categorize(db, user, 'Laden Muster', { mcc })).toEqual(NONE);
    });
  });

  it('a known merchant comes before the MCC', async () => {
    await withRollback(async (db) => {
      const { user, ids } = await userWithCategories(db);
      expect(await categorize(db, user, 'Migros', { mcc: 5812 })).toEqual(
        placed(ids.groceries, 'merchant_list', 90),
      );
    });
  });
});

describe('the person’s rules (step 6)', () => {
  it('a rule comes before known merchants and MCC (confidence 100)', async () => {
    await withRollback(async (db) => {
      const { user } = await userWithCategories(db); // groceries exists: the list would match
      const velo = await make.category(db, user, { name: 'Velo' });
      await make.rule(db, user, velo, { pattern: 'Migros' });
      expect(await categorize(db, user, 'MIGROS M ZÜRICH', { mcc: 5411 })).toEqual(
        placed(velo, 'rule', 100),
      );
    });
  });

  it('matches through merchant keys: accents, case and punctuation do not matter', async () => {
    await withRollback(async (db) => {
      const { user } = await userWithCategories(db, []);
      const bakery = await make.category(db, user, { name: 'Beck' });
      await make.rule(db, user, bakery, { pattern: '  Bäckerei Hug ' });
      expect(await categorize(db, user, 'BACKEREI-HUG 8001')).toEqual(placed(bakery, 'rule', 100));
      expect(await categorize(db, user, 'Bäckerei Hugentobler')).toEqual(NONE);
    });
  });

  it('equals needs the whole key; raw_text rules read the statement text; MCC rules the code', async () => {
    await withRollback(async (db) => {
      const { user } = await userWithCategories(db, []);
      const a = await make.category(db, user, { name: 'A' });
      const b = await make.category(db, user, { name: 'B' });
      const c = await make.category(db, user, { name: 'C' });
      await make.rule(db, user, a, { match_type: 'equals', pattern: 'Manor' });
      await make.rule(db, user, b, { match_field: 'raw_text', pattern: 'Dauerauftrag' });
      await make.rule(db, user, c, { match_field: 'mcc', match_type: 'equals', pattern: '5999' });
      expect(await categorize(db, user, 'MANOR AG')).toEqual(placed(a, 'rule', 100));
      expect(await categorize(db, user, 'Manor Basel')).toEqual(NONE);
      expect(
        await categorize(db, user, 'Vermieter', { rawText: 'DAUERAUFTRAG VERMIETER 01.10' }),
      ).toEqual(placed(b, 'rule', 100));
      // A raw_text rule does not look at the merchant.
      expect(await categorize(db, user, 'Dauerauftrag')).toEqual(NONE);
      expect(await categorize(db, user, 'Laden', { mcc: 5999 })).toEqual(placed(c, 'rule', 100));
    });
  });

  it('a merchant rule also matches the statement text of a row without merchant', async () => {
    await withRollback(async (db) => {
      const { user } = await userWithCategories(db, []);
      const a = await make.category(db, user, { name: 'A' });
      await make.rule(db, user, a, { pattern: 'Vermieter' });
      expect(await categorize(db, user, null, { rawText: 'DAUERAUFTRAG VERMIETER' })).toEqual(
        placed(a, 'rule', 100),
      );
    });
  });

  it('a higher priority wins over a longer pattern', async () => {
    await withRollback(async (db) => {
      const { user } = await userWithCategories(db, []);
      const high = await make.category(db, user, { name: 'High' });
      const long = await make.category(db, user, { name: 'Long' });
      await make.rule(db, user, high, { pattern: 'coop', priority: 2 });
      await make.rule(db, user, long, { pattern: 'coop pronto bahnhof', priority: 1 });
      expect(await categorize(db, user, 'Coop Pronto Bahnhof')).toEqual(placed(high, 'rule', 100));
    });
  });

  it('with equal priority the longer pattern wins, even when it is older', async () => {
    await withRollback(async (db) => {
      const { user } = await userWithCategories(db, []);
      const short = await make.category(db, user, { name: 'Short' });
      const long = await make.category(db, user, { name: 'Long' });
      await make.rule(db, user, long, {
        pattern: 'Coop Pronto',
        priority: 1,
        created_at: '2025-01-01T00:00:00Z',
      });
      await make.rule(db, user, short, { pattern: 'pronto', priority: 1 });
      expect(await categorize(db, user, 'Coop Pronto Bahnhof')).toEqual(placed(long, 'rule', 100));
      expect(await categorize(db, user, 'Pronto Shop')).toEqual(placed(short, 'rule', 100));
    });
  });

  it('with equal priority and pattern length, the newer rule wins', async () => {
    await withRollback(async (db) => {
      const { user } = await userWithCategories(db, []);
      const first = await make.category(db, user, { name: 'First' });
      const second = await make.category(db, user, { name: 'Second' });
      await make.rule(db, user, first, { pattern: 'coop', created_at: '2026-01-01T00:00:00Z' });
      await make.rule(db, user, second, {
        pattern: 'COOP',
        match_type: 'equals',
        created_at: '2026-03-01T00:00:00Z',
      });
      expect(await categorize(db, user, 'Coop')).toEqual(placed(second, 'rule', 100));
    });
  });

  it('a rule on an archived category is skipped (the next rule or step applies)', async () => {
    await withRollback(async (db) => {
      const { user, ids } = await userWithCategories(db);
      const gone = await make.category(db, user, {
        name: 'Weg',
        archived_at: '2026-09-01T00:00:00Z',
      });
      const fallback = await make.category(db, user, { name: 'Ersatz' });
      await make.rule(db, user, gone, { pattern: 'Migros', priority: 5 });
      expect(await categorize(db, user, 'Migros')).toEqual(
        placed(ids.groceries, 'merchant_list', 90),
      );
      await make.rule(db, user, fallback, { pattern: 'Migros Zürich', priority: 1 });
      expect(await categorize(db, user, 'Migros Zürich')).toEqual(placed(fallback, 'rule', 100));
    });
  });

  it('a pattern without a key never matches', async () => {
    await withRollback(async (db) => {
      const { user } = await userWithCategories(db, []);
      const a = await make.category(db, user, { name: 'A' });
      await make.rule(db, user, a, { pattern: '1234' });
      expect(await categorize(db, user, 'Shop 1234')).toEqual(NONE);
    });
  });
});

describe('known names that are not spending, and risky words (QA M3)', () => {
  it('a bank or card issuer stops the category steps: no category, no MCC guess', async () => {
    await withRollback(async (db) => {
      const { user } = await userWithCategories(db);
      for (const name of [
        'Überweisung an Migros Bank AG Sparkonto',
        'UBS Switzerland AG',
        'Zürcher Kantonalbank',
        'ZUERCHER KANTONALBANK',
        'Cornercard Rechnung',
      ]) {
        expect(await categorize(db, user, name, { mcc: 5411 })).toEqual(NONE);
      }
    });
  });

  it('Coop Mobile is the phone fixed cost, never groceries; Coop Mineralöl is transport', async () => {
    await withRollback(async (db) => {
      const { user, ids } = await userWithCategories(db);
      expect(await categorize(db, user, 'Coop Mobile Rechnung', { amount: -3_000 })).toEqual(NONE);
      const phone = await make.fixedCost(db, user, {
        kind: 'phone_internet',
        amount_rappen: 3_000,
      });
      expect(await categorize(db, user, 'Coop Mobile Rechnung', { amount: -3_000 })).toEqual({
        ...NONE,
        fixed_cost_id: phone,
      });
      expect(await categorize(db, user, 'Coop Mineraloel AG Tankstelle')).toEqual(
        placed(ids.transport, 'merchant_list', 85),
      );
      expect(await categorize(db, user, 'COOP MINERALÖL')).toEqual(
        placed(ids.transport, 'merchant_list', 85),
      );
    });
  });

  it('bar, müller, club and lounge are not listed: cash deposits and surnames stay unplaced', async () => {
    await withRollback(async (db) => {
      const { user } = await userWithCategories(db);
      for (const name of [
        'Einzahlung Bar',
        'Kantonsspital Bar',
        'TWINT an Peter Müller',
        'MUELLER HANS',
        'Club Bellevue',
        'Lounge',
      ]) {
        expect(await categorize(db, user, name)).toEqual(NONE);
      }
    });
  });

  it('the folded spellings of listed names match (BAECKEREI, SPRUENGLI, FUESSLI, VOEGELE)', async () => {
    await withRollback(async (db) => {
      const { user, ids } = await userWithCategories(db);
      expect(await categorize(db, user, 'BAECKEREI HUG')).toEqual(
        placed(ids.groceries, 'merchant_list', 60),
      );
      expect(await categorize(db, user, 'CONFISERIE SPRUENGLI')).toEqual(
        placed(ids.eating_out, 'merchant_list', 70),
      );
      expect(await categorize(db, user, 'ORELL FUESSLI ZUERICH')).toEqual(
        placed(ids.hobbies, 'merchant_list', 80),
      );
      expect(await categorize(db, user, 'VOEGELE SHOES')).toEqual(
        placed(ids.clothes, 'merchant_list', 85),
      );
      expect(await categorize(db, user, 'Blue Cinema Abaton')).toEqual(
        placed(ids.going_out, 'merchant_list', 85),
      );
      expect(await categorize(db, user, "Levi's Store")).toEqual(
        placed(ids.clothes, 'merchant_list', 85),
      );
    });
  });
});

describe('the fixed-cost guard of step 7 (QA M4)', () => {
  it('a fixed cost with another payment booked within 20 days is not linked again', async () => {
    await withRollback(async (db) => {
      const { user, ids } = await userWithCategories(db);
      const phone = await make.fixedCost(db, user, {
        kind: 'phone_internet',
        amount_rappen: 6_500,
      });
      await make.transaction(db, user, {
        amount_rappen: -6_500,
        booked_at: '2026-10-01T10:00:00Z',
        merchant: 'Swisscom (Schweiz) AG',
        fixed_cost_id: phone,
      });
      // Within 20 days (inclusive), before or after: a Swisscom Shop purchase is no second bill.
      expect(
        await categorize(db, user, 'Swisscom Shop Zürich', {
          amount: -5_990,
          at: '2026-10-21T10:00:00Z',
        }),
      ).toEqual(NONE);
      expect(
        await categorize(db, user, 'Swisscom Shop Zürich', {
          amount: -5_990,
          mcc: 4812,
          at: '2026-09-11T10:00:00Z',
        }),
      ).toEqual(placed(ids.shopping_electronics, 'mcc', 75));
      // More than 20 days later: next month's bill.
      expect(
        await categorize(db, user, 'Swisscom (Schweiz) AG', {
          amount: -6_500,
          at: '2026-10-21T10:00:01Z',
        }),
      ).toEqual({ ...NONE, fixed_cost_id: phone });
    });
  });

  it('deleted and merged payments do not count for the guard', async () => {
    await withRollback(async (db) => {
      const { user } = await userWithCategories(db);
      const phone = await make.fixedCost(db, user, {
        kind: 'phone_internet',
        amount_rappen: 6_500,
      });
      const survivor = await make.transaction(db, user, { amount_rappen: -100, merchant: 'X' });
      await make.transaction(db, user, {
        amount_rappen: -6_500,
        fixed_cost_id: phone,
        booked_at: '2026-10-04T10:00:00Z',
        deleted_at: '2026-10-04T12:00:00Z',
      });
      await make.transaction(db, user, {
        amount_rappen: -6_500,
        fixed_cost_id: phone,
        booked_at: '2026-10-04T10:00:00Z',
        merged_into_id: survivor,
        source: 'statement_import',
        external_id: 'm1',
      });
      expect(await categorize(db, user, 'Swisscom', { amount: -6_500 })).toEqual({
        ...NONE,
        fixed_cost_id: phone,
      });
    });
  });
});

describe('money in (D-039): never by rules, known merchants or MCC', () => {
  it.each([
    ['Gutschrift Lohn SBB AG Oktober', null, 520_000],
    ['LOHN MIGROS-GENOSSENSCHAFTS-BUND', 5411, 480_000],
    ['Einzahlung Bar Automat Zürich HB', null, 100_000],
    ['TWINT von Peter Müller', null, 5_000],
    ['Helsana Rückerstattung', null, 40_000],
    ['NETFLIX.COM', 5815, 1_590],
  ])('%s (MCC %s, +%s) → no category', async (merchant, mcc, amount) => {
    await withRollback(async (db) => {
      const { user, ids } = await userWithCategories(db);
      await make.rule(db, user, ids.other ?? '', { pattern: 'Lohn' });
      await make.fixedCost(db, user, { kind: 'health_insurance', amount_rappen: 40_000 });
      expect(await categorize(db, user, merchant, { mcc, amount })).toEqual(NONE);
    });
  });
});

describe('refund recognition (D-039)', () => {
  /** A categorized purchase of `user` (as postgres). */
  async function purchase(
    db: Db,
    user: string,
    categoryId: string | null | undefined,
    values: Row = {},
  ): Promise<string> {
    return make.transaction(db, user, {
      amount_rappen: -8_000,
      booked_at: '2026-09-20T10:00:00Z',
      merchant: 'Manor Zürich',
      category_id: categoryId,
      categorized_by: 'user',
      category_confidence: 100,
      ...values,
    });
  }

  it('money in from the merchant of an earlier, at least as large purchase gets its category (60)', async () => {
    await withRollback(async (db) => {
      const { user, ids } = await userWithCategories(db);
      await purchase(db, user, ids.clothes);
      expect(await categorize(db, user, 'MANOR AG', { amount: 8_000 })).toEqual(
        placed(ids.clothes, 'refund', 60),
      );
      expect(await categorize(db, user, 'Manor Rückerstattung', { amount: 2_500 })).toEqual(
        placed(ids.clothes, 'refund', 60),
      );
      // Rules do not place money in; the purchase's category does.
      await make.rule(db, user, ids.gifts ?? '', { pattern: 'Manor', priority: 9 });
      expect(await categorize(db, user, 'Manor', { amount: 1_000 })).toEqual(
        placed(ids.clothes, 'refund', 60),
      );
    });
  });

  it('the most recent matching purchase wins', async () => {
    await withRollback(async (db) => {
      const { user, ids } = await userWithCategories(db);
      await purchase(db, user, ids.clothes, { booked_at: '2026-09-01T10:00:00Z' });
      await purchase(db, user, ids.gifts, { booked_at: '2026-09-25T10:00:00Z' });
      await purchase(db, user, ids.hobbies, {
        booked_at: '2026-09-30T10:00:00Z',
        amount_rappen: -1_000,
      });
      expect(await categorize(db, user, 'Manor', { amount: 5_000 })).toEqual(
        placed(ids.gifts, 'refund', 60),
      );
    });
  });

  it.each([
    ['a smaller purchase', { amount_rappen: -4_999 }, 'Manor'],
    ['a purchase 91 local days before', { booked_at: '2026-07-06T21:59:59Z' }, 'Manor'],
    ['a purchase after the refund’s day', { booked_at: '2026-10-05T22:00:00Z' }, 'Manor'],
    [
      'a purchase without category',
      { category_id: null, categorized_by: 'none', category_confidence: null },
      'Manor',
    ],
    ['a deleted purchase', { deleted_at: '2026-10-01T00:00:00Z' }, 'Manor'],
    ['another merchant', { merchant: 'Globus' }, 'Manor'],
    ['a shared generic first word only', { merchant: 'Restaurant Krone' }, 'Restaurant Sonne'],
  ])('nothing from %s', async (_label, values, merchant) => {
    await withRollback(async (db) => {
      const { user, ids } = await userWithCategories(db);
      await purchase(db, user, ids.clothes, values);
      expect(
        await categorize(db, user, merchant, { amount: 5_000, at: '2026-10-05T10:00:00Z' }),
      ).toEqual(NONE);
    });
  });

  it('counts local days: a purchase 90 days before the refund’s day counts (Europe/Zurich)', async () => {
    await withRollback(async (db) => {
      const { user, ids } = await userWithCategories(db);
      // 2026-07-07 00:00 in Zurich is 2026-07-06T22:00Z; the refund is late on 2026-10-05.
      await purchase(db, user, ids.clothes, { booked_at: '2026-07-06T22:00:00Z' });
      expect(
        await categorize(db, user, 'Manor', { amount: 5_000, at: '2026-10-05T21:59:59Z' }),
      ).toEqual(placed(ids.clothes, 'refund', 60));
    });
  });

  it('nothing from a fixed-cost payment, a merged row, an archived category or another user', async () => {
    await withRollback(async (db) => {
      const { user, ids } = await userWithCategories(db);
      const { user: other, ids: otherIds } = await userWithCategories(db);
      const fixedCost = await make.fixedCost(db, user, { kind: 'other', amount_rappen: 8_000 });
      const survivor = await make.transaction(db, user, { amount_rappen: -1, merchant: 'Volg' });
      await purchase(db, user, ids.clothes, { fixed_cost_id: fixedCost });
      await purchase(db, user, ids.clothes, {
        merged_into_id: survivor,
        source: 'statement_import',
        external_id: 'e1',
      });
      const archived = await make.category(db, user, {
        name: 'Alt',
        archived_at: '2026-09-30T00:00:00Z',
      });
      await purchase(db, user, archived);
      await purchase(db, other, otherIds.clothes);
      expect(await categorize(db, user, 'Manor', { amount: 5_000 })).toEqual(NONE);
    });
  });
});

describe('categorize and other users', () => {
  it('never uses another user’s rules, categories or fixed costs', async () => {
    await withRollback(async (db) => {
      const { user: a } = await userWithCategories(db, []);
      const { user: b, ids: ofB } = await userWithCategories(db);
      await make.rule(db, b, ofB.gifts ?? '', { pattern: 'Migros' });
      await make.fixedCost(db, b, { kind: 'health_insurance', amount_rappen: 40_000 });
      expect(await categorize(db, a, 'Migros', { mcc: 5411 })).toEqual(NONE);
      expect(await categorize(db, a, 'Helsana', { amount: -40_000 })).toEqual(NONE);
    });
  });

  it('places nothing without a signed-in user', async () => {
    await withRollback(async (db) => {
      await userWithCategories(db);
      const row = await queryOne<Placement>(
        db,
        `select c.category_id::text, c.categorized_by, c.category_confidence, c.fixed_cost_id::text
           from internal.categorize('Migros', null, 5411, -100, now()) as c`,
      );
      expect(row).toEqual(NONE);
    });
  });

  it('cannot be called by anon (42501)', async () => {
    await withRollback(async (db) => {
      await asAnon(db);
      await expectSqlError(
        db,
        SQLSTATE.insufficientPrivilege,
        `select * from internal.categorize('Migros', null, 5411, -100, now())`,
      );
    });
  });
});

describe('internal.needs_review', () => {
  it.each([
    ['money out without category', [-100, null, 'none', null, null, false, false, false], true],
    ['a guess below 70', [-100, 'c', 'merchant_list', 69, null, false, false, false], true],
    ['a guess of 70', [-100, 'c', 'mcc', 70, null, false, false, false], false],
    ['placed by the person', [-100, 'c', 'user', 100, null, false, false, false], false],
    [
      '"no category" chosen by the person',
      [-100, null, 'user', 100, null, false, false, false],
      false,
    ],
    ['placed by a rule', [-100, 'c', 'rule', 100, null, false, false, false], false],
    ['a fixed-cost payment', [-100, null, 'none', null, 'f', false, false, false], false],
    ['a split', [-100, null, 'user', 100, null, true, false, false], false],
    ['deleted', [-100, null, 'none', null, null, false, true, false], false],
    ['merged', [-100, null, 'none', null, null, false, false, true], false],
    ['money in without category', [100, null, 'none', null, null, false, false, false], false],
    ['money in with a low guess', [100, 'c', 'mcc', 40, null, false, false, false], true],
    ['a recognized refund (60)', [100, 'c', 'refund', 60, null, false, false, false], true],
  ] as const)('%s → %s', async (_label, args, expected) => {
    const ids: Record<string, string> = {
      c: '00000000-0000-0000-0000-000000000001',
      f: '00000000-0000-0000-0000-000000000002',
    };
    const values = args.map((value) =>
      typeof value === 'string' && value in ids ? ids[value] : value,
    );
    const row = await withRollback((db) =>
      queryOne<{ review: boolean }>(
        db,
        `select internal.needs_review($1, $2, $3, $4, $5, $6, $7, $8) as review`,
        values,
      ),
    );
    expect(row.review).toBe(expected);
  });
});

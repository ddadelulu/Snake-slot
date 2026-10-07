-- Milestone 3, part 1: merchant keys, the reference lists and categorization (docs/CATEGORIZATION.md).
--
--   * Schema internal (D-038): helpers and reference data the transaction RPCs need while running
--     with the caller's rights. Signed-in users may use it; PostgREST does not expose it (only
--     public is served); it is read-only for clients. Schema private stays closed.
--   * Merchant keys: internal.merchant_key is the exact mirror of merchantKey() in @budget/core
--     (parity-tested in supabase/tests/categorization.test.ts).
--   * Reference lists: internal.known_merchants and internal.mcc_categories, seeded exactly from
--     CATEGORIZATION.md (a test compares them with the document). They change through a new
--     migration, reviewed by Scarlett Johansson.
--   * internal.categorize: steps 6-8 of the pipeline (the person's rules, known merchants, MCC).
--
-- Conventions as in the earlier migrations: every function pins search_path to '' and qualifies
-- every name; privileges start from nothing and every grant is listed at the end.

-- ---------------------------------------------------------------------------------------------
-- Schema internal
-- ---------------------------------------------------------------------------------------------

create schema internal;
comment on schema internal is
  'Helpers and reference data for the transaction RPCs (D-038): usable by signed-in users with their own rights, never served by the API, read-only.';

revoke all on schema internal from public, anon, authenticated;
grant usage on schema internal to authenticated;

-- New tables here are granted to nobody. New functions are executable by PUBLIC (a Postgres
-- default that cannot be revoked per schema), so every function below revokes it explicitly and
-- privileges.test.ts lists every function of this schema.

-- ---------------------------------------------------------------------------------------------
-- Merchant keys: mirror of merchantKey() and keyContains() in packages/core/src/merchant.ts
-- ---------------------------------------------------------------------------------------------

-- The comparison key of a merchant name or statement text ('' when nothing identifying is left):
--   1. accented letters mapped by a fixed table (the same table as LETTER_MAP in @budget/core),
--      then the ligatures ß → ss, Æ/æ → ae, Œ/œ → oe;
--   2. ASCII upper case to lower case (nothing else changes case);
--   3. split into words at every run of characters other than a-z and 0-9;
--   4. words containing a digit dropped (store numbers, postal codes, card numbers), and the
--      stopwords (legal forms and web noise) dropped;
--   5. the remaining words joined by one space.
-- Postgres regular expressions compare bracket ranges by code point, like JavaScript.
create function internal.merchant_key(p_text text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select pg_catalog.btrim(pg_catalog.regexp_replace(
           ' ' || pg_catalog.regexp_replace(
             pg_catalog.translate(
               pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(
                 pg_catalog.replace(
                   pg_catalog.translate(
                     coalesce(p_text, ''),
                     'ÀÁÂÃÄÅàáâãäå' || 'ÇçĆćČč' || 'ÈÉÊËèéêë' || 'ÌÍÎÏìíîï' || 'Ññ'
                       || 'ÒÓÔÕÖØòóôõöø' || 'ÙÚÛÜùúûü' || 'ÝýÿŸ' || 'ŠšŞş' || 'ŽžŹźŻż',
                     'aaaaaaaaaaaa' || 'cccccc' || 'eeeeeeee' || 'iiiiiiii' || 'nn'
                       || 'oooooooooooo' || 'uuuuuuuu' || 'yyyy' || 'ssss' || 'zzzzzz'),
                   'ß', 'ss'),
                 'Æ', 'ae'), 'æ', 'ae'), 'Œ', 'oe'), 'œ', 'oe'),
               'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'),
             '[^a-z0-9]+', ' ', 'g') || ' ',
           -- Every word is now enclosed in single spaces. Remove " word" for each dropped word; the
           -- lookahead leaves the following space for the next word.
           ' (?:[a-z0-9]*[0-9][a-z0-9]*|ag|gmbh|sa|sarl|sagl|ltd|llc|inc|kg|co|cie|www|com|ch)(?= )',
           '', 'g'))
$$;

comment on function internal.merchant_key(text) is
  'Comparison key of a merchant name: accents mapped, ASCII lower case, words without digits and legal forms, single spaces. Mirror of merchantKey() in @budget/core.';

-- True when the pattern key's words appear in the text key as a contiguous run of whole words.
-- An empty (or null) key never matches.
create function internal.key_contains(p_text_key text, p_pattern_key text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(p_text_key, '') <> ''
     and coalesce(p_pattern_key, '') <> ''
     and pg_catalog.strpos(' ' || p_text_key || ' ', ' ' || p_pattern_key || ' ') > 0
$$;

comment on function internal.key_contains(text, text) is
  'Whether a pattern key appears in a text key as a run of whole words. Mirror of keyContains() in @budget/core.';

-- A transaction's key: the key of its merchant, or of its statement text when the merchant is
-- empty or has no key.
create function internal.transaction_key(p_merchant text, p_raw_text text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(nullif(internal.merchant_key(p_merchant), ''), internal.merchant_key(p_raw_text))
$$;

-- Deduplication's "same merchant": both keys non-empty, and either their first words are equal or
-- one key contains the other (whole words).
create function internal.same_merchant(p_key_a text, p_key_b text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(p_key_a, '') <> ''
     and coalesce(p_key_b, '') <> ''
     and (pg_catalog.split_part(p_key_a, ' ', 1) = pg_catalog.split_part(p_key_b, ' ', 1)
          or internal.key_contains(p_key_a, p_key_b)
          or internal.key_contains(p_key_b, p_key_a))
$$;

-- Every contiguous run of up to p_max_words words of a key ("twint coop pronto" → "twint",
-- "twint coop", "twint coop pronto", "coop", "coop pronto", "pronto"). The known-merchant lookup
-- searches its primary key for these runs instead of testing every pattern.
create function internal.key_runs(p_key text, p_max_words integer)
returns text[]
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  words text[];
  word_count integer;
  runs text[] := '{}';
begin
  if coalesce(p_key, '') = '' or coalesce(p_max_words, 0) < 1 then
    return runs;
  end if;
  words := pg_catalog.string_to_array(p_key, ' ');
  word_count := pg_catalog.cardinality(words);
  for first_word in 1 .. word_count loop
    for last_word in first_word .. least(word_count, first_word + p_max_words - 1) loop
      runs := pg_catalog.array_append(runs,
        pg_catalog.array_to_string(words[first_word:last_word], ' '));
    end loop;
  end loop;
  return runs;
end;
$$;

-- What a fixed cost learns as its merchant_hint from a payment: the merchant as printed when it
-- has a key and fits (120 characters), otherwise the transaction's key cut at a word boundary.
-- Null when the payment has nothing identifying.
create function internal.fixed_cost_hint(p_merchant text, p_raw_text text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when internal.merchant_key(p_merchant) <> '' and char_length(pg_catalog.btrim(p_merchant)) <= 120
      then pg_catalog.btrim(p_merchant)
    else pg_catalog.substring(internal.transaction_key(p_merchant, p_raw_text), '^(.{1,120})(?: |$)')
  end
$$;

-- ---------------------------------------------------------------------------------------------
-- needs_review: whether the app asks the person for a category (API.md, REVIEW_CONFIDENCE = 70)
-- ---------------------------------------------------------------------------------------------

-- True when the transaction counts against the budget (money out, or money in with a category;
-- not deleted, merged or a fixed-cost payment), is not a split, was not placed by the person or
-- one of their rules, and has no category or a confidence below 70 (REVIEW_CONFIDENCE in
-- @budget/core).
create function internal.needs_review(
  p_amount_rappen bigint,
  p_category_id uuid,
  p_categorized_by text,
  p_category_confidence integer,
  p_fixed_cost_id uuid,
  p_is_split boolean,
  p_is_deleted boolean,
  p_is_merged boolean
)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select (p_amount_rappen < 0 or p_category_id is not null)
     and p_fixed_cost_id is null
     and not coalesce(p_is_split, false)
     and not coalesce(p_is_deleted, false)
     and not coalesce(p_is_merged, false)
     and coalesce(p_categorized_by, 'none') not in ('user', 'rule')
     and (p_category_id is null or coalesce(p_category_confidence, 0) < 70)
$$;

-- ---------------------------------------------------------------------------------------------
-- Reference lists (CATEGORIZATION.md, "Known merchants" and "MCC ranges")
-- ---------------------------------------------------------------------------------------------

-- One row per pattern. An entry names a category (with its confidence), a fixed-cost kind, or
-- both (subscriptions). Patterns are merchant keys of at most four words (the lookup searches
-- runs of up to four words).
create table internal.known_merchants (
  pattern text primary key
    check (pattern <> '' and pattern = internal.merchant_key(pattern)
           and pg_catalog.cardinality(pg_catalog.string_to_array(pattern, ' ')) <= 4),
  category_key text check (category_key in (
    'groceries', 'eating_out', 'clothes', 'going_out', 'transport', 'hobbies',
    'personal_care', 'gifts', 'shopping_electronics', 'other'
  )),
  fixed_cost_kind text check (fixed_cost_kind in (
    'rent', 'health_insurance', 'phone_internet', 'transport', 'other_insurance',
    'subscriptions', 'tax_provision', 'leasing_debts', 'other'
  )),
  confidence smallint check (confidence between 1 and 100),
  constraint known_merchants_target check (category_key is not null or fixed_cost_kind is not null),
  constraint known_merchants_confidence check ((category_key is null) = (confidence is null))
);

comment on table internal.known_merchants is
  'Known Swiss merchants (CATEGORIZATION.md): pattern (a merchant key) → default category with confidence, and/or the fixed-cost kind it is paid for.';

-- MCC (ISO 18245) ranges, inclusive, never overlapping.
create table internal.mcc_categories (
  mcc_from smallint primary key check (mcc_from between 0 and 9999),
  mcc_to smallint not null check (mcc_to between 0 and 9999),
  category_key text not null check (category_key in (
    'groceries', 'eating_out', 'clothes', 'going_out', 'transport', 'hobbies',
    'personal_care', 'gifts', 'shopping_electronics', 'other'
  )),
  confidence smallint not null check (confidence between 1 and 100),
  constraint mcc_categories_ordered check (mcc_to >= mcc_from),
  constraint mcc_categories_no_overlap
    exclude using gist (int4range(mcc_from, mcc_to, '[]') with &&)
);

comment on table internal.mcc_categories is
  'Merchant category code ranges (inclusive) → default category with confidence (CATEGORIZATION.md).';

insert into internal.known_merchants (pattern, category_key, confidence)
select pattern, 'groceries', confidence from (values
  ('migros', 90), ('coop', 90), ('coop pronto', 90), ('migrolino', 90), ('denner', 90),
  ('aldi', 90), ('lidl', 90), ('volg', 90), ('spar', 90), ('alnatura', 90), ('farmy', 90),
  ('manor food', 90), ('globus delicatessa', 90), ('aldi suisse', 90),
  ('avec', 60), ('coop city', 60),
  ('k kiosk', 60), ('kkiosk', 60),
  ('backerei', 60), ('baeckerei', 60), ('boulangerie', 60)
) as entry(pattern, confidence)
union all
select pattern, 'eating_out', confidence from (values
  ('migros restaurant', 90), ('coop restaurant', 90), ('mcdonald', 90), ('mc donald', 90),
  ('burger king', 90), ('kfc', 90), ('subway', 90), ('starbucks', 90), ('vapiano', 90),
  ('holy cow', 90), ('tibits', 90), ('hiltl', 90), ('dean david', 90), ('nordsee', 90),
  ('pizza hut', 90), ('dominos', 90), ('domino s', 90), ('uber eats', 90), ('ubereats', 90),
  ('smood', 90),
  ('restaurant', 80), ('ristorante', 80), ('pizzeria', 80), ('trattoria', 80),
  ('migros take away', 80),
  ('cafe', 75), ('caffe', 75), ('coffee', 75), ('kebab', 75),
  ('sprungli', 70), ('spruengli', 70), ('too good to go', 70)
) as entry(pattern, confidence)
union all
select pattern, 'going_out', confidence from (values
  ('pathe', 90), ('kitag', 90), ('arena cinemas', 90),
  ('blue cinema', 85), ('ticketcorner', 85), ('starticket', 85), ('eventfrog', 85),
  ('hallenstadion', 85),
  ('cinema', 80), ('kino', 80), ('see tickets', 80),
  ('bar', 70), ('pub', 70),
  ('club', 60), ('lounge', 60)
) as entry(pattern, confidence)
union all
select pattern, 'transport', confidence from (values
  ('sbb', 95), ('zvv', 95), ('bernmobil', 95), ('vbz', 95), ('postauto', 95),
  ('cff', 90), ('ffs', 90), ('bls', 90), ('tpg', 90), ('bvb', 90), ('vbl', 90),
  ('publibike', 90), ('parkingpay', 90), ('easypark', 90), ('migrol', 90), ('flixbus', 90),
  ('uber', 85), ('taxi', 85), ('parkhaus', 85), ('mobility', 85), ('shell', 85), ('avia', 85),
  ('esso', 85), ('eni', 85), ('tamoil', 85), ('socar', 85), ('agrola', 85), ('bp', 85),
  ('parking', 80), ('lime', 80), ('bolt', 80), ('sixt', 80), ('europcar', 80), ('hertz', 80),
  ('easyjet', 80),
  ('tcs', 70)
) as entry(pattern, confidence)
union all
select pattern, 'clothes', confidence from (values
  ('zara', 90), ('h m', 90), ('uniqlo', 90), ('zalando', 90), ('about you', 90),
  ('bershka', 90), ('pull bear', 90), ('stradivarius', 90), ('massimo dutti', 90),
  ('tally weijl', 90), ('chicoree', 90), ('primark', 90), ('asos', 90), ('ochsner shoes', 90),
  ('hm', 85), ('c a', 85), ('mango', 85), ('vogele', 85), ('voegele', 85), ('dosenbach', 85),
  ('snipes', 85), ('foot locker', 85), ('bata', 85), ('pkz', 85), ('schild', 85),
  ('esprit', 85), ('bonprix', 85), ('shein', 85), ('levi', 85),
  ('nike', 80), ('adidas', 80),
  ('globus', 60),
  ('jelmoli', 60),
  ('manor', 50)
) as entry(pattern, confidence)
union all
select pattern, 'personal_care', confidence from (values
  ('dm drogerie', 90),
  ('amavita', 85), ('sun store', 85), ('benu', 85), ('topwell', 85), ('apotheke', 85),
  ('pharmacie', 85), ('farmacia', 85), ('drogerie', 85), ('droguerie', 85), ('douglas', 85),
  ('marionnaud', 85), ('import parfumerie', 85), ('coiffeur', 85), ('coiffure', 85),
  ('coop vitality', 85),
  ('barber', 80),
  ('kosmetik', 75),
  ('muller', 70)
) as entry(pattern, confidence)
union all
select pattern, 'hobbies', confidence from (values
  ('ochsner sport', 85), ('sportxx', 85), ('decathlon', 85), ('intersport', 85),
  ('transa', 85), ('bachli', 85), ('baechli', 85), ('fitnesspark', 85), ('update fitness', 85),
  ('orell fussli', 80), ('orell fuessli', 80), ('thalia', 80), ('ex libris', 80),
  ('kieser', 80),
  ('fitness', 75), ('steam', 75), ('playstation', 75), ('nintendo', 75), ('xbox', 75),
  ('coop bau hobby', 70),
  ('jumbo', 60), ('hornbach', 60), ('bauhaus', 60), ('obi', 60), ('do it garden', 60)
) as entry(pattern, confidence)
union all
select pattern, 'gifts', confidence from (values
  ('fleurop', 85),
  ('franz carl weber', 75), ('florist', 75),
  ('smyths', 70), ('blumen', 70)
) as entry(pattern, confidence)
union all
select pattern, 'shopping_electronics', confidence from (values
  ('digitec', 90), ('interdiscount', 90), ('mediamarkt', 90), ('media markt', 90),
  ('melectronics', 90),
  ('galaxus', 85), ('fust', 85), ('brack', 85), ('microspot', 85),
  ('aliexpress', 75),
  ('amazon', 70),
  ('ikea', 60), ('pfister', 60), ('conforama', 60), ('jysk', 60)
) as entry(pattern, confidence);

-- Subscriptions: a hobby by default, the subscription fixed cost when the amount fits.
insert into internal.known_merchants (pattern, category_key, fixed_cost_kind, confidence)
select pattern, 'hobbies', 'subscriptions', 70
  from unnest(array['netflix', 'spotify', 'disney plus', 'youtube premium']) as pattern;

-- Providers that are only ever paid as a fixed cost: they never set a category.
-- CATEGORIZATION.md also lists "init7" under phone/internet. Its only word contains a digit, so
-- its merchant key is empty and it can never match: it is left out (reported to the architect).
insert into internal.known_merchants (pattern, fixed_cost_kind)
select pattern, 'health_insurance'
  from unnest(array[
    'css', 'helsana', 'sanitas', 'swica', 'visana', 'concordia', 'assura', 'groupe mutuel', 'kpt',
    'atupri', 'egk', 'sympany', 'okk', 'agrisano'
  ]) as pattern
union all
select pattern, 'phone_internet'
  from unnest(array[
    'swisscom', 'sunrise', 'salt', 'upc', 'wingo', 'yallo', 'quickline', 'digital republic'
  ]) as pattern
union all
select pattern, 'other_insurance'
  from unnest(array[
    'mobiliar', 'axa', 'allianz', 'generali', 'helvetia', 'baloise', 'vaudoise', 'smile direct',
    'zurich versicherung'
  ]) as pattern
union all
select pattern, 'tax_provision'
  from unnest(array['steueramt', 'steuerverwaltung', 'administration fiscale']) as pattern
union all
select pattern, 'leasing_debts'
  from unnest(array['amag leasing', 'cembra', 'bmw financial']) as pattern;

insert into internal.mcc_categories (mcc_from, mcc_to, category_key, confidence)
select code, code, category_key, confidence from (values
  (5411, 'groceries', 80),
  (5451, 'groceries', 75),
  (5422, 'groceries', 70), (5462, 'groceries', 70), (5499, 'groceries', 70),
  (5441, 'groceries', 60),
  (5310, 'groceries', 50),
  (5812, 'eating_out', 85), (5814, 'eating_out', 85),
  (5811, 'eating_out', 70),
  (5813, 'going_out', 80),
  (7832, 'going_out', 85),
  (7922, 'going_out', 80),
  (7929, 'going_out', 70), (7996, 'going_out', 70),
  (7991, 'going_out', 60),
  (4111, 'transport', 90), (4112, 'transport', 90),
  (4121, 'transport', 85), (4131, 'transport', 85), (5542, 'transport', 85),
  (7523, 'transport', 85),
  (4784, 'transport', 80), (5541, 'transport', 80),
  (4789, 'transport', 75), (7512, 'transport', 75),
  (4511, 'transport', 60),
  (5611, 'clothes', 85), (5621, 'clothes', 85), (5651, 'clothes', 85), (5661, 'clothes', 85),
  (5691, 'clothes', 85),
  (5641, 'clothes', 80),
  (5631, 'clothes', 75), (5699, 'clothes', 75),
  (5655, 'clothes', 70), (5681, 'clothes', 70),
  (5311, 'clothes', 40),
  (7230, 'personal_care', 90),
  (5977, 'personal_care', 85),
  (5912, 'personal_care', 80), (7298, 'personal_care', 80),
  (8043, 'personal_care', 70),
  (8011, 'personal_care', 60), (8021, 'personal_care', 60), (8099, 'personal_care', 60),
  (5941, 'hobbies', 80), (7997, 'hobbies', 80),
  (5942, 'hobbies', 75), (5970, 'hobbies', 75), (5733, 'hobbies', 75), (7941, 'hobbies', 75),
  (5945, 'hobbies', 60),
  (5815, 'hobbies', 60), (5816, 'hobbies', 60), (5817, 'hobbies', 60), (5818, 'hobbies', 60),
  (5200, 'hobbies', 50), (5251, 'hobbies', 50),
  (7999, 'hobbies', 50),
  (5947, 'gifts', 80),
  (5992, 'gifts', 75),
  (5193, 'gifts', 60),
  (5732, 'shopping_electronics', 85),
  (5045, 'shopping_electronics', 75), (5722, 'shopping_electronics', 75),
  (5734, 'shopping_electronics', 75), (5946, 'shopping_electronics', 75),
  (4812, 'shopping_electronics', 75),
  (5712, 'other', 60), (5719, 'other', 60),
  (5331, 'other', 50),
  (5399, 'other', 40),
  (5999, 'other', 30)
) as entry(code, category_key, confidence)
union all
-- Airlines (3000-3299) as one range.
select 3000, 3299, 'transport', 60;

-- Read-only reference data: every signed-in user may read it, nobody but the owner may change it.
alter table internal.known_merchants enable row level security;
alter table internal.mcc_categories enable row level security;

create policy "reference data" on internal.known_merchants
  for select to authenticated using (true);
create policy "reference data" on internal.mcc_categories
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------------------------
-- Categorization: steps 6-8 of the pipeline (CATEGORIZATION.md, "The steps, in order")
-- ---------------------------------------------------------------------------------------------

-- Whether a categorization rule matches a transaction:
--   merchant: the rule's pattern key against the transaction key (merchant, else statement text);
--   raw_text: against the key of the statement text;
--   mcc:      the four-digit code equals the transaction's MCC.
-- 'contains' means the pattern's words appear as a contiguous run of whole words, 'equals' that
-- the keys are equal. A pattern without a key (only digits or punctuation) never matches text.
create function internal.rule_matches(
  p_match_field text,
  p_match_type text,
  p_pattern text,
  p_transaction_key text,
  p_raw_text_key text,
  p_mcc integer
)
returns boolean
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  pattern_key text;
  text_key text;
begin
  if p_match_field = 'mcc' then
    return p_mcc is not null
       and p_match_type = 'equals'
       and coalesce(p_pattern ~ '^[0-9]{4}$', false)
       and p_mcc = p_pattern::integer;
  end if;
  if p_match_field = 'merchant' then
    text_key := coalesce(p_transaction_key, '');
  elsif p_match_field = 'raw_text' then
    text_key := coalesce(p_raw_text_key, '');
  else
    return false;
  end if;
  pattern_key := internal.merchant_key(p_pattern);
  if pattern_key = '' or text_key = '' then
    return false;
  end if;
  if p_match_type = 'equals' then
    return text_key = pattern_key;
  end if;
  return p_match_type = 'contains' and internal.key_contains(text_key, pattern_key);
end;
$$;

-- Steps 6-8 for one transaction of the signed-in user, with the caller's rights (their rules,
-- categories and fixed costs under RLS, and the reference lists):
--   6. The person's rules: highest priority first, then the longer pattern (key length; four for
--      an MCC rule), then the newer rule. Rules on archived categories are skipped.
--      categorized_by 'rule', confidence 100.
--   7. Known merchants: the longest matching pattern wins (equally long ones: the higher
--      confidence, then the earlier one in the key). If it names a fixed-cost kind and the
--      person has an active fixed cost of that kind within ±20 % of the amount (money out only),
--      the row is that fixed cost's payment (fixed_cost_id, no category, categorized_by 'none').
--      Otherwise its category, if the person has that default category active
--      (categorized_by 'merchant_list', the entry's confidence). Otherwise on to step 8.
--   8. MCC: the range containing the code, if the person has that category active
--      (categorized_by 'mcc').
-- Nothing found: no category, categorized_by 'none'.
create function internal.categorize(
  p_merchant text,
  p_raw_text text,
  p_mcc integer,
  p_amount_rappen bigint,
  out category_id uuid,
  out categorized_by text,
  out category_confidence smallint,
  out fixed_cost_id uuid
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  tx_key text := internal.transaction_key(p_merchant, p_raw_text);
  raw_key text := internal.merchant_key(p_raw_text);
  runs text[];
  known internal.known_merchants;
  code_range internal.mcc_categories;
begin
  categorized_by := 'none';

  -- 6. The person's rules.
  select r.category_id into category_id
    from public.categorization_rules r
    join public.categories c on c.id = r.category_id and c.user_id = r.user_id
   where r.user_id = me
     and c.archived_at is null
     and internal.rule_matches(r.match_field, r.match_type, r.pattern, tx_key, raw_key, p_mcc)
   order by r.priority desc,
            case when r.match_field = 'mcc' then 4
                 else char_length(internal.merchant_key(r.pattern)) end desc,
            r.created_at desc,
            r.id desc
   limit 1;
  if found then
    categorized_by := 'rule';
    category_confidence := 100;
    return;
  end if;

  -- 7. Known merchants. Equally long patterns: the higher confidence, then the one earlier in
  -- the key.
  runs := internal.key_runs(tx_key, 4);
  select k.* into known
    from internal.known_merchants k
   where k.pattern = any (runs)
   order by char_length(k.pattern) desc, k.confidence desc nulls last,
            array_position(runs, k.pattern), k.pattern
   limit 1;
  if found then
    if known.fixed_cost_kind is not null and p_amount_rappen < 0 then
      select f.id into fixed_cost_id
        from public.fixed_costs f
       where f.user_id = me
         and f.active
         and f.kind = known.fixed_cost_kind
         and 5 * abs(-p_amount_rappen - f.amount_rappen) <= f.amount_rappen
       order by abs(-p_amount_rappen - f.amount_rappen), f.created_at, f.id
       limit 1;
      if found then
        return;
      end if;
    end if;
    if known.category_key is not null then
      select c.id into category_id
        from public.categories c
       where c.user_id = me and c.default_key = known.category_key and c.archived_at is null;
      if found then
        categorized_by := 'merchant_list';
        category_confidence := known.confidence;
        return;
      end if;
    end if;
  end if;

  -- 8. MCC.
  if p_mcc is not null then
    select m.* into code_range
      from internal.mcc_categories m
     where p_mcc between m.mcc_from and m.mcc_to;
    if found then
      select c.id into category_id
        from public.categories c
       where c.user_id = me and c.default_key = code_range.category_key and c.archived_at is null;
      if found then
        categorized_by := 'mcc';
        category_confidence := code_range.confidence;
        return;
      end if;
    end if;
  end if;
end;
$$;

comment on function internal.categorize(text, text, integer, bigint) is
  'Steps 6-8 of the transaction pipeline for the signed-in user: their rules, known merchants (incl. fixed-cost providers), MCC. Runs with the caller''s rights.';

-- ---------------------------------------------------------------------------------------------
-- Privileges: nothing by default, then exactly what the transaction RPCs use
-- ---------------------------------------------------------------------------------------------

revoke all on internal.known_merchants, internal.mcc_categories from public, anon, authenticated;
grant select on internal.known_merchants, internal.mcc_categories to authenticated;

revoke all on function internal.merchant_key(text) from public, anon, authenticated;
revoke all on function internal.key_contains(text, text) from public, anon, authenticated;
revoke all on function internal.transaction_key(text, text) from public, anon, authenticated;
revoke all on function internal.same_merchant(text, text) from public, anon, authenticated;
revoke all on function internal.key_runs(text, integer) from public, anon, authenticated;
revoke all on function internal.fixed_cost_hint(text, text) from public, anon, authenticated;
revoke all on function internal.needs_review(bigint, uuid, text, integer, uuid, boolean, boolean, boolean)
  from public, anon, authenticated;
revoke all on function internal.rule_matches(text, text, text, text, text, integer)
  from public, anon, authenticated;
revoke all on function internal.categorize(text, text, integer, bigint)
  from public, anon, authenticated;

grant execute on function internal.merchant_key(text) to authenticated;
grant execute on function internal.key_contains(text, text) to authenticated;
grant execute on function internal.transaction_key(text, text) to authenticated;
grant execute on function internal.same_merchant(text, text) to authenticated;
grant execute on function internal.key_runs(text, integer) to authenticated;
grant execute on function internal.fixed_cost_hint(text, text) to authenticated;
grant execute on function internal.needs_review(bigint, uuid, text, integer, uuid, boolean, boolean, boolean)
  to authenticated;
grant execute on function internal.rule_matches(text, text, text, text, text, integer)
  to authenticated;
grant execute on function internal.categorize(text, text, integer, bigint) to authenticated;

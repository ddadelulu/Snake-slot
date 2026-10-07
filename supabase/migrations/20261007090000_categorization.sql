-- Milestone 3, part 1: merchant keys, the reference lists and categorization (docs/CATEGORIZATION.md).
--
--   * Schema internal (D-038): helpers and reference data the transaction RPCs need while running
--     with the caller's rights. Signed-in users may use it; PostgREST does not expose it (only
--     public is served); it is read-only for clients. Schema private stays closed.
--   * Merchant keys: internal.merchant_key is the exact mirror of merchantKey() in @budget/core
--     (parity-tested in supabase/tests/categorization.test.ts). Keys are stored where they are
--     compared often: transactions.merchant_key, categorization_rules.pattern_key and
--     fixed_costs.merchant_hint_key are generated columns, so no key is computed per candidate.
--   * Word lists (generic words, payment words, month names): what never identifies a merchant on
--     its own. Documented in CATEGORIZATION.md, compared with it by a test.
--   * Reference lists: internal.known_merchants and internal.mcc_categories, seeded exactly from
--     CATEGORIZATION.md (a test compares them with the document). They change through a new
--     migration, reviewed by Scarlett Johansson.
--   * internal.categorize: steps 6-8 of the pipeline for money out (the person's rules, known
--     merchants, MCC) and refund recognition for money in (D-039).
--   * internal.suggest_rule: the pattern proposed for "Always do this for …?" (D-042).
--   * categorized_by gains 'refund' (CATEGORIZED_BY in @budget/core).
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
--   1. apostrophes (' ’ ´ `) dropped, accented letters mapped by a fixed table (the same table as
--      LETTER_MAP in @budget/core), then the ligatures ß → ss, Æ/æ → ae, Œ/œ → oe;
--   2. ASCII upper case to lower case (nothing else changes case: lower() under collation "C");
--   3. every "e" directly after "a", "o" or "u" dropped, so Bäckerei/BAECKEREI, Müller/MUELLER
--      and Sprüngli/SPRUENGLI share a key (the matches cannot overlap, so one pass does it);
--   4. split into words at every run of characters other than a-z and 0-9;
--   5. words containing a digit dropped (store numbers, postal codes, card numbers), and the
--      stopwords (legal forms and web noise) dropped;
--   6. the remaining words joined by one space.
-- A text of ASCII characters only (byte length = character length) skips step 1's table. The
-- table is applied with one regular expression per letter, which is several times faster than
-- translate() on long statement texts. Postgres regular expressions compare bracket ranges by
-- code point, like JavaScript.
create function internal.merchant_key(p_text text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select pg_catalog.btrim(pg_catalog.regexp_replace(
           ' ' || pg_catalog.regexp_replace(
             pg_catalog.regexp_replace(
               pg_catalog.lower((
                 case
                   when pg_catalog.octet_length(source.text) = pg_catalog.char_length(source.text)
                     then pg_catalog.replace(pg_catalog.replace(source.text, '''', ''), '`', '')
                   else
                     pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(
                       pg_catalog.replace(
                         pg_catalog.regexp_replace(pg_catalog.regexp_replace(
                         pg_catalog.regexp_replace(pg_catalog.regexp_replace(
                         pg_catalog.regexp_replace(pg_catalog.regexp_replace(
                         pg_catalog.regexp_replace(pg_catalog.regexp_replace(
                         pg_catalog.regexp_replace(pg_catalog.regexp_replace(
                         pg_catalog.regexp_replace(
                           source.text,
                           '[''’´`]', '', 'g'),
                           '[ÀÁÂÃÄÅàáâãäå]', 'a', 'g'),
                           '[ÇçĆćČč]', 'c', 'g'),
                           '[ÈÉÊËèéêë]', 'e', 'g'),
                           '[ÌÍÎÏìíîï]', 'i', 'g'),
                           '[Ññ]', 'n', 'g'),
                           '[ÒÓÔÕÖØòóôõöø]', 'o', 'g'),
                           '[ÙÚÛÜùúûü]', 'u', 'g'),
                           '[ÝýÿŸ]', 'y', 'g'),
                           '[ŠšŞş]', 's', 'g'),
                           '[ŽžŹźŻż]', 'z', 'g'),
                         'ß', 'ss'),
                       'Æ', 'ae'), 'æ', 'ae'), 'Œ', 'oe'), 'œ', 'oe')
                 end) collate "C"),
               '([aou])e', '\1', 'g'),
             '[^a-z0-9]+', ' ', 'g') || ' ',
           -- Every word is now enclosed in single spaces. Remove " word" for each dropped word; the
           -- lookahead leaves the following space for the next word.
           ' (?:[a-z0-9]*[0-9][a-z0-9]*|ag|gmbh|sa|sarl|sagl|ltd|llc|inc|kg|co|cie|www|com|ch)(?= )',
           '', 'g'))
    from (select coalesce(p_text, '') as text) as source
$$;

comment on function internal.merchant_key(text) is
  'Comparison key of a merchant name: apostrophes dropped, accents mapped, ASCII lower case, ae/oe/ue folded, words without digits and legal forms, single spaces. Mirror of merchantKey() in @budget/core.';

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
-- empty or has no key. Stored as transactions.merchant_key.
create function internal.transaction_key(p_merchant text, p_raw_text text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(nullif(internal.merchant_key(p_merchant), ''), internal.merchant_key(p_raw_text))
$$;

-- ---------------------------------------------------------------------------------------------
-- Word lists (CATEGORIZATION.md, "Word lists")
-- ---------------------------------------------------------------------------------------------

-- Kinds of places and articles ("Restaurant Krone", "Bäckerei Hug", "The Kitchen"): a shared
-- first word of this list does not make two merchants the same, and none of these words is
-- proposed as a rule on its own.
create function internal.generic_words()
returns text[]
language sql
immutable
parallel safe
set search_path = ''
as $$
  select '{restaurant,ristorante,pizzeria,trattoria,osteria,brasserie,bistro,cafe,caffe,bar,pub,
           club,lounge,hotel,gasthaus,gasthof,backerei,boulangerie,panetteria,metzgerei,boucherie,
           macelleria,confiserie,apotheke,pharmacie,farmacia,drogerie,drogurie,kiosk,garage,
           tankstelle,coiffeur,coiffure,salon,shop,store,laden,markt,boutique,online,take,imbiss,
           kebab,pizza,sushi,burger,parking,parkhaus,taxi,kino,cinema,fitness,florist,blumen,
           praxis,optik,studio,the,le,la,les,der,die,das,il,lo,el,zum,zur,chez}'::text[]
$$;

-- How or through whom something was paid, statement boilerplate and filler words ("TWINT",
-- "Kauf/Dienstleistung vom", "Dauerauftrag an", "ZKB Visa Debit"): a shared first word of this
-- list does not make two merchants the same, a fixed cost's merchant hint leaves them out, and
-- they are never proposed as a rule.
create function internal.payment_words()
returns text[]
language sql
immutable
parallel safe
set search_path = ''
as $$
  select '{twint,sumup,payrexx,paypal,stripe,kauf,einkauf,dienstleistung,zahlung,karte,karten,
           kartennummer,card,purchase,debit,debitkarte,kreditkarte,pos,maestro,visa,mastercard,
           pay,achat,paiement,carte,acquisto,pagamento,lastschrift,lsv,dauerauftrag,auftrag,
           uberweisung,gutschrift,belastung,e,banking,ebanking,ebill,rechnung,facture,fattura,
           invoice,an,von,vom,zugunsten,nr,ref,referenz,mitteilung,de,du,des,et,und,per,zkb,ubs,
           raiffeisen,postfinance,valiant,cler,bcv,bcge,bkb,bekb,lukb,sgkb,akb,glkb,tkb,szkb,gkb,
           yuh,revolut}'::text[]
$$;

-- Month names in German, French, Italian and English, full and short ("Mietzins Oktober"): a
-- fixed cost's merchant hint leaves them out, so next month's text still matches.
create function internal.month_words()
returns text[]
language sql
immutable
parallel safe
set search_path = ''
as $$
  select '{januar,februar,marz,april,mai,juni,juli,august,september,oktober,november,dezember,
           jan,feb,mar,apr,jun,jul,aug,sep,sept,okt,nov,dez,
           janvier,fevrier,mars,avril,juin,juillet,aout,septembre,octobre,novembre,decembre,
           janv,fevr,avr,juil,oct,dec,
           gennaio,febbraio,marzo,aprile,maggio,giugno,luglio,agosto,settembre,ottobre,dicembre,
           gen,mag,giu,lug,ago,set,ott,dic,
           january,february,march,may,june,july,october,december}'::text[]
$$;

-- Deduplication's "same merchant" (D-040): both keys non-empty, and either one key contains the
-- other (whole words), or their first words are equal and that word is neither generic nor a
-- payment word ("restaurant krone" and "restaurant sonne" are not the same; "coop zurich" and
-- "coop" are). add_transactions and internal.categorize compare stored keys with the same
-- expression written out (a function call per candidate would cost more than the comparison).
create function internal.same_merchant(p_key_a text, p_key_b text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(p_key_a, '') <> ''
     and coalesce(p_key_b, '') <> ''
     and (pg_catalog.strpos(' ' || p_key_a || ' ', ' ' || p_key_b || ' ') > 0
          or pg_catalog.strpos(' ' || p_key_b || ' ', ' ' || p_key_a || ' ') > 0
          or (pg_catalog.split_part(p_key_a, ' ', 1) = pg_catalog.split_part(p_key_b, ' ', 1)
              and pg_catalog.split_part(p_key_a, ' ', 1)
                  <> all (internal.generic_words() || internal.payment_words())))
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

-- What a fixed cost's merchant hint is compared with (D-031, steps 5 and 9): the words of the
-- merchant key without month names and payment words, else those of the statement text's key
-- ("Dauerauftrag Mietzins Verwaltung Muster AG Oktober" → "mietzins verwaltung muster"). Also
-- the key of a hint itself (fixed_costs.merchant_hint_key).
create function internal.hint_words(p_merchant text, p_raw_text text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  -- CASE evaluates the statement text's key only when the merchant leaves no word.
  select case
           when words.from_merchant <> '' then words.from_merchant
           else pg_catalog.array_to_string(array(
                  select w.word
                    from pg_catalog.unnest(pg_catalog.string_to_array(
                           internal.merchant_key(p_raw_text), ' ')) with ordinality as w(word, n)
                   where w.word <> all (internal.month_words() || internal.payment_words())
                   order by w.n), ' ')
         end
    from (
      select pg_catalog.array_to_string(array(
               select w.word
                 from pg_catalog.unnest(pg_catalog.string_to_array(
                        internal.merchant_key(p_merchant), ' ')) with ordinality as w(word, n)
                where w.word <> all (internal.month_words() || internal.payment_words())
                order by w.n), ' ') as from_merchant
    ) as words
$$;

-- What a fixed cost learns as its merchant_hint from a payment: the first three of its hint
-- words. Null when the payment has nothing identifying.
create function internal.fixed_cost_hint(p_merchant text, p_raw_text text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select nullif(pg_catalog.array_to_string(
           (pg_catalog.string_to_array(internal.hint_words(p_merchant, p_raw_text), ' '))[1:3],
           ' '), '')
$$;

-- ---------------------------------------------------------------------------------------------
-- Stored keys
-- ---------------------------------------------------------------------------------------------

-- Generated columns recompute when their inputs change. A later migration that changes one of
-- these functions must recompute them (for example update … set merchant = merchant).
alter table public.transactions
  add column merchant_key text not null
    generated always as (internal.transaction_key(merchant, raw_text)) stored;
comment on column public.transactions.merchant_key is
  'internal.transaction_key(merchant, raw_text): the key deduplication, rules, refunds and search compare (CATEGORIZATION.md).';

alter table public.categorization_rules
  add column pattern_key text not null
    generated always as (internal.merchant_key(pattern)) stored;
comment on column public.categorization_rules.pattern_key is
  'internal.merchant_key(pattern): what a merchant or raw_text rule matches.';

alter table public.fixed_costs
  add column merchant_hint_key text not null
    generated always as (internal.hint_words(merchant_hint, null)) stored;
comment on column public.fixed_costs.merchant_hint_key is
  'internal.hint_words(merchant_hint): the words a payment''s hint words must contain (step 5).';

-- categorized_by gains 'refund' (D-039): money in placed in the category of the purchase it
-- returns. CATEGORIZED_BY in @budget/core lists the same values (contracts.test.ts).
alter table public.transactions drop constraint transactions_categorized_by_check;
alter table public.transactions add constraint transactions_categorized_by_check
  check (categorized_by in ('none', 'user', 'rule', 'merchant_list', 'mcc', 'ai', 'refund'));

-- ---------------------------------------------------------------------------------------------
-- needs_review: whether the app asks the person for a category (API.md, REVIEW_CONFIDENCE = 70)
-- ---------------------------------------------------------------------------------------------

-- True when the transaction counts against the budget (money out, or money in with a category;
-- not deleted, merged or a fixed-cost payment), is not a split, was not placed by the person or
-- one of their rules, and has no category or a confidence below 70 (REVIEW_CONFIDENCE in
-- @budget/core). A recognized refund (confidence 60) is therefore asked about.
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

-- One row per pattern. An entry names a category (with its confidence), a fixed-cost kind, both
-- (subscriptions), or neither: a known name that is not spending (a bank), which stops the
-- category steps so the person is asked. Patterns are merchant keys of at most four words (the
-- lookup searches runs of up to four words).
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
  constraint known_merchants_confidence check ((category_key is null) = (confidence is null))
);

comment on table internal.known_merchants is
  'Known Swiss merchants (CATEGORIZATION.md): pattern (a merchant key) → default category with confidence, and/or the fixed-cost kind it is paid for; neither = not spending (never categorized, asked).';

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

-- Patterns are written as keys: ae/oe/ue appear folded ("blu cinema" for Blue Cinema, "steuramt"
-- for Steueramt), apostrophes dropped ("mcdonalds").
insert into internal.known_merchants (pattern, category_key, confidence)
select pattern, 'groceries', confidence from (values
  ('migros', 90), ('coop', 90), ('coop pronto', 90), ('migrolino', 90), ('denner', 90),
  ('aldi', 90), ('lidl', 90), ('volg', 90), ('spar', 90), ('alnatura', 90), ('farmy', 90),
  ('manor food', 90), ('globus delicatessa', 90), ('aldi suisse', 90),
  ('avec', 60), ('coop city', 60), ('k kiosk', 60), ('kkiosk', 60), ('backerei', 60),
  ('boulangerie', 60)
) as entry(pattern, confidence)
union all
select pattern, 'eating_out', confidence from (values
  ('migros restaurant', 90), ('coop restaurant', 90), ('mcdonalds', 90), ('mc donalds', 90),
  ('burger king', 90), ('kfc', 90), ('subway', 90), ('starbucks', 90), ('vapiano', 90),
  ('holy cow', 90), ('tibits', 90), ('hiltl', 90), ('dean david', 90), ('nordsee', 90),
  ('pizza hut', 90), ('dominos', 90), ('uber eats', 90), ('ubereats', 90), ('smood', 90),
  ('restaurant', 80), ('ristorante', 80), ('pizzeria', 80), ('trattoria', 80),
  ('migros take away', 80),
  ('cafe', 75), ('caffe', 75), ('coffee', 75), ('kebab', 75),
  ('sprungli', 70), ('too good to go', 70)
) as entry(pattern, confidence)
union all
select pattern, 'going_out', confidence from (values
  ('pathe', 90), ('kitag', 90), ('arena cinemas', 90),
  ('blu cinema', 85), ('ticketcorner', 85), ('starticket', 85), ('eventfrog', 85),
  ('hallenstadion', 85),
  ('cinema', 80), ('kino', 80), ('see tickets', 80),
  ('pub', 70)
) as entry(pattern, confidence)
union all
select pattern, 'transport', confidence from (values
  ('sbb', 95), ('zvv', 95), ('bernmobil', 95), ('vbz', 95), ('postauto', 95),
  ('cff', 90), ('ffs', 90), ('bls', 90), ('tpg', 90), ('bvb', 90), ('vbl', 90),
  ('publibike', 90), ('parkingpay', 90), ('easypark', 90), ('migrol', 90), ('flixbus', 90),
  ('uber', 85), ('taxi', 85), ('parkhaus', 85), ('mobility', 85), ('shell', 85), ('avia', 85),
  ('esso', 85), ('eni', 85), ('tamoil', 85), ('socar', 85), ('agrola', 85), ('bp', 85),
  ('coop mineralol', 85),
  ('parking', 80), ('lime', 80), ('bolt', 80), ('sixt', 80), ('europcar', 80), ('hertz', 80),
  ('easyjet', 80),
  ('tcs', 70)
) as entry(pattern, confidence)
union all
select pattern, 'clothes', confidence from (values
  ('zara', 90), ('h m', 90), ('uniqlo', 90), ('zalando', 90), ('about you', 90),
  ('bershka', 90), ('pull bear', 90), ('stradivarius', 90), ('massimo dutti', 90),
  ('tally weijl', 90), ('chicoree', 90), ('primark', 90), ('asos', 90), ('ochsner shos', 90),
  ('hm', 85), ('c a', 85), ('mango', 85), ('vogele', 85), ('dosenbach', 85), ('snipes', 85),
  ('foot locker', 85), ('bata', 85), ('pkz', 85), ('schild', 85), ('esprit', 85),
  ('bonprix', 85), ('shein', 85), ('levis', 85),
  ('nike', 80), ('adidas', 80),
  ('globus', 60), ('jelmoli', 60),
  ('manor', 50)
) as entry(pattern, confidence)
union all
select pattern, 'personal_care', confidence from (values
  ('dm drogerie', 90),
  ('amavita', 85), ('sun store', 85), ('benu', 85), ('topwell', 85), ('apotheke', 85),
  ('pharmacie', 85), ('farmacia', 85), ('drogerie', 85), ('drogurie', 85), ('douglas', 85),
  ('marionnaud', 85), ('import parfumerie', 85), ('coiffeur', 85), ('coiffure', 85),
  ('coop vitality', 85),
  ('barber', 80),
  ('kosmetik', 75)
) as entry(pattern, confidence)
union all
select pattern, 'hobbies', confidence from (values
  ('ochsner sport', 85), ('sportxx', 85), ('decathlon', 85), ('intersport', 85),
  ('transa', 85), ('bachli', 85), ('fitnesspark', 85), ('update fitness', 85),
  ('orell fussli', 80), ('thalia', 80), ('ex libris', 80), ('kieser', 80),
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
-- CATEGORIZATION.md explains why Init7 is missing: its only word contains a digit, so its merchant
-- key is empty and it could never match.
insert into internal.known_merchants (pattern, fixed_cost_kind)
select pattern, 'health_insurance'
  from unnest(array[
    'css', 'helsana', 'sanitas', 'swica', 'visana', 'concordia', 'assura', 'groupe mutul', 'kpt',
    'atupri', 'egk', 'sympany', 'okk', 'agrisano'
  ]) as pattern
union all
select pattern, 'phone_internet'
  from unnest(array[
    'swisscom', 'sunrise', 'salt', 'upc', 'wingo', 'yallo', 'quickline', 'digital republic',
    'coop mobile'
  ]) as pattern
union all
select pattern, 'other_insurance'
  from unnest(array[
    'mobiliar', 'axa', 'allianz', 'generali', 'helvetia', 'baloise', 'vaudoise', 'smile direct',
    'zurich versicherung'
  ]) as pattern
union all
select pattern, 'tax_provision'
  from unnest(array['steuramt', 'steurverwaltung', 'administration fiscale']) as pattern
union all
select pattern, 'leasing_debts'
  from unnest(array['amag leasing', 'cembra', 'bmw financial']) as pattern;

-- Known names that are not spending (banks, card issuers): money moved there is a transfer or a
-- card bill, not a purchase. They stop the category steps, so "Überweisung an Migros Bank" is
-- not groceries and is asked about.
insert into internal.known_merchants (pattern)
select pattern
  from unnest(array[
    'migros bank', 'bank cler', 'raiffeisen', 'postfinance', 'ubs', 'zkb', 'zurcher kantonalbank',
    'credit suisse', 'valiant', 'bcv', 'bcge', 'bekb', 'berner kantonalbank', 'lukb',
    'luzerner kantonalbank', 'bkb', 'basler kantonalbank', 'sgkb', 'st galler kantonalbank',
    'akb', 'aargauische kantonalbank', 'swissquote', 'yuh', 'revolut', 'cornercard', 'viseca',
    'swisscard'
  ]) as pattern;

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
-- Categorization: steps 6-8 of the pipeline, and refunds (CATEGORIZATION.md, "The steps")
-- ---------------------------------------------------------------------------------------------

-- One transaction of the signed-in user, with the caller's rights (their rules, categories,
-- fixed costs and transactions under RLS, and the reference lists).
--
-- Money out (steps 6-8):
--   6. The person's rules: highest priority first, then the longer pattern (key length; four for
--      an MCC rule), then the newer rule. Rules on archived categories are skipped. A merchant
--      rule matches the transaction key (merchant, else statement text), a raw_text rule the key
--      of the statement text, an MCC rule the code; 'contains' = the pattern's words as a
--      contiguous run of whole words, 'equals' = the same key. categorized_by 'rule', 100.
--   7. Known merchants: the longest matching pattern wins (equally long ones: the higher
--      confidence, then the earlier one in the key). If it names a fixed-cost kind and the
--      person has an active fixed cost of that kind within ±20 % of the amount that has no other
--      payment booked within 20 days, the row is that fixed cost's payment (fixed_cost_id, no
--      category, categorized_by 'none'). Otherwise its category, if the person has that default
--      category active (categorized_by 'merchant_list', the entry's confidence). An entry with
--      neither (not spending, e.g. a bank) ends here without a category. Otherwise on to step 8.
--   8. MCC: the range containing the code, if the person has that category active
--      (categorized_by 'mcc').
-- Money in (D-039): rules, known merchants and MCC never apply (a salary from "SBB" is no train
-- ticket). A refund is recognized instead: among the 200 most recent purchases booked on the
-- same local day or up to 90 days before (by the person's time zone) that are not deleted,
-- merged or a fixed-cost payment, have a category that is still active and are at least as
-- large as this amount, the most recent one from the same merchant (internal.same_merchant)
-- gives its category: categorized_by 'refund', confidence 60, so the person is asked.
-- Nothing found: no category, categorized_by 'none'.
create function internal.categorize(
  p_merchant text,
  p_raw_text text,
  p_mcc integer,
  p_amount_rappen bigint,
  p_booked_at timestamptz,
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
  merchant_only_key text := internal.merchant_key(p_merchant);
  tx_key text;
  tx_padded text;
  tx_first text;
  tx_first_distinctive boolean;
  raw_key text;
  raw_padded text;
  user_zone text;
  local_day date;
  runs text[];
  known internal.known_merchants;
  code_range internal.mcc_categories;
begin
  categorized_by := 'none';
  if me is null or coalesce(p_amount_rappen, 0) = 0 then
    return;
  end if;
  if merchant_only_key <> '' then
    tx_key := merchant_only_key;
  else
    raw_key := internal.merchant_key(p_raw_text);
    tx_key := raw_key;
  end if;
  tx_padded := ' ' || tx_key || ' ';

  -- Money in: refund recognition only.
  if p_amount_rappen > 0 then
    if tx_key = '' or p_booked_at is null then
      return;
    end if;
    select pr.timezone into user_zone from public.profiles pr where pr.id = me;
    local_day := (p_booked_at at time zone user_zone)::date;
    tx_first := pg_catalog.split_part(tx_key, ' ', 1);
    tx_first_distinctive := tx_first <> all (internal.generic_words() || internal.payment_words());
    select purchase.category_id into category_id
      from (
        select t.category_id, t.merchant_key, t.booked_at, t.created_at, t.id
          from public.transactions t
         where t.user_id = me
           and t.booked_at >= ((local_day - 90)::timestamp at time zone user_zone)
           and t.booked_at < ((local_day + 1)::timestamp at time zone user_zone)
           and t.amount_rappen <= -p_amount_rappen
           and t.category_id is not null
           and t.fixed_cost_id is null
           and t.deleted_at is null
           and t.merged_into_id is null
           and t.merchant_key <> ''
         order by t.booked_at desc, t.created_at desc, t.id desc
         limit 200
      ) as purchase
      join public.categories c
        on c.id = purchase.category_id and c.user_id = me and c.archived_at is null
     -- internal.same_merchant(tx_key, purchase.merchant_key), written out.
     where pg_catalog.strpos(' ' || purchase.merchant_key || ' ', tx_padded) > 0
        or pg_catalog.strpos(tx_padded, ' ' || purchase.merchant_key || ' ') > 0
        or (tx_first_distinctive
            and pg_catalog.split_part(purchase.merchant_key, ' ', 1) = tx_first)
     order by purchase.booked_at desc, purchase.created_at desc, purchase.id desc
     limit 1;
    if found then
      categorized_by := 'refund';
      category_confidence := 60;
    end if;
    return;
  end if;

  -- 6. The person's rules. The statement text's key is computed only when a raw_text rule needs
  -- it (it is the transaction key already when the merchant has none).
  if raw_key is null and exists (
       select 1 from public.categorization_rules r
        where r.user_id = me and r.match_field = 'raw_text') then
    raw_key := internal.merchant_key(p_raw_text);
  end if;
  raw_padded := ' ' || coalesce(raw_key, '') || ' ';
  select r.category_id into category_id
    from public.categorization_rules r
    join public.categories c on c.id = r.category_id and c.user_id = r.user_id
   where r.user_id = me
     and c.archived_at is null
     and case r.match_field
           when 'mcc' then
             r.match_type = 'equals' and p_mcc is not null
             and r.pattern = pg_catalog.lpad(p_mcc::text, 4, '0')
           when 'merchant' then
             r.pattern_key <> '' and tx_key <> ''
             and case r.match_type
                   when 'equals' then tx_key = r.pattern_key
                   when 'contains' then pg_catalog.strpos(tx_padded, ' ' || r.pattern_key || ' ') > 0
                   else false
                 end
           when 'raw_text' then
             r.pattern_key <> '' and coalesce(raw_key, '') <> ''
             and case r.match_type
                   when 'equals' then raw_key = r.pattern_key
                   when 'contains' then pg_catalog.strpos(raw_padded, ' ' || r.pattern_key || ' ') > 0
                   else false
                 end
           else false
         end
   order by r.priority desc,
            case when r.match_field = 'mcc' then 4 else pg_catalog.char_length(r.pattern_key) end desc,
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
   order by pg_catalog.char_length(k.pattern) desc, k.confidence desc nulls last,
            pg_catalog.array_position(runs, k.pattern), k.pattern
   limit 1;
  if found then
    if known.fixed_cost_kind is not null then
      select f.id into fixed_cost_id
        from public.fixed_costs f
       where f.user_id = me
         and f.active
         and f.kind = known.fixed_cost_kind
         and 5 * abs(-p_amount_rappen - f.amount_rappen) <= f.amount_rappen
         and not exists (
               select 1 from public.transactions t
                where t.user_id = me
                  and t.fixed_cost_id = f.id
                  and t.deleted_at is null
                  and t.merged_into_id is null
                  and t.booked_at between p_booked_at - interval '20 days'
                                      and p_booked_at + interval '20 days')
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
    elsif known.fixed_cost_kind is null then
      -- Not spending: no category, no MCC guess.
      return;
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

comment on function internal.categorize(text, text, integer, bigint, timestamptz) is
  'Money out: steps 6-8 of the transaction pipeline for the signed-in user (their rules, known merchants incl. fixed-cost providers, MCC). Money in: refund recognition (D-039). Runs with the caller''s rights.';

-- ---------------------------------------------------------------------------------------------
-- Rule suggestion (D-042)
-- ---------------------------------------------------------------------------------------------

-- The rule "Always do this for …?" proposes for a transaction, from its merchant only (never its
-- statement text): { match_field: 'merchant', match_type: 'contains', pattern } with
--   1. the longest known-merchant pattern contained in the merchant's key that is not a single
--      generic or payment word ("coop vitality", "manor food", "migros restaurant"; equally
--      long ones: the earlier in the key), else
--   2. the merchant key's first word that is neither generic nor a payment word when it has at
--      least three letters ("krone" for Restaurant Krone), else that word and the next one
--      ("mc donalds"),
-- or null when nothing distinctive is left (no merchant, "TWINT", "Kauf Karte Visa", "Bar").
create function internal.suggest_rule(p_merchant text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  merchant_only_key text := internal.merchant_key(p_merchant);
  skipped text[] := internal.generic_words() || internal.payment_words();
  runs text[];
  words text[];
  pattern text;
begin
  if merchant_only_key = '' then
    return null;
  end if;
  runs := internal.key_runs(merchant_only_key, 4);
  select k.pattern into pattern
    from internal.known_merchants k
   where k.pattern = any (runs)
     and k.pattern <> all (skipped)
   order by pg_catalog.char_length(k.pattern) desc, pg_catalog.array_position(runs, k.pattern),
            k.pattern
   limit 1;
  if pattern is null then
    words := array(
      select w.word
        from pg_catalog.unnest(pg_catalog.string_to_array(merchant_only_key, ' '))
             with ordinality as w(word, n)
       where w.word <> all (skipped)
       order by w.n);
    if pg_catalog.cardinality(words) = 0 then
      return null;
    elsif pg_catalog.char_length(words[1]) >= 3 then
      pattern := words[1];
    elsif pg_catalog.cardinality(words) >= 2 then
      pattern := words[1] || ' ' || words[2];
    else
      return null;
    end if;
  end if;
  return pg_catalog.jsonb_build_object(
    'match_field', 'merchant', 'match_type', 'contains', 'pattern', pattern);
end;
$$;

comment on function internal.suggest_rule(text) is
  'The rule proposed for "Always do this for …?" (D-042): a known-merchant pattern or the first distinctive word of the merchant; null when nothing distinctive is left.';

-- ---------------------------------------------------------------------------------------------
-- Privileges: nothing by default, then exactly what the transaction RPCs use
-- ---------------------------------------------------------------------------------------------

revoke all on internal.known_merchants, internal.mcc_categories from public, anon, authenticated;
grant select on internal.known_merchants, internal.mcc_categories to authenticated;

revoke all on function internal.merchant_key(text) from public, anon, authenticated;
revoke all on function internal.key_contains(text, text) from public, anon, authenticated;
revoke all on function internal.transaction_key(text, text) from public, anon, authenticated;
revoke all on function internal.generic_words() from public, anon, authenticated;
revoke all on function internal.payment_words() from public, anon, authenticated;
revoke all on function internal.month_words() from public, anon, authenticated;
revoke all on function internal.same_merchant(text, text) from public, anon, authenticated;
revoke all on function internal.key_runs(text, integer) from public, anon, authenticated;
revoke all on function internal.hint_words(text, text) from public, anon, authenticated;
revoke all on function internal.fixed_cost_hint(text, text) from public, anon, authenticated;
revoke all on function internal.needs_review(bigint, uuid, text, integer, uuid, boolean, boolean, boolean)
  from public, anon, authenticated;
revoke all on function internal.categorize(text, text, integer, bigint, timestamptz)
  from public, anon, authenticated;
revoke all on function internal.suggest_rule(text) from public, anon, authenticated;

grant execute on function internal.merchant_key(text) to authenticated;
grant execute on function internal.key_contains(text, text) to authenticated;
grant execute on function internal.transaction_key(text, text) to authenticated;
grant execute on function internal.generic_words() to authenticated;
grant execute on function internal.payment_words() to authenticated;
grant execute on function internal.month_words() to authenticated;
grant execute on function internal.same_merchant(text, text) to authenticated;
grant execute on function internal.key_runs(text, integer) to authenticated;
grant execute on function internal.hint_words(text, text) to authenticated;
grant execute on function internal.fixed_cost_hint(text, text) to authenticated;
grant execute on function internal.needs_review(bigint, uuid, text, integer, uuid, boolean, boolean, boolean)
  to authenticated;
grant execute on function internal.categorize(text, text, integer, bigint, timestamptz)
  to authenticated;
grant execute on function internal.suggest_rule(text) to authenticated;

-- The generated key columns call these functions with the rights of whoever writes the row, so
-- the backend role (service_role, which writes the tables directly) needs them too. Nothing else
-- of schema internal is granted to it.
grant execute on function internal.merchant_key(text) to service_role;
grant execute on function internal.transaction_key(text, text) to service_role;
grant execute on function internal.month_words() to service_role;
grant execute on function internal.payment_words() to service_role;
grant execute on function internal.hint_words(text, text) to service_role;

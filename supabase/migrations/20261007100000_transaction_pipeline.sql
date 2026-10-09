-- Milestone 3, part 2: the transaction pipeline and the transaction RPCs (docs/API.md,
-- "Transactions (Milestone 3)"; the rules are in docs/CATEGORIZATION.md).
--
--   * add_transactions: the one way transactions enter the database (manual entry and statement
--     files today): validation, re-import check, cross-source deduplication, look-alike checks,
--     fixed-cost detection, categorization, storage; optionally as a dry run.
--   * list_transactions, get_transaction: the Transactions screen (TransactionItem, with the
--     proposed rule).
--   * update_transaction, set_transaction_splits: corrections, "Always do this for …?" rules,
--     fixed-cost links, splits, soft delete.
--   * remove_import: undo a statement import for good (D-041). export_my_data: the data export
--     (revDSG/GDPR).
--   * get_overview gains needs_review_count and, per recent transaction, categorized_by and
--     needs_review.
--
-- Every RPC runs with the caller's rights (row-level security applies to every row it reads or
-- writes), needs a signed-in user (42501 otherwise) and reports invalid input as 22023 with the
-- error code as message and the problem in DETAIL. Every list in the input is bounded before it
-- is read element by element.

-- Deduplication looks for the same amount from a given source around the same time: an index
-- range per (amount, source), ordered by time, so the nearest candidates are read first and a
-- call's own rows (all of one source) are never read when looking at other sources.
create index transactions_user_amount_source_booked_at_idx
  on public.transactions (user_id, amount_rappen, source, booked_at);

-- What a merge copied into the surviving transaction, kept on the evidence row (D-041):
-- { "<field>": { "from": <survivor's value before>, "to": <value copied> }, … } with the fields
-- merchant, raw_text, mcc, items, note, original ({ amount_minor, currency }) and category
-- ({ category_id, categorized_by, category_confidence }). remove_import puts "from" back where
-- the survivor still holds "to". Null when the merge copied nothing.
alter table public.transactions
  add column merge_changes jsonb check (merge_changes is null or jsonb_typeof(merge_changes) = 'object');
comment on column public.transactions.merge_changes is
  'On a merged (evidence) row: what its merge copied into the surviving transaction, { field: { from, to } }, so removing the import can undo it (D-041).';

-- ---------------------------------------------------------------------------------------------
-- JSON input helpers
-- ---------------------------------------------------------------------------------------------

-- The integer a JSON value holds when it is a number without fraction within [p_min, p_max];
-- otherwise null (wrong type, fraction, out of range, or JSON null).
create function internal.json_bigint(p_value jsonb, p_min bigint, p_max bigint)
returns bigint
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  number_value numeric;
begin
  if p_value is null or jsonb_typeof(p_value) <> 'number' then
    return null;
  end if;
  number_value := p_value::numeric;
  if number_value <> trunc(number_value) or number_value < p_min or number_value > p_max then
    return null;
  end if;
  return number_value::bigint;
end;
$$;

-- The text of a JSON string; null for anything else.
create function internal.json_string(p_value jsonb)
returns text
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
begin
  if jsonb_typeof(p_value) = 'string' then
    return p_value #>> '{}';
  end if;
  return null;
end;
$$;

-- The uuid in a JSON string; null when the value is not a string holding a uuid.
create function internal.json_uuid(p_value jsonb)
returns uuid
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  text_value text := internal.json_string(p_value);
begin
  if text_value is null or not pg_catalog.pg_input_is_valid(text_value, 'uuid') then
    return null;
  end if;
  return text_value::uuid;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- One IngestRow, validated (API.md, add_transactions)
-- ---------------------------------------------------------------------------------------------

-- Checks one row of add_transactions and returns it as a transactions row (user, amount, booking
-- time resolved in p_timezone, merchant, statement text, MCC, source, external id, foreign
-- amount, items, the person's category, note). Splits and allow_duplicate are checked here and
-- read from the input by the caller. Raises 22023 with DETAIL "row <index>: <problem>":
--   invalid_row         a value has the wrong type, is out of bounds or is missing
--   invalid_splits      the parts do not form a valid split
--   category_not_found  a category is not one of the caller's active categories
create function internal.ingest_row(
  p_row jsonb,
  p_index integer,
  p_source text,
  p_timezone text
)
returns public.transactions
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  tx public.transactions;
  unknown_key text;
  value jsonb;
  text_value text;
  local_time time;
  splits jsonb;
  part jsonb;
  part_index integer;
  part_amount bigint;
  part_category uuid;
  parts_total numeric := 0;
  item jsonb;
  item_index integer;
  item_amount bigint;
  item_quantity bigint;
  items jsonb[] := '{}';
begin
  if jsonb_typeof(p_row) is distinct from 'object' then
    raise exception 'invalid_row'
      using errcode = '22023', detail = format('row %s: must be an object', p_index);
  end if;
  select k into unknown_key
    from jsonb_object_keys(p_row) as k
   where k not in (
     'amount_rappen', 'booked_at', 'booked_on', 'booked_time', 'merchant', 'raw_text', 'mcc',
     'source', 'external_id', 'original_amount_minor', 'original_currency', 'items',
     'category_id', 'splits', 'note', 'allow_duplicate'
   )
   order by k
   limit 1;
  if unknown_key is not null then
    raise exception 'invalid_row'
      using errcode = '22023', detail = format('row %s: unknown key "%s"', p_index, unknown_key);
  end if;

  tx.user_id := me;

  tx.amount_rappen := internal.json_bigint(p_row -> 'amount_rappen', -10000000000, 10000000000);
  if tx.amount_rappen is null or tx.amount_rappen = 0 then
    raise exception 'invalid_row'
      using errcode = '22023',
            detail = format('row %s: amount_rappen must be a non-zero integer within ±10000000000',
                            p_index);
  end if;

  text_value := internal.json_string(p_row -> 'source');
  if text_value is null or text_value not in ('manual', 'statement_import') then
    raise exception 'invalid_row'
      using errcode = '22023',
            detail = format('row %s: source must be "manual" or "statement_import"', p_index);
  end if;
  if text_value <> p_source then
    raise exception 'invalid_row'
      using errcode = '22023',
            detail = case when p_source = 'statement_import'
                       then format('row %s: rows of an import must have source "statement_import"', p_index)
                       else format('row %s: source "statement_import" needs "import"', p_index)
                     end;
  end if;
  tx.source := text_value;

  -- When: an instant with offset, or a local date (and time, else 12:00) in the user's zone.
  if (nullif(p_row -> 'booked_at', 'null') is null) = (nullif(p_row -> 'booked_on', 'null') is null) then
    raise exception 'invalid_row'
      using errcode = '22023',
            detail = format('row %s: exactly one of booked_at and booked_on is required', p_index);
  end if;
  if nullif(p_row -> 'booked_at', 'null') is not null then
    text_value := internal.json_string(p_row -> 'booked_at');
    if text_value is null
       or text_value !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$'
       or not pg_catalog.pg_input_is_valid(text_value, 'timestamptz') then
      raise exception 'invalid_row'
        using errcode = '22023',
              detail = format('row %s: booked_at must be an ISO 8601 date-time with an offset',
                              p_index);
    end if;
    if nullif(p_row -> 'booked_time', 'null') is not null then
      raise exception 'invalid_row'
        using errcode = '22023',
              detail = format('row %s: booked_time belongs to booked_on', p_index);
    end if;
    tx.booked_at := text_value::timestamptz;
  else
    text_value := internal.json_string(p_row -> 'booked_on');
    if text_value is null
       or text_value !~ '^\d{4}-\d{2}-\d{2}$'
       or not pg_catalog.pg_input_is_valid(text_value, 'date') then
      raise exception 'invalid_row'
        using errcode = '22023',
              detail = format('row %s: booked_on must be a date YYYY-MM-DD', p_index);
    end if;
    local_time := '12:00';
    if nullif(p_row -> 'booked_time', 'null') is not null then
      if coalesce(internal.json_string(p_row -> 'booked_time') !~ '^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$', true) then
        raise exception 'invalid_row'
          using errcode = '22023',
                detail = format('row %s: booked_time must be HH:MM or HH:MM:SS', p_index);
      end if;
      local_time := (p_row ->> 'booked_time')::time;
    end if;
    tx.booked_at := (text_value::date + local_time) at time zone p_timezone;
  end if;

  value := nullif(p_row -> 'merchant', 'null');
  if value is not null then
    text_value := internal.json_string(value);
    if text_value is null or text_value ~ '^[[:space:]]*$' or char_length(text_value) > 200 then
      raise exception 'invalid_row'
        using errcode = '22023',
              detail = format('row %s: merchant must be null or 1-200 characters', p_index);
    end if;
    tx.merchant := regexp_replace(text_value, '^[[:space:]]+|[[:space:]]+$', '', 'g');
  end if;

  value := nullif(p_row -> 'raw_text', 'null');
  if value is not null then
    text_value := internal.json_string(value);
    if text_value is null or char_length(text_value) > 4000 then
      raise exception 'invalid_row'
        using errcode = '22023',
              detail = format('row %s: raw_text must be null or at most 4000 characters', p_index);
    end if;
    tx.raw_text := nullif(text_value, '');
  end if;

  value := nullif(p_row -> 'mcc', 'null');
  if value is not null then
    tx.mcc := internal.json_bigint(value, 0, 9999);
    if tx.mcc is null then
      raise exception 'invalid_row'
        using errcode = '22023',
              detail = format('row %s: mcc must be null or an integer 0-9999', p_index);
    end if;
  end if;

  value := nullif(p_row -> 'external_id', 'null');
  if value is not null then
    text_value := internal.json_string(value);
    if text_value is null or char_length(text_value) not between 1 and 200 then
      raise exception 'invalid_row'
        using errcode = '22023',
              detail = format('row %s: external_id must be null or 1-200 characters', p_index);
    end if;
    tx.external_id := text_value;
  elsif tx.source = 'statement_import' then
    raise exception 'invalid_row'
      using errcode = '22023',
            detail = format('row %s: statement rows need an external_id', p_index);
  end if;

  if (nullif(p_row -> 'original_amount_minor', 'null') is null)
     <> (nullif(p_row -> 'original_currency', 'null') is null) then
    raise exception 'invalid_row'
      using errcode = '22023',
            detail = format('row %s: original_amount_minor and original_currency go together',
                            p_index);
  end if;
  if nullif(p_row -> 'original_amount_minor', 'null') is not null then
    tx.original_amount_minor :=
      internal.json_bigint(p_row -> 'original_amount_minor', -1000000000000, 1000000000000);
    if tx.original_amount_minor is null or tx.original_amount_minor = 0 then
      raise exception 'invalid_row'
        using errcode = '22023',
              detail = format('row %s: original_amount_minor must be a non-zero integer', p_index);
    end if;
    text_value := internal.json_string(p_row -> 'original_currency');
    if text_value is null or text_value !~ '^[A-Z]{3}$' then
      raise exception 'invalid_row'
        using errcode = '22023',
              detail = format('row %s: original_currency must be an ISO 4217 code such as EUR',
                              p_index);
    end if;
    tx.original_currency := text_value;
  end if;

  value := nullif(p_row -> 'items', 'null');
  if value is not null then
    if jsonb_typeof(value) <> 'array' or jsonb_array_length(value) > 500 then
      raise exception 'invalid_row'
        using errcode = '22023',
              detail = format('row %s: items must be a list of at most 500 items', p_index);
    end if;
    for item, item_index in
      select element, (ordinal - 1)::integer
        from jsonb_array_elements(value) with ordinality as listed(element, ordinal)
    loop
      if jsonb_typeof(item) <> 'object'
         or exists (select 1 from jsonb_object_keys(item) as k
                     where k not in ('description', 'amount_rappen', 'quantity')) then
        raise exception 'invalid_row'
          using errcode = '22023',
                detail = format('row %s: items[%s] must be { description, amount_rappen, quantity }',
                                p_index, item_index);
      end if;
      text_value := internal.json_string(item -> 'description');
      if text_value is null or text_value ~ '^[[:space:]]*$' then
        raise exception 'invalid_row'
          using errcode = '22023',
                detail = format('row %s: items[%s].description is empty', p_index, item_index);
      end if;
      item_amount := internal.json_bigint(item -> 'amount_rappen', -10000000000, 10000000000);
      if item_amount is null then
        raise exception 'invalid_row'
          using errcode = '22023',
                detail = format('row %s: items[%s].amount_rappen must be an integer within ±10000000000',
                                p_index, item_index);
      end if;
      item_quantity := null;
      if nullif(item -> 'quantity', 'null') is not null then
        item_quantity := internal.json_bigint(item -> 'quantity', 1, 2147483647);
        if item_quantity is null then
          raise exception 'invalid_row'
            using errcode = '22023',
                  detail = format('row %s: items[%s].quantity must be a positive integer',
                                  p_index, item_index);
        end if;
      end if;
      items := array_append(items, jsonb_strip_nulls(jsonb_build_object(
        'description', text_value, 'amount_rappen', item_amount, 'quantity', item_quantity)));
    end loop;
    if cardinality(items) > 0 then
      tx.items := to_jsonb(items);
      if octet_length(tx.items::text) > 20000 then
        raise exception 'invalid_row'
          using errcode = '22023',
                detail = format('row %s: items must be at most 20000 bytes', p_index);
      end if;
    end if;
  end if;

  value := nullif(p_row -> 'category_id', 'null');
  if value is not null then
    tx.category_id := internal.json_uuid(value);
    if tx.category_id is null then
      raise exception 'invalid_row'
        using errcode = '22023', detail = format('row %s: category_id must be a uuid', p_index);
    end if;
    if not exists (select 1 from public.categories c
                    where c.id = tx.category_id and c.user_id = me and c.archived_at is null) then
      raise exception 'category_not_found'
        using errcode = '22023',
              detail = format('row %s: category_id is not one of your active categories', p_index);
    end if;
  end if;

  splits := nullif(p_row -> 'splits', 'null');
  if splits is not null then
    if jsonb_typeof(splits) <> 'array' then
      raise exception 'invalid_splits'
        using errcode = '22023', detail = format('row %s: splits must be a list', p_index);
    end if;
    if jsonb_array_length(splits) > 0 then
      if tx.category_id is not null then
        raise exception 'invalid_splits'
          using errcode = '22023',
                detail = format('row %s: a split transaction has no category_id of its own', p_index);
      end if;
      if jsonb_array_length(splits) not between 2 and 50 then
        raise exception 'invalid_splits'
          using errcode = '22023',
                detail = format('row %s: a split has 2 to 50 parts', p_index);
      end if;
      for part, part_index in
        select element, (ordinal - 1)::integer
          from jsonb_array_elements(splits) with ordinality as listed(element, ordinal)
      loop
        if jsonb_typeof(part) <> 'object'
           or exists (select 1 from jsonb_object_keys(part) as k
                       where k not in ('category_id', 'amount_rappen', 'note')) then
          raise exception 'invalid_splits'
            using errcode = '22023',
                  detail = format('row %s: splits[%s] must be { category_id, amount_rappen, note }',
                                  p_index, part_index);
        end if;
        part_amount := internal.json_bigint(part -> 'amount_rappen', -10000000000, 10000000000);
        if part_amount is null or part_amount = 0 or sign(part_amount) <> sign(tx.amount_rappen) then
          raise exception 'invalid_splits'
            using errcode = '22023',
                  detail = format('row %s: splits[%s].amount_rappen must be a non-zero integer with the sign of the transaction',
                                  p_index, part_index);
        end if;
        parts_total := parts_total + part_amount;
        value := nullif(part -> 'note', 'null');
        if value is not null
           and coalesce(char_length(internal.json_string(value)) > 500, true) then
          raise exception 'invalid_splits'
            using errcode = '22023',
                  detail = format('row %s: splits[%s].note must be null or at most 500 characters',
                                  p_index, part_index);
        end if;
        value := nullif(part -> 'category_id', 'null');
        if value is not null then
          part_category := internal.json_uuid(value);
          if part_category is null then
            raise exception 'invalid_splits'
              using errcode = '22023',
                    detail = format('row %s: splits[%s].category_id must be a uuid or null',
                                    p_index, part_index);
          end if;
          if not exists (select 1 from public.categories c
                          where c.id = part_category and c.user_id = me and c.archived_at is null) then
            raise exception 'category_not_found'
              using errcode = '22023',
                    detail = format('row %s: splits[%s].category_id is not one of your active categories',
                                    p_index, part_index);
          end if;
        end if;
      end loop;
      if parts_total <> tx.amount_rappen then
        raise exception 'invalid_splits'
          using errcode = '22023',
                detail = format('row %s: the parts add up to %s Rappen, the transaction is %s Rappen',
                                p_index, parts_total, tx.amount_rappen);
      end if;
    end if;
  end if;

  value := nullif(p_row -> 'note', 'null');
  if value is not null then
    text_value := internal.json_string(value);
    if text_value is null or char_length(text_value) > 500 then
      raise exception 'invalid_row'
        using errcode = '22023',
              detail = format('row %s: note must be null or at most 500 characters', p_index);
    end if;
    tx.note := case when text_value ~ '^[[:space:]]*$' then null else text_value end;
  end if;

  value := nullif(p_row -> 'allow_duplicate', 'null');
  if value is not null and jsonb_typeof(value) <> 'boolean' then
    raise exception 'invalid_row'
      using errcode = '22023',
            detail = format('row %s: allow_duplicate must be true or false', p_index);
  end if;

  return tx;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- TransactionItem (API.md, "Reading")
-- ---------------------------------------------------------------------------------------------

-- One of the caller's transactions as the app reads it: the row, its data source's name, the
-- rule "Always do this for …?" proposes (internal.suggest_rule, from the merchant only), its
-- split parts, the sources of the rows merged into it, and needs_review. Null when the id is not
-- the caller's. Timestamps in UTC.
create function internal.transaction_item(p_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
set timezone to 'UTC'
as $$
  select jsonb_build_object(
           'id', t.id,
           'amount_rappen', t.amount_rappen,
           'booked_at', t.booked_at,
           'merchant', t.merchant,
           'raw_text', t.raw_text,
           'note', t.note,
           'mcc', t.mcc,
           'source', t.source,
           'data_source_id', t.data_source_id,
           'data_source_name', d.display_name,
           'category_id', t.category_id,
           'categorized_by', t.categorized_by,
           'category_confidence', t.category_confidence,
           'fixed_cost_id', t.fixed_cost_id,
           'original_amount_minor', t.original_amount_minor,
           'original_currency', t.original_currency,
           'items', t.items,
           'suggested_rule', internal.suggest_rule(t.merchant),
           'splits', coalesce(parts.list, '[]'::jsonb),
           'merged_sources', coalesce(merged.list, '[]'::jsonb),
           'needs_review', internal.needs_review(
             t.amount_rappen, t.category_id, t.categorized_by, t.category_confidence,
             t.fixed_cost_id, parts.list is not null, t.deleted_at is not null,
             t.merged_into_id is not null),
           'deleted_at', t.deleted_at,
           'created_at', t.created_at
         )
    from public.transactions t
    left join public.data_sources d on d.id = t.data_source_id and d.user_id = t.user_id
    cross join lateral (
      select jsonb_agg(jsonb_build_object(
               'id', s.id,
               'category_id', s.category_id,
               'amount_rappen', s.amount_rappen,
               'note', s.note
             ) order by s.created_at, abs(s.amount_rappen) desc, s.id) as list
        from public.transaction_splits s
       where s.transaction_id = t.id
    ) as parts
    cross join lateral (
      select jsonb_agg(sources.source order by sources.source) as list
        from (select distinct m.source
                from public.transactions m
               where m.merged_into_id = t.id and m.user_id = t.user_id and m.deleted_at is null
             ) as sources
    ) as merged
   where t.id = p_id
     and t.user_id = (select auth.uid())
$$;

-- ---------------------------------------------------------------------------------------------
-- add_transactions: the pipeline (CATEGORIZATION.md, "The steps, in order")
-- ---------------------------------------------------------------------------------------------

-- Input { rows: [IngestRow, …] (1-2000), import: { file_name, format, bank } | null,
-- dry_run: boolean }. All rows of a call have one source (manual, or statement_import with
-- import). "Days" are local dates in the person's time zone, compared by date (D-040: no hour
-- arithmetic, so daylight-saving changes do not matter). Rows are processed in order; for each:
--   1. A row with the person's category or splits is stored as categorized_by 'user'
--      (confidence 100); steps 5-9 do not run for it.
--   2. Same source and external_id as a stored row (also one stored earlier in this call):
--      already_imported, nothing stored.
--   3. The same purchase from another source: a stored transaction of another source with the
--      same amount, booked at most 4 days before or after (by local date, inclusive), neither
--      deleted nor merged, without splits, not yet merged with a row from this source, with the
--      same merchant (internal.same_merchant: one key contains the other, or the same first word
--      that is neither generic nor a payment word). The closest in time wins, then the oldest.
--      Rows with splits or without a merchant key are never merged. The row is stored as
--      evidence with merged_into_id (categorized by steps 1 and 5-8, so it is complete if it is
--      ever unmerged); the survivor gains merchant, statement text, MCC, items and foreign amount
--      it lacked, a note when it has none, and the person's category when its own was a guess
--      (not placed by the person or a rule, not a fixed-cost payment). What it gained is kept on
--      the evidence row (merge_changes) for remove_import. duplicate_of describes the survivor.
--   4. Unless the row says allow_duplicate, possible_duplicate (nothing stored; duplicate_of
--      describes the stored transaction, the survivor when the match was merged):
--      a. statement rows: a row of the same source stored before this call (not deleted; merged
--         evidence counts) with the same amount, booked at most 4 days before or after (by local
--         date, as in 3), a different external_id and the same merchant (or both without a key):
--         the same purchase can carry the booking day in one file (a CSV without purchase
--         dates) and the purchase day in another (camt.053);
--      b. any row: a visible transaction of another source with the same amount within 4 days
--         (as in 3, not yet merged with a row from this source) when the merchants cannot be
--         compared: either has no merchant key, or either is a split (D-040).
--   5. Money out whose hint words (internal.hint_words) contain an active fixed cost's
--      merchant_hint_key, within ±20 % of its amount, when no other payment of that fixed cost is
--      booked within 20 days: that fixed cost's payment (no category). The longest hint wins.
--   6-8. internal.categorize: for money out the person's rules, known merchants, MCC; for money
--      in only refund recognition (D-039).
--   9. Added (not merged) money-out rows from a source other than manual entry that are still
--      without category: when exactly one active fixed cost has exactly this amount and no other
--      payment of it is booked within 20 days (inclusive), this is its payment; the fixed cost
--      learns a merchant hint (internal.fixed_cost_hint) when it has none.
-- Steps 3 and 4 read at most the 50 nearest candidates before and after the row per source, so
-- a file of thousands of identical amounts stays fast; a call's own rows are skipped by the
-- index (step 3, 4b: another source) or by their data source (4a) before any key is compared.
-- Statement rows are stored acknowledged (D-033), manual rows not. With import, one data_sources
-- row (kind statement_import) is created when anything is stored and every stored row is linked
-- to it. A dry run computes the same result and stores nothing (ids of new rows are null).
-- Serialized per user (advisory lock), so concurrent calls cannot both add the same row.
create function public.add_transactions(p jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
set timezone to 'UTC'
-- The per-row queries run up to 2000 times per call with the same shape; planning them again for
-- every row (custom plans) cost more than running them.
set plan_cache_mode to 'force_generic_plan'
as $$
declare
  me uuid := auth.uid();
  user_zone text;
  onboarded_at timestamptz;
  unknown_key text;
  input_rows jsonb;
  row_count integer;
  import_input jsonb;
  file_name text;
  import_format text;
  import_bank text;
  is_dry_run boolean := false;
  row_source text;
  other_sources text[];
  check_same_source boolean;
  fixed_costs_have_hints boolean;
  not_distinctive text[] := internal.generic_words() || internal.payment_words();
  row_index integer;
  row_input jsonb;
  tx public.transactions;
  tx_key text;
  tx_padded text;
  tx_first text;
  tx_first_distinctive boolean;
  tx_hint_padded text;
  local_day date;
  window_start timestamptz;
  window_end timestamptz;
  has_splits boolean;
  allow_duplicate boolean;
  existing public.transactions;
  candidate_id uuid;
  survivor public.transactions;
  shown public.transactions;
  shown_is_split boolean;
  placed record;
  take_category boolean;
  changes jsonb;
  fixed_candidate_id uuid;
  fixed_candidate_count integer;
  learned_hint text;
  new_id uuid;
  new_data_source_id uuid;
  outcome text;
  result_id uuid;
  result_is_new boolean;
  duplicate_of jsonb;
  review boolean;
  inserted_ids uuid[] := '{}';
  result_is_new_flags boolean[] := '{}';
  results jsonb[] := '{}';
  added_count integer := 0;
  merged_count integer := 0;
  already_count integer := 0;
  duplicate_count integer := 0;
  review_count integer := 0;
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  select pr.timezone, pr.onboarding_completed_at into user_zone, onboarded_at
    from public.profiles pr where pr.id = me;
  if not found then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if onboarded_at is null then
    raise exception 'not_onboarded'
      using errcode = '55000', detail = 'Transactions can be added after onboarding.';
  end if;

  -- The request itself.
  if jsonb_typeof(p) is distinct from 'object' then
    raise exception 'invalid_input'
      using errcode = '22023', detail = 'Expected { rows, import, dry_run }.';
  end if;
  select k into unknown_key
    from jsonb_object_keys(p) as k
   where k not in ('rows', 'import', 'dry_run')
   order by k
   limit 1;
  if unknown_key is not null then
    raise exception 'invalid_input'
      using errcode = '22023', detail = format('Unknown key "%s".', unknown_key);
  end if;
  input_rows := p -> 'rows';
  if jsonb_typeof(input_rows) is distinct from 'array' or jsonb_array_length(input_rows) = 0 then
    raise exception 'invalid_input'
      using errcode = '22023', detail = 'rows must be a list of 1 to 2000 rows.';
  end if;
  row_count := jsonb_array_length(input_rows);
  if row_count > 2000 then
    raise exception 'too_many_rows'
      using errcode = '22023',
            detail = format('%s rows; one call takes at most 2000.', row_count);
  end if;
  if nullif(p -> 'dry_run', 'null') is not null then
    if jsonb_typeof(p -> 'dry_run') <> 'boolean' then
      raise exception 'invalid_input'
        using errcode = '22023', detail = 'dry_run must be true or false.';
    end if;
    is_dry_run := (p -> 'dry_run')::boolean;
  end if;
  import_input := nullif(p -> 'import', 'null');
  if import_input is not null then
    if jsonb_typeof(import_input) <> 'object'
       or exists (select 1 from jsonb_object_keys(import_input) as k
                   where k not in ('file_name', 'format', 'bank')) then
      raise exception 'invalid_input'
        using errcode = '22023', detail = 'import must be { file_name, format, bank }.';
    end if;
    file_name := btrim(internal.json_string(import_input -> 'file_name'));
    if file_name is null or char_length(file_name) not between 1 and 255 then
      raise exception 'invalid_input'
        using errcode = '22023', detail = 'import.file_name must be 1-255 characters.';
    end if;
    import_format := internal.json_string(import_input -> 'format');
    if import_format is null or import_format not in ('csv', 'camt053') then
      raise exception 'invalid_input'
        using errcode = '22023', detail = 'import.format must be "csv" or "camt053".';
    end if;
    if nullif(import_input -> 'bank', 'null') is not null then
      import_bank := btrim(internal.json_string(import_input -> 'bank'));
      if import_bank is null or char_length(import_bank) not between 1 and 60 then
        raise exception 'invalid_input'
          using errcode = '22023', detail = 'import.bank must be null or 1-60 characters.';
      end if;
    end if;
    row_source := 'statement_import';
  else
    row_source := 'manual';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('public.add_transactions:' || me::text, 0)
  );

  -- What the person has stored before this call, read once: the other sources a row can merge
  -- with or look like (this call's rows all have row_source), whether there are earlier rows of
  -- this source to compare with (step 4a), and whether any fixed cost has a hint (step 5).
  select coalesce(array_agg(distinct t.source), '{}') into other_sources
    from public.transactions t
   where t.user_id = me
     and t.source <> row_source
     and t.deleted_at is null
     and t.merged_into_id is null;
  check_same_source := row_source = 'statement_import'
    and exists (select 1 from public.transactions t
                 where t.user_id = me and t.source = row_source and t.external_id is not null
                   and t.deleted_at is null);
  fixed_costs_have_hints := exists (
    select 1 from public.fixed_costs f
     where f.user_id = me and f.active and f.merchant_hint_key <> '');

  -- A dry run does all the work, then rolls this block back (BZ001 is raised and caught below);
  -- the results computed inside stay in the variables.
  begin
    for row_index in 0 .. row_count - 1 loop
      row_input := input_rows -> row_index;
      tx := internal.ingest_row(row_input, row_index, row_source, user_zone);
      has_splits := coalesce(jsonb_array_length(nullif(row_input -> 'splits', 'null')), 0) > 0;
      allow_duplicate := coalesce((nullif(row_input -> 'allow_duplicate', 'null'))::boolean, false);
      tx_key := internal.transaction_key(tx.merchant, tx.raw_text);
      tx_padded := ' ' || tx_key || ' ';
      tx_first := split_part(tx_key, ' ', 1);
      tx_first_distinctive := tx_first <> '' and tx_first <> all (not_distinctive);
      local_day := (tx.booked_at at time zone user_zone)::date;
      window_start := (local_day - 4)::timestamp at time zone user_zone;
      window_end := (local_day + 5)::timestamp at time zone user_zone;
      outcome := null;
      result_id := null;
      result_is_new := false;
      duplicate_of := null;
      candidate_id := null;
      changes := null;

      -- 2. Already imported.
      if tx.external_id is not null then
        select t.* into existing
          from public.transactions t
         where t.user_id = me and t.source = tx.source and t.external_id = tx.external_id;
        if found then
          outcome := 'already_imported';
          result_id := coalesce(existing.merged_into_id, existing.id);
          result_is_new := result_id = any (inserted_ids);
        end if;
      end if;

      -- 3. The same purchase from another source. Per other source, the 50 nearest rows on each
      -- side; then the merchant (internal.same_merchant written out on the stored keys).
      if outcome is null and not has_splits and tx_key <> ''
         and cardinality(other_sources) > 0 then
        select c.id into candidate_id
          from unnest(other_sources) as s(source)
          cross join lateral (
            (select t.id, t.booked_at, t.created_at, t.merchant_key
               from public.transactions t
              where t.user_id = me
                and t.amount_rappen = tx.amount_rappen
                and t.source = s.source
                and t.booked_at >= window_start
                and t.booked_at <= tx.booked_at
                and t.deleted_at is null
                and t.merged_into_id is null
              order by t.booked_at desc
              limit 50)
            union all
            (select t.id, t.booked_at, t.created_at, t.merchant_key
               from public.transactions t
              where t.user_id = me
                and t.amount_rappen = tx.amount_rappen
                and t.source = s.source
                and t.booked_at > tx.booked_at
                and t.booked_at < window_end
                and t.deleted_at is null
                and t.merged_into_id is null
              order by t.booked_at
              limit 50)
          ) as c
         where c.merchant_key <> ''
           and (strpos(' ' || c.merchant_key || ' ', tx_padded) > 0
                or strpos(tx_padded, ' ' || c.merchant_key || ' ') > 0
                or (tx_first_distinctive and split_part(c.merchant_key, ' ', 1) = tx_first))
           and not exists (select 1 from public.transaction_splits sp
                            where sp.transaction_id = c.id)
           and not exists (select 1 from public.transactions e
                            where e.merged_into_id = c.id and e.user_id = me
                              and e.source = tx.source and e.deleted_at is null)
         order by abs(extract(epoch from c.booked_at - tx.booked_at)), c.created_at, c.id
         limit 1;
        if candidate_id is not null then
          select t.* into survivor
            from public.transactions t
           where t.id = candidate_id and t.deleted_at is null and t.merged_into_id is null
             for update;
          if found then
            outcome := 'merged';
          end if;
        end if;
      end if;

      -- 4a. Possible duplicate from the same source (statement files): rows stored before this
      -- call, at most 4 local days apart.
      if outcome is null and check_same_source and not allow_duplicate then
        select c.id into candidate_id
          from (
            (select t.id, t.booked_at, t.created_at, t.merchant_key
               from public.transactions t
              where t.user_id = me
                and t.amount_rappen = tx.amount_rappen
                and t.source = tx.source
                and t.booked_at >= window_start
                and t.booked_at <= tx.booked_at
                and (new_data_source_id is null or t.data_source_id is distinct from new_data_source_id)
                and t.deleted_at is null
                and t.external_id is distinct from tx.external_id
              order by t.booked_at desc
              limit 50)
            union all
            (select t.id, t.booked_at, t.created_at, t.merchant_key
               from public.transactions t
              where t.user_id = me
                and t.amount_rappen = tx.amount_rappen
                and t.source = tx.source
                and t.booked_at > tx.booked_at
                and t.booked_at < window_end
                and (new_data_source_id is null or t.data_source_id is distinct from new_data_source_id)
                and t.deleted_at is null
                and t.external_id is distinct from tx.external_id
              order by t.booked_at
              limit 50)
          ) as c
         where case
                 when tx_key = '' then c.merchant_key = ''
                 else c.merchant_key <> ''
                      and (strpos(' ' || c.merchant_key || ' ', tx_padded) > 0
                           or strpos(tx_padded, ' ' || c.merchant_key || ' ') > 0
                           or (tx_first_distinctive
                               and split_part(c.merchant_key, ' ', 1) = tx_first))
               end
         order by abs(extract(epoch from c.booked_at - tx.booked_at)), c.created_at, c.id
         limit 1;
        if candidate_id is not null then
          outcome := 'possible_duplicate';
        end if;
      end if;

      -- 4b. A look-alike from another source whose merchant cannot be compared (D-040).
      if outcome is null and not allow_duplicate and cardinality(other_sources) > 0 then
        select c.id into candidate_id
          from unnest(other_sources) as s(source)
          cross join lateral (
            (select t.id, t.booked_at, t.created_at, t.merchant_key
               from public.transactions t
              where t.user_id = me
                and t.amount_rappen = tx.amount_rappen
                and t.source = s.source
                and t.booked_at >= window_start
                and t.booked_at <= tx.booked_at
                and t.deleted_at is null
                and t.merged_into_id is null
              order by t.booked_at desc
              limit 50)
            union all
            (select t.id, t.booked_at, t.created_at, t.merchant_key
               from public.transactions t
              where t.user_id = me
                and t.amount_rappen = tx.amount_rappen
                and t.source = s.source
                and t.booked_at > tx.booked_at
                and t.booked_at < window_end
                and t.deleted_at is null
                and t.merged_into_id is null
              order by t.booked_at
              limit 50)
          ) as c
         where (tx_key = '' or has_splits or c.merchant_key = ''
                or exists (select 1 from public.transaction_splits sp
                            where sp.transaction_id = c.id))
           and not exists (select 1 from public.transactions e
                            where e.merged_into_id = c.id and e.user_id = me
                              and e.source = tx.source and e.deleted_at is null)
         order by abs(extract(epoch from c.booked_at - tx.booked_at)), c.created_at, c.id
         limit 1;
        if candidate_id is not null then
          outcome := 'possible_duplicate';
        end if;
      end if;

      if outcome = 'possible_duplicate' then
        -- Point at the transaction the person sees (the survivor when the match was merged).
        select t.* into existing from public.transactions t where t.id = candidate_id;
        if existing.merged_into_id is not null then
          select t.* into existing from public.transactions t where t.id = existing.merged_into_id;
        end if;
        duplicate_of := jsonb_build_object(
          'id', existing.id,
          'booked_at', existing.booked_at,
          'merchant', existing.merchant,
          'amount_rappen', existing.amount_rappen,
          'source', existing.source
        );
      end if;

      if outcome is null or outcome = 'merged' then
        -- 1. Chosen by the person; otherwise 5-8 (and 9 below for added rows).
        if tx.category_id is not null or has_splits then
          tx.categorized_by := 'user';
          tx.category_confidence := 100;
        else
          tx.categorized_by := 'none';
          tx.category_confidence := null;
          tx.fixed_cost_id := null;
          -- 5. Fixed cost by its merchant hint.
          if tx.amount_rappen < 0 and tx_key <> '' and fixed_costs_have_hints then
            tx_hint_padded := ' ' || internal.hint_words(tx.merchant, tx.raw_text) || ' ';
            select f.id into tx.fixed_cost_id
              from public.fixed_costs f
             where f.user_id = me
               and f.active
               and f.merchant_hint_key <> ''
               and strpos(tx_hint_padded, ' ' || f.merchant_hint_key || ' ') > 0
               and 5 * abs(-tx.amount_rappen - f.amount_rappen) <= f.amount_rappen
               and not exists (
                     select 1 from public.transactions t
                      where t.user_id = me
                        and t.fixed_cost_id = f.id
                        and t.deleted_at is null
                        and t.merged_into_id is null
                        and t.booked_at between tx.booked_at - interval '20 days'
                                            and tx.booked_at + interval '20 days')
             order by char_length(f.merchant_hint_key) desc,
                      abs(-tx.amount_rappen - f.amount_rappen), f.created_at, f.id
             limit 1;
          end if;
          -- 6-8. Rules, known merchants, MCC (money out); refunds (money in).
          if tx.fixed_cost_id is null then
            select c.* into placed
              from internal.categorize(tx.merchant, tx.raw_text, tx.mcc::integer, tx.amount_rappen,
                                       tx.booked_at) as c;
            tx.category_id := placed.category_id;
            tx.categorized_by := placed.categorized_by;
            tx.category_confidence := placed.category_confidence;
            tx.fixed_cost_id := placed.fixed_cost_id;
          end if;
          -- 9. Fixed cost by exact amount.
          if outcome is null
             and tx.source <> 'manual'
             and tx.amount_rappen < 0
             and tx.category_id is null
             and tx.fixed_cost_id is null then
            select (array_agg(f.id))[1], count(*) into fixed_candidate_id, fixed_candidate_count
              from public.fixed_costs f
             where f.user_id = me and f.active and f.amount_rappen = -tx.amount_rappen;
            if fixed_candidate_count = 1 and not exists (
                 select 1 from public.transactions t
                  where t.user_id = me
                    and t.fixed_cost_id = fixed_candidate_id
                    and t.deleted_at is null
                    and t.merged_into_id is null
                    and t.booked_at between tx.booked_at - interval '20 days'
                                        and tx.booked_at + interval '20 days') then
              tx.fixed_cost_id := fixed_candidate_id;
              learned_hint := internal.fixed_cost_hint(tx.merchant, tx.raw_text);
              update public.fixed_costs f
                 set merchant_hint = learned_hint
               where f.id = fixed_candidate_id and f.user_id = me and f.merchant_hint is null;
              if found and learned_hint is not null then
                fixed_costs_have_hints := true;
              end if;
            end if;
          end if;
        end if;

        if outcome = 'merged' then
          -- What the survivor gains, recorded on the evidence row for remove_import.
          take_category := tx.categorized_by = 'user'
                           and tx.category_id is not null
                           and survivor.categorized_by not in ('user', 'rule')
                           and survivor.fixed_cost_id is null;
          changes := '{}'::jsonb;
          if survivor.merchant is null and tx.merchant is not null then
            changes := changes || jsonb_build_object('merchant',
              jsonb_build_object('from', null, 'to', tx.merchant));
          end if;
          if survivor.raw_text is null and tx.raw_text is not null then
            changes := changes || jsonb_build_object('raw_text',
              jsonb_build_object('from', null, 'to', tx.raw_text));
          end if;
          if survivor.mcc is null and tx.mcc is not null then
            changes := changes || jsonb_build_object('mcc',
              jsonb_build_object('from', null, 'to', tx.mcc));
          end if;
          if survivor.items is null and tx.items is not null then
            changes := changes || jsonb_build_object('items',
              jsonb_build_object('from', null, 'to', tx.items));
          end if;
          if survivor.original_amount_minor is null and tx.original_amount_minor is not null then
            changes := changes || jsonb_build_object('original', jsonb_build_object(
              'from', jsonb_build_object('amount_minor', null, 'currency', null),
              'to', jsonb_build_object('amount_minor', tx.original_amount_minor,
                                       'currency', tx.original_currency)));
          end if;
          if survivor.note is null and tx.note is not null then
            changes := changes || jsonb_build_object('note',
              jsonb_build_object('from', null, 'to', tx.note));
          end if;
          if take_category then
            changes := changes || jsonb_build_object('category', jsonb_build_object(
              'from', jsonb_build_object('category_id', survivor.category_id,
                                         'categorized_by', survivor.categorized_by,
                                         'category_confidence', survivor.category_confidence),
              'to', jsonb_build_object('category_id', tx.category_id,
                                       'categorized_by', 'user',
                                       'category_confidence', 100)));
          end if;
          changes := nullif(changes, '{}'::jsonb);
        end if;

        if import_input is not null and new_data_source_id is null then
          insert into public.data_sources (
            user_id, kind, provider, display_name, status, consent_version, settings, last_synced_at
          )
          values (
            me, 'statement_import', coalesce(import_bank, import_format), left(file_name, 80),
            'active', 'statement-import-1',
            jsonb_build_object('file_name', file_name, 'format', import_format, 'bank', import_bank,
                               'added', 0, 'merged', 0),
            now()
          )
          returning id into new_data_source_id;
        end if;

        insert into public.transactions (
          user_id, amount_rappen, original_amount_minor, original_currency, booked_at, merchant,
          raw_text, mcc, source, external_id, data_source_id, category_id, categorized_by,
          category_confidence, note, items, fixed_cost_id, merged_into_id, merge_changes,
          acknowledged_at
        )
        values (
          me, tx.amount_rappen, tx.original_amount_minor, tx.original_currency, tx.booked_at,
          tx.merchant, tx.raw_text, tx.mcc, tx.source, tx.external_id, new_data_source_id,
          tx.category_id, tx.categorized_by, tx.category_confidence, tx.note, tx.items,
          tx.fixed_cost_id, case when outcome = 'merged' then survivor.id end, changes,
          case when tx.source = 'statement_import' then now() end
        )
        returning id into new_id;
        inserted_ids := array_append(inserted_ids, new_id);

        if has_splits then
          insert into public.transaction_splits (user_id, transaction_id, category_id, amount_rappen, note)
          select me, new_id, internal.json_uuid(part -> 'category_id'),
                 (part ->> 'amount_rappen')::numeric::bigint,
                 nullif(internal.json_string(part -> 'note'), '')
            from jsonb_array_elements(row_input -> 'splits') as part;
        end if;

        if outcome = 'merged' then
          update public.transactions s
             set merchant = coalesce(s.merchant, tx.merchant),
                 raw_text = coalesce(s.raw_text, tx.raw_text),
                 mcc = coalesce(s.mcc, tx.mcc),
                 items = coalesce(s.items, tx.items),
                 original_currency = case when s.original_amount_minor is null
                                          then tx.original_currency else s.original_currency end,
                 original_amount_minor = coalesce(s.original_amount_minor, tx.original_amount_minor),
                 note = coalesce(s.note, tx.note),
                 category_id = case when take_category then tx.category_id else s.category_id end,
                 categorized_by = case when take_category then 'user' else s.categorized_by end,
                 category_confidence = case when take_category then 100::smallint
                                            else s.category_confidence end
           where s.id = survivor.id
          returning s.* into shown;
          shown_is_split := false;
          result_id := survivor.id;
          duplicate_of := jsonb_build_object(
            'id', shown.id,
            'booked_at', shown.booked_at,
            'merchant', shown.merchant,
            'amount_rappen', shown.amount_rappen,
            'source', shown.source
          );
          merged_count := merged_count + 1;
        else
          outcome := 'added';
          result_id := new_id;
          result_is_new := true;
          shown := tx;
          shown_is_split := has_splits;
          added_count := added_count + 1;
        end if;
      elsif outcome = 'already_imported' then
        select t.* into shown from public.transactions t where t.id = result_id;
        shown_is_split := exists (select 1 from public.transaction_splits s
                                   where s.transaction_id = result_id);
        already_count := already_count + 1;
      else
        shown := null;
        shown_is_split := false;
        duplicate_count := duplicate_count + 1;
      end if;

      review := coalesce(internal.needs_review(
        shown.amount_rappen, shown.category_id, shown.categorized_by, shown.category_confidence,
        shown.fixed_cost_id, shown_is_split, shown.deleted_at is not null,
        shown.merged_into_id is not null), false);
      if review then
        review_count := review_count + 1;
      end if;
      results := array_append(results, jsonb_build_object(
        'index', row_index,
        'outcome', outcome,
        'transaction_id', result_id,
        'duplicate_of', duplicate_of,
        'category_id', shown.category_id,
        'categorized_by', coalesce(shown.categorized_by, 'none'),
        'category_confidence', shown.category_confidence,
        'fixed_cost_id', shown.fixed_cost_id,
        'needs_review', review
      ));
      result_is_new_flags := array_append(result_is_new_flags, result_is_new);
    end loop;

    if new_data_source_id is not null then
      update public.data_sources d
         set settings = d.settings || jsonb_build_object('added', added_count, 'merged', merged_count)
       where d.id = new_data_source_id;
    end if;

    if is_dry_run then
      raise exception 'dry run' using errcode = 'BZ001';
    end if;
  exception
    when sqlstate 'BZ001' then
      -- Everything this call wrote is rolled back. Rows it would have created have no id.
      new_data_source_id := null;
      for row_index in 1 .. cardinality(results) loop
        if result_is_new_flags[row_index] then
          results[row_index] := jsonb_set(results[row_index], '{transaction_id}', 'null'::jsonb);
        end if;
      end loop;
  end;

  return jsonb_build_object(
    'data_source_id', new_data_source_id,
    'results', to_jsonb(results),
    'counts', jsonb_build_object(
      'added', added_count,
      'merged', merged_count,
      'already_imported', already_count,
      'possible_duplicate', duplicate_count,
      'needs_review', review_count
    )
  );
end;
$$;

comment on function public.add_transactions(jsonb) is
  'The transaction pipeline (API.md): validates, recognizes re-imports, merges duplicates across sources, reports look-alikes, detects fixed-cost payments, categorizes and stores; dry_run computes the same without storing.';

-- ---------------------------------------------------------------------------------------------
-- Reading
-- ---------------------------------------------------------------------------------------------

-- Filters (all optional, combined with AND; category_ids and uncategorized with OR): search
-- (merchant, note or statement text contain the term case-insensitively, % and _ matching
-- themselves; or the merchant key of the merchant, note or statement text contains the key of
-- the term, so "zurich" finds "Zürich" and "baeckerei" finds "Bäckerei"), category_ids (at most
-- 100; a split matches by any part), uncategorized (no category and not a fixed-cost payment, or
-- a split part without category), sources (at most 8), from / to (local dates in the user's
-- zone, inclusive), needs_review; limit 1-100 (default 50); cursor = the previous page's
-- next_cursor. Newest first by (booked_at, id); deleted and merged rows are left out. Returns
-- { items: TransactionItem[], next_cursor: { booked_at, id } | null } (keyset: the last item's
-- booking time in UTC with microseconds, and its id).
create function public.list_transactions(p jsonb)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
set timezone to 'UTC'
as $$
declare
  me uuid := auth.uid();
  input jsonb := coalesce(p, '{}'::jsonb);
  unknown_key text;
  value jsonb;
  user_zone text;
  search_pattern text;
  search_key text;
  category_filter uuid[];
  only_uncategorized boolean := false;
  source_filter text[];
  from_date date;
  to_date date;
  review_filter boolean;
  page_size integer := 50;
  cursor_at timestamptz;
  cursor_id uuid;
  page_ids uuid[];
  page_times timestamptz[];
  items jsonb;
  next_cursor jsonb;
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if jsonb_typeof(input) <> 'object' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'Expected an object of filters.';
  end if;
  select k into unknown_key
    from jsonb_object_keys(input) as k
   where k not in ('search', 'category_ids', 'uncategorized', 'sources', 'from', 'to',
                   'needs_review', 'limit', 'cursor')
   order by k
   limit 1;
  if unknown_key is not null then
    raise exception 'invalid_input'
      using errcode = '22023', detail = format('Unknown filter "%s".', unknown_key);
  end if;

  value := nullif(input -> 'search', 'null');
  if value is not null then
    if internal.json_string(value) is null or char_length(internal.json_string(value)) > 200 then
      raise exception 'invalid_input'
        using errcode = '22023', detail = 'search must be text of at most 200 characters.';
    end if;
    if btrim(internal.json_string(value)) <> '' then
      search_pattern := '%' || replace(replace(replace(btrim(internal.json_string(value)),
                                 '\', '\\'), '%', '\%'), '_', '\_') || '%';
      search_key := internal.merchant_key(internal.json_string(value));
    end if;
  end if;

  value := nullif(input -> 'category_ids', 'null');
  if value is not null then
    if jsonb_typeof(value) <> 'array' or jsonb_array_length(value) > 100 then
      raise exception 'invalid_input'
        using errcode = '22023', detail = 'category_ids must be a list of at most 100 ids.';
    end if;
    if exists (select 1 from jsonb_array_elements(value) as e where internal.json_uuid(e) is null) then
      raise exception 'invalid_input'
        using errcode = '22023', detail = 'category_ids must be a list of at most 100 ids.';
    end if;
    if jsonb_array_length(value) > 0 then
      select array_agg(internal.json_uuid(e)) into category_filter from jsonb_array_elements(value) as e;
    end if;
  end if;

  value := nullif(input -> 'uncategorized', 'null');
  if value is not null then
    if jsonb_typeof(value) <> 'boolean' then
      raise exception 'invalid_input'
        using errcode = '22023', detail = 'uncategorized must be true or false.';
    end if;
    only_uncategorized := value::boolean;
  end if;

  value := nullif(input -> 'sources', 'null');
  if value is not null then
    if jsonb_typeof(value) <> 'array' or jsonb_array_length(value) > 8 then
      raise exception 'invalid_input'
        using errcode = '22023', detail = 'sources must be a list of at most 8 transaction sources.';
    end if;
    if exists (select 1 from jsonb_array_elements(value) as e
                where coalesce(internal.json_string(e) not in (
                  'bank', 'android_notification', 'ios_shortcut', 'email', 'receipt',
                  'statement_import', 'manual', 'assistant'), true)) then
      raise exception 'invalid_input'
        using errcode = '22023', detail = 'sources must be a list of at most 8 transaction sources.';
    end if;
    if jsonb_array_length(value) > 0 then
      select array_agg(e #>> '{}') into source_filter from jsonb_array_elements(value) as e;
    end if;
  end if;

  value := nullif(input -> 'from', 'null');
  if value is not null then
    if coalesce(internal.json_string(value) !~ '^\d{4}-\d{2}-\d{2}$', true)
       or not pg_catalog.pg_input_is_valid(internal.json_string(value), 'date') then
      raise exception 'invalid_input' using errcode = '22023', detail = 'from must be a date YYYY-MM-DD.';
    end if;
    from_date := internal.json_string(value)::date;
  end if;

  value := nullif(input -> 'to', 'null');
  if value is not null then
    if coalesce(internal.json_string(value) !~ '^\d{4}-\d{2}-\d{2}$', true)
       or not pg_catalog.pg_input_is_valid(internal.json_string(value), 'date') then
      raise exception 'invalid_input' using errcode = '22023', detail = 'to must be a date YYYY-MM-DD.';
    end if;
    to_date := internal.json_string(value)::date;
  end if;

  value := nullif(input -> 'needs_review', 'null');
  if value is not null then
    if jsonb_typeof(value) <> 'boolean' then
      raise exception 'invalid_input'
        using errcode = '22023', detail = 'needs_review must be true or false.';
    end if;
    review_filter := value::boolean;
  end if;

  value := nullif(input -> 'limit', 'null');
  if value is not null then
    page_size := internal.json_bigint(value, 1, 100);
    if page_size is null then
      raise exception 'invalid_input' using errcode = '22023', detail = 'limit must be 1 to 100.';
    end if;
  end if;

  value := nullif(input -> 'cursor', 'null');
  if value is not null then
    if jsonb_typeof(value) <> 'object'
       or exists (select 1 from jsonb_object_keys(value) as k where k not in ('booked_at', 'id'))
       or coalesce(internal.json_string(value -> 'booked_at')
                     !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$', true)
       or not pg_catalog.pg_input_is_valid(internal.json_string(value -> 'booked_at'), 'timestamptz')
       or internal.json_uuid(value -> 'id') is null then
      raise exception 'invalid_input'
        using errcode = '22023', detail = 'cursor must be the next_cursor of the previous page.';
    end if;
    cursor_at := internal.json_string(value -> 'booked_at')::timestamptz;
    cursor_id := internal.json_uuid(value -> 'id');
  end if;

  select pr.timezone into user_zone from public.profiles pr where pr.id = me;

  select array_agg(page.id order by page.booked_at desc, page.id desc),
         array_agg(page.booked_at order by page.booked_at desc, page.id desc)
    into page_ids, page_times
    from (
      select t.id, t.booked_at
        from public.transactions t
       where t.user_id = me
         and t.deleted_at is null
         and t.merged_into_id is null
         and (cursor_at is null or (t.booked_at, t.id) < (cursor_at, cursor_id))
         -- Cheapest first: the stored key holds the merchant's key (else the statement text's);
         -- the keys of a note, and of a statement text next to a merchant, are computed last.
         and (search_pattern is null
              or t.merchant ilike search_pattern escape '\'
              or t.note ilike search_pattern escape '\'
              or t.raw_text ilike search_pattern escape '\'
              or (search_key <> ''
                  and (strpos(t.merchant_key, search_key) > 0
                       or (t.note is not null
                           and strpos(internal.merchant_key(t.note), search_key) > 0)
                       or (t.raw_text is not null and t.merchant is not null
                           and strpos(internal.merchant_key(t.raw_text), search_key) > 0))))
         and ((category_filter is null and not only_uncategorized)
              or (category_filter is not null
                  and (t.category_id = any (category_filter)
                       or exists (select 1 from public.transaction_splits s
                                   where s.transaction_id = t.id
                                     and s.category_id = any (category_filter))))
              or (only_uncategorized
                  and ((t.category_id is null and t.fixed_cost_id is null
                        and not exists (select 1 from public.transaction_splits s
                                         where s.transaction_id = t.id))
                       or exists (select 1 from public.transaction_splits s
                                   where s.transaction_id = t.id and s.category_id is null))))
         and (source_filter is null or t.source = any (source_filter))
         and (from_date is null
              or (t.booked_at >= (from_date - 1)::timestamp at time zone 'UTC'
                  and (t.booked_at at time zone user_zone)::date >= from_date))
         and (to_date is null
              or (t.booked_at < (to_date + 2)::timestamp at time zone 'UTC'
                  and (t.booked_at at time zone user_zone)::date <= to_date))
         and (review_filter is null
              or internal.needs_review(
                   t.amount_rappen, t.category_id, t.categorized_by, t.category_confidence,
                   t.fixed_cost_id,
                   exists (select 1 from public.transaction_splits s where s.transaction_id = t.id),
                   false, false) = review_filter)
       order by t.booked_at desc, t.id desc
       limit page_size + 1
    ) as page;

  if coalesce(cardinality(page_ids), 0) > page_size then
    next_cursor := jsonb_build_object('booked_at', page_times[page_size], 'id', page_ids[page_size]);
    page_ids := page_ids[1:page_size];
  end if;

  select coalesce(jsonb_agg(internal.transaction_item(listed.id) order by listed.ordinal), '[]'::jsonb)
    into items
    from unnest(page_ids) with ordinality as listed(id, ordinal);

  return jsonb_build_object('items', items, 'next_cursor', next_cursor);
end;
$$;

comment on function public.list_transactions(jsonb) is
  'The Transactions screen: the caller''s transactions (not deleted or merged), newest first, filtered and paged by cursor.';

-- One transaction (TransactionItem); null for unknown, other users' and merged ids. Deleted rows
-- are returned with deleted_at.
create function public.get_transaction(p_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  return (select internal.transaction_item(t.id)
            from public.transactions t
           where t.id = p_id and t.user_id = me and t.merged_into_id is null);
end;
$$;

comment on function public.get_transaction(uuid) is
  'One of the caller''s transactions as TransactionItem; null when unknown or merged.';

-- ---------------------------------------------------------------------------------------------
-- Changing
-- ---------------------------------------------------------------------------------------------

-- Keys (all optional):
--   category_id    the person's choice (categorized_by 'user', confidence 100; null = "no
--                  category", not asked again); ends a fixed-cost link
--   rule           with a non-null category_id: { match_field: merchant | raw_text,
--                  match_type: contains | equals, pattern }. Creates the rule, or re-targets the
--                  existing one with the same field, type and pattern (case and outer spaces
--                  ignored), with priority = the caller's highest + 1, then applies it to every
--                  other money-out transaction it matches that is not deleted, merged, split, a
--                  fixed-cost payment or placed by the person (recategorized_count). Rules never
--                  place money in (D-039).
--   fixed_cost_id  marks the payment of one of the caller's fixed costs (category cleared; the
--                  fixed cost learns a merchant hint, internal.fixed_cost_hint, when it has
--                  none); null removes the link (the transaction is then asked about unless
--                  categorized)
--   note, merchant text; an empty string clears
--   amount_rappen, booked_at   manual entries only
--   deleted        true: soft delete (deleted_at), false: restore
-- Returns { transaction: TransactionItem, rule_id, recategorized_count }.
create function public.update_transaction(p_id uuid, p jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
set timezone to 'UTC'
as $$
declare
  me uuid := auth.uid();
  input jsonb := coalesce(p, '{}'::jsonb);
  unknown_key text;
  value jsonb;
  text_value text;
  tx public.transactions;
  is_split boolean;
  new_category uuid;
  new_fixed_cost uuid;
  rule_input jsonb;
  rule_field text;
  rule_type text;
  rule_pattern text;
  rule_key text;
  new_amount bigint;
  new_booked_at timestamptz;
  new_rule_id uuid;
  recategorized integer := 0;
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if jsonb_typeof(input) <> 'object' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'Expected an object of changes.';
  end if;
  select k into unknown_key
    from jsonb_object_keys(input) as k
   where k not in ('category_id', 'rule', 'fixed_cost_id', 'note', 'merchant', 'amount_rappen',
                   'booked_at', 'deleted')
   order by k
   limit 1;
  if unknown_key is not null then
    raise exception 'invalid_input'
      using errcode = '22023', detail = format('Unknown key "%s".', unknown_key);
  end if;

  -- Shapes first.
  if nullif(input -> 'category_id', 'null') is not null then
    new_category := internal.json_uuid(input -> 'category_id');
    if new_category is null then
      raise exception 'invalid_input' using errcode = '22023', detail = 'category_id must be a uuid or null.';
    end if;
  end if;
  if nullif(input -> 'fixed_cost_id', 'null') is not null then
    new_fixed_cost := internal.json_uuid(input -> 'fixed_cost_id');
    if new_fixed_cost is null then
      raise exception 'invalid_input' using errcode = '22023', detail = 'fixed_cost_id must be a uuid or null.';
    end if;
  end if;
  if new_category is not null and new_fixed_cost is not null then
    raise exception 'invalid_input'
      using errcode = '22023',
            detail = 'A fixed-cost payment has no category: set category_id or fixed_cost_id, not both.';
  end if;
  rule_input := nullif(input -> 'rule', 'null');
  if rule_input is not null then
    if jsonb_typeof(rule_input) <> 'object'
       or exists (select 1 from jsonb_object_keys(rule_input) as k
                   where k not in ('match_field', 'match_type', 'pattern')) then
      raise exception 'invalid_input'
        using errcode = '22023', detail = 'rule must be { match_field, match_type, pattern }.';
    end if;
    rule_field := internal.json_string(rule_input -> 'match_field');
    rule_type := internal.json_string(rule_input -> 'match_type');
    rule_pattern := btrim(internal.json_string(rule_input -> 'pattern'));
    if rule_field is null or rule_field not in ('merchant', 'raw_text') then
      raise exception 'invalid_input'
        using errcode = '22023', detail = 'rule.match_field must be "merchant" or "raw_text".';
    end if;
    if rule_type is null or rule_type not in ('contains', 'equals') then
      raise exception 'invalid_input'
        using errcode = '22023', detail = 'rule.match_type must be "contains" or "equals".';
    end if;
    rule_key := internal.merchant_key(rule_pattern);
    if rule_pattern is null or char_length(rule_pattern) not between 1 and 200
       or rule_key = '' then
      raise exception 'invalid_input'
        using errcode = '22023',
              detail = 'rule.pattern must be 1-200 characters with at least one word without digits.';
    end if;
    if new_category is null then
      raise exception 'rule_needs_category'
        using errcode = '22023', detail = 'A rule needs the category_id it assigns.';
    end if;
  end if;
  value := nullif(input -> 'note', 'null');
  if value is not null and coalesce(char_length(internal.json_string(value)) > 500, true) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'note must be at most 500 characters.';
  end if;
  value := nullif(input -> 'merchant', 'null');
  if value is not null and coalesce(char_length(internal.json_string(value)) > 200, true) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'merchant must be at most 200 characters.';
  end if;
  if input ? 'amount_rappen' then
    new_amount := internal.json_bigint(input -> 'amount_rappen', -10000000000, 10000000000);
    if new_amount is null or new_amount = 0 then
      raise exception 'invalid_input'
        using errcode = '22023',
              detail = 'amount_rappen must be a non-zero integer within ±10000000000.';
    end if;
  end if;
  if input ? 'booked_at' then
    text_value := internal.json_string(input -> 'booked_at');
    if text_value is null
       or text_value !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$'
       or not pg_catalog.pg_input_is_valid(text_value, 'timestamptz') then
      raise exception 'invalid_input'
        using errcode = '22023', detail = 'booked_at must be an ISO 8601 date-time with an offset.';
    end if;
    new_booked_at := text_value::timestamptz;
  end if;
  if nullif(input -> 'deleted', 'null') is not null and jsonb_typeof(input -> 'deleted') <> 'boolean' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'deleted must be true or false.';
  end if;

  -- The transaction: the caller's own, not merged into another one.
  select t.* into tx
    from public.transactions t
   where t.id = p_id and t.user_id = me and t.merged_into_id is null
     for update;
  if not found then
    raise exception 'transaction_not_found'
      using errcode = '22023', detail = 'No such transaction of yours.';
  end if;
  is_split := exists (select 1 from public.transaction_splits s where s.transaction_id = tx.id);

  if (new_amount is not null or new_booked_at is not null) and tx.source <> 'manual' then
    raise exception 'not_editable'
      using errcode = '22023', detail = 'Only manual entries can change amount and time.';
  end if;
  if is_split and (input ? 'category_id' or new_fixed_cost is not null
                   or (new_amount is not null and new_amount <> tx.amount_rappen)) then
    raise exception 'transaction_is_split'
      using errcode = '22023',
            detail = 'A split transaction is categorized by its parts: change or remove the split first.';
  end if;
  if new_category is not null and not exists (
       select 1 from public.categories c
        where c.id = new_category and c.user_id = me and c.archived_at is null) then
    raise exception 'category_not_found'
      using errcode = '22023', detail = 'category_id is not one of your active categories.';
  end if;
  if new_fixed_cost is not null and not exists (
       select 1 from public.fixed_costs f where f.id = new_fixed_cost and f.user_id = me) then
    raise exception 'fixed_cost_not_found'
      using errcode = '22023', detail = 'fixed_cost_id is not one of your fixed costs.';
  end if;

  if input ? 'category_id' then
    tx.category_id := new_category;
    tx.categorized_by := 'user';
    tx.category_confidence := 100;
    tx.fixed_cost_id := null;
  end if;
  if input ? 'fixed_cost_id' then
    if new_fixed_cost is not null then
      tx.fixed_cost_id := new_fixed_cost;
      tx.category_id := null;
      tx.categorized_by := 'user';
      tx.category_confidence := 100;
      update public.fixed_costs f
         set merchant_hint = internal.fixed_cost_hint(tx.merchant, tx.raw_text)
       where f.id = new_fixed_cost and f.user_id = me and f.merchant_hint is null;
    elsif not (input ? 'category_id') and tx.fixed_cost_id is not null then
      tx.fixed_cost_id := null;
      if tx.category_id is null then
        tx.categorized_by := 'none';
        tx.category_confidence := null;
      end if;
    end if;
  end if;
  if input ? 'note' then
    text_value := internal.json_string(nullif(input -> 'note', 'null'));
    tx.note := case when coalesce(text_value ~ '^[[:space:]]*$', true) then null else text_value end;
  end if;
  if input ? 'merchant' then
    text_value := internal.json_string(nullif(input -> 'merchant', 'null'));
    tx.merchant := nullif(regexp_replace(coalesce(text_value, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g'), '');
  end if;
  if new_amount is not null then
    tx.amount_rappen := new_amount;
  end if;
  if new_booked_at is not null then
    tx.booked_at := new_booked_at;
  end if;
  if nullif(input -> 'deleted', 'null') is not null then
    tx.deleted_at := case when (input -> 'deleted')::boolean then coalesce(tx.deleted_at, now()) end;
  end if;

  update public.transactions t
     set category_id = tx.category_id,
         categorized_by = tx.categorized_by,
         category_confidence = tx.category_confidence,
         fixed_cost_id = tx.fixed_cost_id,
         note = tx.note,
         merchant = tx.merchant,
         amount_rappen = tx.amount_rappen,
         booked_at = tx.booked_at,
         deleted_at = tx.deleted_at
   where t.id = tx.id;

  if rule_input is not null then
    insert into public.categorization_rules (user_id, match_field, match_type, pattern, category_id, priority)
    values (me, rule_field, rule_type, rule_pattern, new_category,
            (select coalesce(max(r.priority), 0) + 1 from public.categorization_rules r where r.user_id = me))
    on conflict (user_id, match_field, match_type, (lower(btrim(pattern))))
    do update set category_id = excluded.category_id,
                  priority = excluded.priority,
                  pattern = excluded.pattern
    returning id into new_rule_id;

    -- The same matching as step 6 in internal.categorize: a merchant rule on the stored
    -- transaction key, a raw_text rule on the statement text's key.
    update public.transactions t
       set category_id = new_category, categorized_by = 'rule', category_confidence = 100
     where t.user_id = me
       and t.id <> tx.id
       and t.amount_rappen < 0
       and t.deleted_at is null
       and t.merged_into_id is null
       and t.fixed_cost_id is null
       and t.categorized_by <> 'user'
       and not exists (select 1 from public.transaction_splits s where s.transaction_id = t.id)
       and case
             when rule_field = 'merchant' and rule_type = 'equals' then t.merchant_key = rule_key
             when rule_field = 'merchant' then
               strpos(' ' || t.merchant_key || ' ', ' ' || rule_key || ' ') > 0
             when rule_type = 'equals' then
               t.raw_text is not null and internal.merchant_key(t.raw_text) = rule_key
             else
               t.raw_text is not null
               and strpos(' ' || internal.merchant_key(t.raw_text) || ' ', ' ' || rule_key || ' ') > 0
           end
       and (t.category_id, t.categorized_by, t.category_confidence)
           is distinct from (new_category, 'rule', 100::smallint);
    get diagnostics recategorized = row_count;
  end if;

  return jsonb_build_object(
    'transaction', internal.transaction_item(tx.id),
    'rule_id', new_rule_id,
    'recategorized_count', recategorized
  );
end;
$$;

comment on function public.update_transaction(uuid, jsonb) is
  'Changes one of the caller''s transactions (category, rule, fixed-cost link, note, merchant, manual amount/time, delete/restore).';

-- Replaces the parts of a split ([{ category_id, amount_rappen, note }], 2-50 parts, the sign of
-- the transaction, adding up exactly) and clears the transaction's own category and fixed-cost
-- link (categorized_by 'user'). [] removes the split; the transaction is then asked about.
-- Returns the TransactionItem.
create function public.set_transaction_splits(p_id uuid, p_parts jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  tx public.transactions;
  part jsonb;
  part_index integer;
  part_amount bigint;
  part_category uuid;
  parts_total numeric := 0;
  value jsonb;
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select t.* into tx
    from public.transactions t
   where t.id = p_id and t.user_id = me and t.merged_into_id is null
     for update;
  if not found then
    raise exception 'transaction_not_found'
      using errcode = '22023', detail = 'No such transaction of yours.';
  end if;
  if jsonb_typeof(p_parts) is distinct from 'array' then
    raise exception 'invalid_splits' using errcode = '22023', detail = 'parts must be a list.';
  end if;

  if jsonb_array_length(p_parts) = 0 then
    delete from public.transaction_splits s where s.transaction_id = tx.id;
    if found then
      update public.transactions t
         set categorized_by = 'none', category_confidence = null
       where t.id = tx.id and t.category_id is null;
    end if;
    return internal.transaction_item(tx.id);
  end if;

  if jsonb_array_length(p_parts) not between 2 and 50 then
    raise exception 'invalid_splits' using errcode = '22023', detail = 'A split has 2 to 50 parts.';
  end if;
  for part, part_index in
    select element, (ordinal - 1)::integer
      from jsonb_array_elements(p_parts) with ordinality as listed(element, ordinal)
  loop
    if jsonb_typeof(part) <> 'object'
       or exists (select 1 from jsonb_object_keys(part) as k
                   where k not in ('category_id', 'amount_rappen', 'note')) then
      raise exception 'invalid_splits'
        using errcode = '22023',
              detail = format('parts[%s] must be { category_id, amount_rappen, note }', part_index);
    end if;
    part_amount := internal.json_bigint(part -> 'amount_rappen', -10000000000, 10000000000);
    if part_amount is null or part_amount = 0 or sign(part_amount) <> sign(tx.amount_rappen) then
      raise exception 'invalid_splits'
        using errcode = '22023',
              detail = format('parts[%s].amount_rappen must be a non-zero integer with the sign of the transaction',
                              part_index);
    end if;
    parts_total := parts_total + part_amount;
    value := nullif(part -> 'note', 'null');
    if value is not null and coalesce(char_length(internal.json_string(value)) > 500, true) then
      raise exception 'invalid_splits'
        using errcode = '22023',
              detail = format('parts[%s].note must be null or at most 500 characters', part_index);
    end if;
    value := nullif(part -> 'category_id', 'null');
    if value is not null then
      part_category := internal.json_uuid(value);
      if part_category is null then
        raise exception 'invalid_splits'
          using errcode = '22023',
                detail = format('parts[%s].category_id must be a uuid or null', part_index);
      end if;
      if not exists (select 1 from public.categories c
                      where c.id = part_category and c.user_id = me and c.archived_at is null) then
        raise exception 'category_not_found'
          using errcode = '22023',
                detail = format('parts[%s].category_id is not one of your active categories',
                                part_index);
      end if;
    end if;
  end loop;
  if parts_total <> tx.amount_rappen then
    raise exception 'invalid_splits'
      using errcode = '22023',
            detail = format('The parts add up to %s Rappen, the transaction is %s Rappen.',
                            parts_total, tx.amount_rappen);
  end if;

  delete from public.transaction_splits s where s.transaction_id = tx.id;
  insert into public.transaction_splits (user_id, transaction_id, category_id, amount_rappen, note)
  select me, tx.id, internal.json_uuid(element -> 'category_id'),
         (element ->> 'amount_rappen')::numeric::bigint,
         case when coalesce(internal.json_string(element -> 'note') ~ '^[[:space:]]*$', true) then null
              else internal.json_string(element -> 'note') end
    from jsonb_array_elements(p_parts) as element;
  update public.transactions t
     set category_id = null, categorized_by = 'user', category_confidence = 100, fixed_cost_id = null
   where t.id = tx.id;

  return internal.transaction_item(tx.id);
end;
$$;

comment on function public.set_transaction_splits(uuid, jsonb) is
  'Replaces the split parts of one of the caller''s transactions ([] removes the split).';

-- ---------------------------------------------------------------------------------------------
-- Imports and export
-- ---------------------------------------------------------------------------------------------

-- Undoes a statement import for good (D-041):
--   1. For every row of the import that was merged into an earlier transaction, each field group
--      its merge copied (merge_changes: merchant, raw_text, mcc, items, note, original amount,
--      category) is put back to its previous value where the earlier transaction still holds
--      exactly the copied value (what the person changed since stays). A previous category that
--      no longer exists comes back as "no category" (categorized_by 'none').
--   2. Rows of other sources that had been merged into the import's rows come back as
--      transactions of their own.
--   3. Every transaction stored from the import is deleted (not soft-deleted: its statement
--      texts leave the account), so the same file can be imported again.
--   4. The data source is marked revoked.
-- Returns { removed, restored }: how many of the import's transactions the person still saw
-- (not deleted or merged), and how many earlier transactions got values back. Both 0 when the
-- import was already removed. 22023 import_not_found for anything but one of the caller's
-- statement imports.
create function public.remove_import(p_data_source_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  source_row public.data_sources;
  evidence record;
  survivor public.transactions;
  previous jsonb;
  restored_any boolean;
  removed_count integer;
  restored_count integer := 0;
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('public.add_transactions:' || me::text, 0)
  );
  select d.* into source_row
    from public.data_sources d
   where d.id = p_data_source_id and d.user_id = me and d.kind = 'statement_import'
     for update;
  if not found then
    raise exception 'import_not_found'
      using errcode = '22023', detail = 'No such statement import of yours.';
  end if;
  if source_row.status = 'revoked' then
    return jsonb_build_object('removed', 0, 'restored', 0);
  end if;

  -- 1. Put back what the import's merges copied, where it is still the copied value.
  for evidence in
    select e.merged_into_id, e.merge_changes
      from public.transactions e
     where e.user_id = me
       and e.data_source_id = source_row.id
       and e.merged_into_id is not null
       and e.merge_changes is not null
     order by e.created_at, e.id
  loop
    select t.* into survivor
      from public.transactions t
     where t.id = evidence.merged_into_id and t.user_id = me
       for update;
    if not found then
      continue;
    end if;
    restored_any := false;
    if evidence.merge_changes ? 'merchant'
       and to_jsonb(survivor.merchant) is not distinct from evidence.merge_changes #> '{merchant,to}' then
      survivor.merchant := evidence.merge_changes #>> '{merchant,from}';
      restored_any := true;
    end if;
    if evidence.merge_changes ? 'raw_text'
       and to_jsonb(survivor.raw_text) is not distinct from evidence.merge_changes #> '{raw_text,to}' then
      survivor.raw_text := evidence.merge_changes #>> '{raw_text,from}';
      restored_any := true;
    end if;
    if evidence.merge_changes ? 'mcc'
       and to_jsonb(survivor.mcc) is not distinct from evidence.merge_changes #> '{mcc,to}' then
      survivor.mcc := (evidence.merge_changes #>> '{mcc,from}')::smallint;
      restored_any := true;
    end if;
    if evidence.merge_changes ? 'items'
       and survivor.items is not distinct from evidence.merge_changes #> '{items,to}' then
      survivor.items := nullif(evidence.merge_changes #> '{items,from}', 'null'::jsonb);
      restored_any := true;
    end if;
    if evidence.merge_changes ? 'note'
       and to_jsonb(survivor.note) is not distinct from evidence.merge_changes #> '{note,to}' then
      survivor.note := evidence.merge_changes #>> '{note,from}';
      restored_any := true;
    end if;
    if evidence.merge_changes ? 'original'
       and jsonb_build_object('amount_minor', survivor.original_amount_minor,
                              'currency', survivor.original_currency)
           = evidence.merge_changes #> '{original,to}' then
      previous := evidence.merge_changes #> '{original,from}';
      survivor.original_amount_minor := (previous ->> 'amount_minor')::bigint;
      survivor.original_currency := previous ->> 'currency';
      restored_any := true;
    end if;
    if evidence.merge_changes ? 'category'
       and jsonb_build_object('category_id', survivor.category_id,
                              'categorized_by', survivor.categorized_by,
                              'category_confidence', survivor.category_confidence)
           = evidence.merge_changes #> '{category,to}' then
      previous := evidence.merge_changes #> '{category,from}';
      if previous ->> 'category_id' is null
         or exists (select 1 from public.categories c
                     where c.id = (previous ->> 'category_id')::uuid and c.user_id = me) then
        survivor.category_id := (previous ->> 'category_id')::uuid;
        survivor.categorized_by := previous ->> 'categorized_by';
        survivor.category_confidence := (previous ->> 'category_confidence')::smallint;
      else
        survivor.category_id := null;
        survivor.categorized_by := 'none';
        survivor.category_confidence := null;
      end if;
      restored_any := true;
    end if;
    if restored_any then
      update public.transactions t
         set merchant = survivor.merchant,
             raw_text = survivor.raw_text,
             mcc = survivor.mcc,
             items = survivor.items,
             note = survivor.note,
             original_amount_minor = survivor.original_amount_minor,
             original_currency = survivor.original_currency,
             category_id = survivor.category_id,
             categorized_by = survivor.categorized_by,
             category_confidence = survivor.category_confidence
       where t.id = survivor.id;
      restored_count := restored_count + 1;
    end if;
  end loop;

  -- 2. Rows of other sources merged into the import's rows come back on their own.
  update public.transactions t
     set merged_into_id = null, merge_changes = null
   where t.user_id = me
     and t.data_source_id is distinct from source_row.id
     and t.merged_into_id in (select r.id from public.transactions r
                               where r.user_id = me and r.data_source_id = source_row.id);

  -- 3. The import's transactions, for good.
  select count(*) filter (where t.deleted_at is null and t.merged_into_id is null)
    into removed_count
    from public.transactions t
   where t.user_id = me and t.data_source_id = source_row.id;
  delete from public.transactions t
   where t.user_id = me and t.data_source_id = source_row.id;

  -- 4. The source.
  update public.data_sources d
     set status = 'revoked', consent_revoked_at = now()
   where d.id = source_row.id;

  return jsonb_build_object('removed', removed_count, 'restored', restored_count);
end;
$$;

comment on function public.remove_import(uuid) is
  'Undoes a statement import for good (D-041): restores what its merges copied (unless changed since), unmerges rows merged into it, deletes its transactions, revokes the source. Returns { removed, restored }.';

-- Everything stored about the signed-in user (revDSG art. 28, GDPR art. 20), one key per table:
-- profile, notification_settings and subscription as objects, every other table as a list (all
-- transactions, deleted and merged ones included). Never anything from schema private (tokens).
create function public.export_my_data()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
set timezone to 'UTC'
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'format_version', 1,
    'exported_at', now(),
    'profile', (select to_jsonb(r) from public.profiles r where r.id = me),
    'notification_settings',
      (select to_jsonb(r) from public.notification_settings r where r.user_id = me),
    'subscription', (select to_jsonb(r) from public.subscriptions r where r.user_id = me),
    'fixed_costs', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at, r.id)
                               from public.fixed_costs r where r.user_id = me), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(to_jsonb(r) order by r.sort_order, r.created_at, r.id)
                              from public.categories r where r.user_id = me), '[]'::jsonb),
    'budget_periods', coalesce((select jsonb_agg(to_jsonb(r) order by r.starts_on, r.id)
                                  from public.budget_periods r where r.user_id = me), '[]'::jsonb),
    'budgets', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at, r.id)
                           from public.budgets r where r.user_id = me), '[]'::jsonb),
    'transactions', coalesce((select jsonb_agg(to_jsonb(r) order by r.booked_at, r.id)
                                from public.transactions r where r.user_id = me), '[]'::jsonb),
    'transaction_splits', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at, r.id)
                                      from public.transaction_splits r where r.user_id = me),
                                   '[]'::jsonb),
    'categorization_rules', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at, r.id)
                                        from public.categorization_rules r where r.user_id = me),
                                     '[]'::jsonb),
    'data_sources', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at, r.id)
                                from public.data_sources r where r.user_id = me), '[]'::jsonb),
    'alerts', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at, r.id)
                          from public.alerts r where r.user_id = me), '[]'::jsonb),
    'ai_conversations', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at, r.id)
                                    from public.ai_conversations r where r.user_id = me),
                                 '[]'::jsonb),
    'ai_messages', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at, r.id)
                               from public.ai_messages r where r.user_id = me), '[]'::jsonb),
    'consent_events', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at, r.id)
                                  from public.consent_events r where r.user_id = me), '[]'::jsonb)
  );
end;
$$;

comment on function public.export_my_data() is
  'The data export (revDSG art. 28, GDPR art. 20): every row of the caller in every public table, as JSON. Never credentials.';

-- ---------------------------------------------------------------------------------------------
-- Home screen: needs_review_count and, per recent transaction, categorized_by and needs_review
-- ---------------------------------------------------------------------------------------------

-- As in 20261002090000_budget_engine.sql, plus needs_review_count (transactions booked in the
-- current period, by local date, that need a category) and categorized_by / needs_review per
-- recent transaction.
create or replace function public.get_overview()
returns jsonb
language plpgsql
security invoker
set search_path = ''
set timezone to 'UTC'
as $$
declare
  me uuid := auth.uid();
  current_period_id uuid;
  current_period public.budget_periods;
  user_zone text;
  today date;
  overview jsonb;
begin
  current_period_id := public.ensure_current_period();
  if current_period_id is null then
    return null;
  end if;

  select * into strict current_period from public.budget_periods where id = current_period_id;
  select timezone into strict user_zone from public.profiles where id = me;
  today := (now() at time zone user_zone)::date;

  with spending as (
    -- The spending rules of private.period_totals, for the signed-in user (see there).
    select allocation.category_id, (-sum(allocation.amount_rappen))::bigint as spent_rappen
      from public.transactions t
      cross join lateral (
        select s.category_id, s.amount_rappen
          from public.transaction_splits s
         where s.transaction_id = t.id
        union all
        select t.category_id, t.amount_rappen
         where not exists (select 1 from public.transaction_splits s where s.transaction_id = t.id)
      ) as allocation
     where t.user_id = me
       and t.deleted_at is null
       and t.merged_into_id is null
       and t.fixed_cost_id is null
       and t.booked_at >= (current_period.starts_on - 1)::timestamp at time zone 'UTC'
       and t.booked_at < (current_period.ends_on + 1)::timestamp at time zone 'UTC'
       and (t.booked_at at time zone user_zone)::date >= current_period.starts_on
       and (t.booked_at at time zone user_zone)::date < current_period.ends_on
       and (allocation.amount_rappen < 0 or allocation.category_id is not null)
     group by allocation.category_id
  ),
  category_rows as (
    select c.id, c.default_key, c.name, c.icon, c.sort_order, c.created_at,
           c.archived_at is not null as archived,
           b.id as budget_id,
           coalesce(b.amount_rappen, 0) as budget_amount_rappen,
           coalesce(b.rollover_rappen, 0) as rollover_rappen,
           coalesce(s.spent_rappen, 0) as spent_rappen
      from public.categories c
      left join public.budgets b on b.category_id = c.id and b.period_id = current_period.id
      left join spending s on s.category_id = c.id
     where c.user_id = me
       and (c.archived_at is null or s.category_id is not null)
  ),
  recent as (
    select t.id, t.amount_rappen, t.booked_at, t.merchant, t.category_id, t.source, t.note,
           t.created_at, t.categorized_by, t.category_confidence, t.fixed_cost_id,
           exists (select 1 from public.transaction_splits s where s.transaction_id = t.id)
             as is_split
      from public.transactions t
     where t.user_id = me
       and t.deleted_at is null
       and t.merged_into_id is null
     order by t.booked_at desc, t.created_at desc, t.id desc
     limit 5
  ),
  to_review as (
    select count(*)::integer as n
      from public.transactions t
     where t.user_id = me
       and t.deleted_at is null
       and t.merged_into_id is null
       and t.booked_at >= (current_period.starts_on - 1)::timestamp at time zone 'UTC'
       and t.booked_at < (current_period.ends_on + 1)::timestamp at time zone 'UTC'
       and (t.booked_at at time zone user_zone)::date >= current_period.starts_on
       and (t.booked_at at time zone user_zone)::date < current_period.ends_on
       and internal.needs_review(
             t.amount_rappen, t.category_id, t.categorized_by, t.category_confidence,
             t.fixed_cost_id,
             exists (select 1 from public.transaction_splits s where s.transaction_id = t.id),
             false, false)
  )
  select jsonb_build_object(
    'today', today,
    'period', jsonb_build_object(
      'id', current_period.id,
      'starts_on', current_period.starts_on,
      'ends_on', current_period.ends_on,
      'income_rappen', current_period.income_rappen,
      'fixed_costs_rappen', current_period.fixed_costs_rappen,
      'savings_rappen', current_period.savings_rappen,
      'carried_over_rappen', current_period.carried_over_rappen
    ),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object(
               'category_id', r.id,
               'default_key', r.default_key,
               'name', r.name,
               'icon', r.icon,
               'sort_order', r.sort_order,
               'archived', r.archived,
               'budget_id', r.budget_id,
               'budget_amount_rappen', r.budget_amount_rappen,
               'rollover_rappen', r.rollover_rappen,
               'spent_rappen', r.spent_rappen
             ) order by r.sort_order, r.created_at, r.id)
        from category_rows r
    ), '[]'::jsonb),
    'uncategorized_spent_rappen', coalesce((
      select s.spent_rappen from spending s where s.category_id is null
    ), 0),
    'needs_review_count', (select n from to_review),
    'recent_transactions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id,
               'amount_rappen', r.amount_rappen,
               'booked_at', r.booked_at,
               'merchant', r.merchant,
               'category_id', r.category_id,
               'is_split', r.is_split,
               'source', r.source,
               'note', r.note,
               'categorized_by', r.categorized_by,
               'needs_review', internal.needs_review(
                 r.amount_rappen, r.category_id, r.categorized_by, r.category_confidence,
                 r.fixed_cost_id, r.is_split, false, false)
             ) order by r.booked_at desc, r.created_at desc, r.id desc)
        from recent r
    ), '[]'::jsonb)
  ) into overview;

  return overview;
end;
$$;

comment on function public.get_overview() is
  'The home screen: current period (rolled on payday), categories with budget and spending, uncategorized spending, how many transactions of the period need a category, the 5 latest transactions. Null before onboarding.';

-- ---------------------------------------------------------------------------------------------
-- Privileges: nothing by default, then exactly what the app calls
-- ---------------------------------------------------------------------------------------------

revoke all on function internal.json_bigint(jsonb, bigint, bigint) from public, anon, authenticated;
revoke all on function internal.json_string(jsonb) from public, anon, authenticated;
revoke all on function internal.json_uuid(jsonb) from public, anon, authenticated;
revoke all on function internal.ingest_row(jsonb, integer, text, text) from public, anon, authenticated;
revoke all on function internal.transaction_item(uuid) from public, anon, authenticated;
revoke all on function public.add_transactions(jsonb) from public, anon, authenticated;
revoke all on function public.list_transactions(jsonb) from public, anon, authenticated;
revoke all on function public.get_transaction(uuid) from public, anon, authenticated;
revoke all on function public.update_transaction(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.set_transaction_splits(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.remove_import(uuid) from public, anon, authenticated;
revoke all on function public.export_my_data() from public, anon, authenticated;

grant execute on function internal.json_bigint(jsonb, bigint, bigint) to authenticated;
grant execute on function internal.json_string(jsonb) to authenticated;
grant execute on function internal.json_uuid(jsonb) to authenticated;
grant execute on function internal.ingest_row(jsonb, integer, text, text) to authenticated;
grant execute on function internal.transaction_item(uuid) to authenticated;
grant execute on function public.add_transactions(jsonb) to authenticated;
grant execute on function public.list_transactions(jsonb) to authenticated;
grant execute on function public.get_transaction(uuid) to authenticated;
grant execute on function public.update_transaction(uuid, jsonb) to authenticated;
grant execute on function public.set_transaction_splits(uuid, jsonb) to authenticated;
grant execute on function public.remove_import(uuid) to authenticated;
grant execute on function public.export_my_data() to authenticated;

-- Milestone 1: foundations of the data model (spec section 14).
--
-- Conventions (docs/DATA_MODEL.md):
--   * Money is bigint Rappen, bounded to ±10'000'000'000 (CHF 100 million). Never numeric/float.
--   * Every user-owned row carries user_id. Row-level security limits every client to its own rows.
--   * References between user-owned rows are composite (id, user_id) foreign keys, so a row can
--     never point at another user's data, even by guessing an id.
--   * Vocabularies are text + CHECK constraints mirroring packages/core/src/constants.ts.
--   * Clients (role "authenticated") get only the privileges they need; "anon" gets nothing.

create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- profiles: one row per user (income, payday, hours, pain level, language, savings)
-- ---------------------------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) between 1 and 80),
  language text not null default 'de' check (language in ('de', 'en')),
  timezone text not null default 'Europe/Zurich' check (char_length(timezone) between 1 and 64),
  net_income_rappen bigint check (net_income_rappen between 0 and 10000000000),
  payday smallint check (payday between 1 and 31),
  irregular_income boolean not null default false,
  weekly_work_minutes integer check (weekly_work_minutes between 60 and 6720),
  savings_monthly_rappen bigint not null default 0
    check (savings_monthly_rappen between 0 and 10000000000),
  savings_goal_name text check (char_length(savings_goal_name) between 1 and 80),
  savings_goal_rappen bigint check (savings_goal_rappen between 1 and 10000000000),
  savings_goal_date date,
  leftover_policy text not null default 'rollover'
    check (leftover_policy in ('rollover', 'savings', 'reset')),
  pain_level text not null default 'normal' check (pain_level in ('mild', 'normal', 'brutal')),
  sound_enabled boolean not null default true,
  payment_methods text[] not null default '{}'
    check (payment_methods <@ array['card', 'twint', 'apple_pay', 'google_pay', 'cash']::text[]),
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.profiles.weekly_work_minutes is
  'Hours worked per week, in minutes (42.5 h = 2550). Used for the "= X hours of work" display.';
comment on column public.profiles.payday is
  'Day of month the salary arrives. Months without that day use their last day.';

-- ---------------------------------------------------------------------------------------------
-- fixed_costs: rent, health insurance, ... (spec section 3, step 2)
-- ---------------------------------------------------------------------------------------------

create table public.fixed_costs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in (
    'rent', 'health_insurance', 'phone_internet', 'transport', 'other_insurance',
    'subscriptions', 'tax_provision', 'leasing_debts', 'other'
  )),
  label text check (char_length(btrim(label)) between 1 and 80),
  amount_rappen bigint not null check (amount_rappen between 0 and 10000000000),
  due_day smallint check (due_day between 1 and 31),
  merchant_hint text check (char_length(merchant_hint) between 1 and 120),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

comment on column public.fixed_costs.merchant_hint is
  'Text that identifies the payment in a transaction (e.g. the landlord), used to mark it paid.';

-- ---------------------------------------------------------------------------------------------
-- categories: defaults (by key, translated in the app) and custom ones (by name)
-- ---------------------------------------------------------------------------------------------

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  default_key text check (default_key in (
    'groceries', 'eating_out', 'clothes', 'going_out', 'transport', 'hobbies',
    'personal_care', 'gifts', 'shopping_electronics', 'other'
  )),
  name text check (char_length(btrim(name)) between 1 and 40),
  icon text check (char_length(icon) between 1 and 40),
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  constraint categories_named check (default_key is not null or name is not null)
);

create unique index categories_user_default_key_key
  on public.categories (user_id, default_key) where default_key is not null;
create unique index categories_user_name_key
  on public.categories (user_id, lower(btrim(name))) where name is not null and archived_at is null;

-- ---------------------------------------------------------------------------------------------
-- budget_periods: one per "month", which runs from payday to the next payday
-- ---------------------------------------------------------------------------------------------

create table public.budget_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  income_rappen bigint not null check (income_rappen between 0 and 10000000000),
  fixed_costs_rappen bigint not null check (fixed_costs_rappen between 0 and 10000000000),
  savings_rappen bigint not null check (savings_rappen between 0 and 10000000000),
  carried_over_rappen bigint not null default 0
    check (carried_over_rappen between -10000000000 and 10000000000),
  closed_at timestamptz,
  leftover_action text check (leftover_action in ('rollover', 'savings', 'reset')),
  leftover_rappen bigint check (leftover_rappen between -10000000000 and 10000000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, starts_on),
  constraint budget_periods_ordered check (ends_on > starts_on),
  constraint budget_periods_closed check (
    (closed_at is null and leftover_action is null and leftover_rappen is null)
    or (closed_at is not null and leftover_action is not null and leftover_rappen is not null)
  ),
  constraint budget_periods_no_overlap
    exclude using gist (user_id with =, daterange(starts_on, ends_on) with &&)
);

comment on column public.budget_periods.ends_on is 'Exclusive: the next payday.';

-- ---------------------------------------------------------------------------------------------
-- budgets: amount per category per period
-- ---------------------------------------------------------------------------------------------

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  period_id uuid not null,
  category_id uuid not null,
  amount_rappen bigint not null check (amount_rappen between 0 and 10000000000),
  rollover_rappen bigint not null default 0
    check (rollover_rappen between -10000000000 and 10000000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (period_id, category_id),
  foreign key (period_id, user_id) references public.budget_periods (id, user_id) on delete cascade,
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete cascade
);

-- ---------------------------------------------------------------------------------------------
-- data_sources: one row per connected source, with its consent (spec sections 6 and 15)
-- ---------------------------------------------------------------------------------------------

create table public.data_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in (
    'bank', 'android_notification', 'ios_shortcut', 'email', 'receipt', 'statement_import'
  )),
  provider text check (char_length(provider) between 1 and 60),
  display_name text check (char_length(display_name) between 1 and 80),
  status text not null default 'pending' check (status in (
    'pending', 'active', 'reconnect_required', 'error', 'revoked'
  )),
  consent_version text not null check (char_length(consent_version) between 1 and 40),
  consent_granted_at timestamptz not null default now(),
  consent_revoked_at timestamptz,
  settings jsonb not null default '{}'::jsonb
    check (jsonb_typeof(settings) = 'object' and octet_length(settings::text) <= 8000),
  last_synced_at timestamptz,
  last_error text check (char_length(last_error) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  constraint data_sources_revoked check ((status = 'revoked') = (consent_revoked_at is not null))
);

comment on column public.data_sources.settings is
  'Non-secret settings only (e.g. which apps a notification listener reads). Tokens never go here.';

-- Encrypted tokens for sources that need them (bank, email). Not reachable by clients: it lives
-- outside the API-exposed schema, has RLS without policies and no privileges for client roles.
create schema private;
revoke all on schema private from public, anon, authenticated;

create table private.data_source_credentials (
  data_source_id uuid primary key,
  user_id uuid not null,
  ciphertext bytea not null,
  key_version smallint not null check (key_version > 0),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (data_source_id, user_id)
    references public.data_sources (id, user_id) on delete cascade
);

alter table private.data_source_credentials enable row level security;
revoke all on private.data_source_credentials from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- transactions: the unified output of every source (spec section 6)
-- ---------------------------------------------------------------------------------------------

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  amount_rappen bigint not null
    check (amount_rappen <> 0 and amount_rappen between -10000000000 and 10000000000),
  currency char(3) not null default 'CHF' check (currency = 'CHF'),
  original_amount_minor bigint
    check (original_amount_minor between -1000000000000 and 1000000000000),
  original_currency char(3) check (original_currency ~ '^[A-Z]{3}$'),
  booked_at timestamptz not null,
  merchant text check (char_length(merchant) between 1 and 200),
  raw_text text check (char_length(raw_text) <= 4000),
  mcc smallint check (mcc between 0 and 9999),
  source text not null check (source in (
    'bank', 'android_notification', 'ios_shortcut', 'email', 'receipt', 'statement_import',
    'manual', 'assistant'
  )),
  external_id text check (char_length(external_id) between 1 and 200),
  data_source_id uuid,
  category_id uuid,
  categorized_by text not null default 'none'
    check (categorized_by in ('none', 'user', 'rule', 'merchant_list', 'mcc', 'ai')),
  category_confidence smallint check (category_confidence between 0 and 100),
  note text check (char_length(note) <= 500),
  items jsonb check (
    items is null or (jsonb_typeof(items) = 'array' and octet_length(items::text) <= 20000)
  ),
  fixed_cost_id uuid,
  merged_into_id uuid,
  acknowledged_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  constraint transactions_original_pair
    check ((original_amount_minor is null) = (original_currency is null)),
  constraint transactions_not_self_merged check (merged_into_id <> id),
  foreign key (data_source_id, user_id)
    references public.data_sources (id, user_id) on delete set null (data_source_id),
  foreign key (category_id, user_id)
    references public.categories (id, user_id) on delete set null (category_id),
  foreign key (fixed_cost_id, user_id)
    references public.fixed_costs (id, user_id) on delete set null (fixed_cost_id),
  foreign key (merged_into_id, user_id)
    references public.transactions (id, user_id) on delete set null (merged_into_id)
);

comment on column public.transactions.amount_rappen is
  'Signed CHF amount as booked: negative = money out (purchase), positive = money in (refund).';
comment on column public.transactions.original_amount_minor is
  'Foreign-currency amount in that currency''s minor unit, for display only. Budgets use amount_rappen.';
comment on column public.transactions.external_id is
  'The source''s own id for this transaction; re-imports with the same id are rejected.';
comment on column public.transactions.acknowledged_at is
  'When the user confirmed "I paid this" in the cash-feel moment. Null = still queued.';
comment on column public.transactions.merged_into_id is
  'Set when deduplication merged this row into another one (spec section 6, "Dedup").';

create unique index transactions_source_external_id_key
  on public.transactions (user_id, source, external_id) where external_id is not null;
create index transactions_user_booked_at_idx on public.transactions (user_id, booked_at desc);
create index transactions_category_id_idx on public.transactions (category_id);
create index transactions_data_source_id_idx on public.transactions (data_source_id);
create index transactions_fixed_cost_id_idx on public.transactions (fixed_cost_id);
create index transactions_merged_into_id_idx on public.transactions (merged_into_id);
create index transactions_unacknowledged_idx
  on public.transactions (user_id, booked_at) where acknowledged_at is null and deleted_at is null;

-- ---------------------------------------------------------------------------------------------
-- transaction_splits: one transaction across several categories (spec section 7)
-- ---------------------------------------------------------------------------------------------

create table public.transaction_splits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  transaction_id uuid not null,
  category_id uuid,
  amount_rappen bigint not null
    check (amount_rappen <> 0 and amount_rappen between -10000000000 and 10000000000),
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (transaction_id, user_id)
    references public.transactions (id, user_id) on delete cascade,
  foreign key (category_id, user_id)
    references public.categories (id, user_id) on delete set null (category_id)
);

create index transaction_splits_transaction_id_idx on public.transaction_splits (transaction_id);
create index transaction_splits_category_id_idx on public.transaction_splits (category_id);

-- A split transaction has at least two parts, each with the transaction's sign, adding up to
-- exactly the transaction amount, and no category of its own. Checked at commit, so a client can
-- replace all parts in one transaction.
create function public.check_transaction_splits()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  tx_ids uuid[];
  tx_id uuid;
  tx_amount bigint;
  tx_category uuid;
  part_count integer;
  part_total bigint;
  wrong_sign integer;
begin
  if tg_table_name = 'transactions' then
    tx_ids := array[coalesce(new.id, old.id)];
  elsif tg_op = 'UPDATE' and new.transaction_id is distinct from old.transaction_id then
    -- A part moved to another transaction: the one it left must stay consistent too.
    tx_ids := array[new.transaction_id, old.transaction_id];
  else
    tx_ids := array[coalesce(new.transaction_id, old.transaction_id)];
  end if;

  foreach tx_id in array tx_ids loop
    select amount_rappen, category_id into tx_amount, tx_category
    from public.transactions where id = tx_id;
    continue when not found; -- transaction deleted; its parts went with it

    select count(*), coalesce(sum(amount_rappen), 0),
           count(*) filter (where sign(amount_rappen) <> sign(tx_amount))
      into part_count, part_total, wrong_sign
    from public.transaction_splits where transaction_id = tx_id;
    continue when part_count = 0;

    if part_count < 2 then
      raise exception 'a split transaction needs at least two parts (transaction %)', tx_id
        using errcode = '23514';
    end if;
    if wrong_sign > 0 then
      raise exception 'split parts must have the same sign as the transaction (transaction %)', tx_id
        using errcode = '23514';
    end if;
    if part_total <> tx_amount then
      raise exception 'split parts add up to % Rappen but the transaction is % Rappen (transaction %)',
        part_total, tx_amount, tx_id
        using errcode = '23514';
    end if;
    if tx_category is not null then
      raise exception 'a split transaction has no single category (transaction %)', tx_id
        using errcode = '23514';
    end if;
  end loop;
  return null;
end;
$$;

create constraint trigger transaction_splits_consistent
  after insert or update or delete on public.transaction_splits
  deferrable initially deferred
  for each row execute function public.check_transaction_splits();

create constraint trigger transactions_splits_consistent
  after update of amount_rappen, category_id on public.transactions
  deferrable initially deferred
  for each row execute function public.check_transaction_splits();

-- ---------------------------------------------------------------------------------------------
-- categorization_rules: "Always do this for Manor?" (spec section 7)
-- ---------------------------------------------------------------------------------------------

create table public.categorization_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  match_field text not null check (match_field in ('merchant', 'raw_text', 'mcc')),
  match_type text not null check (match_type in ('equals', 'contains')),
  pattern text not null check (char_length(btrim(pattern)) between 1 and 200),
  category_id uuid not null,
  priority integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete cascade,
  constraint categorization_rules_mcc
    check (match_field <> 'mcc' or (match_type = 'equals' and pattern ~ '^[0-9]{4}$'))
);

create unique index categorization_rules_unique_key
  on public.categorization_rules (user_id, match_field, match_type, lower(btrim(pattern)));
create index categorization_rules_category_id_idx on public.categorization_rules (category_id);

-- ---------------------------------------------------------------------------------------------
-- alerts: the in-app inbox. dedupe_key makes "never the same alert twice" a database guarantee;
-- clients dismiss alerts instead of deleting them, so a key can never be used a second time.
-- ---------------------------------------------------------------------------------------------

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (type in (
    'category_50', 'category_80', 'category_100', 'category_over', 'total_low', 'pace',
    'unusual_purchase', 'daily_allowance', 'payday', 'weekly_review', 'categorize'
  )),
  dedupe_key text not null check (char_length(dedupe_key) between 1 and 200),
  title text not null check (char_length(title) between 1 and 200),
  body text not null check (char_length(body) between 1 and 1000),
  params jsonb not null default '{}'::jsonb check (jsonb_typeof(params) = 'object'),
  category_id uuid,
  transaction_id uuid,
  period_id uuid,
  pushed_at timestamptz,
  read_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key),
  foreign key (category_id, user_id)
    references public.categories (id, user_id) on delete set null (category_id),
  foreign key (transaction_id, user_id)
    references public.transactions (id, user_id) on delete set null (transaction_id),
  foreign key (period_id, user_id)
    references public.budget_periods (id, user_id) on delete set null (period_id)
);

create index alerts_user_created_at_idx on public.alerts (user_id, created_at desc);
create index alerts_category_id_idx on public.alerts (category_id);
create index alerts_transaction_id_idx on public.alerts (transaction_id);
create index alerts_period_id_idx on public.alerts (period_id);

-- ---------------------------------------------------------------------------------------------
-- notification_settings: per alert type toggles, quiet hours, daily cap (spec section 9)
-- ---------------------------------------------------------------------------------------------

create table public.notification_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  transaction_moments boolean not null default true,
  category_thresholds boolean not null default true,
  total_low boolean not null default true,
  pace boolean not null default true,
  unusual_purchase boolean not null default true,
  daily_allowance boolean not null default true,
  payday boolean not null default true,
  weekly_review boolean not null default true,
  categorize_requests boolean not null default true,
  quiet_hours_enabled boolean not null default true,
  quiet_hours_start time not null default '22:00',
  quiet_hours_end time not null default '07:00',
  max_per_day smallint not null default 6 check (max_per_day between 1 and 50),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------
-- AI assistant history
-- ---------------------------------------------------------------------------------------------

create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text check (char_length(title) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create index ai_conversations_user_updated_at_idx
  on public.ai_conversations (user_id, updated_at desc);

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  conversation_id uuid not null,
  role text not null check (role in ('user', 'assistant', 'tool')),
  content text not null check (char_length(content) <= 20000),
  tool_name text check (char_length(tool_name) between 1 and 80),
  tool_payload jsonb,
  created_at timestamptz not null default now(),
  foreign key (conversation_id, user_id)
    references public.ai_conversations (id, user_id) on delete cascade
);

create index ai_messages_conversation_created_at_idx
  on public.ai_messages (conversation_id, created_at);

-- ---------------------------------------------------------------------------------------------
-- subscriptions: written only by the store webhook (service role); clients read their own row
-- ---------------------------------------------------------------------------------------------

create table public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  status text not null default 'none' check (status in (
    'none', 'trialing', 'active', 'grace_period', 'billing_issue', 'cancelled', 'expired'
  )),
  store text check (store in ('app_store', 'play_store', 'promotional')),
  product_id text check (char_length(product_id) between 1 and 200),
  trial_ends_at timestamptz,
  current_period_ends_at timestamptz,
  will_renew boolean,
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------
-- consent_events: append-only record of consents given and withdrawn (revDSG / GDPR)
-- ---------------------------------------------------------------------------------------------

create table public.consent_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in (
    'terms', 'privacy_policy', 'data_source', 'ai_processing', 'email_access'
  )),
  subject text check (char_length(subject) between 1 and 200),
  version text not null check (char_length(version) between 1 and 40),
  granted boolean not null,
  created_at timestamptz not null default now()
);

create index consent_events_user_created_at_idx on public.consent_events (user_id, created_at);

-- ---------------------------------------------------------------------------------------------
-- user_id indexes for RLS filters and cascades
-- ---------------------------------------------------------------------------------------------

create index fixed_costs_user_id_idx on public.fixed_costs (user_id);
create index categories_user_id_idx on public.categories (user_id, sort_order);
create index budget_periods_user_id_idx on public.budget_periods (user_id, starts_on desc);
create index budgets_user_id_idx on public.budgets (user_id);
create index budgets_category_id_idx on public.budgets (category_id);
create index data_sources_user_id_idx on public.data_sources (user_id);
create index transaction_splits_user_id_idx on public.transaction_splits (user_id);
create index categorization_rules_user_id_idx on public.categorization_rules (user_id);
create index ai_messages_user_id_idx on public.ai_messages (user_id);
create index data_source_credentials_user_id_idx on private.data_source_credentials (user_id);

-- ---------------------------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'fixed_costs', 'categories', 'budget_periods', 'budgets', 'data_sources',
    'transactions', 'transaction_splits', 'categorization_rules', 'notification_settings',
    'ai_conversations', 'subscriptions'
  ] loop
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t);
  end loop;
end;
$$;

create trigger set_updated_at before update on private.data_source_credentials
  for each row execute function public.set_updated_at();

-- consent_events is evidence (revDSG / GDPR) and ai_messages are ordered by time: clients may not
-- choose their timestamps.
create function public.set_created_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at := now();
  return new;
end;
$$;

create trigger set_created_at before insert on public.consent_events
  for each row execute function public.set_created_at();
create trigger set_created_at before insert on public.ai_messages
  for each row execute function public.set_created_at();

-- ---------------------------------------------------------------------------------------------
-- New users: create their profile, notification settings and subscription row
-- ---------------------------------------------------------------------------------------------

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_language text := new.raw_user_meta_data ->> 'language';
begin
  insert into public.profiles (id, language)
  values (new.id, case when requested_language in ('de', 'en') then requested_language else 'de' end);
  insert into public.notification_settings (user_id) values (new.id);
  insert into public.subscriptions (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------------------------
-- Account deletion (spec section 15): removes the auth user; every table cascades from it.
-- ---------------------------------------------------------------------------------------------

create function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  delete from auth.users where id = me;
end;
$$;

comment on function public.delete_my_account() is
  'Deletes the calling user and, through ON DELETE CASCADE, all of their data.';

-- ---------------------------------------------------------------------------------------------
-- Privileges: start from nothing, then grant exactly what the app needs
-- ---------------------------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- Later migrations start from nothing too: every grant to a client role must be explicit.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on
  public.fixed_costs, public.categories, public.budget_periods, public.budgets,
  public.data_sources, public.transactions, public.transaction_splits,
  public.categorization_rules, public.ai_conversations
  to authenticated;
grant select, insert on public.ai_messages to authenticated;
grant select on public.alerts to authenticated;
grant update (read_at, dismissed_at) on public.alerts to authenticated;
grant select, update on public.notification_settings to authenticated;
grant select on public.subscriptions to authenticated;
grant select, insert on public.consent_events to authenticated;

grant execute on function public.delete_my_account() to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Row-level security: every client sees and writes only its own rows
-- ---------------------------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.fixed_costs enable row level security;
alter table public.categories enable row level security;
alter table public.budget_periods enable row level security;
alter table public.budgets enable row level security;
alter table public.data_sources enable row level security;
alter table public.transactions enable row level security;
alter table public.transaction_splits enable row level security;
alter table public.categorization_rules enable row level security;
alter table public.alerts enable row level security;
alter table public.notification_settings enable row level security;
alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;
alter table public.subscriptions enable row level security;
alter table public.consent_events enable row level security;

create policy "own profile" on public.profiles
  for all to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "own notification settings" on public.notification_settings
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "own subscription" on public.subscriptions
  for select to authenticated
  using (user_id = (select auth.uid()));

do $$
declare
  t text;
begin
  foreach t in array array[
    'fixed_costs', 'categories', 'budget_periods', 'budgets', 'data_sources', 'transactions',
    'transaction_splits', 'categorization_rules', 'alerts', 'ai_conversations', 'consent_events'
  ] loop
    execute format(
      'create policy "own rows" on public.%I for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))', t);
  end loop;
end;
$$;

-- Clients may only write their own words into a conversation; assistant and tool messages are
-- written by the backend with the service role.
create policy "own messages: read" on public.ai_messages
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "own messages: write user turns" on public.ai_messages
  for insert to authenticated
  with check (user_id = (select auth.uid()) and role = 'user' and tool_name is null and tool_payload is null);

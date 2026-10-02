-- Milestone 2: the budget engine in the database (spec sections 3 and 4).
--
--   * Period math: a "month" runs from payday to the next payday (mirror of @budget/core).
--   * Spending rules: which transactions count against which category in a period.
--   * The monthly reset on payday: close the period, settle the leftover (roll over, move to
--     savings, or reset), open the next one. Runs on demand (ensure_current_period) and hourly
--     (pg_cron job "roll-due-periods").
--   * Client RPCs: complete_onboarding, get_overview, move_budget.
--
-- Conventions (as in the first migration): every function has an empty search_path and fully
-- qualified names; client roles get EXECUTE only where listed. Functions in schema private are
-- reachable only from other functions, never from a client.

-- ---------------------------------------------------------------------------------------------
-- Period math: mirror of periodContaining() in packages/core/src/engine/period.ts
-- ---------------------------------------------------------------------------------------------

-- The period that contains p_date for a given payday: starts_on (inclusive, a payday) to
-- ends_on (exclusive, the next payday). A payday the month does not have (the 31st in April, the
-- 30th in February) falls on the month's last day. periods.test.ts compares this with the
-- TypeScript engine for every day of four years and every payday.
create function public.period_containing(p_date date, p_payday integer)
returns table (starts_on date, ends_on date)
language plpgsql
immutable
set search_path = ''
as $$
declare
  this_month date;
  next_month date;
  previous_month date;
  payday_this_month date;
begin
  if p_date is null then
    raise exception 'date is required' using errcode = '22023';
  end if;
  if p_payday is null or p_payday not between 1 and 31 then
    raise exception 'payday must be a day of the month from 1 to 31' using errcode = '22023';
  end if;

  this_month := p_date - (extract(day from p_date)::integer - 1);
  next_month := (this_month + interval '1 month')::date;
  previous_month := (this_month - interval '1 month')::date;
  -- The payday in a month = least(the payday-th day, the month's last day).
  payday_this_month := least(this_month + (p_payday - 1), next_month - 1);

  if p_date >= payday_this_month then
    starts_on := payday_this_month;
    ends_on := least(next_month + (p_payday - 1), (next_month + interval '1 month')::date - 1);
  else
    starts_on := least(previous_month + (p_payday - 1), this_month - 1);
    ends_on := payday_this_month;
  end if;
  return next;
end;
$$;

comment on function public.period_containing(date, integer) is
  'The budget period (payday to next payday, end exclusive) that contains a date.';

-- ---------------------------------------------------------------------------------------------
-- Leftover policy: mirror of settleLeftover() in packages/core/src/engine/leftover.ts
-- ---------------------------------------------------------------------------------------------

-- rollover: the whole result moves into the next period, a deficit included.
-- savings:  money left over goes to savings; nothing is carried (a deficit is not carried either).
-- reset:    nothing is carried.
create function private.settle_leftover(
  p_policy text,
  p_leftover bigint,
  out carried_over bigint,
  out to_savings bigint
)
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_leftover is null or p_leftover not between -10000000000 and 10000000000 then
    raise exception 'leftover must be an integer number of Rappen within ±10000000000'
      using errcode = '22003';
  end if;
  case p_policy
    when 'rollover' then
      carried_over := p_leftover;
      to_savings := 0;
    when 'savings' then
      carried_over := 0;
      to_savings := greatest(p_leftover, 0);
    when 'reset' then
      carried_over := 0;
      to_savings := 0;
    else
      raise exception 'unknown leftover policy "%"', p_policy using errcode = '22023';
  end case;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Profile integrity: a real time zone, and income + payday once onboarded
-- ---------------------------------------------------------------------------------------------

-- Every "today" and every period boundary is computed in the profile's time zone, so it must be
-- a zone Postgres knows by name (abbreviations and POSIX offsets are not accepted).
create function private.check_profile_timezone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'invalid_timezone'
      using errcode = '22023', detail = format('"%s" is not a known time zone name.', new.timezone);
  end if;
  return new;
end;
$$;

create trigger check_timezone
  before insert or update of timezone on public.profiles
  for each row execute function private.check_profile_timezone();

-- The monthly reset needs both to open the next period; onboarding requires them, and this keeps
-- a later profile edit from removing them.
alter table public.profiles add constraint profiles_onboarded_has_income check (
  onboarding_completed_at is null or (net_income_rappen is not null and payday is not null)
);

-- ---------------------------------------------------------------------------------------------
-- Spending rules: what a period's transactions add up to, per category
-- ---------------------------------------------------------------------------------------------

-- THE spending rules (docs/DATA_MODEL.md, "Spending rules"):
--
--   1. A transaction belongs to the period when its booking time, converted to the user's time
--      zone, falls on a date in [starts_on, ends_on).
--   2. Ignored: deleted transactions (deleted_at), merged duplicates (merged_into_id) and
--      fixed-cost payments (fixed_cost_id; fixed costs are already deducted in the plan).
--   3. Allocations: a split transaction contributes its parts; any other transaction contributes
--      itself (amount_rappen, category_id).
--   4. Counted: every negative allocation (a purchase), and positive allocations that have a
--      category (a refund gives money back to that category). A positive allocation without a
--      category (e.g. a salary arriving through a bank feed) does not change the budget.
--   5. spent = −Σ amount per category. Uncategorized spending is one row with category_id NULL.
--      Categories without counted allocations are not returned.
--
-- public.get_overview() applies the same rules to the signed-in user's rows under RLS (a client
-- cannot call into schema private); overview.test.ts checks that both agree.
create function private.period_totals(
  p_user uuid,
  p_starts_on date,
  p_ends_on date,
  p_timezone text
)
returns table (category_id uuid, spent_rappen bigint)
language sql
stable
set search_path = ''
as $$
  select allocation.category_id, (-sum(allocation.amount_rappen))::bigint
    from public.transactions t
    cross join lateral (
      select s.category_id, s.amount_rappen
        from public.transaction_splits s
       where s.transaction_id = t.id
      union all
      select t.category_id, t.amount_rappen
       where not exists (select 1 from public.transaction_splits s where s.transaction_id = t.id)
    ) as allocation
   where t.user_id = p_user
     and t.deleted_at is null
     and t.merged_into_id is null
     and t.fixed_cost_id is null
     -- A local date lies within a day of the same UTC date: this coarse range lets the
     -- (user_id, booked_at) index do the work, the next two lines decide.
     and t.booked_at >= (p_starts_on - 1)::timestamp at time zone 'UTC'
     and t.booked_at < (p_ends_on + 1)::timestamp at time zone 'UTC'
     and (t.booked_at at time zone p_timezone)::date >= p_starts_on
     and (t.booked_at at time zone p_timezone)::date < p_ends_on
     and (allocation.amount_rappen < 0 or allocation.category_id is not null)
   group by allocation.category_id
$$;

-- ---------------------------------------------------------------------------------------------
-- The monthly reset on payday (spec section 4)
-- ---------------------------------------------------------------------------------------------

-- Brings one user's periods up to today (in their time zone): while the latest period has ended,
-- close it (record the leftover and what the policy did with it), then open the next one with a
-- fresh snapshot of the profile (income, active fixed costs, savings), the settled carry-over and
-- a copy of its budgets (archived categories left out). Several missed months roll one by one.
-- After a payday change, the first new period runs from the old payday to the first new payday
-- after it. Returns the current period's id, or null when the user has no period yet or is not
-- onboarded. Serialized per user, so concurrent calls never open a period twice.
create function private.roll_periods(p_user uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  profile public.profiles;
  today date;
  latest public.budget_periods;
  opened public.budget_periods;
  spent bigint;
  leftover bigint;
  policy text;
  carried bigint;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('private.roll_periods:' || p_user::text, 0)
  );

  select * into profile from public.profiles where id = p_user;
  if not found or profile.onboarding_completed_at is null then
    return null;
  end if;
  today := (now() at time zone profile.timezone)::date;

  select * into latest
    from public.budget_periods
   where user_id = p_user
   order by starts_on desc
   limit 1;
  if not found then
    return null;
  end if;

  while latest.ends_on <= today loop
    if latest.closed_at is null then
      select coalesce(sum(totals.spent_rappen), 0) into spent
        from private.period_totals(p_user, latest.starts_on, latest.ends_on, profile.timezone)
             as totals;
      leftover := latest.income_rappen - latest.fixed_costs_rappen - latest.savings_rappen
        + latest.carried_over_rappen - spent;
      policy := profile.leftover_policy;
      update public.budget_periods
         set closed_at = now(), leftover_action = policy, leftover_rappen = leftover
       where id = latest.id;
    else
      -- Closed earlier without a successor: the recorded outcome stands.
      leftover := latest.leftover_rappen;
      policy := latest.leftover_action;
    end if;

    select settled.carried_over into carried
      from private.settle_leftover(policy, leftover) as settled;

    insert into public.budget_periods (
      user_id, starts_on, ends_on, income_rappen, fixed_costs_rappen, savings_rappen,
      carried_over_rappen
    )
    select p_user, latest.ends_on, next_period.ends_on, profile.net_income_rappen,
           (select coalesce(sum(f.amount_rappen), 0)
              from public.fixed_costs f
             where f.user_id = p_user and f.active),
           profile.savings_monthly_rappen, carried
      from public.period_containing(latest.ends_on, profile.payday) as next_period
    returning * into opened;

    insert into public.budgets (user_id, period_id, category_id, amount_rappen, rollover_rappen)
    select p_user, opened.id, b.category_id, b.amount_rappen, 0
      from public.budgets b
      join public.categories c on c.id = b.category_id and c.user_id = b.user_id
     where b.period_id = latest.id
       and c.archived_at is null;

    latest := opened;
  end loop;

  return latest.id;
end;
$$;

-- For the app: rolls the signed-in user's periods up to today and returns the current period id
-- (null before onboarding).
create function public.ensure_current_period()
returns uuid
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
  return private.roll_periods(me);
end;
$$;

comment on function public.ensure_current_period() is
  'Rolls the signed-in user''s periods up to today (payday reset) and returns the current period id, or null before onboarding.';

-- For the scheduler: rolls every onboarded user whose latest period has ended in their time zone.
-- One user's failure (e.g. a value out of bounds) is logged and does not stop the others.
-- Returns how many users got a new period.
create function public.roll_due_periods()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  due record;
  rolled integer := 0;
begin
  for due in
    select p.id as user_id, latest.id as period_id
      from public.profiles p
      cross join lateral (
        select bp.id, bp.ends_on
          from public.budget_periods bp
         where bp.user_id = p.id
         order by bp.starts_on desc
         limit 1
      ) as latest
     where p.onboarding_completed_at is not null
       and latest.ends_on <= (now() at time zone p.timezone)::date
     order by p.id
  loop
    begin
      if private.roll_periods(due.user_id) is distinct from due.period_id then
        rolled := rolled + 1;
      end if;
    exception when others then
      raise warning 'roll_due_periods: periods of user % not rolled: % (SQLSTATE %)',
        due.user_id, sqlerrm, sqlstate;
    end;
  end loop;
  return rolled;
end;
$$;

comment on function public.roll_due_periods() is
  'Scheduled hourly (pg_cron job roll-due-periods): rolls every onboarded user whose period has ended. Returns the number of users rolled.';

-- ---------------------------------------------------------------------------------------------
-- Onboarding (spec section 3): everything the nine steps collected, in one atomic call
-- ---------------------------------------------------------------------------------------------

-- Input (keys as the columns they fill; other keys are ignored):
--   profile:               net_income_rappen, payday (both required), irregular_income,
--                          weekly_work_minutes, savings_monthly_rappen, savings_goal_name,
--                          savings_goal_rappen, savings_goal_date, leftover_policy,
--                          payment_methods, pain_level, sound_enabled, language, timezone
--   fixed_costs:           [{ kind, label, amount_rappen }]            (optional)
--   categories:            [{ default_key, name, budget_rappen }]      (at least one)
--   notification_settings: { <alert type toggles>, quiet_hours_enabled, quiet_hours_start "HH:MM",
--                            quiet_hours_end "HH:MM", max_per_day }    (optional)
-- Writes the profile fields, the fixed costs, the categories (sort_order = 0-based position in
-- the list), the first period (the one containing today in the given time zone) with one budget
-- per category, and the notification settings (missing keys keep their current values). Values
-- are checked by the tables' constraints and the time zone trigger; any failure leaves nothing
-- behind. Runs with the caller's rights, so RLS applies to every write.
create function public.complete_onboarding(p jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  profile_input jsonb := p -> 'profile';
  fixed_cost_input jsonb := coalesce(p -> 'fixed_costs', '[]'::jsonb);
  category_input jsonb := p -> 'categories';
  settings_input jsonb := coalesce(p -> 'notification_settings', '{}'::jsonb);
  profile public.profiles;
  settings public.notification_settings;
  fixed_costs_total bigint;
  today date;
  new_period_id uuid;
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  -- Locking the profile serializes concurrent calls: the second one sees the first one's result.
  select * into profile from public.profiles where id = me for update;
  if not found then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if profile.onboarding_completed_at is not null then
    raise exception 'already_onboarded' using errcode = '55000';
  end if;
  if (profile_input ->> 'net_income_rappen') is null or (profile_input ->> 'payday') is null then
    raise exception 'net_income_required' using errcode = '22023';
  end if;
  if jsonb_typeof(category_input) is distinct from 'array'
     or jsonb_array_length(category_input) = 0 then
    raise exception 'no_categories' using errcode = '22023';
  end if;

  -- Profile: only the onboarding fields; id, display name and timestamps are not the input's.
  profile := jsonb_populate_record(profile, (
    select coalesce(jsonb_object_agg(field.key, field.value), '{}'::jsonb)
      from jsonb_each(profile_input) as field
     where field.key in (
       'net_income_rappen', 'payday', 'irregular_income', 'weekly_work_minutes',
       'savings_monthly_rappen', 'savings_goal_name', 'savings_goal_rappen', 'savings_goal_date',
       'leftover_policy', 'payment_methods', 'pain_level', 'sound_enabled', 'language', 'timezone'
     )
  ));
  update public.profiles
     set net_income_rappen = profile.net_income_rappen,
         payday = profile.payday,
         irregular_income = profile.irregular_income,
         weekly_work_minutes = profile.weekly_work_minutes,
         savings_monthly_rappen = profile.savings_monthly_rappen,
         savings_goal_name = profile.savings_goal_name,
         savings_goal_rappen = profile.savings_goal_rappen,
         savings_goal_date = profile.savings_goal_date,
         leftover_policy = profile.leftover_policy,
         payment_methods = profile.payment_methods,
         pain_level = profile.pain_level,
         sound_enabled = profile.sound_enabled,
         language = profile.language,
         timezone = profile.timezone
   where id = me
  returning * into profile;

  with inserted as (
    insert into public.fixed_costs (user_id, kind, label, amount_rappen)
    select me, item.kind, item.label, item.amount_rappen
      from jsonb_to_recordset(fixed_cost_input) as item(kind text, label text, amount_rappen bigint)
    returning amount_rappen
  )
  select coalesce(sum(amount_rappen), 0) into fixed_costs_total from inserted;

  today := (now() at time zone profile.timezone)::date;
  insert into public.budget_periods (
    user_id, starts_on, ends_on, income_rappen, fixed_costs_rappen, savings_rappen,
    carried_over_rappen
  )
  select me, first_period.starts_on, first_period.ends_on, profile.net_income_rappen,
         fixed_costs_total, profile.savings_monthly_rappen, 0
    from public.period_containing(today, profile.payday) as first_period
  returning id into new_period_id;

  with chosen as (
    select (entry.ordinal - 1)::integer as list_index, item.default_key, item.name,
           item.budget_rappen
      from jsonb_array_elements(category_input) with ordinality as entry(value, ordinal)
      cross join lateral jsonb_to_record(entry.value)
        as item(default_key text, name text, budget_rappen bigint)
  ),
  inserted as (
    insert into public.categories (user_id, default_key, name, sort_order)
    select me, chosen.default_key, chosen.name, chosen.list_index from chosen
    returning id, sort_order
  )
  insert into public.budgets (user_id, period_id, category_id, amount_rappen)
  select me, new_period_id, inserted.id, chosen.budget_rappen
    from inserted
    join chosen on chosen.list_index = inserted.sort_order;

  select * into strict settings from public.notification_settings where user_id = me;
  settings := jsonb_populate_record(settings, (
    select coalesce(jsonb_object_agg(field.key, field.value), '{}'::jsonb)
      from jsonb_each(settings_input) as field
     where field.key in (
       'transaction_moments', 'category_thresholds', 'total_low', 'pace', 'unusual_purchase',
       'daily_allowance', 'payday', 'weekly_review', 'categorize_requests', 'quiet_hours_enabled',
       'quiet_hours_start', 'quiet_hours_end', 'max_per_day'
     )
  ));
  update public.notification_settings
     set transaction_moments = settings.transaction_moments,
         category_thresholds = settings.category_thresholds,
         total_low = settings.total_low,
         pace = settings.pace,
         unusual_purchase = settings.unusual_purchase,
         daily_allowance = settings.daily_allowance,
         payday = settings.payday,
         weekly_review = settings.weekly_review,
         categorize_requests = settings.categorize_requests,
         quiet_hours_enabled = settings.quiet_hours_enabled,
         quiet_hours_start = settings.quiet_hours_start,
         quiet_hours_end = settings.quiet_hours_end,
         max_per_day = settings.max_per_day
   where user_id = me;

  update public.profiles set onboarding_completed_at = now() where id = me;
  return new_period_id;
end;
$$;

comment on function public.complete_onboarding(jsonb) is
  'Saves the onboarding answers (profile, fixed costs, categories with budgets, notification settings) and opens the first period. Returns its id.';

-- ---------------------------------------------------------------------------------------------
-- Home screen: the current period with its plan, categories, spending and latest transactions
-- ---------------------------------------------------------------------------------------------

-- Rolls the period first (ensure_current_period), then reads with the caller's rights: RLS
-- applies to every row. Returns null before onboarding. Timestamps are rendered in UTC.
create function public.get_overview()
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
           t.created_at,
           exists (select 1 from public.transaction_splits s where s.transaction_id = t.id)
             as is_split
      from public.transactions t
     where t.user_id = me
       and t.deleted_at is null
       and t.merged_into_id is null
     order by t.booked_at desc, t.created_at desc, t.id desc
     limit 5
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
    'recent_transactions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id,
               'amount_rappen', r.amount_rappen,
               'booked_at', r.booked_at,
               'merchant', r.merchant,
               'category_id', r.category_id,
               'is_split', r.is_split,
               'source', r.source,
               'note', r.note
             ) order by r.booked_at desc, r.created_at desc, r.id desc)
        from recent r
    ), '[]'::jsonb)
  ) into overview;

  return overview;
end;
$$;

comment on function public.get_overview() is
  'The home screen: current period (rolled on payday), categories with budget and spending, uncategorized spending, the 5 latest transactions. Null before onboarding.';

-- ---------------------------------------------------------------------------------------------
-- Moving budget between categories ("cover an overspend")
-- ---------------------------------------------------------------------------------------------

create function public.move_budget(p_from_budget uuid, p_to_budget uuid, p_amount_rappen bigint)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  from_row public.budgets;
  to_row public.budgets;
  locked_row public.budgets;
  period_closed_at timestamptz;
begin
  if p_amount_rappen is null or p_amount_rappen <= 0 then
    raise exception 'invalid_amount'
      using errcode = '22023', detail = 'The amount to move must be more than 0 Rappen.';
  end if;
  if p_from_budget is null or p_to_budget is null then
    raise exception 'budget_not_found'
      using errcode = '22023', detail = 'Both budgets are required.';
  end if;
  if p_from_budget = p_to_budget then
    raise exception 'same_budget'
      using errcode = '22023', detail = 'Budget cannot be moved onto the budget it comes from.';
  end if;

  -- Lock both rows in a fixed order, so two opposite moves cannot deadlock. RLS hides other
  -- users' budgets: they are "not found".
  for locked_row in
    select * from public.budgets b
     where b.id in (p_from_budget, p_to_budget)
     order by b.id
       for update
  loop
    if locked_row.id = p_from_budget then
      from_row := locked_row;
    else
      to_row := locked_row;
    end if;
  end loop;

  if from_row.id is null or to_row.id is null then
    raise exception 'budget_not_found'
      using errcode = '22023', detail = 'Both budgets must exist and belong to you.';
  end if;
  if from_row.period_id <> to_row.period_id then
    raise exception 'different_periods'
      using errcode = '22023', detail = 'Budget can only move between budgets of the same period.';
  end if;
  -- Only the open period's plan can change. FOR SHARE waits for a payday reset that is closing
  -- the period right now and then sees its result.
  select bp.closed_at into period_closed_at
    from public.budget_periods bp
   where bp.id = from_row.period_id
     for share;
  if period_closed_at is not null then
    raise exception 'period_closed'
      using errcode = '22023', detail = 'Budget can only move within a period that is still open.';
  end if;
  if p_amount_rappen > from_row.amount_rappen then
    raise exception 'insufficient_budget'
      using errcode = '22023',
            detail = format('The budget has %s Rappen; %s Rappen cannot be moved.',
                            from_row.amount_rappen, p_amount_rappen);
  end if;

  update public.budgets set amount_rappen = amount_rappen - p_amount_rappen
   where id = from_row.id;
  update public.budgets set amount_rappen = amount_rappen + p_amount_rappen
   where id = to_row.id;
end;
$$;

comment on function public.move_budget(uuid, uuid, bigint) is
  'Moves an amount from one budget to another budget of the same open period, atomically.';

-- ---------------------------------------------------------------------------------------------
-- Schedule: the payday reset runs hourly (at minute 5) for everyone whose period has ended
-- ---------------------------------------------------------------------------------------------

-- On Supabase, pg_cron is installed into pg_catalog and keeps its jobs in schema cron.
create extension if not exists pg_cron with schema pg_catalog;

select cron.unschedule(jobid) from cron.job where jobname = 'roll-due-periods';
select cron.schedule('roll-due-periods', '5 * * * *', 'select public.roll_due_periods()');

-- ---------------------------------------------------------------------------------------------
-- Privileges: nothing by default, then exactly what the app calls
-- ---------------------------------------------------------------------------------------------

revoke all on function public.period_containing(date, integer) from public, anon, authenticated;
revoke all on function public.ensure_current_period() from public, anon, authenticated;
revoke all on function public.roll_due_periods() from public, anon, authenticated;
revoke all on function public.complete_onboarding(jsonb) from public, anon, authenticated;
revoke all on function public.get_overview() from public, anon, authenticated;
revoke all on function public.move_budget(uuid, uuid, bigint) from public, anon, authenticated;
revoke all on function private.settle_leftover(text, bigint) from public, anon, authenticated;
revoke all on function private.check_profile_timezone() from public, anon, authenticated;
revoke all on function private.period_totals(uuid, date, date, text)
  from public, anon, authenticated;
revoke all on function private.roll_periods(uuid) from public, anon, authenticated;

grant execute on function public.period_containing(date, integer) to authenticated;
grant execute on function public.ensure_current_period() to authenticated;
grant execute on function public.complete_onboarding(jsonb) to authenticated;
grant execute on function public.get_overview() to authenticated;
grant execute on function public.move_budget(uuid, uuid, bigint) to authenticated;

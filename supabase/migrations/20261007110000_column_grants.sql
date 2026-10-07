-- Milestone 3, part 3: the item accepted at the M2 security review (D-036).
--
--   * Clients may change only the user-editable columns of their profile: never its id, the
--     onboarding completion or the timestamps.
--   * budget_periods is read-only for clients. Periods are written by onboarding and the payday
--     reset only, both with the owner's rights.
--   * complete_onboarding therefore runs with the owner's rights (SECURITY DEFINER). Owner rights
--     bypass row-level security, so every statement is scoped to auth.uid() explicitly (reviewed
--     statement by statement below).
--   * move_budget waited for a concurrent payday reset with SELECT … FOR SHARE on budget_periods,
--     which needs UPDATE on that table. It now takes the reset's per-user lock instead.

-- ---------------------------------------------------------------------------------------------
-- complete_onboarding with the owner's rights
-- ---------------------------------------------------------------------------------------------

-- Same input, result and errors as in 20261002090000_budget_engine.sql. Review notes:
--   * me = auth.uid(); null → 42501. Every read and write below names me: profiles by id = me,
--     notification_settings by user_id = me, inserted rows with user_id = me, budgets only for
--     the period and categories inserted in this call.
--   * Input is read through whitelists (profile and notification keys) and typed records; values
--     are checked by the tables' constraints and the time zone trigger, as before.
--   * search_path is empty and every name is qualified, so no object of the caller's choosing is
--     resolved with the owner's rights.
--   * The profile row is locked first: a second call waits and then fails with already_onboarded.
create or replace function public.complete_onboarding(p jsonb)
returns uuid
language plpgsql
security definer
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
  'Saves the onboarding answers (profile, fixed costs, categories with budgets, notification settings) and opens the first period. Returns its id. Owner rights (D-036); every statement is scoped to auth.uid().';

-- ---------------------------------------------------------------------------------------------
-- move_budget without FOR SHARE on budget_periods
-- ---------------------------------------------------------------------------------------------

-- As before, except how it waits for a payday reset: private.roll_periods holds the per-user
-- advisory lock "private.roll_periods:<user>" while it closes a period, so taking the same lock
-- first means the closed_at read below sees a finished reset. RLS still hides other users'
-- budgets ("not found").
create or replace function public.move_budget(p_from_budget uuid, p_to_budget uuid, p_amount_rappen bigint)
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

  -- Wait for a payday reset of this user that is running right now.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('private.roll_periods:' || auth.uid()::text, 0)
  );

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
  -- Only the open period's plan can change.
  select bp.closed_at into period_closed_at
    from public.budget_periods bp
   where bp.id = from_row.period_id;
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

-- ---------------------------------------------------------------------------------------------
-- Column-level grants (D-036)
-- ---------------------------------------------------------------------------------------------

revoke update on public.profiles from authenticated;
grant update (
  display_name, language, timezone, net_income_rappen, payday, irregular_income,
  weekly_work_minutes, savings_monthly_rappen, savings_goal_name, savings_goal_rappen,
  savings_goal_date, leftover_policy, pain_level, sound_enabled, payment_methods
) on public.profiles to authenticated;

revoke insert, update, delete on public.budget_periods from authenticated;

-- create or replace keeps the function's privileges; restated for the reader.
revoke all on function public.complete_onboarding(jsonb) from public, anon, authenticated;
revoke all on function public.move_budget(uuid, uuid, bigint) from public, anon, authenticated;
grant execute on function public.complete_onboarding(jsonb) to authenticated;
grant execute on function public.move_budget(uuid, uuid, bigint) to authenticated;

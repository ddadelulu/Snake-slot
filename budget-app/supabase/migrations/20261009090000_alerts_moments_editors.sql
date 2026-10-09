-- Milestone 4: alerts, cash-feel moments, reminders, push delivery, editors and the write guard
-- (docs/API.md, "Alerts, moments, reminders, editors (Milestone 4)"; docs/DATA_MODEL.md).
--
--   * One spending rule set: internal.counted_allocations is the only place that decides which
--     transaction parts count in a period. private.period_totals (the payday reset),
--     get_overview, the alert engine, the moments and the category detail all read it.
--   * Alert engine: private.evaluate_alerts (owner rights, scoped to one user) creates alerts
--     with a dedupe key, so each alert exists at most once. It runs at the end of every
--     transaction RPC (through internal.evaluate_alerts, guarded to the caller) and hourly for
--     everyone (run_scheduled_alerts, which also raises the reminders of D-044).
--   * Push: push_tokens (written through register/unregister_push_token only), claim_pushes for
--     the send-pushes Edge Function (service role), quiet hours and the daily cap in the user's
--     time zone.
--   * Guard (M4-06): clients can no longer write transactions, transaction_splits or
--     data_sources directly; the RPCs set the transaction-local flag batzen.via_rpc.
--   * Moments, inbox, editors (set_budget, get_category_detail), unread_alert_count.
--
-- Conventions as before: empty search_path, qualified names, EXECUTE only where granted at the end.

-- ---------------------------------------------------------------------------------------------
-- Vocabulary and settings
-- ---------------------------------------------------------------------------------------------

alter table public.alerts drop constraint alerts_type_check;
alter table public.alerts add constraint alerts_type_check check (type in (
  'category_50', 'category_80', 'category_100', 'category_over', 'total_low', 'pace',
  'unusual_purchase', 'daily_allowance', 'payday', 'weekly_review', 'categorize',
  'reminder_payday', 'reminder_weekly', 'reminder_stale'
));

-- Inbox-only alerts: when one evaluation crosses several thresholds of a category at once
-- (50 % straight to over budget), every crossed threshold is recorded but only the highest is
-- pushed; the lower ones are silent.
alter table public.alerts add column silent boolean not null default false;

comment on column public.alerts.silent is
  'Shown in the inbox, never pushed (a lower threshold crossed together with a higher one).';
comment on column public.alerts.pushed_at is
  'When claim_pushes handed the alert to the push sender (at most once).';

create index alerts_user_pushed_at_idx on public.alerts (user_id, pushed_at)
  where pushed_at is not null;
create index alerts_unpushed_idx on public.alerts (created_at)
  where pushed_at is null and not silent;

alter table public.notification_settings
  add column reminder_payday boolean not null default true,
  add column reminder_weekly boolean not null default true,
  add column reminder_weekly_day smallint not null default 7
    check (reminder_weekly_day between 1 and 7),
  add column reminder_weekly_time time not null default '18:00',
  add column reminder_stale boolean not null default true;

comment on column public.notification_settings.reminder_weekly_day is
  'ISO day of the week for the weekly reminder: 1 = Monday … 7 = Sunday.';
comment on column public.notification_settings.reminder_weekly_time is
  'Local time (profile time zone) from which the weekly reminder is raised.';

-- ---------------------------------------------------------------------------------------------
-- push_tokens: Expo push tokens of the user's devices
-- ---------------------------------------------------------------------------------------------

create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token text not null unique
    check (char_length(token) <= 255 and token ~ '^Expo(nent)?PushToken\[[^\]]+\]$'),
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.push_tokens is
  'One row per device. A token belongs to the user who registered it last (a device switching accounts moves).';

create index push_tokens_user_id_idx on public.push_tokens (user_id);

create trigger set_updated_at before update on public.push_tokens
  for each row execute function public.set_updated_at();

alter table public.push_tokens enable row level security;

create policy "own rows" on public.push_tokens for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------------------------
-- Spending rules, in one place
-- ---------------------------------------------------------------------------------------------

-- The parts of a user's transactions that count against the budget in [p_starts_on, p_ends_on)
-- (local dates in p_timezone), by the spending rules of DATA_MODEL.md: not deleted, merged or a
-- fixed-cost payment; a split contributes its parts; money out always, money in only with a
-- category. Runs with the caller's rights: under RLS for a client, for any user with owner
-- rights.
create function internal.counted_allocations(
  p_user uuid,
  p_starts_on date,
  p_ends_on date,
  p_timezone text
)
returns table (transaction_id uuid, booked_at timestamptz, category_id uuid, amount_rappen bigint)
language sql
stable
set search_path = ''
as $$
  select t.id, t.booked_at, allocation.category_id, allocation.amount_rappen
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
$$;

-- spent = −Σ amount per category (null = uncategorized); categories without counted parts are
-- not returned.
create function internal.period_spending(
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
  select a.category_id, (-sum(a.amount_rappen))::bigint
    from internal.counted_allocations(p_user, p_starts_on, p_ends_on, p_timezone) as a
   group by a.category_id
$$;

-- The payday reset keeps its name and result; the rules now live in internal.period_spending.
create or replace function private.period_totals(
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
  select s.category_id, s.spent_rappen
    from internal.period_spending(p_user, p_starts_on, p_ends_on, p_timezone) as s
$$;

-- Pace forecast: the day the money runs out when spending goes on at the average daily rate so
-- far this period, today + remaining / (spent / days elapsed), rounded down. Null when nothing
-- was spent yet or nothing is left.
create function internal.pace_runs_out(
  p_available_rappen bigint,
  p_spent_rappen bigint,
  p_starts_on date,
  p_today date
)
returns date
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  elapsed integer := p_today - p_starts_on + 1;
begin
  if p_spent_rappen is null or p_spent_rappen <= 0 or elapsed < 1
     or p_available_rappen is null or p_available_rappen <= p_spent_rappen then
    return null;
  end if;
  return p_today + ((p_available_rappen - p_spent_rappen) * elapsed / p_spent_rappen)::integer;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Texts (de with Swiss spelling, en)
-- ---------------------------------------------------------------------------------------------

-- 'CHF 1’240.50' (de) / 'CHF 1,240.50' (en); negative amounts as 'CHF -12.00'.
create function private.format_chf(p_rappen bigint, p_language text)
returns text
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  absolute bigint := abs(p_rappen);
  francs text := (absolute / 100)::text;
  separator text := case when p_language = 'en' then ',' else '’' end;
begin
  francs := regexp_replace(francs, '(\d)(?=(\d{3})+$)', '\1' || separator, 'g');
  return 'CHF ' || case when p_rappen < 0 then '-' else '' end
      || francs || '.' || lpad((absolute % 100)::text, 2, '0');
end;
$$;

-- '18. Oktober' (de) / '18 October' (en).
create function private.format_day(p_date date, p_language text)
returns text
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  month integer := extract(month from p_date)::integer;
  day integer := extract(day from p_date)::integer;
begin
  if p_language = 'en' then
    return day || ' ' || (array['January', 'February', 'March', 'April', 'May', 'June', 'July',
      'August', 'September', 'October', 'November', 'December'])[month];
  end if;
  return day || '. ' || (array['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli',
    'August', 'September', 'Oktober', 'November', 'Dezember'])[month];
end;
$$;

-- A category's display name: its own name, else the default key's name as the app shows it
-- (apps/mobile/src/i18n, "categories").
create function private.category_label(p_default_key text, p_name text, p_language text)
returns text
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
begin
  if p_name is not null then
    return p_name;
  end if;
  if p_language = 'en' then
    return case p_default_key
      when 'groceries' then 'Groceries'
      when 'eating_out' then 'Eating out'
      when 'clothes' then 'Clothes'
      when 'going_out' then 'Going out'
      when 'transport' then 'Transport'
      when 'hobbies' then 'Hobbies'
      when 'personal_care' then 'Personal care'
      when 'gifts' then 'Gifts'
      when 'shopping_electronics' then 'Shopping & electronics'
      else 'Other'
    end;
  end if;
  return case p_default_key
    when 'groceries' then 'Lebensmittel'
    when 'eating_out' then 'Auswärts essen'
    when 'clothes' then 'Kleider'
    when 'going_out' then 'Ausgang'
    when 'transport' then 'Verkehr'
    when 'hobbies' then 'Hobbys'
    when 'personal_care' then 'Körperpflege'
    when 'gifts' then 'Geschenke'
    when 'shopping_electronics' then 'Shopping & Elektronik'
    else 'Diverses'
  end;
end;
$$;

-- Title and body of an alert in the profile language, from its params (amounts in Rappen,
-- dates as ISO strings) and the category's display name.
create function private.alert_text(
  p_type text,
  p_language text,
  p_params jsonb,
  p_category text,
  out title text,
  out body text
)
language plpgsql
immutable
set search_path = ''
as $$
declare
  en boolean := p_language = 'en';
  name text := case when p_language = 'en' then '“' || p_category || '”'
                    else '«' || p_category || '»' end;
  merchant text := p_params ->> 'merchant';
  amount text;
begin
  case p_type
  when 'category_50' then
    amount := private.format_chf((p_params ->> 'remaining_rappen')::bigint, p_language);
    title := case when en then 'Halfway through ' || name else 'Halbzeit bei ' || name end;
    body := case when en then 'You’ve spent half of ' || name || '. ' || amount || ' left.'
                 else 'Die Hälfte von ' || name || ' ist ausgegeben. Noch ' || amount || ' übrig.' end;
  when 'category_80' then
    amount := private.format_chf((p_params ->> 'remaining_rappen')::bigint, p_language);
    title := case when en then name || ' almost used up' else name || ' fast aufgebraucht' end;
    body := case when en then '80% of ' || name || ' is gone. ' || amount || ' left.'
                 else '80 % von ' || name || ' sind weg. Noch ' || amount || ' übrig.' end;
  when 'category_100' then
    title := case when en then name || ' used up' else name || ' aufgebraucht' end;
    body := case when en then 'Your ' || name || ' budget is used up for this month.'
                 else 'Das Budget für ' || name || ' ist für diesen Monat aufgebraucht.' end;
  when 'category_over' then
    amount := private.format_chf(-(p_params ->> 'remaining_rappen')::bigint, p_language);
    title := case when en then 'Over budget: ' || name else name || ' überzogen' end;
    body := case when en then 'You’re ' || amount || ' over your ' || name || ' budget.'
                 else 'Du bist ' || amount || ' über dem Budget für ' || name || '.' end;
  when 'total_low' then
    amount := private.format_chf((p_params ->> 'balance_rappen')::bigint, p_language);
    title := case when en then 'Running low' else 'Nur noch wenig übrig' end;
    if (p_params ->> 'balance_rappen')::bigint < 0 then
      amount := private.format_chf(-(p_params ->> 'balance_rappen')::bigint, p_language);
      body := case when en then 'You’re ' || amount || ' over for this month.'
                   else 'Du bist diesen Monat ' || amount || ' im Minus.' end;
    else
      body := case when en then 'You have ' || amount || ' left this month (under 20%).'
                   else 'Diesen Monat bleiben dir noch ' || amount || ' (unter 20 %).' end;
    end if;
  when 'pace' then
    amount := private.format_day((p_params ->> 'runs_out_on')::date, p_language);
    title := case when en then 'Spending fast' else 'Zu schnell unterwegs' end;
    if p_category is null then
      body := case when en then 'At this pace, your money runs out on ' || amount || '.'
                   else 'Bei diesem Tempo reicht dein Geld nur bis am ' || amount || '.' end;
    else
      body := case when en then 'At this pace, ' || name || ' runs out on ' || amount || '.'
                   else 'Bei diesem Tempo reicht ' || name || ' nur bis am ' || amount || '.' end;
    end if;
  when 'unusual_purchase' then
    amount := private.format_chf(-(p_params ->> 'amount_rappen')::bigint, p_language);
    title := case when en then 'Unusual purchase' else 'Ungewöhnlicher Einkauf' end;
    body := amount
      || case when merchant is null then ''
              when en then ' at ' || merchant else ' bei ' || merchant end
      || case when en then ': much more than you usually spend on ' || name || '.'
              else ': viel mehr als sonst für ' || name || '.' end;
  when 'daily_allowance' then
    title := case when en then 'Over today’s budget' else 'Tagesbudget überschritten' end;
    body := case when en then
        'You’ve spent ' || private.format_chf((p_params ->> 'spent_today_rappen')::bigint, p_language)
        || ' today; your daily budget is '
        || private.format_chf((p_params ->> 'allowance_rappen')::bigint, p_language) || '.'
      else
        'Heute hast du ' || private.format_chf((p_params ->> 'spent_today_rappen')::bigint, p_language)
        || ' ausgegeben, dein Tagesbudget ist '
        || private.format_chf((p_params ->> 'allowance_rappen')::bigint, p_language) || '.'
      end;
  when 'payday' then
    title := case when en then 'Payday!' else 'Zahltag!' end;
    if (p_params ->> 'leftover_rappen')::bigint < 0 then
      amount := private.format_chf(-(p_params ->> 'leftover_rappen')::bigint, p_language);
      body := case when en then 'A new month starts. Last month you spent ' || amount
                                || ' more than planned.'
                   else 'Ein neuer Monat beginnt. Letzten Monat hast du ' || amount
                        || ' mehr ausgegeben als geplant.' end;
    else
      amount := private.format_chf((p_params ->> 'leftover_rappen')::bigint, p_language);
      body := case when en then 'A new month starts. You had ' || amount || ' left last month.'
                   else 'Ein neuer Monat beginnt. Letzten Monat sind ' || amount
                        || ' übrig geblieben.' end;
    end if;
  when 'categorize' then
    amount := private.format_chf(-(p_params ->> 'amount_rappen')::bigint, p_language);
    title := case when en then 'What was it?' else 'Was war das?' end;
    body := amount
      || case when merchant is null then ''
              when en then ' at ' || merchant else ' bei ' || merchant end
      || case when en then '. Pick a category.' else '. Wähle eine Kategorie.' end;
  when 'reminder_payday' then
    title := case when en then 'Plan your new month' else 'Plane deinen neuen Monat' end;
    body := case when en then 'It’s payday. Take two minutes to check your budgets.'
                 else 'Heute ist Zahltag. Nimm dir zwei Minuten für deine Budgets.' end;
  when 'reminder_weekly' then
    title := case when en then 'Weekly check-in' else 'Wochenrückblick' end;
    body := case when en then 'Log your cash and import your statement.'
                 else 'Erfasse dein Bargeld und importiere deinen Kontoauszug.' end;
  when 'reminder_stale' then
    title := case when en then 'Does your budget still fit?' else 'Passt dein Budget noch?' end;
    body := case when en then 'You haven’t changed your budget in 30 days. Take a quick look.'
                 else 'Du hast dein Budget seit 30 Tagen nicht angepasst. Schau kurz rein.' end;
  end case;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- The alert engine (owner rights; every statement names the user it was called for)
-- ---------------------------------------------------------------------------------------------

-- Inserts one alert unless its dedupe key was used before. Returns whether it was inserted.
create function private.raise_alert(
  p_user uuid,
  p_language text,
  p_type text,
  p_dedupe_key text,
  p_params jsonb,
  p_category_label text,
  p_category_id uuid,
  p_transaction_id uuid,
  p_period_id uuid,
  p_silent boolean
)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  text_parts record;
  new_id uuid;
begin
  select * into text_parts from private.alert_text(p_type, p_language, p_params, p_category_label);
  insert into public.alerts (
    user_id, type, dedupe_key, title, body, params, category_id, transaction_id, period_id, silent
  )
  values (
    p_user, p_type, p_dedupe_key, text_parts.title, text_parts.body, p_params, p_category_id,
    p_transaction_id, p_period_id, p_silent
  )
  on conflict (user_id, dedupe_key) do nothing
  returning id into new_id;
  return new_id is not null;
end;
$$;

-- Thresholds a category has crossed: 50 / 80 / 100 % of what it has (budget + rollover) and
-- "over"; with nothing to spend (0 or less), any spending is "over".
create function private.crossed_levels(p_available bigint, p_spent bigint)
returns text[]
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  levels text[] := '{}';
begin
  if p_spent is null or p_spent <= 0 then
    return levels;
  end if;
  if p_available <= 0 then
    return array['over'];
  end if;
  if p_spent * 2 >= p_available then levels := levels || '50'::text; end if;
  if p_spent * 5 >= p_available * 4 then levels := levels || '80'::text; end if;
  if p_spent >= p_available then levels := levels || '100'::text; end if;
  if p_spent > p_available then levels := levels || 'over'::text; end if;
  return levels;
end;
$$;

-- Everything about the user's period that can call for an alert, as of p_now (in the profile's
-- time zone): category thresholds, total_low, pace (categories and total), daily_allowance,
-- payday. Then, for each of p_transaction_ids, unusual_purchase and categorize. Disabled types
-- (notification_settings) are not created. Returns how many alerts were created.
create function private.evaluate_alerts(
  p_user uuid,
  p_transaction_ids uuid[],
  p_now timestamptz
)
returns integer
language plpgsql
set search_path = ''
set timezone to 'UTC'
as $$
declare
  profile public.profiles;
  settings public.notification_settings;
  zone text;
  lang text;
  today date;
  period public.budget_periods;
  previous public.budget_periods;
  created integer := 0;
  spendable bigint;
  total_spent bigint;
  spent_before_today bigint;
  spent_today bigint;
  balance_at_start bigint;
  allowance bigint;
  runs_out date;
  elapsed integer;
  cat record;
  new_levels text[];
  level_index integer;
  tx record;
  median numeric;
  history_count integer;
begin
  select * into profile from public.profiles where id = p_user;
  if not found or profile.onboarding_completed_at is null then
    return 0;
  end if;
  select * into settings from public.notification_settings where user_id = p_user;
  if not found then
    return 0;
  end if;
  zone := profile.timezone;
  lang := profile.language;
  today := (p_now at time zone zone)::date;

  select * into period
    from public.budget_periods bp
   where bp.user_id = p_user and bp.starts_on <= today and bp.ends_on > today;

  if found then
    elapsed := today - period.starts_on + 1;
    spendable := period.income_rappen - period.fixed_costs_rappen - period.savings_rappen
      + period.carried_over_rappen;
    select coalesce(sum(s.spent_rappen), 0) into total_spent
      from internal.period_spending(p_user, period.starts_on, period.ends_on, zone) as s;

    -- Categories with a budget in this period (active ones; archived categories get no alerts).
    for cat in
      select c.id, private.category_label(c.default_key, c.name, lang) as label,
             b.amount_rappen + b.rollover_rappen as available,
             coalesce(s.spent_rappen, 0) as spent
        from public.budgets b
        join public.categories c on c.id = b.category_id
        left join internal.period_spending(p_user, period.starts_on, period.ends_on, zone) as s
          on s.category_id = c.id
       where b.period_id = period.id and b.user_id = p_user and c.archived_at is null
       order by c.sort_order, c.created_at, c.id
    loop
      if settings.category_thresholds then
        select coalesce(array_agg(level order by ord), '{}') into new_levels
          from unnest(private.crossed_levels(cat.available, cat.spent))
               with ordinality as crossed(level, ord)
         where not exists (
           select 1 from public.alerts a
            where a.user_id = p_user
              and a.dedupe_key = 'category_' || level || ':' || period.id || ':' || cat.id);
        for level_index in 1 .. coalesce(array_length(new_levels, 1), 0) loop
          created := created + private.raise_alert(
               p_user, lang, 'category_' || new_levels[level_index],
               'category_' || new_levels[level_index] || ':' || period.id || ':' || cat.id,
               jsonb_build_object('period_id', period.id, 'category_id', cat.id,
                                  'budget_rappen', cat.available, 'spent_rappen', cat.spent,
                                  'remaining_rappen', cat.available - cat.spent),
               cat.label, cat.id, null, period.id,
               -- Several thresholds at once: only the highest is pushed.
               level_index < array_length(new_levels, 1))::integer;
        end loop;
      end if;

      if settings.pace and elapsed >= 3 then
        runs_out := internal.pace_runs_out(cat.available, cat.spent, period.starts_on, today);
        if runs_out < period.ends_on then
          created := created + private.raise_alert(
                 p_user, lang, 'pace', 'pace:' || period.id || ':' || cat.id,
                 jsonb_build_object('period_id', period.id, 'category_id', cat.id,
                                    'scope', 'category', 'available_rappen', cat.available,
                                    'spent_rappen', cat.spent,
                                    'daily_average_rappen', cat.spent / elapsed,
                                    'runs_out_on', runs_out, 'ends_on', period.ends_on),
                 cat.label, cat.id, null, period.id, false)::integer;
        end if;
      end if;
    end loop;

    if settings.total_low and spendable > 0 and total_spent > 0
       and (spendable - total_spent) * 5 < spendable then
      created := created + private.raise_alert(
             p_user, lang, 'total_low', 'total_low:' || period.id,
             jsonb_build_object('period_id', period.id, 'spendable_rappen', spendable,
                                'spent_rappen', total_spent,
                                'balance_rappen', spendable - total_spent),
             null, null, null, period.id, false)::integer;
    end if;

    if settings.pace and elapsed >= 3 then
      runs_out := internal.pace_runs_out(spendable, total_spent, period.starts_on, today);
      if runs_out < period.ends_on then
        created := created + private.raise_alert(
               p_user, lang, 'pace', 'pace:' || period.id || ':total',
               jsonb_build_object('period_id', period.id, 'category_id', null, 'scope', 'total',
                                  'available_rappen', spendable, 'spent_rappen', total_spent,
                                  'daily_average_rappen', total_spent / elapsed,
                                  'runs_out_on', runs_out, 'ends_on', period.ends_on),
               null, null, null, period.id, false)::integer;
      end if;
    end if;

    -- The day's allowance: what was left at the start of today, spread over the days left
    -- (today included). Only while something was left.
    if settings.daily_allowance then
      select coalesce(sum(s.spent_rappen), 0) into spent_before_today
        from internal.period_spending(p_user, period.starts_on, today, zone) as s;
      select coalesce(sum(s.spent_rappen), 0) into spent_today
        from internal.period_spending(p_user, today, today + 1, zone) as s;
      balance_at_start := spendable - spent_before_today;
      if balance_at_start > 0 then
        allowance := balance_at_start / (period.ends_on - today);
        if spent_today > allowance then
          created := created + private.raise_alert(
                 p_user, lang, 'daily_allowance', 'daily_allowance:' || today,
                 jsonb_build_object('period_id', period.id, 'date', today,
                                    'allowance_rappen', allowance,
                                    'spent_today_rappen', spent_today),
                 null, null, null, period.id, false)::integer;
        end if;
      end if;
    end if;

    -- Payday: a period that follows a closed one, within its first week.
    if settings.payday and today - period.starts_on < 7 then
      select * into previous
        from public.budget_periods bp
       where bp.user_id = p_user and bp.ends_on = period.starts_on and bp.closed_at is not null;
      if found then
        created := created + private.raise_alert(
           p_user, lang, 'payday', 'payday:' || period.id,
           jsonb_build_object(
             'period_id', period.id, 'previous_period_id', previous.id,
             'previous_spent_rappen', (
               select coalesce(sum(s.spent_rappen), 0)
                 from internal.period_spending(p_user, previous.starts_on, previous.ends_on, zone)
                      as s),
             'leftover_rappen', previous.leftover_rappen,
             'leftover_action', previous.leftover_action,
             'carried_over_rappen', period.carried_over_rappen),
           null, null, null, period.id, false)::integer;
      end if;
    end if;
  end if;

  -- Transaction alerts: recent money out (booked within the last three days), not from a
  -- statement file (history), not a split, a fixed-cost payment, deleted or merged.
  for tx in
    select t.id, t.amount_rappen, t.merchant, t.booked_at, t.source, t.category_id,
           t.categorized_by, t.category_confidence, t.fixed_cost_id,
           private.category_label(c.default_key, c.name, lang) as label
      from public.transactions t
      left join public.categories c on c.id = t.category_id
     where t.user_id = p_user
       and t.id = any (coalesce(p_transaction_ids, '{}'))
       and t.amount_rappen < 0
       and t.deleted_at is null
       and t.merged_into_id is null
       and t.fixed_cost_id is null
       and t.source <> 'statement_import'
       and (t.booked_at at time zone zone)::date between today - 2 and today + 1
       and not exists (select 1 from public.transaction_splits s where s.transaction_id = t.id)
     order by t.booked_at, t.id
  loop
    -- The person typed a manual entry in the app; they are asked there, not by push.
    if settings.categorize_requests and tx.source <> 'manual'
       and internal.needs_review(tx.amount_rappen, tx.category_id, tx.categorized_by,
                                 tx.category_confidence, tx.fixed_cost_id, false, false, false)
    then
      created := created + private.raise_alert(
             p_user, lang, 'categorize', 'categorize:' || tx.id,
             jsonb_build_object('transaction_id', tx.id, 'amount_rappen', tx.amount_rappen,
                                'merchant', tx.merchant, 'booked_at', tx.booked_at),
             null, null, tx.id, null, false)::integer;
    end if;

    if settings.unusual_purchase and tx.category_id is not null and -tx.amount_rappen > 5000 then
      select percentile_cont(0.5) within group (order by -h.amount_rappen), count(*)
        into median, history_count
        from public.transactions h
       where h.user_id = p_user
         and h.category_id = tx.category_id
         and h.id <> tx.id
         and h.amount_rappen < 0
         and h.deleted_at is null
         and h.merged_into_id is null
         and h.fixed_cost_id is null
         and h.booked_at >= tx.booked_at - interval '90 days'
         and h.booked_at < tx.booked_at;
      if history_count >= 3 and -tx.amount_rappen > 3 * median then
        created := created + private.raise_alert(
               p_user, lang, 'unusual_purchase', 'unusual_purchase:' || tx.id,
               jsonb_build_object('transaction_id', tx.id, 'category_id', tx.category_id,
                                  'amount_rappen', tx.amount_rappen,
                                  'median_rappen', round(median)::bigint,
                                  'merchant', tx.merchant),
               tx.label, tx.category_id, tx.id, null, false)::integer;
      end if;
    end if;
  end loop;

  return created;
end;
$$;

-- The reminders of D-044, as of p_now in the profile's time zone: plan the new month on payday
-- (from 09:00), the weekly reminder on the chosen day from the chosen time, and a nudge when the
-- budget has not changed for 30 days (from 09:00; once per quiet stretch).
create function private.reminder_alerts(p_user uuid, p_now timestamptz)
returns integer
language plpgsql
set search_path = ''
set timezone to 'UTC'
as $$
declare
  profile public.profiles;
  settings public.notification_settings;
  local_now timestamp;
  today date;
  period public.budget_periods;
  last_change timestamptz;
  created integer := 0;
begin
  select * into profile from public.profiles where id = p_user;
  if not found or profile.onboarding_completed_at is null then
    return 0;
  end if;
  select * into settings from public.notification_settings where user_id = p_user;
  if not found then
    return 0;
  end if;
  local_now := p_now at time zone profile.timezone;
  today := local_now::date;

  if settings.reminder_payday and local_now::time >= '09:00' then
    select * into period
      from public.budget_periods bp
     where bp.user_id = p_user and bp.starts_on = today
       and exists (select 1 from public.budget_periods earlier
                    where earlier.user_id = p_user and earlier.ends_on = bp.starts_on);
    if found then
      created := created + private.raise_alert(
         p_user, profile.language, 'reminder_payday', 'reminder_payday:' || period.id,
         jsonb_build_object('period_id', period.id, 'starts_on', period.starts_on,
                            'ends_on', period.ends_on),
         null, null, null, period.id, false)::integer;
    end if;
  end if;

  if settings.reminder_weekly
     and extract(isodow from today) = settings.reminder_weekly_day
     and local_now::time >= settings.reminder_weekly_time then
    created := created + private.raise_alert(
           p_user, profile.language, 'reminder_weekly', 'reminder_weekly:' || today,
           jsonb_build_object('date', today), null, null, null, null, false)::integer;
  end if;

  if settings.reminder_stale and local_now::time >= '09:00' then
    -- A budget change by the person: onboarding, a category created, renamed or archived, a
    -- budget changed after it was created (the payday reset only creates budgets).
    select greatest(
             profile.onboarding_completed_at,
             (select max(c.updated_at) from public.categories c where c.user_id = p_user),
             (select max(b.updated_at) from public.budgets b
               where b.user_id = p_user and b.updated_at > b.created_at))
      into last_change;
    if last_change <= p_now - interval '30 days' then
      created := created + private.raise_alert(
             p_user, profile.language, 'reminder_stale',
             'reminder_stale:' || to_char(last_change at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS'),
             jsonb_build_object('last_change_at', last_change), null, null, null, null, false)::integer;
    end if;
  end if;

  return created;
end;
$$;

-- For the RPCs (with the caller's rights): evaluates the caller's alerts with owner rights,
-- because alerts are not writable by clients (a client could otherwise push any text to itself).
-- Only for the signed-in user: p_user must be auth.uid().
create function internal.evaluate_alerts(p_user uuid, p_transaction_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or p_user is distinct from auth.uid() then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  return private.evaluate_alerts(p_user, p_transaction_ids, now());
end;
$$;

comment on function internal.evaluate_alerts(uuid, uuid[]) is
  'Raises the signed-in user''s due alerts (owner rights, only for auth.uid()). Called at the end of the transaction RPCs and set_budget.';

-- The hourly job (pg_cron run-scheduled-alerts): rolls due periods, then raises every onboarded
-- user's due alerts and reminders as of p_now. One user's failure is logged and skipped.
-- Returns how many alerts were created. p_now exists for tests; the job passes nothing.
create function public.run_scheduled_alerts(p_now timestamptz default now())
returns integer
language plpgsql
set search_path = ''
as $$
declare
  due record;
  created integer := 0;
begin
  perform public.roll_due_periods();
  for due in
    select p.id from public.profiles p where p.onboarding_completed_at is not null order by p.id
  loop
    begin
      created := created + private.evaluate_alerts(due.id, null, p_now)
                         + private.reminder_alerts(due.id, p_now);
    exception when others then
      raise warning 'run_scheduled_alerts: alerts of user % not evaluated: % (SQLSTATE %)',
        due.id, sqlerrm, sqlstate;
    end;
  end loop;
  return created;
end;
$$;

comment on function public.run_scheduled_alerts(timestamptz) is
  'Scheduled hourly (pg_cron job run-scheduled-alerts): time-based alerts and reminders for every onboarded user. Returns the number created.';

-- ---------------------------------------------------------------------------------------------
-- Guard (M4-06): transactions, transaction_splits and data_sources only through the RPCs
-- ---------------------------------------------------------------------------------------------

-- Role authenticated may write these tables only while an RPC has set batzen.via_rpc for the
-- current transaction. Owner rights (SECURITY DEFINER functions, foreign-key cascades and
-- set-null actions, which run as the table owner) and the service role are not affected.
create function private.guard_client_writes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated'
     and coalesce(current_setting('batzen.via_rpc', true), '') <> 'on' then
    raise exception 'direct_write_not_allowed'
      using errcode = '42501',
            detail = format('public.%s is written through the RPCs only.', tg_table_name);
  end if;
  return null;
end;
$$;

create trigger guard_client_writes before insert or update or delete on public.transactions
  for each statement execute function private.guard_client_writes();
create trigger guard_client_writes before insert or update or delete on public.transaction_splits
  for each statement execute function private.guard_client_writes();
create trigger guard_client_writes before insert or update or delete on public.data_sources
  for each statement execute function private.guard_client_writes();

-- The four writing RPCs of Milestone 3 move to schema internal unchanged (same body, settings
-- and privileges); the public functions of the same name set the flag, call them, raise the
-- alerts and restore the flag.
alter function public.add_transactions(jsonb) set schema internal;
alter function internal.add_transactions(jsonb) rename to add_transactions_impl;
alter function public.update_transaction(uuid, jsonb) set schema internal;
alter function internal.update_transaction(uuid, jsonb) rename to update_transaction_impl;
alter function public.set_transaction_splits(uuid, jsonb) set schema internal;
alter function internal.set_transaction_splits(uuid, jsonb) rename to set_transaction_splits_impl;
alter function public.remove_import(uuid) set schema internal;
alter function internal.remove_import(uuid) rename to remove_import_impl;

create function public.add_transactions(p jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  previous text := current_setting('batzen.via_rpc', true);
  result jsonb;
  added uuid[];
begin
  perform pg_catalog.set_config('batzen.via_rpc', 'on', true);
  result := internal.add_transactions_impl(p);
  -- Transaction alerts for the rows stored as new (a dry run stores none: no ids).
  select coalesce(array_agg((r ->> 'transaction_id')::uuid), '{}') into added
    from jsonb_array_elements(result -> 'results') as r
   where r ->> 'outcome' = 'added' and r ->> 'transaction_id' is not null;
  perform internal.evaluate_alerts(auth.uid(), added);
  perform pg_catalog.set_config('batzen.via_rpc', coalesce(previous, ''), true);
  return result;
end;
$$;

create function public.update_transaction(p_id uuid, p jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  previous text := current_setting('batzen.via_rpc', true);
  result jsonb;
begin
  perform pg_catalog.set_config('batzen.via_rpc', 'on', true);
  result := internal.update_transaction_impl(p_id, p);
  perform internal.evaluate_alerts(auth.uid(), array[p_id]);
  perform pg_catalog.set_config('batzen.via_rpc', coalesce(previous, ''), true);
  return result;
end;
$$;

create function public.set_transaction_splits(p_id uuid, p_parts jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  previous text := current_setting('batzen.via_rpc', true);
  result jsonb;
begin
  perform pg_catalog.set_config('batzen.via_rpc', 'on', true);
  result := internal.set_transaction_splits_impl(p_id, p_parts);
  perform internal.evaluate_alerts(auth.uid(), array[p_id]);
  perform pg_catalog.set_config('batzen.via_rpc', coalesce(previous, ''), true);
  return result;
end;
$$;

create function public.remove_import(p_data_source_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  previous text := current_setting('batzen.via_rpc', true);
  result jsonb;
begin
  perform pg_catalog.set_config('batzen.via_rpc', 'on', true);
  result := internal.remove_import_impl(p_data_source_id);
  perform internal.evaluate_alerts(auth.uid(), null);
  perform pg_catalog.set_config('batzen.via_rpc', coalesce(previous, ''), true);
  return result;
end;
$$;

comment on function public.add_transactions(jsonb) is
  'The transaction pipeline (API.md; internal.add_transactions_impl), then the alerts it calls for. The only way a client stores transactions (M4-06).';
comment on function public.update_transaction(uuid, jsonb) is
  'Changes one transaction (API.md; internal.update_transaction_impl), then raises due alerts.';
comment on function public.set_transaction_splits(uuid, jsonb) is
  'Replaces a transaction''s split (API.md; internal.set_transaction_splits_impl), then raises due alerts.';
comment on function public.remove_import(uuid) is
  'Undoes a statement import (API.md, D-041; internal.remove_import_impl), then raises due alerts.';

-- ---------------------------------------------------------------------------------------------
-- Cash-feel moments
-- ---------------------------------------------------------------------------------------------

-- Money out of the last 7 days (local dates) that the person has not acknowledged, oldest first
-- (at most 50): not deleted, merged or a fixed-cost payment. Each with the period's balance and
-- the category's remaining budget right before and right after it (every counted part of the
-- period booked up to and including it, by (booked_at, id)). Splits have no single category.
create function public.pending_moments()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
set timezone to 'UTC'
as $$
declare
  me uuid := auth.uid();
  zone text;
  today date;
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select p.timezone into zone from public.profiles p where p.id = me;
  if not found then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  today := (now() at time zone zone)::date;

  return coalesce((
    with pending as (
      select t.id, t.amount_rappen, t.booked_at, t.created_at, t.merchant, t.source,
             t.category_id,
             exists (select 1 from public.transaction_splits s where s.transaction_id = t.id)
               as is_split,
             bp.id as period_id, bp.starts_on, bp.ends_on,
             bp.income_rappen - bp.fixed_costs_rappen - bp.savings_rappen
               + bp.carried_over_rappen as spendable
        from public.transactions t
        left join public.budget_periods bp
          on bp.user_id = me
         and (t.booked_at at time zone zone)::date >= bp.starts_on
         and (t.booked_at at time zone zone)::date < bp.ends_on
       where t.user_id = me
         and t.acknowledged_at is null
         and t.deleted_at is null
         and t.merged_into_id is null
         and t.fixed_cost_id is null
         and t.amount_rappen < 0
         and t.booked_at >= (today - 7)::timestamp at time zone 'UTC'
         and t.booked_at < (today + 2)::timestamp at time zone 'UTC'
         and (t.booked_at at time zone zone)::date between today - 6 and today
       order by t.booked_at, t.created_at, t.id
       limit 50
    ),
    periods as (
      select distinct p.period_id, p.starts_on, p.ends_on from pending p where p.period_id is not null
    ),
    allocations as (
      select pr.period_id, a.*
        from periods pr
        cross join lateral internal.counted_allocations(me, pr.starts_on, pr.ends_on, zone) as a
    ),
    moments as (
      select p.*,
             b.amount_rappen + b.rollover_rappen as budget,
             (select -coalesce(sum(a.amount_rappen), 0) from allocations a
               where a.period_id = p.period_id and a.transaction_id = p.id) as own,
             (select -coalesce(sum(a.amount_rappen), 0) from allocations a
               where a.period_id = p.period_id
                 and (a.booked_at, a.transaction_id) <= (p.booked_at, p.id)) as spent_through,
             (select -coalesce(sum(a.amount_rappen), 0) from allocations a
               where a.period_id = p.period_id and a.category_id = p.category_id
                 and (a.booked_at, a.transaction_id) <= (p.booked_at, p.id)) as category_through
        from pending p
        left join public.budgets b
          on b.period_id = p.period_id and b.category_id = p.category_id and not p.is_split
    )
    select jsonb_agg(jsonb_build_object(
             'transaction_id', m.id,
             'amount_rappen', m.amount_rappen,
             'booked_at', m.booked_at,
             'merchant', m.merchant,
             'source', m.source,
             'category_id', case when m.is_split then null else m.category_id end,
             'is_split', m.is_split,
             'period_id', m.period_id,
             'budget_rappen', m.budget,
             'balance_before_rappen', m.spendable - m.spent_through + m.own,
             'balance_after_rappen', m.spendable - m.spent_through,
             'remaining_before_rappen', m.budget - m.category_through + m.own,
             'remaining_after_rappen', m.budget - m.category_through,
             'over_budget', case when m.budget is not null then m.budget - m.category_through < 0
                                 else m.spendable - m.spent_through < 0 end
           ) order by m.booked_at, m.created_at, m.id)
      from moments m
  ), '[]'::jsonb);
end;
$$;

comment on function public.pending_moments() is
  'Unacknowledged money out of the last 7 days, oldest first, with balance and category budget before and after each (the cash-feel moment).';

-- "I paid this": acknowledges the caller's transactions (at most 500 ids; unknown, other users'
-- and already acknowledged ids are skipped). Returns how many were acknowledged.
create function public.acknowledge_transactions(p_ids uuid[])
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  previous text := current_setting('batzen.via_rpc', true);
  changed integer;
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_ids is null or cardinality(p_ids) > 500 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'Expected 0-500 ids.';
  end if;
  perform pg_catalog.set_config('batzen.via_rpc', 'on', true);
  update public.transactions t
     set acknowledged_at = now()
   where t.user_id = me
     and t.id = any (p_ids)
     and t.acknowledged_at is null
     and t.deleted_at is null
     and t.merged_into_id is null;
  get diagnostics changed = row_count;
  perform pg_catalog.set_config('batzen.via_rpc', coalesce(previous, ''), true);
  return changed;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Inbox
-- ---------------------------------------------------------------------------------------------

-- The caller's alerts that are not dismissed, newest first by (created_at, id). Input keys, all
-- optional: limit 1-100 (30), cursor = the previous page's next_cursor { created_at, id },
-- unread_only. Returns { items, next_cursor }.
create function public.list_alerts(p jsonb)
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
  page_size integer := 30;
  cursor_at timestamptz;
  cursor_id uuid;
  unread_only boolean := false;
  items jsonb;
  next_cursor jsonb;
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if jsonb_typeof(input) <> 'object' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'Expected an object.';
  end if;
  select k into unknown_key from jsonb_object_keys(input) as k
   where k not in ('limit', 'cursor', 'unread_only') limit 1;
  if unknown_key is not null then
    raise exception 'invalid_input' using errcode = '22023',
      detail = format('Unknown key %s.', unknown_key);
  end if;
  if nullif(input -> 'limit', 'null') is not null then
    page_size := internal.json_bigint(input -> 'limit', 1, 100)::integer;
    if page_size is null then
      raise exception 'invalid_input' using errcode = '22023', detail = 'limit must be 1-100.';
    end if;
  end if;
  if nullif(input -> 'unread_only', 'null') is not null then
    if jsonb_typeof(input -> 'unread_only') <> 'boolean' then
      raise exception 'invalid_input' using errcode = '22023',
        detail = 'unread_only must be true or false.';
    end if;
    unread_only := (input -> 'unread_only')::boolean;
  end if;
  if nullif(input -> 'cursor', 'null') is not null then
    begin
      cursor_at := (input -> 'cursor' ->> 'created_at')::timestamptz;
      cursor_id := (input -> 'cursor' ->> 'id')::uuid;
    exception when others then
      cursor_at := null;
    end;
    if cursor_at is null or cursor_id is null then
      raise exception 'invalid_input' using errcode = '22023',
        detail = 'cursor must be { created_at, id } from the previous page.';
    end if;
  end if;

  with page as (
    select a.*
      from public.alerts a
     where a.user_id = me
       and a.dismissed_at is null
       and (not unread_only or a.read_at is null)
       and (cursor_at is null or (a.created_at, a.id) < (cursor_at, cursor_id))
     order by a.created_at desc, a.id desc
     limit page_size + 1
  ),
  numbered as (
    select page.*, row_number() over (order by page.created_at desc, page.id desc) as n from page
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', n.id, 'type', n.type, 'title', n.title, 'body', n.body, 'params', n.params,
           'category_id', n.category_id, 'transaction_id', n.transaction_id,
           'period_id', n.period_id, 'read_at', n.read_at, 'created_at', n.created_at
         ) order by n.created_at desc, n.id desc) filter (where n.n <= page_size), '[]'::jsonb),
         (select jsonb_build_object('created_at', last.created_at, 'id', last.id)
            from numbered last
           where last.n = page_size
             and exists (select 1 from numbered more where more.n > page_size))
    into items, next_cursor
    from numbered n;

  return jsonb_build_object('items', items, 'next_cursor', next_cursor);
end;
$$;

-- Marks the caller's alerts as read (p_ids, at most 500; null = every unread alert). Returns how
-- many changed.
create function public.mark_alerts_read(p_ids uuid[])
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  changed integer;
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if cardinality(p_ids) > 500 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'At most 500 ids.';
  end if;
  update public.alerts a
     set read_at = now()
   where a.user_id = me
     and a.read_at is null
     and (p_ids is null or a.id = any (p_ids));
  get diagnostics changed = row_count;
  return changed;
end;
$$;

-- Hides one of the caller's alerts from the inbox (its dedupe key stays used). Returns whether
-- it was found.
create function public.dismiss_alert(p_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  update public.alerts a
     set dismissed_at = coalesce(a.dismissed_at, now())
   where a.user_id = me and a.id = p_id;
  return found;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Push
-- ---------------------------------------------------------------------------------------------

-- Registers this device's Expo push token for the signed-in user. Owner rights, because a token
-- registered by another account on the same device must move to the caller (it is invisible to
-- the caller under RLS); every statement is scoped to the token or auth.uid(). At most 10 devices
-- per user: the oldest registration goes. 22023 invalid_push_token / invalid_platform.
create function public.register_push_token(p_token text, p_platform text)
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
  if p_token is null or char_length(p_token) > 255
     or p_token !~ '^Expo(nent)?PushToken\[[^\]]+\]$' then
    raise exception 'invalid_push_token' using errcode = '22023',
      detail = 'Expected an Expo push token (ExponentPushToken[…]).';
  end if;
  if p_platform is null or p_platform not in ('ios', 'android') then
    raise exception 'invalid_platform' using errcode = '22023', detail = 'ios or android.';
  end if;
  insert into public.push_tokens (user_id, token, platform)
  values (me, p_token, p_platform)
  on conflict (token) do update
    set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
  delete from public.push_tokens t
   where t.user_id = me
     and t.id not in (select k.id from public.push_tokens k where k.user_id = me
                       order by k.updated_at desc, k.id desc limit 10);
end;
$$;

-- Removes this device's token from the signed-in user (on sign-out or when push is turned off).
-- Owner rights like register_push_token (clients have no write privilege on push_tokens);
-- scoped to auth.uid(). Returns whether a token was removed.
create function public.unregister_push_token(p_token text)
returns boolean
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
  delete from public.push_tokens t where t.user_id = me and t.token = p_token;
  return found;
end;
$$;

-- For the send-pushes Edge Function (service role only). Claims at most p_limit alerts to push
-- and marks them pushed_at = p_now (at most once: a failed delivery is not retried). An alert is
-- pushed when it is not silent, read, dismissed or older than 12 hours, its user has a device,
-- is outside quiet hours (start inclusive, end exclusive, across midnight when start > end; equal
-- times mean none) and has had fewer than max_per_day pushes on the local day; oldest first.
-- Concurrent claims skip each other's rows.
create function public.claim_pushes(p_limit integer default 100, p_now timestamptz default now())
returns table (
  alert_id uuid,
  user_id uuid,
  type text,
  title text,
  body text,
  data jsonb,
  sound boolean,
  tokens text[]
)
language plpgsql
security invoker
set search_path = ''
set timezone to 'UTC'
as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'p_limit must be 1-1000.';
  end if;
  return query
  with candidates as (
    select a.id, a.user_id, a.created_at
      from public.alerts a
      join public.profiles p on p.id = a.user_id
      join public.notification_settings s on s.user_id = a.user_id
     where a.pushed_at is null
       and not a.silent
       and a.read_at is null
       and a.dismissed_at is null
       and a.created_at > p_now - interval '12 hours'
       and exists (select 1 from public.push_tokens t where t.user_id = a.user_id)
       and not (
         s.quiet_hours_enabled and s.quiet_hours_start <> s.quiet_hours_end
         and case when s.quiet_hours_start < s.quiet_hours_end
                  then (p_now at time zone p.timezone)::time >= s.quiet_hours_start
                       and (p_now at time zone p.timezone)::time < s.quiet_hours_end
                  else (p_now at time zone p.timezone)::time >= s.quiet_hours_start
                       or (p_now at time zone p.timezone)::time < s.quiet_hours_end
             end)
       for update of a skip locked
  ),
  ranked as (
    select c.id, c.created_at,
           row_number() over (partition by c.user_id order by c.created_at, c.id) as n,
           s.max_per_day,
           (select count(*) from public.alerts x
             where x.user_id = c.user_id and x.pushed_at is not null
               and (x.pushed_at at time zone p.timezone)::date
                   = (p_now at time zone p.timezone)::date) as pushed_today
      from candidates c
      join public.profiles p on p.id = c.user_id
      join public.notification_settings s on s.user_id = c.user_id
  ),
  chosen as (
    select r.id from ranked r
     where r.pushed_today + r.n <= r.max_per_day
     order by r.created_at, r.id
     limit p_limit
  ),
  marked as (
    update public.alerts a set pushed_at = p_now
      from chosen where a.id = chosen.id
    returning a.*
  )
  select m.id, m.user_id, m.type, m.title, m.body,
         jsonb_strip_nulls(jsonb_build_object(
           'alert_id', m.id, 'type', m.type, 'transaction_id', m.transaction_id,
           'category_id', m.category_id, 'period_id', m.period_id)),
         p.sound_enabled,
         (select array_agg(t.token order by t.token) from public.push_tokens t
           where t.user_id = m.user_id)
    from marked m
    join public.profiles p on p.id = m.user_id
   order by m.created_at, m.id;
end;
$$;

-- For the send-pushes Edge Function (service role only): forgets tokens the push service
-- reported as no longer registered. Returns how many were removed.
create function public.forget_push_tokens(p_tokens text[])
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  removed integer;
begin
  delete from public.push_tokens t where t.token = any (coalesce(p_tokens, '{}'));
  get diagnostics removed = row_count;
  return removed;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Editors
-- ---------------------------------------------------------------------------------------------

-- Sets a category's budget in the open (current) period, creating the budget row if it has
-- none, and raises the alerts the change calls for. 55000 not_onboarded; 22023 invalid_amount
-- (0 to CHF 100 million), category_not_found (unknown, another user's or archived).
create function public.set_budget(p_category_id uuid, p_amount_rappen bigint)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  period_id uuid;
  saved public.budgets;
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_amount_rappen is null or p_amount_rappen < 0 or p_amount_rappen > 10000000000 then
    raise exception 'invalid_amount' using errcode = '22023',
      detail = 'The budget must be 0 to 10000000000 Rappen.';
  end if;
  period_id := public.ensure_current_period();
  if period_id is null then
    raise exception 'not_onboarded' using errcode = '55000';
  end if;
  -- Wait for a payday reset of this user that is running right now (as move_budget).
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('private.roll_periods:' || me::text, 0)
  );
  if not exists (select 1 from public.categories c
                  where c.id = p_category_id and c.user_id = me and c.archived_at is null) then
    raise exception 'category_not_found' using errcode = '22023';
  end if;

  insert into public.budgets (user_id, period_id, category_id, amount_rappen)
  values (me, period_id, p_category_id, p_amount_rappen)
  on conflict on constraint budgets_period_id_category_id_key
    do update set amount_rappen = excluded.amount_rappen
  returning * into saved;

  perform internal.evaluate_alerts(me, null);
  return jsonb_build_object(
    'budget_id', saved.id, 'period_id', saved.period_id, 'category_id', saved.category_id,
    'amount_rappen', saved.amount_rappen, 'rollover_rappen', saved.rollover_rappen);
end;
$$;

-- One category for the detail screen: the current period's budget, rollover, spent and
-- remaining, the 6 periods before it (newest first; 0 without a budget row), and the pace
-- forecast inputs. 55000 not_onboarded; 22023 category_not_found (unknown or another user's;
-- archived categories are shown).
create function public.get_category_detail(p_category_id uuid)
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
  zone text;
  today date;
  category public.categories;
  budget public.budgets;
  spent bigint;
  available bigint;
  elapsed integer;
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  current_period_id := public.ensure_current_period();
  select * into current_period from public.budget_periods where id = current_period_id;
  if not found then
    raise exception 'not_onboarded' using errcode = '55000';
  end if;
  select * into category from public.categories c where c.id = p_category_id and c.user_id = me;
  if not found then
    raise exception 'category_not_found' using errcode = '22023';
  end if;
  select p.timezone into zone from public.profiles p where p.id = me;
  today := (now() at time zone zone)::date;
  elapsed := today - current_period.starts_on + 1;

  select * into budget from public.budgets b
   where b.period_id = current_period.id and b.category_id = category.id;
  select coalesce(sum(s.spent_rappen), 0) into spent
    from internal.period_spending(me, current_period.starts_on, current_period.ends_on, zone) as s
   where s.category_id = category.id;
  available := coalesce(budget.amount_rappen, 0) + coalesce(budget.rollover_rappen, 0);

  return jsonb_build_object(
    'category', jsonb_build_object(
      'id', category.id, 'default_key', category.default_key, 'name', category.name,
      'icon', category.icon, 'archived', category.archived_at is not null),
    'period', jsonb_build_object(
      'id', current_period.id, 'starts_on', current_period.starts_on,
      'ends_on', current_period.ends_on),
    'budget_id', budget.id,
    'budget_amount_rappen', coalesce(budget.amount_rappen, 0),
    'rollover_rappen', coalesce(budget.rollover_rappen, 0),
    'spent_rappen', spent,
    'remaining_rappen', available - spent,
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
               'period_id', h.id, 'starts_on', h.starts_on, 'ends_on', h.ends_on,
               'budget_amount_rappen', coalesce(hb.amount_rappen, 0),
               'rollover_rappen', coalesce(hb.rollover_rappen, 0),
               'spent_rappen', coalesce((
                 select s.spent_rappen
                   from internal.period_spending(me, h.starts_on, h.ends_on, zone) as s
                  where s.category_id = category.id), 0)
             ) order by h.starts_on desc)
        from (select bp.* from public.budget_periods bp
               where bp.user_id = me and bp.starts_on < current_period.starts_on
               order by bp.starts_on desc limit 6) as h
        left join public.budgets hb on hb.period_id = h.id and hb.category_id = category.id
    ), '[]'::jsonb),
    'pace', jsonb_build_object(
      'today', today,
      'days_elapsed', elapsed,
      'days_left', current_period.ends_on - today,
      'available_rappen', available,
      'spent_rappen', spent,
      'daily_average_rappen', case when spent > 0 then spent / elapsed else 0 end,
      'runs_out_on', internal.pace_runs_out(available, spent, current_period.starts_on, today))
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Home screen: unread_alert_count; spending from internal.period_spending
-- ---------------------------------------------------------------------------------------------

-- As in 20261007100000_transaction_pipeline.sql, plus unread_alert_count (alerts neither read
-- nor dismissed); spending now comes from internal.period_spending (same rules, one place).
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
    select s.category_id, s.spent_rappen
      from internal.period_spending(me, current_period.starts_on, current_period.ends_on,
                                    user_zone) as s
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
    'unread_alert_count', (
      select count(*)::integer from public.alerts a
       where a.user_id = me and a.read_at is null and a.dismissed_at is null
    ),
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
  'The home screen: current period (rolled on payday), categories with budget and spending, uncategorized spending, how many transactions of the period need a category, unread alerts, the 5 latest transactions. Null before onboarding.';

-- ---------------------------------------------------------------------------------------------
-- Data export: push_tokens too
-- ---------------------------------------------------------------------------------------------

create or replace function public.export_my_data()
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
    'push_tokens', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at, r.id)
                               from public.push_tokens r where r.user_id = me), '[]'::jsonb),
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

-- ---------------------------------------------------------------------------------------------
-- Schedule
-- ---------------------------------------------------------------------------------------------

select cron.unschedule(jobid) from cron.job where jobname = 'run-scheduled-alerts';
select cron.schedule('run-scheduled-alerts', '15 * * * *', 'select public.run_scheduled_alerts()');

-- ---------------------------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------------------------

-- Devices are registered through the RPCs only; the owner may read them.
grant select on public.push_tokens to authenticated;

revoke all on function internal.counted_allocations(uuid, date, date, text) from public, anon, authenticated;
revoke all on function internal.period_spending(uuid, date, date, text) from public, anon, authenticated;
revoke all on function private.period_totals(uuid, date, date, text) from public, anon, authenticated;
revoke all on function internal.pace_runs_out(bigint, bigint, date, date) from public, anon, authenticated;
revoke all on function private.format_chf(bigint, text) from public, anon, authenticated;
revoke all on function private.format_day(date, text) from public, anon, authenticated;
revoke all on function private.category_label(text, text, text) from public, anon, authenticated;
revoke all on function private.alert_text(text, text, jsonb, text) from public, anon, authenticated;
revoke all on function private.raise_alert(uuid, text, text, text, jsonb, text, uuid, uuid, uuid, boolean)
  from public, anon, authenticated;
revoke all on function private.crossed_levels(bigint, bigint) from public, anon, authenticated;
revoke all on function private.evaluate_alerts(uuid, uuid[], timestamptz) from public, anon, authenticated;
revoke all on function private.reminder_alerts(uuid, timestamptz) from public, anon, authenticated;
revoke all on function private.guard_client_writes() from public, anon, authenticated;
revoke all on function internal.evaluate_alerts(uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.run_scheduled_alerts(timestamptz) from public, anon, authenticated;
revoke all on function public.add_transactions(jsonb) from public, anon, authenticated;
revoke all on function public.update_transaction(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.set_transaction_splits(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.remove_import(uuid) from public, anon, authenticated;
revoke all on function public.pending_moments() from public, anon, authenticated;
revoke all on function public.acknowledge_transactions(uuid[]) from public, anon, authenticated;
revoke all on function public.list_alerts(jsonb) from public, anon, authenticated;
revoke all on function public.mark_alerts_read(uuid[]) from public, anon, authenticated;
revoke all on function public.dismiss_alert(uuid) from public, anon, authenticated;
revoke all on function public.register_push_token(text, text) from public, anon, authenticated;
revoke all on function public.unregister_push_token(text) from public, anon, authenticated;
revoke all on function public.claim_pushes(integer, timestamptz) from public, anon, authenticated;
revoke all on function public.forget_push_tokens(text[]) from public, anon, authenticated;
revoke all on function public.set_budget(uuid, bigint) from public, anon, authenticated;
revoke all on function public.get_category_detail(uuid) from public, anon, authenticated;
revoke all on function public.get_overview() from public, anon, authenticated;
revoke all on function public.export_my_data() from public, anon, authenticated;

-- The *_impl functions kept their grants from schema public: authenticated keeps EXECUTE (the
-- public wrappers call them with the caller's rights); the default grant to service_role there
-- does not belong in schema internal.
revoke all on function internal.add_transactions_impl(jsonb) from service_role;
revoke all on function internal.update_transaction_impl(uuid, jsonb) from service_role;
revoke all on function internal.set_transaction_splits_impl(uuid, jsonb) from service_role;
revoke all on function internal.remove_import_impl(uuid) from service_role;

-- Helpers the client RPCs call with the caller's rights.
grant execute on function internal.counted_allocations(uuid, date, date, text) to authenticated;
grant execute on function internal.period_spending(uuid, date, date, text) to authenticated;
grant execute on function internal.pace_runs_out(bigint, bigint, date, date) to authenticated;
grant execute on function internal.evaluate_alerts(uuid, uuid[]) to authenticated;

grant execute on function public.add_transactions(jsonb) to authenticated;
grant execute on function public.update_transaction(uuid, jsonb) to authenticated;
grant execute on function public.set_transaction_splits(uuid, jsonb) to authenticated;
grant execute on function public.remove_import(uuid) to authenticated;
grant execute on function public.pending_moments() to authenticated;
grant execute on function public.acknowledge_transactions(uuid[]) to authenticated;
grant execute on function public.list_alerts(jsonb) to authenticated;
grant execute on function public.mark_alerts_read(uuid[]) to authenticated;
grant execute on function public.dismiss_alert(uuid) to authenticated;
grant execute on function public.register_push_token(text, text) to authenticated;
grant execute on function public.unregister_push_token(text) to authenticated;
grant execute on function public.set_budget(uuid, bigint) to authenticated;
grant execute on function public.get_category_detail(uuid) to authenticated;
grant execute on function public.get_overview() to authenticated;
grant execute on function public.export_my_data() to authenticated;

-- The push sender (Edge Function send-pushes, service role).
grant execute on function public.claim_pushes(integer, timestamptz) to service_role;
grant execute on function public.forget_push_tokens(text[]) to service_role;

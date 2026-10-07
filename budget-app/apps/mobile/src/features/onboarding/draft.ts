import {
  DEFAULT_CATEGORY_KEYS,
  FIXED_COST_KINDS,
  LEFTOVER_POLICIES,
  PAIN_LEVELS,
  PAYMENT_METHODS,
  checkAllocation,
  parseChf,
  spendableOf,
  suggestBudgets,
  sumFixedCosts,
  type AllocationCheck,
  type DefaultCategoryKey,
  type FixedCostKind,
  type Language,
  type LeftoverPolicy,
  type PainLevel,
  type PaymentMethod,
  type Rappen,
} from '@budget/core';

/**
 * The onboarding questionnaire (spec section 3) as plain data: what the person has answered so
 * far, how each step is validated, and the payload `complete_onboarding` receives. Screens only
 * render this; all rules live here so they can be tested without UI.
 *
 * Money fields keep the text the person typed and are parsed with parseChf (integer Rappen) when
 * validated, so "1’250.50" or "1250,50" both work and nothing is ever rounded through a float.
 */

export const ONBOARDING_STEPS = [
  'income',
  'fixed-costs',
  'savings',
  'categories',
  'budgets',
  'payment',
  'pain',
  'notifications',
  'sources',
  'summary',
] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

/** Steps the person may skip (spec: "skip where optional"). */
export const SKIPPABLE_STEPS: readonly OnboardingStep[] = [
  'savings',
  'payment',
  'notifications',
  'sources',
];

/** The steps of drafts saved with `version: 1`, before the sources step existed (D-037). */
const V1_STEPS: readonly OnboardingStep[] = ONBOARDING_STEPS.filter((step) => step !== 'sources');

export const NOTIFICATION_TYPES = [
  'transaction_moments',
  'category_thresholds',
  'total_low',
  'pace',
  'unusual_purchase',
  'daily_allowance',
  'payday',
  'weekly_review',
  'categorize_requests',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type NotificationChoices = Record<NotificationType, boolean> & {
  quietHoursEnabled: boolean;
  /** Minutes after midnight, in 30-minute steps. */
  quietStartMinutes: number;
  quietEndMinutes: number;
  maxPerDay: number;
};

/** A category picked during onboarding: a default one by key, or a custom one by name. */
export type CategoryChoice =
  { kind: 'default'; key: DefaultCategoryKey } | { kind: 'custom'; name: string };

export type OnboardingDraft = {
  /** 2 since the sources step (D-037); version-1 drafts are still restored. */
  version: 2;
  netIncome: string;
  payday: number | null;
  irregularIncome: boolean;
  hoursPerWeek: string;
  fixedCosts: Record<FixedCostKind, string>;
  otherFixedCostLabel: string;
  savingsMonthly: string;
  goalName: string;
  goalAmount: string;
  /** Last day of the target month, or null for no date. */
  goalDate: string | null;
  leftoverPolicy: LeftoverPolicy;
  categories: CategoryChoice[];
  /** Budget per category id (see categoryId); filled when the budgets step is first shown. */
  budgets: Record<string, Rappen>;
  /** True once the person moved a slider: suggestions no longer overwrite their choices. */
  budgetsAdjusted: boolean;
  paymentMethods: PaymentMethod[];
  painLevel: PainLevel;
  notifications: NotificationChoices;
  /**
   * Step 9: open the statement import right after setup. Null until the person decides; the
   * suggestion then follows how they pay (see `wantsImportAfterSetup`).
   */
  importAfterSetup: boolean | null;
  /** Index of the furthest step reached, to resume where the person left off. */
  reached: number;
};

/** Categories most people need, picked in advance (Tom Hanks: fewer decisions on the first run). */
export const PRESELECTED_CATEGORIES: readonly DefaultCategoryKey[] = [
  'groceries',
  'eating_out',
  'going_out',
  'transport',
  'clothes',
  'other',
];

export const DEFAULT_NOTIFICATIONS: NotificationChoices = {
  transaction_moments: true,
  category_thresholds: true,
  total_low: true,
  pace: true,
  unusual_purchase: true,
  daily_allowance: true,
  payday: true,
  weekly_review: true,
  categorize_requests: true,
  quietHoursEnabled: true,
  quietStartMinutes: 22 * 60,
  quietEndMinutes: 7 * 60,
  maxPerDay: 6,
};

export const QUIET_HOURS_STEP_MINUTES = 30;
export const MAX_ALERTS_PER_DAY = { min: 1, max: 20 } as const;

export function createDraft(): OnboardingDraft {
  return {
    version: 2,
    netIncome: '',
    payday: null,
    irregularIncome: false,
    hoursPerWeek: '',
    fixedCosts: Object.fromEntries(FIXED_COST_KINDS.map((kind) => [kind, ''])) as Record<
      FixedCostKind,
      string
    >,
    otherFixedCostLabel: '',
    savingsMonthly: '',
    goalName: '',
    goalAmount: '',
    goalDate: null,
    leftoverPolicy: 'rollover',
    categories: PRESELECTED_CATEGORIES.map((key) => ({ kind: 'default', key })),
    budgets: {},
    budgetsAdjusted: false,
    paymentMethods: [],
    painLevel: 'normal',
    notifications: { ...DEFAULT_NOTIFICATIONS },
    importAfterSetup: null,
    reached: 0,
  };
}

/** Stable id of a picked category inside the draft ("default:groceries", "custom:dog"). */
export function categoryId(choice: CategoryChoice): string {
  return choice.kind === 'default'
    ? `default:${choice.key}`
    : `custom:${choice.name.trim().toLowerCase()}`;
}

// ---------------------------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------------------------

export type AmountResult = { ok: true; value: Rappen } | { ok: false };

/** An optional, non-negative amount: empty means zero. */
export function optionalAmount(text: string): AmountResult {
  if (text.trim() === '') return { ok: true, value: 0 };
  const value = parseChf(text);
  return value === null || value < 0 ? { ok: false } : { ok: true, value };
}

/** Hours per week ("42", "42.5", "42,25") as whole minutes; null for empty or invalid input. */
export function parseWeeklyMinutes(text: string): number | null {
  const match = /^(\d{1,3})(?:[.,](\d{1,2}))?$/.exec(text.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const fraction = match[2] ?? '';
  const scale = 10 ** fraction.length;
  const fractionMinutes =
    fraction === '' ? 0 : Math.floor((Number(fraction) * 60 * 2 + scale) / (2 * scale));
  const minutes = hours * 60 + fractionMinutes;
  return minutes >= 60 && minutes <= 112 * 60 ? minutes : null;
}

// ---------------------------------------------------------------------------------------------
// Validation per step
// ---------------------------------------------------------------------------------------------

/** Error codes; screens map them to `onboarding.*` texts. */
export type ErrorCode =
  | 'income_required'
  | 'amount_invalid'
  | 'payday_required'
  | 'hours_invalid'
  | 'goal_incomplete'
  | 'categories_required'
  | 'category_duplicate'
  | 'category_too_long';

export type Validation<Field extends string> = {
  ok: boolean;
  errors: Partial<Record<Field, ErrorCode>>;
};

export function validateIncome(
  draft: OnboardingDraft,
): Validation<'netIncome' | 'payday' | 'hoursPerWeek'> {
  const errors: Validation<'netIncome' | 'payday' | 'hoursPerWeek'>['errors'] = {};
  if (draft.netIncome.trim() === '') {
    errors.netIncome = 'income_required';
  } else {
    const income = parseChf(draft.netIncome);
    if (income === null || income <= 0) errors.netIncome = 'amount_invalid';
  }
  if (draft.payday === null) errors.payday = 'payday_required';
  if (draft.hoursPerWeek.trim() !== '' && parseWeeklyMinutes(draft.hoursPerWeek) === null) {
    errors.hoursPerWeek = 'hours_invalid';
  }
  return { ok: Object.keys(errors).length === 0, errors };
}

export function validateFixedCosts(draft: OnboardingDraft): Validation<FixedCostKind> {
  const errors: Validation<FixedCostKind>['errors'] = {};
  for (const kind of FIXED_COST_KINDS) {
    if (!optionalAmount(draft.fixedCosts[kind]).ok) errors[kind] = 'amount_invalid';
  }
  return { ok: Object.keys(errors).length === 0, errors };
}

export function validateSavings(
  draft: OnboardingDraft,
): Validation<'savingsMonthly' | 'goalAmount' | 'goal'> {
  const errors: Validation<'savingsMonthly' | 'goalAmount' | 'goal'>['errors'] = {};
  if (!optionalAmount(draft.savingsMonthly).ok) errors.savingsMonthly = 'amount_invalid';
  const hasName = draft.goalName.trim() !== '';
  const hasAmount = draft.goalAmount.trim() !== '';
  if (hasAmount) {
    const amount = parseChf(draft.goalAmount);
    if (amount === null || amount <= 0) errors.goalAmount = 'amount_invalid';
  }
  if (hasName !== hasAmount || (!hasName && draft.goalDate !== null))
    errors.goal = 'goal_incomplete';
  return { ok: Object.keys(errors).length === 0, errors };
}

export const CUSTOM_CATEGORY_MAX_LENGTH = 40;

/**
 * Checks a new custom category name against the picked categories. `takenNames` are the names
 * on screen (translated default names and custom names), compared case-insensitively.
 */
export function validateCustomCategory(
  name: string,
  takenNames: readonly string[],
): ErrorCode | null {
  const trimmed = name.trim();
  if (trimmed.length > CUSTOM_CATEGORY_MAX_LENGTH) return 'category_too_long';
  const lower = trimmed.toLowerCase();
  return takenNames.some((taken) => taken.trim().toLowerCase() === lower)
    ? 'category_duplicate'
    : null;
}

export function validateCategories(draft: OnboardingDraft): Validation<'categories'> {
  return draft.categories.length > 0
    ? { ok: true, errors: {} }
    : { ok: false, errors: { categories: 'categories_required' } };
}

// ---------------------------------------------------------------------------------------------
// Sources (step 9)
// ---------------------------------------------------------------------------------------------

/**
 * Whether step 9 suggests importing a statement right after setup: yes when the person pays by
 * card, TWINT, Apple Pay or Google Pay (those payments are on the statement), no when they pay
 * only cash. Without an answer the import is suggested too, as most purchases in Switzerland are
 * cashless.
 */
export function suggestsImport(paymentMethods: readonly PaymentMethod[]): boolean {
  return paymentMethods.length === 0 || paymentMethods.some((method) => method !== 'cash');
}

/** The person's choice on step 9, or the suggestion while they have not made one. */
export function wantsImportAfterSetup(draft: OnboardingDraft): boolean {
  return draft.importAfterSetup ?? suggestsImport(draft.paymentMethods);
}

// ---------------------------------------------------------------------------------------------
// The month plan
// ---------------------------------------------------------------------------------------------

export type MonthPlan = {
  incomeRappen: Rappen;
  fixedCostsRappen: Rappen;
  savingsRappen: Rappen;
  spendableRappen: Rappen;
};

/** Income, fixed costs, saving and what is left to spend, from the answers so far. */
export function monthPlan(draft: OnboardingDraft): MonthPlan {
  const income = parseChf(draft.netIncome);
  const incomeRappen = income !== null && income > 0 ? income : 0;
  const fixedCostsRappen = sumFixedCosts(
    FIXED_COST_KINDS.map((kind) => {
      const amount = optionalAmount(draft.fixedCosts[kind]);
      return { amountRappen: amount.ok ? amount.value : 0 };
    }),
  );
  const savings = optionalAmount(draft.savingsMonthly);
  const savingsRappen = savings.ok ? savings.value : 0;
  return {
    incomeRappen,
    fixedCostsRappen,
    savingsRappen,
    spendableRappen: spendableOf({ incomeRappen, fixedCostsRappen, savingsRappen }),
  };
}

/** The suggested split of what is left (rules-based now; the assistant refines it in M5). */
export function suggestedBudgets(draft: OnboardingDraft): Record<string, Rappen> {
  const suggestion = suggestBudgets({
    spendableRappen: monthPlan(draft).spendableRappen,
    categories: draft.categories.map((choice) => ({
      id: categoryId(choice),
      defaultKey: choice.kind === 'default' ? choice.key : null,
    })),
  });
  return Object.fromEntries(suggestion.map(({ id, amountRappen }) => [id, amountRappen]));
}

/**
 * The budgets to show on the budgets step: the suggestion, unless the person already adjusted
 * the sliders for exactly these categories. Newly added categories start at 0 then.
 */
export function budgetsForStep(draft: OnboardingDraft): Record<string, Rappen> {
  const ids = draft.categories.map(categoryId);
  if (!draft.budgetsAdjusted) return suggestedBudgets(draft);
  return Object.fromEntries(ids.map((id) => [id, draft.budgets[id] ?? 0]));
}

export function allocation(draft: OnboardingDraft): AllocationCheck {
  const budgets = budgetsForStep(draft);
  return checkAllocation(
    monthPlan(draft).spendableRappen,
    draft.categories.map((choice) => budgets[categoryId(choice)] ?? 0),
  );
}

// ---------------------------------------------------------------------------------------------
// Payload for public.complete_onboarding
// ---------------------------------------------------------------------------------------------

export type OnboardingPayload = {
  profile: {
    net_income_rappen: Rappen;
    payday: number;
    irregular_income: boolean;
    weekly_work_minutes: number | null;
    savings_monthly_rappen: Rappen;
    savings_goal_name: string | null;
    savings_goal_rappen: Rappen | null;
    savings_goal_date: string | null;
    leftover_policy: LeftoverPolicy;
    payment_methods: PaymentMethod[];
    pain_level: PainLevel;
    sound_enabled: boolean;
    language: Language;
    timezone: string;
  };
  fixed_costs: { kind: FixedCostKind; label: string | null; amount_rappen: Rappen }[];
  categories: {
    default_key: DefaultCategoryKey | null;
    name: string | null;
    budget_rappen: Rappen;
  }[];
  notification_settings: Record<NotificationType, boolean> & {
    quiet_hours_enabled: boolean;
    quiet_hours_start: string;
    quiet_hours_end: string;
    max_per_day: number;
  };
};

export function formatClockTime(minutes: number): string {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

export class IncompleteDraftError extends Error {
  constructor(public readonly step: OnboardingStep) {
    super(`onboarding step "${step}" is not complete`);
  }
}

/** Builds the payload; throws IncompleteDraftError naming the first step that is not valid. */
export function toOnboardingPayload(
  draft: OnboardingDraft,
  context: { language: Language; timezone: string },
): OnboardingPayload {
  if (!validateIncome(draft).ok) throw new IncompleteDraftError('income');
  if (!validateFixedCosts(draft).ok) throw new IncompleteDraftError('fixed-costs');
  if (!validateSavings(draft).ok) throw new IncompleteDraftError('savings');
  if (!validateCategories(draft).ok) throw new IncompleteDraftError('categories');

  const plan = monthPlan(draft);
  const budgets = budgetsForStep(draft);
  const hasGoal = draft.goalName.trim() !== '';

  return {
    profile: {
      net_income_rappen: plan.incomeRappen,
      payday: draft.payday as number,
      irregular_income: draft.irregularIncome,
      weekly_work_minutes: parseWeeklyMinutes(draft.hoursPerWeek),
      savings_monthly_rappen: plan.savingsRappen,
      savings_goal_name: hasGoal ? draft.goalName.trim() : null,
      savings_goal_rappen: hasGoal ? parseChf(draft.goalAmount) : null,
      savings_goal_date: hasGoal ? draft.goalDate : null,
      leftover_policy: draft.leftoverPolicy,
      payment_methods: PAYMENT_METHODS.filter((method) => draft.paymentMethods.includes(method)),
      pain_level: draft.painLevel,
      sound_enabled: true,
      language: context.language,
      timezone: context.timezone,
    },
    fixed_costs: FIXED_COST_KINDS.flatMap((kind) => {
      const amount = optionalAmount(draft.fixedCosts[kind]);
      if (!amount.ok || amount.value === 0) return [];
      const label = kind === 'other' ? draft.otherFixedCostLabel.trim() || null : null;
      return [{ kind, label, amount_rappen: amount.value }];
    }),
    categories: draft.categories.map((choice) => ({
      default_key: choice.kind === 'default' ? choice.key : null,
      name: choice.kind === 'custom' ? choice.name.trim() : null,
      budget_rappen: budgets[categoryId(choice)] ?? 0,
    })),
    notification_settings: {
      ...Object.fromEntries(NOTIFICATION_TYPES.map((type) => [type, draft.notifications[type]])),
      quiet_hours_enabled: draft.notifications.quietHoursEnabled,
      quiet_hours_start: formatClockTime(draft.notifications.quietStartMinutes),
      quiet_hours_end: formatClockTime(draft.notifications.quietEndMinutes),
      max_per_day: draft.notifications.maxPerDay,
    } as OnboardingPayload['notification_settings'],
  };
}

// ---------------------------------------------------------------------------------------------
// Restoring a saved draft
// ---------------------------------------------------------------------------------------------

const isOneOf = <T extends string>(values: readonly T[], value: unknown): value is T =>
  typeof value === 'string' && (values as readonly string[]).includes(value);

/**
 * The furthest step a saved draft reached, as an index of today's steps. Version-1 drafts count
 * the steps without the sources step; one that had reached the summary resumes at the sources
 * step, so nobody misses it.
 */
function restoredReached(reached: unknown, version: 1 | 2): number {
  const steps = version === 1 ? V1_STEPS : ONBOARDING_STEPS;
  if (typeof reached !== 'number' || !Number.isInteger(reached)) return 0;
  const step = steps[Math.min(Math.max(reached, 0), steps.length - 1)] as OnboardingStep;
  return ONBOARDING_STEPS.indexOf(version === 1 && step === 'summary' ? 'sources' : step);
}

/**
 * Reads a draft saved by this or an older app version. Anything unexpected falls back to the
 * fresh-draft value for that field, so a corrupt save never blocks onboarding.
 */
export function restoreDraft(saved: unknown): OnboardingDraft {
  const fresh = createDraft();
  const version = (saved as { version?: unknown } | null)?.version;
  if (typeof saved !== 'object' || saved === null || (version !== 1 && version !== 2)) {
    return fresh;
  }
  const s = saved as Partial<Record<keyof OnboardingDraft, unknown>>;
  const text = (value: unknown, fallback: string) => (typeof value === 'string' ? value : fallback);
  const bool = (value: unknown, fallback: boolean) =>
    typeof value === 'boolean' ? value : fallback;

  const fixedCosts = { ...fresh.fixedCosts };
  if (typeof s.fixedCosts === 'object' && s.fixedCosts !== null) {
    for (const kind of FIXED_COST_KINDS) {
      fixedCosts[kind] = text((s.fixedCosts as Record<string, unknown>)[kind], '');
    }
  }

  const categories: CategoryChoice[] = Array.isArray(s.categories)
    ? s.categories.flatMap((entry): CategoryChoice[] => {
        if (typeof entry !== 'object' || entry === null) return [];
        const e = entry as { kind?: unknown; key?: unknown; name?: unknown };
        if (e.kind === 'default' && isOneOf(DEFAULT_CATEGORY_KEYS, e.key)) {
          return [{ kind: 'default', key: e.key }];
        }
        if (e.kind === 'custom' && typeof e.name === 'string' && e.name.trim() !== '') {
          return [{ kind: 'custom', name: e.name }];
        }
        return [];
      })
    : fresh.categories;

  const budgets: Record<string, Rappen> = {};
  if (typeof s.budgets === 'object' && s.budgets !== null) {
    for (const [id, value] of Object.entries(s.budgets as Record<string, unknown>)) {
      if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)
        budgets[id] = value;
    }
  }

  const notifications = { ...fresh.notifications };
  if (typeof s.notifications === 'object' && s.notifications !== null) {
    const n = s.notifications as Record<string, unknown>;
    for (const type of NOTIFICATION_TYPES) notifications[type] = bool(n[type], notifications[type]);
    notifications.quietHoursEnabled = bool(n.quietHoursEnabled, notifications.quietHoursEnabled);
    for (const key of ['quietStartMinutes', 'quietEndMinutes'] as const) {
      const value = n[key];
      if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < 1440) {
        notifications[key] = value;
      }
    }
    const max = n.maxPerDay;
    if (
      typeof max === 'number' &&
      Number.isInteger(max) &&
      max >= MAX_ALERTS_PER_DAY.min &&
      max <= MAX_ALERTS_PER_DAY.max
    ) {
      notifications.maxPerDay = max;
    }
  }

  const payday =
    typeof s.payday === 'number' && Number.isInteger(s.payday) && s.payday >= 1 && s.payday <= 31
      ? s.payday
      : null;
  return {
    version: 2,
    netIncome: text(s.netIncome, ''),
    payday,
    irregularIncome: bool(s.irregularIncome, false),
    hoursPerWeek: text(s.hoursPerWeek, ''),
    fixedCosts,
    otherFixedCostLabel: text(s.otherFixedCostLabel, ''),
    savingsMonthly: text(s.savingsMonthly, ''),
    goalName: text(s.goalName, ''),
    goalAmount: text(s.goalAmount, ''),
    goalDate:
      typeof s.goalDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.goalDate) ? s.goalDate : null,
    leftoverPolicy: isOneOf(LEFTOVER_POLICIES, s.leftoverPolicy) ? s.leftoverPolicy : 'rollover',
    categories,
    budgets,
    budgetsAdjusted: bool(s.budgetsAdjusted, false),
    paymentMethods: Array.isArray(s.paymentMethods)
      ? PAYMENT_METHODS.filter((method) => (s.paymentMethods as unknown[]).includes(method))
      : [],
    painLevel: isOneOf(PAIN_LEVELS, s.painLevel) ? s.painLevel : 'normal',
    notifications,
    importAfterSetup: typeof s.importAfterSetup === 'boolean' ? s.importAfterSetup : null,
    reached: restoredReached(s.reached, version),
  };
}

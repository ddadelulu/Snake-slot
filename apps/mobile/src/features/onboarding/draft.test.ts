import {
  IncompleteDraftError,
  ONBOARDING_STEPS,
  allocation,
  budgetsForStep,
  categoryId,
  createDraft,
  formatClockTime,
  monthPlan,
  optionalAmount,
  parseWeeklyMinutes,
  restoreDraft,
  suggestedBudgets,
  toOnboardingPayload,
  validateCategories,
  validateCustomCategory,
  validateFixedCosts,
  validateIncome,
  validateSavings,
  type OnboardingDraft,
} from './draft';

/** A typical Zurich month: CHF 6'200 net, rent 1'850, health insurance 420, saving 500. */
function anna(): OnboardingDraft {
  const draft = createDraft();
  return {
    ...draft,
    netIncome: "6'200",
    payday: 25,
    hoursPerWeek: '42',
    fixedCosts: {
      ...draft.fixedCosts,
      rent: '1850',
      health_insurance: '420.50',
      phone_internet: '65',
    },
    savingsMonthly: '500',
  };
}

describe('createDraft', () => {
  it('starts with sensible defaults and common categories picked', () => {
    const draft = createDraft();
    expect(draft.payday).toBeNull();
    expect(draft.leftoverPolicy).toBe('rollover');
    expect(draft.painLevel).toBe('normal');
    expect(draft.categories.map(categoryId)).toEqual([
      'default:groceries',
      'default:eating_out',
      'default:going_out',
      'default:transport',
      'default:clothes',
      'default:other',
    ]);
    expect(draft.notifications).toMatchObject({
      quietHoursEnabled: true,
      quietStartMinutes: 1320,
      quietEndMinutes: 420,
      maxPerDay: 6,
    });
    expect(ONBOARDING_STEPS).toHaveLength(9);
  });
});

describe('parsing helpers', () => {
  it('reads optional amounts, empty meaning zero', () => {
    expect(optionalAmount('')).toEqual({ ok: true, value: 0 });
    expect(optionalAmount('  ')).toEqual({ ok: true, value: 0 });
    expect(optionalAmount("1'850.50")).toEqual({ ok: true, value: 185050 });
    expect(optionalAmount('abc')).toEqual({ ok: false });
    expect(optionalAmount('-5')).toEqual({ ok: false });
  });

  it('reads hours per week as minutes', () => {
    expect(parseWeeklyMinutes('42')).toBe(2520);
    expect(parseWeeklyMinutes('42.5')).toBe(2550);
    expect(parseWeeklyMinutes('42,5')).toBe(2550);
    expect(parseWeeklyMinutes('8.25')).toBe(495);
    expect(parseWeeklyMinutes('1')).toBe(60);
    expect(parseWeeklyMinutes('112')).toBe(6720);
    expect(parseWeeklyMinutes('0.5')).toBeNull();
    expect(parseWeeklyMinutes('113')).toBeNull();
    expect(parseWeeklyMinutes('forty')).toBeNull();
    expect(parseWeeklyMinutes('')).toBeNull();
  });

  it('formats clock times', () => {
    expect(formatClockTime(0)).toBe('00:00');
    expect(formatClockTime(1320)).toBe('22:00');
    expect(formatClockTime(450)).toBe('07:30');
    expect(formatClockTime(-30)).toBe('23:30');
    expect(formatClockTime(1440)).toBe('00:00');
  });
});

describe('step validation', () => {
  it('income needs a positive income and a payday; hours are optional', () => {
    expect(validateIncome(createDraft()).errors).toEqual({
      netIncome: 'income_required',
      payday: 'payday_required',
    });
    expect(validateIncome({ ...createDraft(), netIncome: '0', payday: 1 }).errors).toEqual({
      netIncome: 'amount_invalid',
    });
    expect(validateIncome({ ...anna(), hoursPerWeek: 'lots' }).errors).toEqual({
      hoursPerWeek: 'hours_invalid',
    });
    expect(validateIncome({ ...anna(), hoursPerWeek: '' }).ok).toBe(true);
    expect(validateIncome(anna()).ok).toBe(true);
  });

  it('fixed costs may be empty but must be amounts', () => {
    expect(validateFixedCosts(createDraft()).ok).toBe(true);
    const draft = anna();
    expect(
      validateFixedCosts({ ...draft, fixedCosts: { ...draft.fixedCosts, rent: 'a lot' } }).errors,
    ).toEqual({
      rent: 'amount_invalid',
    });
  });

  it('a savings goal needs a name and an amount together', () => {
    expect(validateSavings(createDraft()).ok).toBe(true);
    expect(
      validateSavings({
        ...createDraft(),
        goalName: 'Japan',
        goalAmount: '3000',
        goalDate: '2027-06-30',
      }).ok,
    ).toBe(true);
    expect(validateSavings({ ...createDraft(), goalName: 'Japan' }).errors).toEqual({
      goal: 'goal_incomplete',
    });
    expect(validateSavings({ ...createDraft(), goalAmount: '3000' }).errors).toEqual({
      goal: 'goal_incomplete',
    });
    expect(validateSavings({ ...createDraft(), goalDate: '2027-06-30' }).errors).toEqual({
      goal: 'goal_incomplete',
    });
    expect(
      validateSavings({ ...createDraft(), goalName: 'Japan', goalAmount: '0' }).errors,
    ).toEqual({
      goalAmount: 'amount_invalid',
    });
    expect(validateSavings({ ...createDraft(), savingsMonthly: 'x' }).errors).toEqual({
      savingsMonthly: 'amount_invalid',
    });
  });

  it('at least one category is needed', () => {
    expect(validateCategories(createDraft()).ok).toBe(true);
    expect(validateCategories({ ...createDraft(), categories: [] }).errors).toEqual({
      categories: 'categories_required',
    });
  });

  it('custom category names are unique (case-insensitive) and short', () => {
    expect(validateCustomCategory('Dog', ['Groceries'])).toBeNull();
    expect(validateCustomCategory(' groceries ', ['Groceries'])).toBe('category_duplicate');
    expect(validateCustomCategory('x'.repeat(41), [])).toBe('category_too_long');
  });
});

describe('month plan and budgets', () => {
  it('adds up income, fixed costs, saving and what is left', () => {
    expect(monthPlan(anna())).toEqual({
      incomeRappen: 620000,
      fixedCostsRappen: 233550,
      savingsRappen: 50000,
      spendableRappen: 336450,
    });
  });

  it('treats unreadable inputs as zero for the running totals', () => {
    expect(monthPlan({ ...createDraft(), netIncome: 'abc', savingsMonthly: 'x' })).toEqual({
      incomeRappen: 0,
      fixedCostsRappen: 0,
      savingsRappen: 0,
      spendableRappen: 0,
    });
  });

  it('suggests a split of what is left in CHF 5 steps', () => {
    const suggestion = suggestedBudgets(anna());
    const total = Object.values(suggestion).reduce((sum, value) => sum + value, 0);
    expect(Object.keys(suggestion)).toEqual(anna().categories.map(categoryId));
    expect(total).toBeLessThanOrEqual(336450);
    expect(336450 - total).toBeLessThan(500);
    for (const value of Object.values(suggestion)) expect(value % 500).toBe(0);
    expect(suggestion['default:groceries']).toBeGreaterThan(suggestion['default:clothes'] ?? 0);
  });

  it('keeps the person’s own budgets once adjusted, new categories starting at zero', () => {
    const adjusted: OnboardingDraft = {
      ...anna(),
      budgets: { 'default:groceries': 100000 },
      budgetsAdjusted: true,
    };
    const budgets = budgetsForStep(adjusted);
    expect(budgets['default:groceries']).toBe(100000);
    expect(budgets['default:eating_out']).toBe(0);
    expect(allocation(adjusted)).toMatchObject({ allocatedRappen: 100000, status: 'under' });
  });

  it('reports over-allocation', () => {
    const over: OnboardingDraft = {
      ...anna(),
      budgets: { 'default:groceries': 400000 },
      budgetsAdjusted: true,
    };
    expect(allocation(over)).toMatchObject({ status: 'over', unallocatedRappen: 336450 - 400000 });
  });
});

describe('toOnboardingPayload', () => {
  it('builds exactly what complete_onboarding expects', () => {
    const draft: OnboardingDraft = {
      ...anna(),
      fixedCosts: { ...anna().fixedCosts, other: '30' },
      otherFixedCostLabel: '  Gym ',
      goalName: ' Japan ',
      goalAmount: '3000',
      goalDate: '2027-06-30',
      leftoverPolicy: 'savings',
      categories: [
        { kind: 'default', key: 'groceries' },
        { kind: 'custom', name: ' Dog ' },
      ],
      paymentMethods: ['cash', 'twint'],
      painLevel: 'brutal',
    };
    const payload = toOnboardingPayload(draft, { language: 'de', timezone: 'Europe/Zurich' });
    expect(payload.profile).toEqual({
      net_income_rappen: 620000,
      payday: 25,
      irregular_income: false,
      weekly_work_minutes: 2520,
      savings_monthly_rappen: 50000,
      savings_goal_name: 'Japan',
      savings_goal_rappen: 300000,
      savings_goal_date: '2027-06-30',
      leftover_policy: 'savings',
      payment_methods: ['twint', 'cash'],
      pain_level: 'brutal',
      sound_enabled: true,
      language: 'de',
      timezone: 'Europe/Zurich',
    });
    expect(payload.fixed_costs).toEqual([
      { kind: 'rent', label: null, amount_rappen: 185000 },
      { kind: 'health_insurance', label: null, amount_rappen: 42050 },
      { kind: 'phone_internet', label: null, amount_rappen: 6500 },
      { kind: 'other', label: 'Gym', amount_rappen: 3000 },
    ]);
    expect(payload.categories).toEqual([
      { default_key: 'groceries', name: null, budget_rappen: expect.any(Number) },
      { default_key: null, name: 'Dog', budget_rappen: expect.any(Number) },
    ]);
    const budgetTotal = payload.categories.reduce(
      (sum, category) => sum + category.budget_rappen,
      0,
    );
    expect(budgetTotal).toBeLessThanOrEqual(333450);
    expect(payload.notification_settings).toEqual({
      transaction_moments: true,
      category_thresholds: true,
      total_low: true,
      pace: true,
      unusual_purchase: true,
      daily_allowance: true,
      payday: true,
      weekly_review: true,
      categorize_requests: true,
      quiet_hours_enabled: true,
      quiet_hours_start: '22:00',
      quiet_hours_end: '07:00',
      max_per_day: 6,
    });
  });

  it('leaves out an empty goal and unknown hours', () => {
    const payload = toOnboardingPayload(
      { ...anna(), hoursPerWeek: '' },
      { language: 'en', timezone: 'Europe/Zurich' },
    );
    expect(payload.profile).toMatchObject({
      weekly_work_minutes: null,
      savings_goal_name: null,
      savings_goal_rappen: null,
      savings_goal_date: null,
    });
  });

  it('names the first incomplete step', () => {
    const context = { language: 'en' as const, timezone: 'Europe/Zurich' };
    const cases: [OnboardingDraft, string][] = [
      [createDraft(), 'income'],
      [{ ...anna(), fixedCosts: { ...anna().fixedCosts, rent: '?' } }, 'fixed-costs'],
      [{ ...anna(), goalName: 'Japan' }, 'savings'],
      [{ ...anna(), categories: [] }, 'categories'],
    ];
    for (const [draft, step] of cases) {
      expect(() => toOnboardingPayload(draft, context)).toThrow(IncompleteDraftError);
      try {
        toOnboardingPayload(draft, context);
      } catch (error) {
        expect((error as IncompleteDraftError).step).toBe(step);
      }
    }
  });
});

describe('restoreDraft', () => {
  it('round-trips a saved draft', () => {
    const draft: OnboardingDraft = {
      ...anna(),
      categories: [...anna().categories, { kind: 'custom', name: 'Dog' }],
      budgets: { 'default:groceries': 90000 },
      budgetsAdjusted: true,
      paymentMethods: ['card'],
      reached: 4,
    };
    expect(restoreDraft(JSON.parse(JSON.stringify(draft)))).toEqual(draft);
  });

  it('starts fresh for anything that is not a version-1 draft', () => {
    expect(restoreDraft(null)).toEqual(createDraft());
    expect(restoreDraft('draft')).toEqual(createDraft());
    expect(restoreDraft({ version: 2 })).toEqual(createDraft());
  });

  it('replaces unexpected fields with defaults', () => {
    const restored = restoreDraft({
      version: 1,
      netIncome: 5000,
      payday: 45,
      fixedCosts: { rent: 1800 },
      categories: [
        { kind: 'default', key: 'casino' },
        { kind: 'custom', name: ' ' },
        'x',
        { kind: 'custom', name: 'Dog' },
      ],
      budgets: { a: 1.5, b: -1, c: 500 },
      leftoverPolicy: 'gamble',
      painLevel: 'extreme',
      paymentMethods: ['card', 'bitcoin'],
      notifications: {
        pace: false,
        quietStartMinutes: 2000,
        maxPerDay: 99,
        quietHoursEnabled: 'yes',
      },
      reached: 42,
      goalDate: 'June',
    });
    expect(restored).toMatchObject({
      netIncome: '',
      payday: null,
      fixedCosts: expect.objectContaining({ rent: '' }),
      categories: [{ kind: 'custom', name: 'Dog' }],
      budgets: { c: 500 },
      leftoverPolicy: 'rollover',
      painLevel: 'normal',
      paymentMethods: ['card'],
      reached: 8,
      goalDate: null,
    });
    expect(restored.notifications).toMatchObject({
      pace: false,
      quietStartMinutes: 1320,
      maxPerDay: 6,
      quietHoursEnabled: true,
    });
  });
});

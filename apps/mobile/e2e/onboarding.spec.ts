import { expect, test } from '@playwright/test';

import { apiAs, confirmMoments, next, signUp, skip, uniqueEmail } from './helpers';

/**
 * Spec section 17: "A new user can sign up, finish onboarding, and see a correct budget in under
 * five minutes", and "a transaction … updates every number correctly".
 */
test.describe('onboarding to a correct month', () => {
  test('sign-up, the full questionnaire and a correct home screen in under five minutes', async ({
    page,
    request,
  }) => {
    const started = Date.now();
    const email = uniqueEmail('onboarding');
    await signUp(page, email, { onboard: false });

    // 1 Income: CHF 6'200 net, payday the 25th, 42 hours a week.
    await expect(page.getByText('Step 1 of 10')).toBeVisible();
    await page.getByTestId('onboarding-net-income').fill("6'200");
    await page.getByTestId('onboarding-payday-25').click();
    await page.getByTestId('onboarding-hours').fill('42');
    await next(page, 'fixed-costs');

    // 2 Fixed costs: rent 1'850, health insurance 420.50.
    await page.getByTestId('onboarding-fixed-rent').fill('1850');
    await page.getByTestId('onboarding-fixed-health_insurance').fill('420.50');
    await expect(page.getByTestId('onboarding-fixed-total')).toContainText('CHF 2,270.50');
    await next(page, 'savings');

    // 3 Saving: CHF 500 a month, leftover money goes to savings.
    await page.getByTestId('onboarding-savings-monthly').fill('500');
    await page.getByRole('radio', { name: /Move it to savings/ }).click();
    await next(page, 'categories');

    // 4 Categories: the suggested ones plus "Dog".
    await page.getByTestId('onboarding-custom-category').fill('Dog');
    await page.getByTestId('onboarding-custom-category-add').click();
    await next(page, 'budgets');

    // 5 Budgets: 6'200 − 2'270.50 − 500 = 3'429.50 to spend, split in CHF 5 steps.
    await expect(page.getByTestId('onboarding-spendable')).toContainText('CHF 3,429.50');
    await next(page, 'payment');

    // 6–8 How I pay, pain level, warnings.
    await page.getByTestId('onboarding-payment-twint').click();
    await page.getByTestId('onboarding-payment-card').click();
    await next(page, 'pain');
    await page.getByRole('radio', { name: /Brutal/ }).click();
    await next(page, 'notifications');
    await skip(page, 'sources');

    // 9 Sources: paying by card and TWINT suggests importing a statement right after setup.
    await expect(page.getByText('Step 9 of 10')).toBeVisible();
    await expect(
      page.getByTestId('onboarding-sources-import-switch').locator('input'),
    ).toBeChecked();
    await next(page, 'summary');

    // Summary "Your month", then the statement import on top of Home; "Not now" leads Home.
    await expect(page.getByTestId('summary-spendable')).toContainText('CHF 3,429.50');
    await page.getByTestId('onboarding-continue').filter({ visible: true }).click();
    await expect(page.getByTestId('import-choose')).toBeVisible();
    await page.getByTestId('import-header-back').click();
    await expect(page.getByTestId('home-balance')).toContainText('3,429.50');
    await expect(page.getByTestId('home-no-transactions')).toBeVisible();
    expect(Date.now() - started).toBeLessThan(5 * 60_000);

    // The budgets the database stored add up to at most what there is to spend.
    const api = await apiAs(request, email);
    const budgets = await api.get<{ amount_rappen: number; category_id: string }[]>(
      'budgets?select=amount_rappen,category_id',
    );
    expect(budgets).toHaveLength(7);
    const allocated = budgets.reduce((sum, budget) => sum + budget.amount_rappen, 0);
    expect(allocated).toBeLessThanOrEqual(342950);
    expect(342950 - allocated).toBeLessThan(500);

    // Book what sources will deliver later: a purchase, a refund, an uncategorized purchase, the
    // rent payment (a fixed cost, already planned) and the salary (income, not a refund).
    const [groceries] = await api.get<{ id: string }[]>(
      'categories?select=id&default_key=eq.groceries',
    );
    const [rent] = await api.get<{ id: string }[]>('fixed_costs?select=id&kind=eq.rent');
    const groceriesBudget = budgets.find(
      (budget) => budget.category_id === groceries!.id,
    )!.amount_rappen;
    const now = new Date().toISOString();
    // Booked through the same pipeline every source uses (direct table writes are refused).
    const base = { booked_at: now, source: 'manual', raw_text: null, mcc: null, external_id: null };
    const { results } = await api.rpc<{ results: { transaction_id: string }[] }>(
      'add_transactions',
      {
        p: {
          rows: [
            { ...base, amount_rappen: -8400, merchant: 'Migros', category_id: groceries!.id },
            {
              ...base,
              amount_rappen: 2000,
              merchant: 'Migros',
              category_id: groceries!.id,
              note: 'Refund',
            },
            { ...base, amount_rappen: -1500, merchant: 'Kiosk' },
            { ...base, amount_rappen: -185000, merchant: 'Verwaltung AG' },
            { ...base, amount_rappen: 620000, merchant: 'Employer' },
          ],
        },
      },
    );
    // The rent payment is marked as the rent's payment (already in the plan).
    await api.rpc('update_transaction', {
      p_id: results[3]!.transaction_id,
      p: { fixed_cost_id: rent!.id },
    });

    // 3'429.50 − (84.00 − 20.00) − 15.00 = 3'350.50; groceries lose 64.00; rent and salary change nothing.
    await page.reload();
    // The purchases are new to the person: each one plays its payment moment first.
    expect(await confirmMoments(page)).toBeGreaterThan(0);
    await expect(page.getByTestId('home-balance')).toContainText('3,350.50');
    const remaining = ((groceriesBudget - 6400) / 100).toFixed(2);
    await expect(page.getByTestId('home-category-groceries')).toContainText(
      `CHF ${remaining.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} left`,
    );
    await expect(page.getByTestId('home-uncategorized')).toContainText('CHF 15.00');
    // Only the kiosk purchase has no category, so it is the one question waiting.
    await expect(page.getByTestId('home-review')).toContainText('1 purchase needs a category');
    await expect(page.getByTestId('home-transaction-0')).toBeVisible();
  });

  test('closing the app keeps the answers', async ({ page }) => {
    await signUp(page, uniqueEmail('resume'), { onboard: false });
    await page.getByTestId('onboarding-net-income').fill('4800');
    await page.getByTestId('onboarding-payday-1').click();
    await next(page, 'fixed-costs');
    await page.getByTestId('onboarding-fixed-rent').fill('1500');
    await page.waitForTimeout(500); // answers are saved shortly after each change
    await page.reload();
    await expect(page.getByTestId('onboarding-fixed-costs')).toBeVisible();
    await expect(page.getByTestId('onboarding-fixed-rent')).toHaveValue('1500');
  });

  test('over-allocated budgets are flagged but allowed', async ({ page }) => {
    await signUp(page, uniqueEmail('over'), { onboard: false });
    await page.getByTestId('onboarding-net-income').fill('3000');
    await page.getByTestId('onboarding-payday-1').click();
    await next(page, 'fixed-costs');
    await page.getByTestId('onboarding-fixed-rent').fill('3500');
    await next(page, 'savings');
    await skip(page, 'categories');
    await next(page, 'budgets');
    await expect(page.getByTestId('onboarding-budgets-negative')).toContainText('CHF 500.00');
  });
});

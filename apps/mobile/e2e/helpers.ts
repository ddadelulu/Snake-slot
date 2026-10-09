import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const PASSWORD = 'correct-horse-battery-9';

/** A fresh address per test, so runs never collide with earlier accounts. */
export function uniqueEmail(label: string): string {
  return `e2e-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

/**
 * Creates an account. By default it also runs through the questionnaire on the quickest path
 * (income CHF 5'000, payday the 1st, everything else as suggested, no statement import after
 * setup) and ends on Home.
 */
export async function signUp(
  page: Page,
  email: string,
  options: { password?: string; onboard?: boolean } = {},
) {
  const { password = PASSWORD, onboard = true } = options;
  await page.goto('/sign-up');
  await page.getByTestId('sign-up-email').fill(email);
  await page.getByTestId('sign-up-password').fill(password);
  await page.getByTestId('sign-up-submit').click();
  await expect(page.getByTestId('onboarding-income')).toBeVisible();
  if (onboard) await quickOnboarding(page);
}

export async function quickOnboarding(page: Page) {
  await page.getByTestId('onboarding-net-income').fill('5000');
  await page.getByTestId('onboarding-payday-1').click();
  await next(page, 'fixed-costs');
  await next(page, 'savings');
  await skip(page, 'categories');
  await next(page, 'budgets');
  await next(page, 'payment');
  await skip(page, 'pain');
  await next(page, 'notifications');
  await skip(page, 'sources');
  // Skipping step 9 means no statement import right after setup: "Start my month" leads Home.
  await skip(page, 'summary');
  await page.getByTestId('onboarding-continue').filter({ visible: true }).click();
  await expect(page.getByTestId('home-balance')).toBeVisible();
}

export async function next(page: Page, step: string) {
  await page.getByTestId('onboarding-continue').filter({ visible: true }).click();
  await expect(page.getByTestId(`onboarding-${step}`)).toBeVisible();
}

export async function skip(page: Page, step: string) {
  await page.getByTestId('onboarding-skip').filter({ visible: true }).click();
  await expect(page.getByTestId(`onboarding-${step}`)).toBeVisible();
}

export async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto('/sign-in');
  await page.getByTestId('sign-in-email').fill(email);
  await page.getByTestId('sign-in-password').fill(password);
  await page.getByTestId('sign-in-submit').click();
}

export async function openTab(page: Page, tab: string) {
  await page.getByTestId(`tab-${tab}`).click();
  await expect(page.getByTestId(`${tab}-screen`)).toBeVisible();
}

/**
 * Talks to the same Supabase API the app uses, signed in as the test user, to book transactions
 * the way a data source will (sources arrive in later milestones). Needs the URL and key the web
 * build was made with: EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_KEY.
 */
export async function apiAs(request: APIRequestContext, email: string, password = PASSWORD) {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_KEY;
  if (!url || !key) throw new Error('Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_KEY');
  const token = await request.post(`${url}/auth/v1/token?grant_type=password`, {
    headers: { apikey: key },
    data: { email, password },
  });
  expect(token.ok()).toBe(true);
  const { access_token: accessToken } = (await token.json()) as { access_token: string };
  const headers = { apikey: key, Authorization: `Bearer ${accessToken}` };

  return {
    async get<T>(path: string): Promise<T> {
      const response = await request.get(`${url}/rest/v1/${path}`, { headers });
      expect(response.ok(), await response.text()).toBe(true);
      return (await response.json()) as T;
    },
    /** Calls a database function as the signed-in user and returns its JSON answer. */
    async rpc<T>(name: string, args: object): Promise<T> {
      const response = await request.post(`${url}/rest/v1/rpc/${name}`, { headers, data: args });
      expect(response.ok(), await response.text()).toBe(true);
      return (await response.json()) as T;
    },
    /** Inserts rows one by one (PostgREST bulk inserts need identical keys in every row). */
    async insert(table: string, rows: object[]) {
      for (const row of rows) {
        const response = await request.post(`${url}/rest/v1/${table}`, {
          headers: { ...headers, Prefer: 'return=minimal' },
          data: row,
        });
        expect(response.ok(), await response.text()).toBe(true);
      }
    },
  };
}

/**
 * Confirms every payment moment that is showing ("I paid this", spec section 8) and returns how
 * many there were. On the Brutal pain level the button has to be held for two seconds, so the
 * button is held down long enough for every level.
 */
export async function confirmMoments(page: Page): Promise<number> {
  let confirmed = 0;
  const screen = page.getByTestId('moment-screen').filter({ visible: true });
  await page.waitForTimeout(300);
  while ((await screen.count()) > 0 && confirmed < 20) {
    const button = page.getByTestId('moment-confirm').filter({ visible: true });
    await button.hover();
    await page.mouse.down();
    await page.waitForTimeout(2_300);
    await page.mouse.up();
    confirmed += 1;
    await page.waitForTimeout(400);
  }
  return confirmed;
}

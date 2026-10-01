import { expect, type Page } from '@playwright/test';

export const PASSWORD = 'correct-horse-battery-9';

/** A fresh address per test, so runs never collide with earlier accounts. */
export function uniqueEmail(label: string): string {
  return `e2e-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

export async function signUp(page: Page, email: string, password = PASSWORD) {
  await page.goto('/sign-up');
  await page.getByTestId('sign-up-email').fill(email);
  await page.getByTestId('sign-up-password').fill(password);
  await page.getByTestId('sign-up-submit').click();
  await expect(page.getByTestId('home-screen')).toBeVisible();
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

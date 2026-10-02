import { expect, test } from '@playwright/test';

import { openTab, signIn, signUp, uniqueEmail } from './helpers';

test.describe('language and appearance', () => {
  test('switching to German changes the app and is stored on the account', async ({
    page,
    browser,
  }) => {
    const email = uniqueEmail('language');
    await signUp(page, email);
    await openTab(page, 'settings');

    await page.getByRole('radio', { name: 'Deutsch' }).click();
    await expect(page.getByText('Einstellungen').first()).toBeVisible();
    await expect(page.getByTestId('tab-home')).toContainText('Übersicht');

    // A fresh device with an English locale follows the account's language after sign-in.
    const otherDevice = await browser.newContext({ locale: 'en-US' });
    const otherPage = await otherDevice.newPage();
    await signIn(otherPage, email);
    await expect(otherPage.getByTestId('home-screen')).toBeVisible();
    await expect(otherPage.getByTestId('home-balance')).toContainText('übrig diesen Monat');
    await otherDevice.close();
  });

  test('the dark appearance applies at once and survives a reload', async ({ page }) => {
    await signUp(page, uniqueEmail('appearance'));
    await openTab(page, 'settings');
    const background = () =>
      page
        .getByTestId('settings-screen')
        .evaluate((node) => getComputedStyle(node).backgroundColor);

    const light = await background();
    await page.getByRole('radio', { name: 'Dark' }).click();
    await expect.poll(background).not.toBe(light);
    const dark = await background();

    await page.reload();
    await openTab(page, 'settings');
    await expect.poll(background).toBe(dark);
  });

  test('a German phone starts in German before sign-in', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'de-CH' });
    const page = await context.newPage();
    await page.goto('/sign-in');
    await expect(page.getByText('Willkommen zurück')).toBeVisible();
    await context.close();
  });
});

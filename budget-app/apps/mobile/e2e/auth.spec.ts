import { expect, test } from '@playwright/test';

import { PASSWORD, openTab, signIn, signUp, uniqueEmail } from './helpers';

test.describe('account lifecycle', () => {
  test('sign up, see every tab, sign out and sign back in', async ({ page }) => {
    const email = uniqueEmail('lifecycle');
    await signUp(page, email);

    await expect(page.getByText('Your month starts here')).toBeVisible();
    for (const tab of ['transactions', 'assistant', 'insights', 'settings', 'home']) {
      await openTab(page, tab);
    }

    await openTab(page, 'settings');
    await expect(page.getByTestId('settings-email')).toContainText(email);
    await page.getByTestId('settings-sign-out').click();
    await expect(page.getByTestId('sign-in-screen')).toBeVisible();

    await signIn(page, email);
    await expect(page.getByTestId('home-screen')).toBeVisible();
  });

  test('the session survives a reload', async ({ page }) => {
    await signUp(page, uniqueEmail('reload'));
    await page.reload();
    await expect(page.getByTestId('home-screen')).toBeVisible();
  });

  test('a deep link survives a cold start', async ({ page }) => {
    await signUp(page, uniqueEmail('deeplink'));
    await page.goto('/settings');
    await expect(page.getByTestId('settings-screen')).toBeVisible();
  });

  test('deleting the account removes it for good', async ({ page }) => {
    const email = uniqueEmail('delete');
    await signUp(page, email);
    await openTab(page, 'settings');

    await page.getByTestId('settings-delete-account').click();
    await expect(page.getByText('Delete your account?')).toBeVisible();
    await page.getByTestId('delete-account-confirm').click();

    await expect(page.getByTestId('sign-in-screen')).toBeVisible();
    await expect(page.getByTestId('auth-notice')).toContainText('deleted');

    await signIn(page, email);
    await expect(page.getByTestId('sign-in-error')).toContainText('Email or password is wrong.');
  });

  test('keeping the account closes the sheet and changes nothing', async ({ page }) => {
    await signUp(page, uniqueEmail('keep'));
    await openTab(page, 'settings');
    await page.getByTestId('settings-delete-account').click();
    await page.getByTestId('delete-account-cancel').click();
    await expect(page.getByText('Delete your account?')).toBeHidden();
    await openTab(page, 'home');
  });
});

test.describe('sign-in and sign-up errors', () => {
  test('field validation happens before anything is sent', async ({ page }) => {
    await page.goto('/sign-up');
    await page.getByTestId('sign-up-email').fill('not-an-email');
    await page.getByTestId('sign-up-password').fill('short');
    await page.getByTestId('sign-up-submit').click();
    await expect(page.getByText('That does not look like an email address.')).toBeVisible();
    await expect(page.getByText('Use at least 10 characters.')).toBeVisible();
  });

  test('a wrong password is rejected with a clear message', async ({ page }) => {
    const email = uniqueEmail('wrong');
    await signUp(page, email);
    await openTab(page, 'settings');
    await page.getByTestId('settings-sign-out').click();
    await expect(page.getByTestId('sign-in-screen')).toBeVisible();

    await signIn(page, email, `${PASSWORD}-nope`);
    await expect(page.getByTestId('sign-in-error')).toContainText('Email or password is wrong.');
  });

  test('signing up twice with the same email points to sign-in', async ({ page }) => {
    const email = uniqueEmail('twice');
    await signUp(page, email);
    await openTab(page, 'settings');
    await page.getByTestId('settings-sign-out').click();
    await expect(page.getByTestId('sign-in-screen')).toBeVisible();

    await page.goto('/sign-up');
    await page.getByTestId('sign-up-email').fill(email);
    await page.getByTestId('sign-up-password').fill(PASSWORD);
    await page.getByTestId('sign-up-submit').click();
    await expect(page.getByTestId('sign-up-error')).toContainText('already an account');
  });

  test('signed-out visitors cannot open the tabs', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByTestId('sign-in-screen')).toBeVisible();
  });
});

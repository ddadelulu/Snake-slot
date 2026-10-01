import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import * as authApi from '@/features/auth/authApi';
import { i18n } from '@/i18n';
import { readEnv } from '@/lib/env';
import { getSupabaseIfConfigured } from '@/lib/supabase';
import { createFakeAuthClient, fakeSession } from '@/test/appHarness';

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'en' }] }));

jest.mock('@/lib/env', () => ({
  ...jest.requireActual('@/lib/env'),
  readEnv: jest.fn(),
}));

jest.mock('@/lib/supabase', () => ({
  getSupabase: jest.fn(() => {
    throw new Error('screens must go through authApi in these tests');
  }),
  getSupabaseIfConfigured: jest.fn(),
  authRedirectUrl: jest.fn(() => 'batzen://auth/callback'),
}));

jest.mock('@/data/profile', () => ({
  useProfile: () => ({ data: undefined }),
  useUpdateProfile: () => ({ mutate: jest.fn(), isPending: false }),
}));

jest.mock('@/features/auth/authApi', () => {
  const actual = jest.requireActual('@/features/auth/authApi');
  return {
    ...actual,
    fetchAuthSettings: jest.fn(async () => ({ ...actual.FALLBACK_AUTH_SETTINGS })),
    isAppleNativeAvailable: jest.fn(async () => false),
    signInWithEmail: jest.fn(actual.signInWithEmail),
    signUpWithEmail: jest.fn(actual.signUpWithEmail),
    signOut: jest.fn(async () => ({ ok: true })),
    deleteAccount: jest.fn(async () => ({ ok: true })),
  };
});

const ENV_OK = {
  ok: true as const,
  supabaseUrl: 'http://127.0.0.1:54321',
  supabaseKey: 'publishable-key',
  appEnv: 'development' as const,
};

function start(session: ReturnType<typeof fakeSession> | null, initialUrl = '/') {
  const fake = createFakeAuthClient(session);
  jest.mocked(getSupabaseIfConfigured).mockReturnValue(fake.client as never);
  renderRouter('src/app', { initialUrl });
  return fake;
}

beforeEach(async () => {
  jest.clearAllMocks();
  jest.mocked(readEnv).mockReturnValue(ENV_OK);
  // Preferences persist like on a phone; every test starts from a fresh install in English.
  await AsyncStorage.clear();
  await i18n.changeLanguage('en');
});

describe('navigation guards', () => {
  it('sends signed-out visitors to sign-in', async () => {
    start(null);
    expect(await screen.findByTestId('sign-in-screen')).toBeOnTheScreen();
  });

  it('keeps signed-out visitors out of the tabs, even by deep link', async () => {
    start(null, '/settings');
    expect(await screen.findByTestId('sign-in-screen')).toBeOnTheScreen();
  });

  it('shows Home and the five tabs when signed in', async () => {
    start(fakeSession());
    expect(await screen.findByTestId('home-screen')).toBeOnTheScreen();
    for (const label of ['Home', 'Transactions', 'AI', 'Insights', 'Settings']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it('opens a tab by deep link when signed in', async () => {
    start(fakeSession(), '/settings');
    expect(await screen.findByTestId('settings-screen')).toBeOnTheScreen();
    expect(screen.getByTestId('settings-email')).toHaveTextContent('anna@example.ch');
  });

  it('moves to the tabs when a session arrives and back to sign-in when it ends', async () => {
    const fake = start(null);
    await screen.findByTestId('sign-in-screen');
    act(() => fake.emit('SIGNED_IN', fakeSession()));
    expect(await screen.findByTestId('home-screen')).toBeOnTheScreen();
    act(() => fake.emit('SIGNED_OUT', null));
    expect(await screen.findByTestId('sign-in-screen')).toBeOnTheScreen();
  });

  it('holds a password-reset session on the new-password screen', async () => {
    const fake = start(null);
    await screen.findByTestId('sign-in-screen');
    act(() => fake.emit('PASSWORD_RECOVERY', fakeSession()));
    expect(await screen.findByTestId('reset-password-screen')).toBeOnTheScreen();
  });

  it('explains a missing configuration instead of starting', async () => {
    jest
      .mocked(readEnv)
      .mockReturnValue({ ok: false, problems: ['EXPO_PUBLIC_SUPABASE_URL is not set.'] });
    start(null);
    expect(await screen.findByTestId('config-error')).toBeOnTheScreen();
    expect(screen.getByText('EXPO_PUBLIC_SUPABASE_URL is not set.')).toBeOnTheScreen();
  });
});

describe('sign-in and sign-up screens', () => {
  it('validates the fields before sending anything', async () => {
    start(null);
    fireEvent.press(await screen.findByTestId('sign-in-submit'));
    expect(await screen.findByText('Enter your email address.')).toBeOnTheScreen();
    expect(screen.getByText('Enter your password.')).toBeOnTheScreen();
  });

  it('shows the server’s answer above the form', async () => {
    jest
      .mocked(authApi.signInWithEmail)
      .mockResolvedValueOnce({ ok: false, kind: 'auth', code: 'invalid_credentials' });
    start(null);
    fireEvent.changeText(await screen.findByTestId('sign-in-email'), 'anna@example.ch');
    fireEvent.changeText(screen.getByTestId('sign-in-password'), 'wrong-password-1');
    fireEvent.press(screen.getByTestId('sign-in-submit'));
    expect(await screen.findByText('Email or password is wrong.')).toBeOnTheScreen();
    expect(authApi.signInWithEmail).toHaveBeenCalledWith({
      email: 'anna@example.ch',
      password: 'wrong-password-1',
    });
  });

  it('asks to confirm the email when the project requires it', async () => {
    jest
      .mocked(authApi.signUpWithEmail)
      .mockResolvedValueOnce({ ok: true, status: 'confirm_email' });
    start(null, '/sign-up');
    fireEvent.changeText(await screen.findByTestId('sign-up-email'), 'neu@example.ch');
    fireEvent.changeText(screen.getByTestId('sign-up-password'), 'correct-horse-9');
    fireEvent.press(screen.getByTestId('sign-up-submit'));
    expect(await screen.findByTestId('check-email-screen')).toBeOnTheScreen();
    expect(screen.getByText(/neu@example\.ch/)).toBeOnTheScreen();
    expect(authApi.signUpWithEmail).toHaveBeenCalledWith({
      email: 'neu@example.ch',
      password: 'correct-horse-9',
      language: 'en',
    });
  });
});

describe('settings', () => {
  it('switches the whole app to German', async () => {
    start(fakeSession(), '/settings');
    fireEvent.press(await screen.findByRole('radio', { name: 'Deutsch' }));
    expect((await screen.findAllByText('Einstellungen')).length).toBeGreaterThan(0);
    expect(screen.getByText('Konto löschen')).toBeOnTheScreen();
  });

  it('deletes the account after confirmation and confirms it on the sign-in screen', async () => {
    const fake = start(fakeSession(), '/settings');
    fireEvent.press(await screen.findByTestId('settings-delete-account'));
    expect(await screen.findByText('Delete your account?')).toBeOnTheScreen();
    jest.mocked(authApi.deleteAccount).mockImplementationOnce(async () => {
      fake.emit('SIGNED_OUT', null);
      return { ok: true };
    });
    fireEvent.press(screen.getByTestId('delete-account-confirm'));
    expect(await screen.findByTestId('sign-in-screen')).toBeOnTheScreen();
    expect(screen.getByText('Your account and all its data have been deleted.')).toBeOnTheScreen();
  });

  it('keeps the account when the person changes their mind', async () => {
    start(fakeSession(), '/settings');
    fireEvent.press(await screen.findByTestId('settings-delete-account'));
    fireEvent.press(await screen.findByTestId('delete-account-cancel'));
    await waitFor(() => expect(screen.queryByText('Delete your account?')).toBeNull());
    expect(authApi.deleteAccount).not.toHaveBeenCalled();
  });

  it('signs out', async () => {
    start(fakeSession(), '/settings');
    fireEvent.press(await screen.findByTestId('settings-sign-out'));
    await waitFor(() => expect(authApi.signOut).toHaveBeenCalledTimes(1));
  });
});

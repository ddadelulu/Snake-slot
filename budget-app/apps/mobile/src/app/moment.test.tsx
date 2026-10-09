import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Audio from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { AccessibilityInfo } from 'react-native';

import { i18n } from '@/i18n';
import { readEnv } from '@/lib/env';
import { OVER_BUDGET_MOMENT, momentJson } from '@/test/m4Fixture';
import type { RpcHandler } from '@/test/fakeSupabase';
import { ok, refused, rpcCalls, startApp, transactionJson } from '@/test/transactionsFixture';

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'en' }] }));
jest.mock('@/lib/env', () => ({ ...jest.requireActual('@/lib/env'), readEnv: jest.fn() }));
jest.mock('@/lib/supabase', () => ({
  getSupabase: jest.fn(),
  getSupabaseIfConfigured: jest.fn(),
  authRedirectUrl: jest.fn(() => 'batzen://auth/callback'),
}));

const MANOR = momentJson({ id: 't-manor' });
const player = (Audio as unknown as { __player: { play: jest.Mock } }).__player;
/** Anna: CHF 6'200 net, 42 hours a week. */
const WORKER = { net_income_rappen: 620000, weekly_work_minutes: 42 * 60 };
const SPIN_DONE = { timeout: 5000 };

function start(
  options: {
    url?: string;
    moments?: unknown[];
    acknowledge?: RpcHandler;
    profile?: Record<string, unknown>;
    rpc?: Record<string, RpcHandler>;
  } = {},
) {
  const moments = [...(options.moments ?? [MANOR])];
  return startApp({
    url: options.url ?? '/moment',
    profile: { ...WORKER, ...options.profile },
    rpc: {
      pending_moments: () => ok(moments),
      acknowledge_transactions: options.acknowledge ?? (() => ok(null)),
      ...options.rpc,
    },
  });
}

const acknowledged = (fake: ReturnType<typeof start>) =>
  rpcCalls(fake, 'acknowledge_transactions') as { p_ids: string[] }[];

let reduceMotion: jest.SpyInstance;

beforeEach(async () => {
  jest.clearAllMocks();
  jest.mocked(readEnv).mockReturnValue({
    ok: true,
    supabaseUrl: 'http://127.0.0.1:54321',
    supabaseKey: 'publishable-key',
    appEnv: 'development',
  });
  reduceMotion = jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  await AsyncStorage.clear();
  await i18n.changeLanguage('en');
});

afterEach(() => reduceMotion.mockRestore());

describe('payment moment', () => {
  it('shows the purchase, the new balance, hours of work and the category, then closes', async () => {
    const fake = start();
    expect(await screen.findByTestId('moment-merchant')).toHaveTextContent('Manor');
    expect(screen.getByTestId('moment-amount')).toHaveTextContent('CHF -84.00');
    expect(screen.getByTestId('moment-work')).toHaveTextContent('= 2.5 hours of work');
    expect(screen.getByTestId('moment-category')).toHaveTextContent('Groceries: CHF 586.00 left');
    expect(screen.getByTestId('moment-balance')).toHaveProp(
      'accessibilityLabel',
      'CHF 2,625.50 left this month',
    );
    expect(screen.getByTestId('moment-category-bar')).toHaveProp('accessibilityValue', {
      min: 0,
      max: 100,
      now: 65,
    });
    expect(screen.queryByTestId('moment-position')).toBeNull();
    expect(screen.queryByTestId('moment-over-budget')).toBeNull();

    fireEvent.press(screen.getByTestId('moment-confirm'));
    expect(await screen.findByTestId('home-screen')).toBeOnTheScreen();
    expect(acknowledged(fake)).toEqual([{ p_ids: ['t-manor'] }]);
  });

  it('with Reduce Motion lands on the end state at once: hit, coin and the warning', async () => {
    start({ moments: [OVER_BUDGET_MOMENT] });
    expect(await screen.findByTestId('moment-over-budget')).toHaveTextContent(
      /This purchase takes Eating out over its budget\./,
    );
    expect(screen.getByTestId('moment-category')).toHaveTextContent(
      'Eating out: CHF 74.00 over budget',
    );
    await waitFor(() =>
      expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Heavy),
    );
    expect(Haptics.notificationAsync).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Error);
    expect(player.play).toHaveBeenCalledTimes(1);
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
  });

  it('spins the balance down with haptic ticks before the heavy hit', async () => {
    reduceMotion.mockResolvedValue(false);
    start({ moments: [OVER_BUDGET_MOMENT] });
    expect(await screen.findByTestId('moment-merchant')).toBeOnTheScreen();
    expect(screen.queryByTestId('moment-over-budget')).toBeNull();
    expect(await screen.findByTestId('moment-over-budget', undefined, SPIN_DONE)).toBeOnTheScreen();
    expect(Haptics.selectionAsync).toHaveBeenCalled();
    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Heavy);
    expect(player.play).toHaveBeenCalledTimes(1);
  });

  it('Mild: no vibration, no sound', async () => {
    start({ profile: { pain_level: 'mild' }, moments: [OVER_BUDGET_MOMENT] });
    expect(await screen.findByTestId('moment-over-budget')).toBeOnTheScreen();
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
    expect(player.play).not.toHaveBeenCalled();
  });

  it('plays no coin when the sound is switched off', async () => {
    start({ profile: { sound_enabled: false } });
    expect(await screen.findByTestId('moment-merchant')).toBeOnTheScreen();
    await waitFor(() => expect(Haptics.impactAsync).toHaveBeenCalled());
    expect(player.play).not.toHaveBeenCalled();
  });

  it('Brutal: the button must be held for two seconds', async () => {
    const fake = start({ profile: { pain_level: 'brutal' } });
    const button = await screen.findByTestId('moment-confirm');
    expect(button).toHaveProp('accessibilityLabel', 'Hold: I paid this');

    fireEvent(button, 'pressIn');
    fireEvent(button, 'pressOut');
    // renderRouter runs on fake timers: let a full hold's time pass after letting go.
    await act(async () => {
      jest.advanceTimersByTime(2500);
    });
    expect(acknowledged(fake)).toHaveLength(0);

    fireEvent(button, 'pressIn');
    expect(await screen.findByTestId('home-screen', undefined, SPIN_DONE)).toBeOnTheScreen();
    expect(acknowledged(fake)).toEqual([{ p_ids: ['t-manor'] }]);
  });

  it('Brutal: a screen reader confirms with the activate action', async () => {
    const fake = start({ profile: { pain_level: 'brutal' } });
    fireEvent(await screen.findByTestId('moment-confirm'), 'accessibilityAction', {
      nativeEvent: { actionName: 'activate' },
    });
    expect(await screen.findByTestId('home-screen')).toBeOnTheScreen();
    expect(acknowledged(fake)).toEqual([{ p_ids: ['t-manor'] }]);
  });

  it('queues several purchases one at a time, oldest first', async () => {
    const fake = start({ moments: [MANOR, OVER_BUDGET_MOMENT] });
    expect(await screen.findByTestId('moment-position')).toHaveTextContent('1 of 2');
    expect(screen.getByTestId('moment-merchant')).toHaveTextContent('Manor');
    fireEvent.press(screen.getByTestId('moment-confirm'));
    expect(await screen.findByText('2 of 2')).toBeOnTheScreen();
    expect(screen.getByTestId('moment-merchant')).toHaveTextContent('Zeughauskeller');
    expect(screen.queryByTestId('moment-show-all')).toBeNull();
    fireEvent.press(screen.getByTestId('moment-confirm'));
    expect(await screen.findByTestId('home-screen')).toBeOnTheScreen();
    expect(acknowledged(fake)).toEqual([{ p_ids: ['t-manor'] }, { p_ids: ['t-dinner'] }]);
  });

  it('"Show all" sums them up and confirms them together', async () => {
    const fake = start({ moments: [MANOR, OVER_BUDGET_MOMENT] });
    fireEvent.press(await screen.findByTestId('moment-show-all'));
    expect(await screen.findByText('2 purchases to confirm')).toBeOnTheScreen();
    expect(screen.getByTestId('moment-summary-total')).toHaveTextContent('Together: CHF -148.00');
    expect(screen.getByTestId('moment-summary-over')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('moment-one-at-a-time'));
    fireEvent.press(await screen.findByTestId('moment-show-all'));
    fireEvent.press(await screen.findByTestId('moment-confirm-all'));
    expect(await screen.findByTestId('home-screen')).toBeOnTheScreen();
    expect(acknowledged(fake)).toEqual([{ p_ids: ['t-manor', 't-dinner'] }]);
  });

  it('a push for one purchase shows that one first', async () => {
    start({ url: '/moment?transaction=t-dinner', moments: [MANOR, OVER_BUDGET_MOMENT] });
    expect(await screen.findByTestId('moment-merchant')).toHaveTextContent('Zeughauskeller');
    expect(screen.getByTestId('moment-position')).toHaveTextContent('1 of 2');
  });

  it('a push for a purchase already confirmed opens the purchase', async () => {
    const fake = start({
      url: '/moment?transaction=t-old',
      moments: [MANOR],
      rpc: {
        get_transaction: () => ok(transactionJson({ id: 't-old', merchant: 'Coop' })),
      },
    });
    await waitFor(() => expect(fake.getPathname()).toBe('/transaction/t-old'));
  });

  it('says when nothing is waiting', async () => {
    start({ moments: [] });
    expect(await screen.findByTestId('moment-nothing')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('moment-done'));
    expect(await screen.findByTestId('home-screen')).toBeOnTheScreen();
  });

  it('keeps the moment open when confirming fails', async () => {
    start({ acknowledge: () => refused('network') });
    fireEvent.press(await screen.findByTestId('moment-confirm'));
    expect(await screen.findByTestId('moment-error')).toBeOnTheScreen();
    expect(screen.getByTestId('moment-merchant')).toBeOnTheScreen();
  });

  it('offers a retry when the purchases cannot be loaded', async () => {
    let fail = true;
    start({
      rpc: { pending_moments: () => (fail ? refused('boom') : ok([MANOR])) },
    });
    const retry = await screen.findByTestId('moment-load-error-action', undefined, SPIN_DONE);
    fail = false;
    fireEvent.press(retry);
    expect(await screen.findByTestId('moment-merchant')).toBeOnTheScreen();
  });
});

describe('when the moment opens', () => {
  it('opens by itself when the app starts with purchases waiting', async () => {
    start({ url: '/' });
    expect(await screen.findByTestId('moment-merchant')).toHaveTextContent('Manor');
  });

  it('opens right after quick add', async () => {
    const moments: unknown[] = [];
    const fake = startApp({
      url: '/add',
      profile: WORKER,
      rpc: {
        pending_moments: () => ok(moments),
        acknowledge_transactions: () => ok(null),
        add_transactions: () => {
          moments.push(MANOR);
          return ok({
            data_source_id: null,
            results: [
              {
                index: 0,
                outcome: 'added',
                transaction_id: 't-manor',
                duplicate_of: null,
                category_id: 'c-groceries',
                categorized_by: 'user',
                category_confidence: 100,
                fixed_cost_id: null,
                needs_review: false,
              },
            ],
            counts: {
              added: 1,
              merged: 0,
              already_imported: 0,
              possible_duplicate: 0,
              needs_review: 0,
            },
          });
        },
      },
    });
    fireEvent.changeText(await screen.findByTestId('add-amount'), '84');
    fireEvent.press(await screen.findByTestId('add-category-groceries'));
    fireEvent.press(screen.getByTestId('add-save'));
    expect(await screen.findByTestId('moment-merchant')).toHaveTextContent('Manor');
    fireEvent.press(screen.getByTestId('moment-confirm'));
    await waitFor(() => expect(fake.getPathname()).toBe('/'));
  });
});

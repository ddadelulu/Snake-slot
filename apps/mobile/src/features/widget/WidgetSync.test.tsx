import { render } from '@testing-library/react-native';

import { parseOverview, toHomeModel } from '@/data/overview';
import { OVERVIEW_JSON } from '@/test/overviewFixture';

import type { WidgetSnapshot } from './snapshot';
import { WidgetSync } from './WidgetSync';

const mockAuth = { status: 'signed_in' as string };
const mockOverview: { isSuccess: boolean; data: unknown } = { isSuccess: false, data: undefined };
const mockStorage = { supported: true, write: jest.fn(async (_snapshot: WidgetSnapshot) => {}) };

jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => mockAuth }));
jest.mock('@/data/overview', () => ({
  ...jest.requireActual('@/data/overview'),
  useOverview: () => mockOverview,
}));
jest.mock('@/i18n', () => ({
  ...jest.requireActual('@/i18n'),
  useLanguage: () => ({ language: 'en' }),
}));
jest.mock('./widgetStorage', () => ({
  get WIDGETS_SUPPORTED() {
    return mockStorage.supported;
  },
  writeWidgetSnapshot: (snapshot: WidgetSnapshot) => mockStorage.write(snapshot),
}));

const home = toHomeModel(parseOverview(OVERVIEW_JSON)!);
const written = () => mockStorage.write.mock.calls.map(([snapshot]) => snapshot);

beforeEach(() => {
  mockStorage.supported = true;
  mockStorage.write.mockClear();
  mockAuth.status = 'signed_in';
  Object.assign(mockOverview, { isSuccess: false, data: undefined });
});

describe('WidgetSync', () => {
  it('writes the numbers after a successful overview fetch, once per change', () => {
    const screen = render(<WidgetSync />);
    expect(mockStorage.write).not.toHaveBeenCalled();

    Object.assign(mockOverview, { isSuccess: true, data: home });
    screen.rerender(<WidgetSync />);
    expect(written()).toHaveLength(1);
    expect(written()[0]).toMatchObject({ state: 'ready', balanceText: 'CHF 2,759.50' });

    // A refetch with the same numbers (new object) changes nothing on the home screen.
    Object.assign(mockOverview, { data: toHomeModel(parseOverview(OVERVIEW_JSON)!) });
    screen.rerender(<WidgetSync />);
    expect(written()).toHaveLength(1);

    Object.assign(mockOverview, {
      data: toHomeModel(parseOverview({ ...OVERVIEW_JSON, today: '2026-10-03' })!),
    });
    screen.rerender(<WidgetSync />);
    expect(written()).toHaveLength(2);
    expect(written()[1]).toMatchObject({ daysText: '22' });
  });

  it('replaces the numbers with a neutral state on sign-out', () => {
    Object.assign(mockOverview, { isSuccess: true, data: home });
    const screen = render(<WidgetSync />);
    mockAuth.status = 'signed_out';
    Object.assign(mockOverview, { isSuccess: false, data: undefined });
    screen.rerender(<WidgetSync />);
    expect(written().map((s) => s.state)).toEqual(['ready', 'signed_out']);
    expect(written()[1]).toMatchObject({ balanceText: null, message: 'Open Batzen', days: [] });
  });

  it('writes nothing while the auth state is loading', () => {
    mockAuth.status = 'loading';
    render(<WidgetSync />);
    expect(mockStorage.write).not.toHaveBeenCalled();
  });

  it('is a no-op on the web', () => {
    mockStorage.supported = false;
    Object.assign(mockOverview, { isSuccess: true, data: home });
    render(<WidgetSync />);
    mockAuth.status = 'signed_out';
    render(<WidgetSync />);
    expect(mockStorage.write).not.toHaveBeenCalled();
  });
});

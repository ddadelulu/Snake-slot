import AsyncStorage from '@react-native-async-storage/async-storage';

import { neutralSnapshot } from './snapshot';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { widget: { appGroup: 'group.com.example.batzen' } } } },
}));

jest.mock('@bacons/apple-targets', () => {
  const set = jest.fn();
  const ExtensionStorage = jest.fn(() => ({ set }));
  Object.assign(ExtensionStorage, { reloadWidget: jest.fn(), __set: set });
  return { ExtensionStorage };
});

jest.mock('react-native-android-widget', () => ({
  ...jest.requireActual('react-native-android-widget'),
  requestWidgetUpdate: jest.fn(async () => undefined),
}));

const snapshot = neutralSnapshot('signed_out', 'en', new Date('2026-10-02T08:00:00Z'));

describe('widget storage', () => {
  beforeEach(() => jest.clearAllMocks());

  it('iOS: writes the JSON to the App Group and reloads the WidgetKit timeline', async () => {
    const { ExtensionStorage } = jest.requireMock('@bacons/apple-targets');
    const ios = require('./widgetStorage.ios') as typeof import('./widgetStorage.ios');
    expect(ios.WIDGETS_SUPPORTED).toBe(true);
    await ios.writeWidgetSnapshot(snapshot);
    expect(ExtensionStorage).toHaveBeenCalledWith('group.com.example.batzen');
    expect(ExtensionStorage.__set).toHaveBeenCalledWith(
      'batzen.widget.snapshot',
      JSON.stringify(snapshot),
    );
    expect(ExtensionStorage.reloadWidget).toHaveBeenCalledWith('BatzenWidget');
  });

  it('Android: keeps the JSON for the background renderer and redraws both sizes', async () => {
    const { requestWidgetUpdate } = jest.requireMock('react-native-android-widget');
    const android = require('./widgetStorage.android') as typeof import('./widgetStorage.android');
    await android.writeWidgetSnapshot(snapshot);
    expect(await AsyncStorage.getItem('batzen.widget.snapshot')).toBe(JSON.stringify(snapshot));
    expect(
      requestWidgetUpdate.mock.calls.map(([call]: [{ widgetName: string }]) => call.widgetName),
    ).toEqual(['BatzenSmall', 'BatzenMedium']);
    const rendered = await requestWidgetUpdate.mock.calls[0][0].renderWidget();
    expect(rendered).toHaveProperty('light');
    expect(rendered).toHaveProperty('dark');
  });

  it('web: does nothing', async () => {
    const web = require('./widgetStorage.web') as typeof import('./widgetStorage.web');
    const { ExtensionStorage } = jest.requireMock('@bacons/apple-targets');
    const { requestWidgetUpdate } = jest.requireMock('react-native-android-widget');
    expect(web.WIDGETS_SUPPORTED).toBe(false);
    await expect(web.writeWidgetSnapshot(snapshot)).resolves.toBeUndefined();
    expect(ExtensionStorage).not.toHaveBeenCalled();
    expect(requestWidgetUpdate).not.toHaveBeenCalled();
  });
});

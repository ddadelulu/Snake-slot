import AsyncStorage from '@react-native-async-storage/async-storage';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { FlexWidget, TextWidget, type WidgetTaskHandlerProps } from 'react-native-android-widget';

import { parseOverview, toHomeModel } from '@/data/overview';
import { darkTheme, lightTheme } from '@/theme/tokens';
import { OVERVIEW_JSON } from '@/test/overviewFixture';

import { buildWidgetSnapshot, neutralSnapshot, type WidgetSnapshot } from '../snapshot';
import { renderBatzenWidget } from './renderBatzenWidget';
import { widgetTaskHandler } from './widgetTaskHandler';

jest.mock('@/i18n/format', () => ({
  ...jest.requireActual('@/i18n/format'),
  deviceTimeZone: () => 'Europe/Zurich',
}));

type Props = Record<string, unknown> & { children?: ReactNode };
type Node = { type: string; props: Props };

/** Expands the widget's own components down to FlexWidget / TextWidget nodes. */
function flatten(node: ReactNode): Node[] {
  if (Array.isArray(node)) return node.flatMap(flatten);
  if (!isValidElement(node)) return [];
  const element = node as ReactElement<Props>;
  if (element.type === FlexWidget || element.type === TextWidget) {
    const name = element.type === FlexWidget ? 'Flex' : 'Text';
    return [{ type: name, props: element.props }, ...flatten(element.props.children)];
  }
  return flatten((element.type as (props: Props) => ReactNode)(element.props));
}

const texts = (node: ReactNode) =>
  flatten(node)
    .filter((n) => n.type === 'Text')
    .map((n) => n.props.text);

const NOW = new Date('2026-10-02T08:00:00Z');
const ready = buildWidgetSnapshot(toHomeModel(parseOverview(OVERVIEW_JSON)!), 'de', NOW);

describe('Android widget', () => {
  it('shows balance, per day, days until payday and a "+" that opens quick add', () => {
    const { light } = renderBatzenWidget('BatzenMedium', ready, NOW) as {
      light: ReactElement;
    };
    expect(texts(light)).toEqual([
      'CHF 2’759.50',
      'übrig diesen Monat',
      '+',
      'CHF 119.97 pro Tag',
      '23 Tage bis zum Zahltag',
    ]);
    const nodes = flatten(light);
    expect(nodes[0]!.props.clickAction).toBe('OPEN_APP');
    expect(nodes.find((n) => n.props.clickAction === 'OPEN_URI')!.props).toMatchObject({
      clickActionData: { uri: 'batzen://add' },
      accessibilityLabel: 'Ausgabe erfassen',
    });
  });

  it('draws light and dark versions with the design tokens', () => {
    const { light, dark } = renderBatzenWidget('BatzenSmall', ready, NOW) as {
      light: ReactElement;
      dark: ReactElement;
    };
    const background = (el: ReactElement) =>
      (flatten(el)[0]!.props.style as { backgroundColor: string }).backgroundColor;
    expect(background(light)).toBe(lightTheme.colors.surface);
    expect(background(dark)).toBe(darkTheme.colors.surface);
  });

  it('moves on to the next day after midnight and hides numbers from payday on', () => {
    const tomorrow = renderBatzenWidget('BatzenSmall', ready, new Date('2026-10-02T22:30:00Z'));
    expect(texts((tomorrow as { light: ReactElement }).light)).toContain('22 Tage bis zum Zahltag');
    const payday = renderBatzenWidget('BatzenSmall', ready, new Date('2026-10-25T06:00:00Z'));
    expect(texts((payday as { light: ReactElement }).light)).toEqual([
      'Neuer Monat: Batzen öffnen',
      '+',
    ]);
  });

  describe('task handler', () => {
    const run = async (stored: WidgetSnapshot | string | null) => {
      if (stored === null) await AsyncStorage.removeItem('batzen.widget.snapshot');
      else
        await AsyncStorage.setItem(
          'batzen.widget.snapshot',
          typeof stored === 'string' ? stored : JSON.stringify(stored),
        );
      const renderWidget = jest.fn();
      await widgetTaskHandler({
        widgetAction: 'WIDGET_UPDATE',
        widgetInfo: { widgetName: 'BatzenSmall' },
        renderWidget,
      } as unknown as WidgetTaskHandlerProps);
      return renderWidget;
    };

    it('draws the stored snapshot (neutral after sign-out)', async () => {
      const renderWidget = await run(neutralSnapshot('signed_out', 'en', NOW));
      expect(texts(renderWidget.mock.calls[0][0].light)).toEqual(['Open Batzen', '+']);
    });

    it('draws the app name when nothing readable is stored', async () => {
      expect(texts((await run('garbage')).mock.calls[0][0].light)).toEqual(['Batzen', '+']);
      expect(texts((await run(null)).mock.calls[0][0].light)).toEqual(['Batzen', '+']);
    });

    it('ignores deletions', async () => {
      const renderWidget = jest.fn();
      await widgetTaskHandler({
        widgetAction: 'WIDGET_DELETED',
        widgetInfo: { widgetName: 'BatzenSmall' },
        renderWidget,
      } as unknown as WidgetTaskHandlerProps);
      expect(renderWidget).not.toHaveBeenCalled();
    });
  });
});

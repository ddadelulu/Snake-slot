import { FlexWidget, TextWidget, type HexColor } from 'react-native-android-widget';

import type { ColorRoles } from '@/theme/tokens';

import type { WidgetView } from '../snapshot';

/**
 * The Android home-screen widget (react-native-android-widget turns this JSX into RemoteViews).
 * Small (2×2): balance, per day, days until payday. Medium (4×2): the same with more room. The
 * "+" opens quick add through the app's deep link; the rest of the widget opens the app.
 */

export type BatzenWidgetSize = 'small' | 'medium';

type Props = { size: BatzenWidgetSize; view: WidgetView; colors: ColorRoles };

const hex = (color: string) => color as HexColor;

function AddButton({
  view,
  colors,
  label,
}: {
  view: WidgetView;
  colors: ColorRoles;
  label: string;
}) {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: view.addUrl }}
      accessibilityLabel={label}
      style={{
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: hex(colors.accent),
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <TextWidget text="+" style={{ fontSize: 24, color: hex(colors.textOnAccent) }} />
    </FlexWidget>
  );
}

export function BatzenWidget({ size, view, colors }: Props) {
  const addLabel = view.kind === 'numbers' ? view.labels.add : '+';
  const secondary = { color: hex(colors.textSecondary), fontSize: 13 } as const;
  const primary = { color: hex(colors.textPrimary), fontWeight: '600' } as const;

  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        width: 'match_parent',
        height: 'match_parent',
        backgroundColor: hex(colors.surface),
        borderRadius: 22,
        padding: 14,
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      <FlexWidget
        style={{ width: 'match_parent', flexDirection: 'row', justifyContent: 'space-between' }}
      >
        {view.kind === 'numbers' ? (
          <FlexWidget style={{ flex: 1, flexDirection: 'column' }}>
            <TextWidget
              text={view.day.balanceText}
              maxLines={1}
              style={{
                fontSize: size === 'small' ? 20 : 26,
                fontWeight: '700',
                color: hex(view.day.overspent ? colors.statusDanger : colors.textPrimary),
              }}
            />
            <TextWidget text={view.labels.balance} maxLines={1} style={secondary} />
          </FlexWidget>
        ) : (
          <TextWidget
            text={view.message}
            maxLines={3}
            style={{ ...primary, fontSize: 16, width: size === 'small' ? 90 : 220 }}
          />
        )}
        <AddButton view={view} colors={colors} label={addLabel} />
      </FlexWidget>
      {view.kind === 'numbers' ? (
        <FlexWidget
          style={{
            width: 'match_parent',
            flexDirection: size === 'small' ? 'column' : 'row',
            justifyContent: 'space-between',
          }}
        >
          <TextWidget
            text={`${view.day.perDayText} ${view.labels.perDay}`}
            maxLines={1}
            style={{ ...primary, fontSize: 14 }}
          />
          <TextWidget
            text={`${view.day.daysText} ${view.day.daysLabel}`}
            maxLines={1}
            style={secondary}
          />
        </FlexWidget>
      ) : null}
    </FlexWidget>
  );
}

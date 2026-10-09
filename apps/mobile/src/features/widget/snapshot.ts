import {
  APP_NAME,
  APP_SCHEME,
  addDays,
  compareLocalDates,
  formatChf,
  isLocalDate,
  type Language,
  type LocalDate,
} from '@budget/core';

import { toHomeModel, type HomeModel } from '@/data/overview';
import { i18n, isLanguage } from '@/i18n';

/**
 * The home-screen widget's data (M4-10, docs/WIDGETS.md). The app formats every number and label
 * here, with the same `formatChf` and translations as the home screen, so the native widgets
 * (SwiftUI on iOS, react-native-android-widget on Android) only place strings and never compute
 * money themselves.
 *
 * `days` holds one entry per calendar day from today until the day before payday, computed by
 * the shared engine as if nothing else were spent. The widgets show the entry for the current
 * day, so "per day" and "days until payday" stay right at midnight without the app running; once
 * the last day has passed (payday), they show "new month: open Batzen" instead of old numbers.
 */

export const WIDGET_SNAPSHOT_VERSION = 1;

/** The quick add screen (`src/app/add.tsx`), opened by the widgets' "+". */
export const WIDGET_ADD_URL = `${APP_SCHEME}://add`;

export type WidgetDay = {
  /** Local calendar date this entry is for, `YYYY-MM-DD`. */
  date: LocalDate;
  balanceText: string;
  perDayText: string;
  /** The number of days until payday, e.g. "12". */
  daysText: string;
  /** "days until payday" / "Tage bis zum Zahltag", pluralised for `daysText`. */
  daysLabel: string;
  /** Balance below zero: the widgets show it in the danger colour. */
  overspent: boolean;
};

export type WidgetLabels = {
  balance: string;
  perDay: string;
  add: string;
  open: string;
  newMonth: string;
};

export type WidgetState = 'ready' | 'empty' | 'signed_out';

export type WidgetSnapshot = {
  version: typeof WIDGET_SNAPSHOT_VERSION;
  /** ready: numbers below; empty: signed in without a current month; signed_out: no data. */
  state: WidgetState;
  language: Language;
  /** When the app wrote this snapshot (ISO instant). */
  updatedAt: string;
  /** Today's values (the first entry of `days`), null unless `state` is "ready". */
  balanceText: string | null;
  perDayText: string | null;
  daysText: string | null;
  daysLabel: string | null;
  /** The neutral text shown instead of numbers ("Open Batzen"); null when `state` is "ready". */
  message: string | null;
  labels: WidgetLabels;
  addUrl: string;
  days: WidgetDay[];
};

function labelsFor(language: Language): WidgetLabels {
  const t = i18n.getFixedT(language);
  return {
    balance: t('home.balanceLabel'),
    perDay: t('home.perDay'),
    add: t('widget.add'),
    open: t('widget.open'),
    newMonth: t('widget.newMonth'),
  };
}

function base(language: Language, now: Date) {
  return {
    version: WIDGET_SNAPSHOT_VERSION,
    language,
    updatedAt: now.toISOString(),
    labels: labelsFor(language),
    addUrl: WIDGET_ADD_URL,
  } as const;
}

/** The snapshot after an overview fetch; `home` null means no current month yet. */
export function buildWidgetSnapshot(
  home: HomeModel | null,
  language: Language,
  now: Date = new Date(),
): WidgetSnapshot {
  if (!home) return neutralSnapshot('empty', language, now);
  const t = i18n.getFixedT(language);
  const { data } = home;
  const days: WidgetDay[] = [];
  for (
    let date = data.today;
    compareLocalDates(date, data.period.endsOn) < 0;
    date = addDays(date, 1)
  ) {
    const overview =
      date === data.today ? home.overview : toHomeModel({ ...data, today: date }).overview;
    days.push({
      date,
      balanceText: formatChf(overview.balanceRappen, { language }),
      perDayText: formatChf(overview.dailyAllowanceRappen, { language }),
      daysText: String(overview.daysUntilPayday),
      daysLabel: t('home.daysUntilPayday', { count: overview.daysUntilPayday }),
      overspent: overview.balanceRappen < 0,
    });
  }
  const today = days[0];
  if (!today) return neutralSnapshot('empty', language, now);
  return {
    ...base(language, now),
    state: 'ready',
    balanceText: today.balanceText,
    perDayText: today.perDayText,
    daysText: today.daysText,
    daysLabel: today.daysLabel,
    message: null,
    days,
  };
}

/** No numbers: after sign-out (nothing financial stays on the home screen) or before setup. */
export function neutralSnapshot(
  state: Exclude<WidgetState, 'ready'>,
  language: Language,
  now: Date = new Date(),
): WidgetSnapshot {
  const t = i18n.getFixedT(language);
  return {
    ...base(language, now),
    state,
    balanceText: null,
    perDayText: null,
    daysText: null,
    daysLabel: null,
    message: state === 'signed_out' ? t('widget.open') : t('widget.setUp'),
    days: [],
  };
}

/** The snapshot without its timestamp, to skip writes that would change nothing on screen. */
export function snapshotContent(snapshot: WidgetSnapshot): string {
  const { updatedAt: _updatedAt, ...content } = snapshot;
  return JSON.stringify(content);
}

/** Reads a stored snapshot; anything unreadable or from another version counts as none. */
export function parseWidgetSnapshot(json: string | null | undefined): WidgetSnapshot | null {
  if (!json) return null;
  try {
    const value = JSON.parse(json) as Partial<WidgetSnapshot> | null;
    if (
      !value ||
      value.version !== WIDGET_SNAPSHOT_VERSION ||
      !isLanguage(value.language) ||
      !Array.isArray(value.days) ||
      !value.days.every((day) => isLocalDate(day?.date)) ||
      typeof value.labels !== 'object' ||
      value.labels === null
    ) {
      return null;
    }
    return value as WidgetSnapshot;
  } catch {
    return null;
  }
}

export type WidgetView =
  | { kind: 'numbers'; day: WidgetDay; labels: WidgetLabels; addUrl: string }
  | { kind: 'message'; message: string; addUrl: string };

/**
 * What a widget shows on `today` (the device's local date). The same rule is implemented in
 * Swift for iOS (`targets/widget/BatzenWidget.swift`); Android renders through this function.
 */
export function widgetView(snapshot: WidgetSnapshot | null, today: LocalDate): WidgetView {
  if (!snapshot) return { kind: 'message', message: APP_NAME, addUrl: WIDGET_ADD_URL };
  if (snapshot.state !== 'ready' || snapshot.days.length === 0) {
    return {
      kind: 'message',
      message: snapshot.message ?? snapshot.labels.open,
      addUrl: snapshot.addUrl,
    };
  }
  const first = snapshot.days[0]!;
  const day =
    snapshot.days.find((entry) => entry.date === today) ??
    (compareLocalDates(today, first.date) < 0 ? first : undefined);
  if (!day) return { kind: 'message', message: snapshot.labels.newMonth, addUrl: snapshot.addUrl };
  return { kind: 'numbers', day, labels: snapshot.labels, addUrl: snapshot.addUrl };
}

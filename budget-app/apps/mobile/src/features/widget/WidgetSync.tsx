import { useEffect, useMemo, useRef } from 'react';

import { useOverview } from '@/data/overview';
import { useAuth } from '@/features/auth/AuthProvider';
import { useLanguage } from '@/i18n';

import {
  buildWidgetSnapshot,
  neutralSnapshot,
  snapshotContent,
  type WidgetSnapshot,
} from './snapshot';
import { WIDGETS_SUPPORTED, writeWidgetSnapshot } from './widgetStorage';

/**
 * Keeps the home-screen widgets in step with the app (M4-10): after every successful overview
 * fetch (app start, foreground, every booking that invalidates the overview) the widgets get the
 * new numbers; after sign-out they get a neutral "Open Batzen" without any amounts. Renders
 * nothing; mounted once in the root layout. A no-op on the web.
 */
export function WidgetSync() {
  return WIDGETS_SUPPORTED ? <WidgetSyncEffect /> : null;
}

function WidgetSyncEffect() {
  const { status } = useAuth();
  const { language } = useLanguage();
  const overview = useOverview();
  const lastWritten = useRef<string | null>(null);

  const { isSuccess, data } = overview;
  const snapshot = useMemo<WidgetSnapshot | null>(() => {
    if (status === 'signed_out') return neutralSnapshot('signed_out', language);
    if (status === 'signed_in' && isSuccess) return buildWidgetSnapshot(data ?? null, language);
    return null;
  }, [status, isSuccess, data, language]);
  const content = snapshot ? snapshotContent(snapshot) : null;

  useEffect(() => {
    if (!snapshot || !content || content === lastWritten.current) return;
    lastWritten.current = content;
    // A failed write leaves the previous widget in place; the next fetch tries again.
    writeWidgetSnapshot(snapshot).catch(() => {
      if (lastWritten.current === content) lastWritten.current = null;
    });
    // `content` captures everything in `snapshot` except the timestamp.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

  return null;
}

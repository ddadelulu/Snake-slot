import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * One-off messages that outlive the screen that caused them, e.g. "Your account has been
 * deleted" on the sign-in screen the app falls back to after the deletion.
 */
export type AuthNotice = 'account_deleted' | 'password_updated';

type AuthNoticeContextValue = {
  notice: AuthNotice | null;
  showNotice: (notice: AuthNotice) => void;
  clearNotice: () => void;
};

const AuthNoticeContext = createContext<AuthNoticeContextValue | null>(null);

export function AuthNoticeProvider({ children }: { children: ReactNode }) {
  const [notice, setNotice] = useState<AuthNotice | null>(null);
  const showNotice = useCallback((next: AuthNotice) => setNotice(next), []);
  const clearNotice = useCallback(() => setNotice(null), []);
  const value = useMemo(
    () => ({ notice, showNotice, clearNotice }),
    [notice, showNotice, clearNotice],
  );
  return <AuthNoticeContext.Provider value={value}>{children}</AuthNoticeContext.Provider>;
}

export function useAuthNotice(): AuthNoticeContextValue {
  const value = useContext(AuthNoticeContext);
  if (!value) throw new Error('useAuthNotice() must be used inside <AuthNoticeProvider>.');
  return value;
}

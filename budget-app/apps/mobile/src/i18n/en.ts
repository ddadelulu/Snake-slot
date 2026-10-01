/**
 * English strings. This catalogue defines the shape every other language must match (see
 * `de.ts`); the type checker rejects a missing or extra key. Plurals use i18next's `_one` /
 * `_other` suffixes.
 */
export const en = {
  common: {
    cancel: 'Cancel',
    close: 'Close',
    continue: 'Continue',
    retry: 'Try again',
    show: 'Show',
    hide: 'Hide',
    dismiss: 'Dismiss',
    or: 'or',
    version: 'Version {{version}}',
  },
  config: {
    title: 'The app is not configured',
    message:
      'This build has no connection to its server. Set the variables below and restart the app (see the setup guide).',
  },
  auth: {
    tagline: 'Every franc, felt.',
    email: 'Email',
    password: 'Password',
    newPassword: 'New password',
    passwordHint: 'At least 10 characters.',
    signIn: {
      title: 'Welcome back',
      submit: 'Sign in',
      forgotPassword: 'Forgot password?',
      noAccount: 'New here?',
      createAccount: 'Create an account',
    },
    signUp: {
      title: 'Create your account',
      subtitle: 'Set up your month once. We keep count of every franc after that.',
      submit: 'Create account',
      haveAccount: 'Already have an account?',
      signIn: 'Sign in',
    },
    providers: {
      google: 'Continue with Google',
      apple: 'Continue with Apple',
    },
    checkEmail: {
      title: 'Check your inbox',
      message:
        'We sent a confirmation link to {{email}}. Open it on this phone to finish creating your account.',
      resend: 'Send the link again',
      resent: 'A new link is on its way.',
      backToSignIn: 'Back to sign in',
    },
    forgotPassword: {
      title: 'Reset your password',
      message:
        'Enter the email you signed up with and we will send you a link to choose a new password.',
      submit: 'Send link',
      sent: 'If {{email}} has an account, a reset link is on its way. Open it on this phone.',
      backToSignIn: 'Back to sign in',
    },
    resetPassword: {
      title: 'Choose a new password',
      message: 'You are signed in through the reset link. Pick a new password to continue.',
      submit: 'Save password',
      cancel: 'Cancel and sign out',
    },
    callback: {
      working: 'Signing you in…',
      failedTitle: 'That link did not work',
    },
    notices: {
      accountDeleted: 'Your account and all its data have been deleted.',
      passwordUpdated: 'Your new password is saved.',
    },
    validation: {
      email_required: 'Enter your email address.',
      email_invalid: 'That does not look like an email address.',
      password_required: 'Enter your password.',
      password_too_short: 'Use at least 10 characters.',
      password_too_long: 'That password is too long. Use at most 72 characters.',
    },
    errors: {
      invalid_credentials: 'Email or password is wrong.',
      email_not_confirmed: 'Please confirm your email first. We can send the link again.',
      user_already_exists: 'There is already an account with this email. Sign in instead.',
      weak_password: 'Choose a stronger password that is not easy to guess.',
      rate_limited: 'Too many attempts. Wait a minute and try again.',
      network: 'No connection to the server. Check your internet and try again.',
      provider_disabled: 'This sign-in method is not available right now.',
      signup_disabled: 'New accounts cannot be created right now.',
      session_expired: 'You were signed out. Please sign in again.',
      link_invalid:
        'The link has expired, was already used or was opened on another device. Request a new one, or sign in if you already confirmed your email.',
      unknown: 'Something went wrong. Please try again.',
    },
  },
  tabs: {
    home: 'Home',
    transactions: 'Transactions',
    assistant: 'AI',
    insights: 'Insights',
    settings: 'Settings',
  },
  home: {
    emptyTitle: 'Your month starts here',
    emptyMessage:
      'Once your income, fixed costs and budgets are set, your balance and categories show up here.',
  },
  transactions: {
    emptyTitle: 'No transactions yet',
    emptyMessage: 'Purchases show up here as soon as they are tracked.',
  },
  assistant: {
    emptyTitle: 'Ask about your money',
    emptyMessage:
      'Your assistant answers only from your own budgets and transactions, so it has nothing to work with yet.',
  },
  insights: {
    emptyTitle: 'Nothing to compare yet',
    emptyMessage:
      'Spending per category, month against month and top merchants appear after your first transactions.',
  },
  settings: {
    title: 'Settings',
    account: 'Account',
    signedInAs: 'Signed in as',
    signOut: 'Sign out',
    deleteAccount: 'Delete account',
    preferences: 'Preferences',
    language: 'Language',
    appearance: 'Appearance',
    appearanceOptions: {
      system: 'Same as phone',
      light: 'Light',
      dark: 'Dark',
    },
    about: 'About',
    environment: 'Environment: {{environment}}',
    signOutFailed: 'Signing out did not work. Please try again.',
    deleteSheet: {
      title: 'Delete your account?',
      message:
        'This permanently deletes your account and everything in it: income, budgets, transactions, connected sources and settings. It cannot be undone.',
      confirm: 'Delete everything',
      cancel: 'Keep my account',
    },
  },
  languageNames: {
    de: 'Deutsch',
    en: 'English',
  },
  notFound: {
    title: 'Page not found',
    home: 'Go to Home',
  },
} as const;

type Widen<T> = { readonly [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };

/** The shape every language catalogue implements. */
export type Translations = Widen<typeof en>;

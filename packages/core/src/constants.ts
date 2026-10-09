/**
 * Domain vocabularies shared by the app, the database and the backend.
 *
 * Every list here is mirrored by a CHECK constraint in `supabase/migrations`. The database test
 * `contracts.test.ts` fails if the two drift apart, so change both together (through the
 * architect, see docs/ARCHITECTURE.md "Shared contracts").
 */

export const LANGUAGES = ['de', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = 'de';

/** Spec section 3, step 4: the default categories a user can pick during onboarding. */
export const DEFAULT_CATEGORY_KEYS = [
  'groceries',
  'eating_out',
  'clothes',
  'going_out',
  'transport',
  'hobbies',
  'personal_care',
  'gifts',
  'shopping_electronics',
  'other',
] as const;
export type DefaultCategoryKey = (typeof DEFAULT_CATEGORY_KEYS)[number];

/** Spec section 3, step 2. */
export const FIXED_COST_KINDS = [
  'rent',
  'health_insurance',
  'phone_internet',
  'transport',
  'other_insurance',
  'subscriptions',
  'tax_provision',
  'leasing_debts',
  'other',
] as const;
export type FixedCostKind = (typeof FIXED_COST_KINDS)[number];

/** Spec section 3, step 7: controls animation, sound, haptics and alert tone. */
export const PAIN_LEVELS = ['mild', 'normal', 'brutal'] as const;
export type PainLevel = (typeof PAIN_LEVELS)[number];

/** Spec section 4: what happens to money left over when the month resets on payday. */
export const LEFTOVER_POLICIES = ['rollover', 'savings', 'reset'] as const;
export type LeftoverPolicy = (typeof LEFTOVER_POLICIES)[number];

/** Spec section 3, step 6. */
export const PAYMENT_METHODS = ['card', 'twint', 'apple_pay', 'google_pay', 'cash'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Spec section 6: sources that need a connection (and a consent record). */
export const DATA_SOURCE_KINDS = [
  'bank',
  'android_notification',
  'ios_shortcut',
  'email',
  'receipt',
  'statement_import',
] as const;
export type DataSourceKind = (typeof DATA_SOURCE_KINDS)[number];

export const DATA_SOURCE_STATUSES = [
  'pending',
  'active',
  'reconnect_required',
  'error',
  'revoked',
] as const;
export type DataSourceStatus = (typeof DATA_SOURCE_STATUSES)[number];

/** Where a transaction came from: every connected source plus manual entry and the assistant. */
export const TRANSACTION_SOURCES = [...DATA_SOURCE_KINDS, 'manual', 'assistant'] as const;
export type TransactionSource = (typeof TRANSACTION_SOURCES)[number];

/**
 * Spec section 7: categorization order is user rules, known merchants, MCC, AI guess. Money in is
 * never placed by those; `refund` is the category of the purchase it returns, as a guess that is
 * asked about (D-039).
 */
export const CATEGORIZED_BY = [
  'none',
  'user',
  'rule',
  'merchant_list',
  'mcc',
  'ai',
  'refund',
] as const;
export type CategorizedBy = (typeof CATEGORIZED_BY)[number];

/**
 * A category guess below this confidence (0-100) is shown as a question ("CHF 84 at Manor: what
 * was it?"); the database uses the same number for `needs_review`.
 */
export const REVIEW_CONFIDENCE = 70;

/** Most rows one `add_transactions` call (one statement file) may carry. */
export const MAX_ROWS_PER_IMPORT = 2000;

/** Largest statement file the app reads (bytes). */
export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;

export const RULE_MATCH_FIELDS = ['merchant', 'raw_text', 'mcc'] as const;
export type RuleMatchField = (typeof RULE_MATCH_FIELDS)[number];

export const RULE_MATCH_TYPES = ['equals', 'contains'] as const;
export type RuleMatchType = (typeof RULE_MATCH_TYPES)[number];

/** Spec section 9. */
export const ALERT_TYPES = [
  'category_50',
  'category_80',
  'category_100',
  'category_over',
  'total_low',
  'pace',
  'unusual_purchase',
  'daily_allowance',
  'payday',
  'weekly_review',
  'categorize',
  // Reminders (D-044): plan the new month on payday, the weekly check-in, no budget change in 30 days.
  'reminder_payday',
  'reminder_weekly',
  'reminder_stale',
] as const;
export type AlertType = (typeof ALERT_TYPES)[number];

export const SUBSCRIPTION_STATUSES = [
  'none',
  'trialing',
  'active',
  'grace_period',
  'billing_issue',
  'cancelled',
  'expired',
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const SUBSCRIPTION_STORES = ['app_store', 'play_store', 'promotional'] as const;
export type SubscriptionStore = (typeof SUBSCRIPTION_STORES)[number];

export const AI_MESSAGE_ROLES = ['user', 'assistant', 'tool'] as const;
export type AiMessageRole = (typeof AI_MESSAGE_ROLES)[number];

/** Spec section 15: consent is recorded per purpose, versioned and revocable. */
export const CONSENT_KINDS = [
  'terms',
  'privacy_policy',
  'data_source',
  'ai_processing',
  'email_access',
] as const;
export type ConsentKind = (typeof CONSENT_KINDS)[number];

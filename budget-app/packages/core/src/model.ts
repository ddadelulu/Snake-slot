import type {
  Language,
  LeftoverPolicy,
  PainLevel,
  PaymentMethod,
  SubscriptionStatus,
  SubscriptionStore,
} from './constants';
import type { Tables, TablesUpdate } from './database.types';

/**
 * Row types with their vocabulary columns narrowed from `string` to the shared unions.
 * `database.types.ts` is generated from the schema; these are the types app code should use.
 */
export type Profile = Omit<
  Tables<'profiles'>,
  'language' | 'pain_level' | 'leftover_policy' | 'payment_methods'
> & {
  language: Language;
  pain_level: PainLevel;
  leftover_policy: LeftoverPolicy;
  payment_methods: PaymentMethod[];
};

/** Fields a client may change on its own profile. */
export type ProfileUpdate = Omit<
  TablesUpdate<'profiles'>,
  | 'id'
  | 'created_at'
  | 'updated_at'
  | 'language'
  | 'pain_level'
  | 'leftover_policy'
  | 'payment_methods'
> & {
  language?: Language;
  pain_level?: PainLevel;
  leftover_policy?: LeftoverPolicy;
  payment_methods?: PaymentMethod[];
};

export type Subscription = Omit<Tables<'subscriptions'>, 'status' | 'store'> & {
  status: SubscriptionStatus;
  store: SubscriptionStore | null;
};

export type NotificationSettings = Tables<'notification_settings'>;

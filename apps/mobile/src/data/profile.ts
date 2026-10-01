import {
  DEFAULT_LANGUAGE,
  LANGUAGES,
  LEFTOVER_POLICIES,
  PAIN_LEVELS,
  PAYMENT_METHODS,
  type Profile,
  type ProfileUpdate,
  type Tables,
} from '@budget/core';
import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import { RequestError, toRequestError } from '@/lib/requestError';
import { getSupabase } from '@/lib/supabase';

/**
 * The signed-in user's profile (one row per user, created by the database on sign-up).
 * Row-level security limits every client to its own row; the queries also filter by id so they
 * never depend on that alone.
 */

export const profileKeys = {
  all: ['profile'] as const,
  detail: (userId: string) => ['profile', userId] as const,
};

function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

/**
 * Narrows a profiles row to Profile. The database CHECK constraints keep these columns inside the
 * shared vocabularies, but an older app version can meet a value added after it was released: it
 * then uses the column's database default (and drops unknown payment methods) instead of failing
 * to show the profile at all. Only changed fields are ever written back, so this does not
 * overwrite the stored value.
 */
export function toProfile(row: Tables<'profiles'>): Profile {
  return {
    ...row,
    language: isOneOf(LANGUAGES, row.language) ? row.language : DEFAULT_LANGUAGE,
    pain_level: isOneOf(PAIN_LEVELS, row.pain_level) ? row.pain_level : 'normal',
    leftover_policy: isOneOf(LEFTOVER_POLICIES, row.leftover_policy)
      ? row.leftover_policy
      : 'rollover',
    payment_methods: row.payment_methods.filter((method) => isOneOf(PAYMENT_METHODS, method)),
  };
}

export async function fetchProfile(userId: string): Promise<Profile> {
  const { data, error, status } = await getSupabase()
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) throw toRequestError({ error, status });
  return toProfile(data);
}

export async function updateProfile(userId: string, patch: ProfileUpdate): Promise<Profile> {
  const { data, error, status } = await getSupabase()
    .from('profiles')
    .update(patch)
    .eq('id', userId)
    .select('*')
    .single();
  if (error) throw toRequestError({ error, status });
  return toProfile(data);
}

/** The patch without keys set to undefined, so applying it never blanks a field. */
function definedFields(patch: ProfileUpdate): ProfileUpdate {
  const result: ProfileUpdate = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) Object.assign(result, { [key]: value });
  }
  return result;
}

/** The signed-in user's profile. Idle (no request) while nobody is signed in. */
export function useProfile() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  return useQuery({
    queryKey: userId ? profileKeys.detail(userId) : profileKeys.all,
    queryFn: userId ? () => fetchProfile(userId) : skipToken,
  });
}

type UpdateContext = { previous: Profile | undefined; key: readonly string[] };

/**
 * Updates the signed-in user's profile. The cached profile changes at once (optimistic update);
 * if the server rejects the change, the cache returns to its previous value and is refetched.
 * On success the cache holds the row as the server stored it.
 */
export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  return useMutation<Profile, Error, ProfileUpdate, UpdateContext>({
    mutationFn: (patch) => {
      if (!userId) return Promise.reject(new RequestError('Not signed in', 401, 'not_signed_in'));
      return updateProfile(userId, definedFields(patch));
    },
    onMutate: async (patch) => {
      const key = userId ? profileKeys.detail(userId) : profileKeys.all;
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Profile>(key);
      if (previous) {
        queryClient.setQueryData<Profile>(key, { ...previous, ...definedFields(patch) });
      }
      return { previous, key };
    },
    onError: (_error, _patch, context) => {
      if (!context) return;
      if (context.previous) queryClient.setQueryData<Profile>(context.key, context.previous);
      void queryClient.invalidateQueries({ queryKey: context.key });
    },
    onSuccess: (profile, _patch, context) => {
      queryClient.setQueryData<Profile>(context.key, profile);
    },
  });
}

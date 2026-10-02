import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { OnboardingPayload } from '@/features/onboarding/draft';
import { RequestError, toRequestError } from '@/lib/requestError';
import { getSupabase } from '@/lib/supabase';

import { overviewKeys } from './overview';
import { profileKeys } from './profile';

/**
 * Saves the questionnaire in one go (`public.complete_onboarding`): profile, fixed costs,
 * categories, the first month and its budgets. Either everything is stored or nothing.
 */
export async function completeOnboarding(payload: OnboardingPayload): Promise<string> {
  const { data, error, status } = await getSupabase().rpc('complete_onboarding', { p: payload });
  if (error) {
    // A second tap after a slow first one: the month already exists, which is what we wanted.
    if (error.message.includes('already_onboarded')) return '';
    throw toRequestError({ error, status });
  }
  if (typeof data !== 'string')
    throw new RequestError('complete_onboarding returned no period', status, '');
  return data;
}

export function useCompleteOnboarding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: completeOnboarding,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: profileKeys.all }),
        queryClient.invalidateQueries({ queryKey: overviewKeys.all }),
      ]);
    },
  });
}

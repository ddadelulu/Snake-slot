import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import { RequestError, toRequestError } from '@/lib/requestError';
import { getSupabase } from '@/lib/supabase';

import { jsonReader } from './json';
import { invalidateTransactionViews } from './transactions';

/** One imported statement file (a `data_sources` row of kind `statement_import`). */
export type StatementImport = {
  id: string;
  fileName: string;
  format: 'csv' | 'camt053';
  bank: string | null;
  added: number;
  merged: number;
  importedAt: string;
  /** True once the import was undone (its transactions removed). */
  removed: boolean;
};

const read = jsonReader('data_sources');

export function toStatementImport(json: unknown, index: number): StatementImport {
  const row = read.object(json, `imports[${index}]`);
  const at = (key: string) => `imports[${index}].${key}`;
  const settings = read.object(row.settings, at('settings'));
  return {
    id: read.text(row.id, at('id')),
    fileName:
      read.optionalText(settings.file_name, at('settings.file_name')) ??
      read.optionalText(row.display_name, at('display_name')) ??
      '',
    format: read.oneOf(['csv', 'camt053'] as const, settings.format, at('settings.format')),
    bank: read.optionalText(settings.bank, at('settings.bank')),
    added: read.integer(settings.added ?? 0, at('settings.added')),
    merged: read.integer(settings.merged ?? 0, at('settings.merged')),
    importedAt: read.text(row.created_at, at('created_at')),
    removed: read.text(row.status, at('status')) === 'revoked',
  };
}

export async function fetchImports(): Promise<StatementImport[]> {
  const { data, error, status } = await getSupabase()
    .from('data_sources')
    .select('id, display_name, status, settings, created_at')
    .eq('kind', 'statement_import')
    .order('created_at', { ascending: false });
  if (error) throw toRequestError({ error, status });
  return (data ?? []).map((row, index) => toStatementImport(row, index));
}

/** Undoes an import: its transactions are removed; returns how many. */
export async function removeImport(id: string): Promise<number> {
  const { data, error, status } = await getSupabase().rpc('remove_import', {
    p_data_source_id: id,
  });
  if (error) throw toRequestError({ error, status });
  if (typeof data !== 'number')
    throw new RequestError('remove_import returned no count', status, '');
  return data;
}

export const importKeys = {
  all: ['imports'] as const,
  list: (userId: string) => ['imports', userId] as const,
};

export function useImports() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  return useQuery({
    queryKey: userId ? importKeys.list(userId) : importKeys.all,
    queryFn: userId ? fetchImports : skipToken,
  });
}

export function useRemoveImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: removeImport,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: importKeys.all }),
        invalidateTransactionViews(queryClient),
      ]);
    },
  });
}

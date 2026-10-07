import { RequestError, toRequestError } from '@/lib/requestError';
import { getSupabase } from '@/lib/supabase';

/**
 * Everything stored about the signed-in user (`export_my_data`, docs/API.md): the source of both
 * exports in Settings, the transactions CSV and the complete JSON file.
 */
export type MyDataExport = Record<string, unknown> & {
  format_version: number;
  exported_at: string;
};

export async function fetchMyData(): Promise<MyDataExport> {
  const { data, error, status } = await getSupabase().rpc('export_my_data');
  if (error) throw toRequestError({ error, status });
  if (
    typeof data !== 'object' ||
    data === null ||
    Array.isArray(data) ||
    typeof (data as Record<string, unknown>).format_version !== 'number' ||
    typeof (data as Record<string, unknown>).exported_at !== 'string'
  ) {
    throw new RequestError('export_my_data returned an unexpected value', status, '');
  }
  return data as MyDataExport;
}

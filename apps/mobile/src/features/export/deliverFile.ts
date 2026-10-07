import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { isExportFileName, type ExportFile } from './exportFiles';

/** The phone offers no share sheet (some Android builds without a file-sharing app). */
export class SharingUnavailableError extends Error {
  constructor() {
    super('sharing is not available on this device');
    this.name = 'SharingUnavailableError';
  }
}

/** Shared through the share sheet (phones) or downloaded by the browser (web build). */
export type Delivery = 'shared' | 'downloaded';

/** How long the browser keeps the download's object URL (it only needs it for the click). */
const REVOKE_AFTER_MS = 1000;

/** Deletes a file if it is there; cleaning up must never fail an export. */
function deleteQuietly(file: File): void {
  try {
    if (file.exists) file.delete();
  } catch {
    // Already gone, or the system is clearing the cache itself.
  }
}

/**
 * Deletes export files an earlier export left in the app cache (e.g. when the app was closed
 * while the share sheet was open), so personal data does not pile up there. Other cache files
 * stay.
 */
export function deleteCachedExports(): void {
  let entries: ReturnType<typeof Paths.cache.list>;
  try {
    entries = Paths.cache.list();
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry instanceof File && isExportFileName(entry.name)) deleteQuietly(entry);
  }
}

/**
 * Hands an export file to the person. On phones it is written to the app cache and the share
 * sheet opens (save to Files, mail it, open it in Excel); once the sheet closes the file is
 * deleted again, and leftovers of earlier exports go before a new one is written (security
 * review: personal financial data should not stay in the cache). On the web build, which the
 * end-to-end tests drive, the browser downloads it.
 */
export async function deliverFile(file: ExportFile): Promise<Delivery> {
  if (Platform.OS === 'web') {
    download(file);
    return 'downloaded';
  }
  if (!(await Sharing.isAvailableAsync())) throw new SharingUnavailableError();
  deleteCachedExports();
  const target = new File(Paths.cache, file.name);
  try {
    target.create({ overwrite: true });
    target.write(file.content);
    await Sharing.shareAsync(target.uri, {
      mimeType: file.mimeType,
      UTI: file.uti,
      dialogTitle: file.name,
    });
  } finally {
    deleteQuietly(target);
  }
  return 'shared';
}

function download(file: ExportFile): void {
  const blob = new Blob([file.content], { type: `${file.mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.name;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
}

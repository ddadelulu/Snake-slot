import { MAX_IMPORT_FILE_BYTES } from '@budget/core';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';

import type { FileProblem } from './model';

/**
 * Picking and reading a statement file (D-032: the file is read on the phone and never
 * uploaded). The picker offers CSV, XML and text files first; any other file can still be picked
 * because banks and phones label CSV exports inconsistently, and the parser says what is wrong.
 */
export const STATEMENT_FILE_TYPES = [
  'text/csv',
  'text/comma-separated-values',
  'application/csv',
  'text/xml',
  'application/xml',
  'text/plain',
  '*/*',
];

export type PickedFile = { name: string; bytes: Uint8Array };

export type PickResult =
  | { kind: 'canceled' }
  | { kind: 'picked'; file: PickedFile }
  | { kind: 'problem'; name: string | null; problem: FileProblem };

type Asset = Pick<DocumentPicker.DocumentPickerAsset, 'uri' | 'file'>;

/**
 * The bytes of a picked file: on the web the browser's File; on phones the picker's copy in the
 * app cache, which is deleted after reading so the statement does not stay on the device.
 */
export async function readAssetBytes(asset: Asset): Promise<Uint8Array> {
  if (asset.file) return new Uint8Array(await asset.file.arrayBuffer());
  const file = new File(asset.uri);
  try {
    return await file.bytes();
  } finally {
    if (Platform.OS !== 'web') {
      try {
        file.delete();
      } catch {
        // The system clears the cache anyway.
      }
    }
  }
}

/**
 * Opens the system file picker and reads the chosen file. `onPicked` runs once a file is chosen,
 * before it is read, so the screen can show that it is working (not while the picker is open).
 */
export async function pickStatementFile(onPicked?: () => void): Promise<PickResult> {
  let result: DocumentPicker.DocumentPickerResult;
  try {
    result = await DocumentPicker.getDocumentAsync({
      type: STATEMENT_FILE_TYPES,
      copyToCacheDirectory: true,
      multiple: false,
      base64: false,
    });
  } catch {
    return { kind: 'problem', name: null, problem: { code: 'unreadable' } };
  }
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return { kind: 'canceled' };
  onPicked?.();
  // Refuse a huge file before reading it into memory (readStatement checks the bytes again).
  if (asset.size !== undefined && asset.size > MAX_IMPORT_FILE_BYTES) {
    return {
      kind: 'problem',
      name: asset.name,
      problem: { code: 'too_large', maxBytes: MAX_IMPORT_FILE_BYTES },
    };
  }
  try {
    return { kind: 'picked', file: { name: asset.name, bytes: await readAssetBytes(asset) } };
  } catch {
    return { kind: 'problem', name: asset.name, problem: { code: 'unreadable' } };
  }
}

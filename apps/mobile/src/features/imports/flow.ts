import { readStatement, type ParsedStatement } from '@budget/core';

import {
  mappingDraftFrom,
  toColumnMapping,
  type FileProblem,
  type ImportSummary,
  type MappingDraft,
  type UnknownColumns,
} from './model';
import type { PickedFile } from './readFile';

/**
 * The steps of the import screen. The picked file's bytes stay in the mapping and preview steps,
 * so a failed request or another column choice never needs the file to be picked again.
 */
export type MappingStep = {
  kind: 'mapping';
  file: PickedFile;
  request: UnknownColumns;
  draft: MappingDraft;
  /** The last mapping produced no transaction; the screen asks to check the columns. */
  rejected: boolean;
};

export type PreviewStep = { kind: 'preview'; file: PickedFile; statement: ParsedStatement };

export type ImportStep =
  | { kind: 'intro' }
  | { kind: 'reading' }
  | { kind: 'problem'; fileName: string | null; problem: FileProblem }
  | MappingStep
  | PreviewStep
  | { kind: 'done'; summary: ImportSummary };

/** Parses a picked file: the preview, the column mapping for an unknown CSV, or the problem. */
export function readPickedFile(file: PickedFile): ImportStep {
  const result = readStatement(file.bytes);
  if (result.ok) return { kind: 'preview', file, statement: result.statement };
  if (result.error.code === 'unknown_columns') {
    return {
      kind: 'mapping',
      file,
      request: result.error,
      draft: mappingDraftFrom(result.error.guess),
      rejected: false,
    };
  }
  return { kind: 'problem', fileName: file.name, problem: result.error };
}

/**
 * Parses the file again with the person's columns. Columns that yield nothing (every line
 * skipped, e.g. a text column picked as the date) keep the mapping step open with a hint;
 * problems of the file itself (another currency, too many lines) end it.
 */
export function applyMapping(step: MappingStep): ImportStep {
  const mapping = toColumnMapping(step.draft, step.request.headerRow);
  if (mapping === null) return step;
  const result = readStatement(step.file.bytes, { mapping });
  if (result.ok) return { kind: 'preview', file: step.file, statement: result.statement };
  const { error } = result;
  if (error.code === 'unknown_columns' || error.code === 'no_transactions') {
    return { ...step, rejected: true };
  }
  return { kind: 'problem', fileName: step.file.name, problem: error };
}

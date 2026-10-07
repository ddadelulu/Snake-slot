import type { RulePatch, TransactionItem } from '@/data/transactions';

/**
 * "Always do this for Manor?" (US-3.3, docs/CATEGORIZATION.md step 6): after the person chooses
 * a category, the app offers the rule the database proposed for the transaction
 * (`suggested_rule`, D-042: built from a known merchant name or the merchant's first distinctive
 * word, never from statement text). The app never builds a pattern itself.
 *
 * Null when nothing should be asked: "no category" cannot become a rule (the database refuses it,
 * `rule_needs_category`), and without a proposal there is nothing reliable to match.
 */
export function rulePromptFor(
  categoryId: string | null,
  transaction: Pick<TransactionItem, 'suggestedRule'>,
): RulePatch | null {
  if (categoryId === null) return null;
  return transaction.suggestedRule;
}

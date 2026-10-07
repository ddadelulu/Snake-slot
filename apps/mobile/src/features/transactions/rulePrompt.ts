import { suggestRulePattern } from '@budget/core';

import type { RulePatch, TransactionItem } from '@/data/transactions';

/**
 * "Always do this for Manor?" (US-3.3, docs/CATEGORIZATION.md step 6): after the person chooses a
 * category, the app offers a rule built from the merchant, or from the statement text when the
 * merchant gives nothing to build one from.
 */
export function suggestRule(
  transaction: Pick<TransactionItem, 'merchant' | 'rawText'>,
): RulePatch | null {
  const fromMerchant = suggestRulePattern(transaction.merchant);
  if (fromMerchant !== null) {
    return { matchField: 'merchant', matchType: 'contains', pattern: fromMerchant };
  }
  const fromText = suggestRulePattern(transaction.rawText);
  if (fromText !== null) {
    return { matchField: 'raw_text', matchType: 'contains', pattern: fromText };
  }
  return null;
}

/**
 * The rule to offer after choosing `categoryId`, or null when nothing should be asked: "no
 * category" cannot become a rule (the database refuses it, `rule_needs_category`), and a
 * transaction without merchant or statement text has nothing to recognise it by.
 */
export function rulePromptFor(
  categoryId: string | null,
  transaction: Pick<TransactionItem, 'merchant' | 'rawText'>,
): RulePatch | null {
  if (categoryId === null) return null;
  return suggestRule(transaction);
}

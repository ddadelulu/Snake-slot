import type { Widen } from './en';
import type { transactionsEn } from './transactions.en';

/** Deutsche Texte zu Ausgaben (Schweizer Rechtschreibung: ss statt ß). */
export const transactionsDe: Widen<typeof transactionsEn> = {
  transactions: {
    emptyTitle: 'Noch keine Ausgaben',
    emptyMessage: 'Einkäufe erscheinen hier, sobald sie erfasst sind.',
  },
};

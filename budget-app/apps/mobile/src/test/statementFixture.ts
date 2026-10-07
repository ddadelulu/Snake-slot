/**
 * A UBS e-banking export (German) with four single bookings and no collective order, so the
 * screens' tests do not depend on how the parser splits collective payments (D-043): a card
 * purchase with trade date and time, an e-banking order, a salary and a café purchase.
 * SYNTHETIC like the parser's fixtures (packages/core/src/import/__fixtures__).
 */
export const UBS_STATEMENT = [
  'Kontonummer:;0000 00000000.00A;',
  'IBAN:;CH93 0000 0000 0000 0000 0;',
  'Von:;2026-09-01;',
  'Bis:;2026-09-30;',
  'Bewertet in:;CHF;',
  '',
  'Abschlussdatum;Abschlusszeit;Buchungsdatum;Valutadatum;Währung;Belastung;Gutschrift;Einzelbetrag;Saldo;Transaktions-Nr.;Beschreibung1;Beschreibung2;Beschreibung3;Fussnoten;',
  '2026-09-29;14:23:05;2026-09-30;2026-09-30;CHF;-23.40;;;1211.16;TEST0000000001;Mustermarkt-4567 Zürich;Zahlung Debitkarte;Kartennummer: XXXX 1234;;',
  ';;2026-09-28;2026-09-28;CHF;-150.00;;;1234.56;TEST0000000002;Fictiva Versicherung AG;e-banking-Auftrag;;;',
  ';;2026-09-25;2026-09-25;CHF;;5200.00;;1384.56;TEST0000000003;Fictiva Arbeitgeber AG;Gutschrift;Lohn September;;',
  '2026-09-24;09:05:00;2026-09-25;2026-09-25;CHF;-8.50;;;;TEST0000000004;Exempla Café Bern;Zahlung Debitkarte;;;',
].join('\r\n');

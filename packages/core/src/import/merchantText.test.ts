import { describe, expect, it } from 'vitest';

import { MERCHANT_TEXT_MAX_LENGTH, merchantFromText } from './merchantText';

// Synthetic statement texts in the styles Swiss banks print; every merchant and person is made up.
describe('merchantFromText', () => {
  it.each([
    // PostFinance (de, fr, it)
    [
      'KAUF/DIENSTLEISTUNG VOM 29.09.2026 KARTEN NR. XXXX1234 MUSTERMARKT-4567 ZUERICH',
      'MUSTERMARKT-4567 ZUERICH',
    ],
    [
      'ACHAT/SERVICE DU 29.09.2026 NO DE CARTE XXXX1234 EXEMPLA EPICERIE LAUSANNE',
      'EXEMPLA EPICERIE LAUSANNE',
    ],
    [
      'ACQUISTO/SERVIZIO DEL 29.09.2026 NUMERO CARTA XXXX1234 ESEMPIO BAR LUGANO',
      'ESEMPIO BAR LUGANO',
    ],
    ['TWINT KAUF/DIENSTLEISTUNG VOM 27.09.2026 BEISPIEL BAECKEREI BERN', 'BEISPIEL BAECKEREI BERN'],
    ['GUTSCHRIFT VON FICTIVA ARBEITGEBER AG', 'FICTIVA ARBEITGEBER AG'],
    ['LASTSCHRIFT FICTIVA KRANKENKASSE AG', 'FICTIVA KRANKENKASSE AG'],
    [
      'GIRO AUS KONTO CH93 0000 0000 0000 0000 0 MUSTER MAX MUSTERWEG 1 8000 BEISPIELSTADT',
      'MUSTER MAX MUSTERWEG 1 8000 BEISPIELSTADT',
    ],
    // ZKB
    [
      'Einkauf ZKB Visa Debit Karte Nr. xxxx1234, Mustermarkt-4567 Zürich',
      'Mustermarkt-4567 Zürich',
    ],
    ['Gutschrift Fictiva Arbeitgeber AG', 'Fictiva Arbeitgeber AG'],
    // UBS
    ['Mustermarkt-4567 Zürich', 'Mustermarkt-4567 Zürich'],
    ['Exempla Pronto, Zürich', 'Exempla Pronto, Zürich'],
    // Card products and wallets
    ['Visa Debit Kauf Mustermarkt-4567 Zürich CHF 23.40', 'Mustermarkt-4567 Zürich'],
    ['Maestro-Bezug 29.09.2026 14:23 Exempla Shop Kartennummer: 12345678', 'Exempla Shop'],
    [
      'Debit Mastercard 4123 45XX XXXX 1234 Beispiel Shop Basel EUR 25.00 Kurs 0.9360',
      'Beispiel Shop Basel',
    ],
    ['Kartenzahlung kontaktlos Exempla Kiosk ****1234', 'Exempla Kiosk'],
    ['TWINT *Café Exempla, Bern', 'Café Exempla, Bern'],
    ['Paiement TWINT Café Exemple Lausanne', 'Café Exemple Lausanne'],
    ['SUMUP *BAECKEREI MUSTER', 'BAECKEREI MUSTER'],
    ['PAYPAL *FICTIVASHOP 4029000000', 'FICTIVASHOP'],
    ['Achat par carte de débit Boulangerie Exemple Genève', 'Boulangerie Exemple Genève'],
    ['Pagamento carta di debito Esempio Pizzeria Bellinzona', 'Esempio Pizzeria Bellinzona'],
    ['Card payment Exempla Coffee London GBP 4.20', 'Exempla Coffee London'],
    // Transfers, bills and standing orders
    [
      'Zahlung QR-Rechnung Fictiva Energie AG Referenz: 210000000003139471430009017',
      'Fictiva Energie AG',
    ],
    [
      'e-banking-Auftrag an Fictiva Versicherung AG 21 00000 00003 13947 14300 09017',
      'Fictiva Versicherung AG',
    ],
    ['Zahlung an Fictiva Verlag RF18 5390 0754 7034', 'Fictiva Verlag'],
    ['Dauerauftrag Miete Oktober', 'Miete Oktober'],
    ['Ordre permanent loyer octobre', 'loyer octobre'],
    ['Bonifico a favore di Esempio SA', 'Esempio SA'],
    ['Zahlung zugunsten von Fictiva Stiftung', 'Fictiva Stiftung'],
    ['Überweisung an Muster Anna', 'Muster Anna'],
    // Dates, times, amounts and references in the middle
    ['Einkauf vom 30.09.2026 um 14:23 Uhr bei Fictiva Kiosk', 'Fictiva Kiosk'],
    ['Achat du 30.09.26 à 14h23 Exempla Tabac', 'Exempla Tabac'],
    ['Online-Kauf www.fictiva-shop.ch 2026-09-30', 'www.fictiva-shop.ch'],
    ['Exempla Garage Service AG Transaktions-Nr. 9930273TI0000001', 'Exempla Garage Service AG'],
    ['Exempla Shop Ref. A12345 Wechselkurs: 1.0632 USD 12.00', 'Exempla Shop'],
    [
      'Bargeldbezug vom 29.09.2026 Karten Nr. XXXX1234 Bancomat Beispielplatz',
      'Bargeldbezug Bancomat Beispielplatz',
    ],
    ['Storno Gutschrift Mustermarkt-4567 Zürich', 'Mustermarkt-4567 Zürich'],
    ['Exempla Shop bei Kartenzahlung', 'Exempla Shop'],
    ['Exempla A', 'Exempla A'],
    ['Exempla (Filiale) 23.40', 'Exempla (Filiale)'],
  ])('%s → %s', (text, merchant) => {
    expect(merchantFromText(text)).toBe(merchant);
  });

  it.each([
    'Zahlung Debitkarte',
    'Gutschrift',
    'Kartennummer: XXXX 1234',
    'Transaktions-Nr. 9930273TI0000001',
    'Sammelauftrag e-banking',
    'Einkauf vom 30.09.2026 CHF 12.00',
    'X',
    '',
    '   ',
  ])('finds no merchant in %j', (text) => {
    expect(merchantFromText(text)).toBeNull();
  });

  it('accepts null and undefined', () => {
    expect(merchantFromText(null)).toBeNull();
    expect(merchantFromText(undefined)).toBeNull();
  });

  it('keeps at most 200 characters', () => {
    const merchant = merchantFromText(`Exempla ${'Langername '.repeat(30)}`);
    expect(merchant?.length).toBeLessThanOrEqual(200);
    expect(merchant?.startsWith('Exempla Langername')).toBe(true);
  });
});

describe('merchantFromText on crafted input', () => {
  it.each([
    ['letters', 'x'.repeat(40_000) + 'a'],
    ['brackets', ')'.repeat(40_000) + 'a'],
    ['digits and dots', '1.'.repeat(20_000) + 'a'],
    ['masks', 'X'.repeat(30_000) + '1'],
  ])('stays fast on %s', (_name, text) => {
    const started = performance.now();
    merchantFromText(text);
    expect(performance.now() - started).toBeLessThan(250);
  });

  it('only reads the first 1000 characters', () => {
    expect(merchantFromText(`Coop Zürich ${'x'.repeat(MERCHANT_TEXT_MAX_LENGTH)} Migros`)).toBe(
      'Coop Zürich',
    );
  });
});

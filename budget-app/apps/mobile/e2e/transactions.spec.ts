import { readFile } from 'node:fs/promises';

import { expect, test, type Page } from '@playwright/test';

import { apiAs, openTab, signUp, uniqueEmail } from './helpers';

/**
 * Milestone 3 end to end (spec sections 6, 7, 12, 17): quick add in under five seconds, statement
 * import (CSV and camt.053), deduplication against a typed-in purchase, the category question
 * with "Always do this for …?", undoing an import, and the data export. Every account starts
 * with the quick onboarding: CHF 5'000 income, payday the 1st, nothing fixed, nothing saved, so
 * the whole income is the month's balance.
 *
 * Statement files are synthetic test data, dated today so they fall into the current month.
 */

type ListItem = {
  merchant: string | null;
  amount_rappen: number;
  category_id: string | null;
  categorized_by: string;
  needs_review: boolean;
};

/** Today in the browser's (and so the profile's) time zone, as YYYY-MM-DD. */
async function today(page: Page): Promise<string> {
  return page.evaluate(() => {
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  });
}

function swissDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}.${month}.${year}`;
}

/** A PostFinance export (current layout), Windows-1252 encoded like the bank's own files. */
function postFinanceCsv(day: string): Buffer {
  const date = swissDate(day);
  const lines = [
    `Datum von:;="${date}"`,
    `Datum bis:;="${date}"`,
    'Kategorie:;="Alle"',
    'Konto:;="CH93 0000 0000 0000 0000 0"',
    'Währung:;="CHF"',
    '',
    'Datum;Bewegungstyp;Avisierungstext;Gutschrift in CHF;Lastschrift in CHF;Label;Kategorie',
    `${date};Belastung;"Einkauf vom ${date} Karten-Nr. XXXX1234 Coop-4567 Zürich";;-23.40;;`,
    `${date};Belastung;"TWINT *Café Exempla Bern";;-6.80;;`,
    `${date};Gutschrift;"Gutschrift Fictiva Arbeitgeber AG";5200.00;;;`,
  ];
  return Buffer.from(`${lines.join('\r\n')}\r\n`, 'latin1');
}

/** A camt.053.001.08 statement with one card purchase at Coop. */
function camt053(day: string): Buffer {
  return Buffer.from(
    `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08">
  <BkToCstmrStmt>
    <GrpHdr><MsgId>E2E-TEST-1</MsgId><CreDtTm>${day}T18:00:00</CreDtTm></GrpHdr>
    <Stmt>
      <Id>E2E-TEST-STATEMENT</Id>
      <Acct><Id><IBAN>CH9300000000000000000</IBAN></Id><Ccy>CHF</Ccy></Acct>
      <Ntry>
        <Amt Ccy="CHF">23.40</Amt>
        <CdtDbtInd>DBIT</CdtDbtInd>
        <Sts><Cd>BOOK</Cd></Sts>
        <BookgDt><Dt>${day}</Dt></BookgDt>
        <ValDt><Dt>${day}</Dt></ValDt>
        <AcctSvcrRef>E2E-TEST-REF-1</AcctSvcrRef>
        <NtryDtls>
          <TxDtls>
            <Refs><AcctSvcrRef>E2E-TEST-REF-1</AcctSvcrRef></Refs>
            <Amt Ccy="CHF">23.40</Amt>
            <CdtDbtInd>DBIT</CdtDbtInd>
            <RltdPties><Cdtr><Pty><Nm>Coop-4567 Zürich</Nm></Pty></Cdtr></RltdPties>
          </TxDtls>
        </NtryDtls>
        <AddtlNtryInf>Einkauf Coop-4567 Zürich</AddtlNtryInf>
      </Ntry>
    </Stmt>
  </BkToCstmrStmt>
</Document>
`,
    'utf8',
  );
}

/** Settings → Data sources → Import a statement → pick the file → preview. */
async function importFile(page: Page, name: string, mimeType: string, buffer: Buffer) {
  await openTab(page, 'settings');
  await page.getByTestId('settings-data-sources').click();
  await page.getByTestId('data-sources-new-import').click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('import-choose').click();
  await (await chooser).setFiles({ name, mimeType, buffer });
  await expect(page.getByTestId('import-summary')).toBeVisible();
}

async function quickAdd(page: Page, amount: string, category: string, merchant?: string) {
  await page.getByTestId('home-add').click();
  await page.getByTestId('add-amount').fill(amount);
  await page.getByTestId(`add-category-${category}`).click();
  if (merchant) await page.getByTestId('add-merchant').fill(merchant);
  await page.getByTestId('add-save').click();
}

test.describe('transactions', () => {
  test('a cash purchase is added in under five seconds and Home follows', async ({ page }) => {
    await signUp(page, uniqueEmail('quickadd'));
    await expect(page.getByTestId('home-balance')).toContainText('5,000.00');

    const started = Date.now();
    await quickAdd(page, '12.50', 'groceries');
    await expect(page.getByTestId('home-balance')).toContainText('4,987.50');
    expect(Date.now() - started).toBeLessThan(5_000);
    await expect(page.getByTestId('home-transaction-0')).toContainText('12.50');

    // Delete it from its detail, then undo: the balance follows both ways.
    await page.getByTestId('home-transaction-0').click();
    await expect(page.getByTestId('detail-amount')).toContainText('12.50');
    await page.getByTestId('detail-delete').click();
    await page.getByTestId('detail-delete-confirm').click();
    await page.getByTestId('detail-undo').click();
    await expect(page.getByTestId('detail-delete')).toBeVisible();
    await page.getByTestId('detail-delete').click();
    await page.getByTestId('detail-delete-confirm').click();
    await page.getByTestId('detail-leave').click();
    await expect(page.getByTestId('home-balance')).toContainText('5,000.00');
  });

  test('a PostFinance CSV is imported once, categorized, and can be undone', async ({
    page,
    request,
  }) => {
    const email = uniqueEmail('csv');
    await signUp(page, email);
    const day = await today(page);

    await importFile(page, 'konto.csv', 'text/csv', postFinanceCsv(day));
    await expect(page.getByTestId('import-source')).toContainText('PostFinance');
    await expect(page.getByTestId('import-count')).toContainText('3');
    await expect(page.getByTestId('import-count-new')).toContainText('3');
    await page.getByTestId('import-confirm').click();
    await expect(page.getByTestId('import-result-added')).toContainText('3');
    await page.getByTestId('import-done').click();

    // The salary is income without a category: it does not change the budget.
    await openTab(page, 'home');
    await expect(page.getByTestId('home-balance')).toContainText('4,969.80');

    const api = await apiAs(request, email);
    const { items } = await api.rpc<{ items: ListItem[] }>('list_transactions', { p: {} });
    const coop = items.find((item) => item.amount_rappen === -2340)!;
    const [groceries] = await api.get<{ id: string }[]>(
      'categories?select=id&default_key=eq.groceries',
    );
    expect(coop).toMatchObject({ categorized_by: 'merchant_list', category_id: groceries!.id });
    expect(coop.merchant).toContain('Coop-4567 Zürich');

    // The same file again adds nothing.
    await importFile(page, 'konto.csv', 'text/csv', postFinanceCsv(day));
    await expect(page.getByTestId('import-count-imported_before')).toContainText('3');
    await expect(page.getByTestId('import-nothing-new')).toBeVisible();
    await page.getByTestId('import-nothing-done').click();

    // Back on Data sources: undo the import; its transactions are gone and the month is whole.
    await expect(page.getByTestId('data-sources-screen')).toBeVisible();
    await page.locator('[data-testid^="data-sources-remove-"]').first().click();
    await page.getByTestId('data-sources-remove-confirm').click();
    await expect(page.getByTestId('data-sources-removed')).toBeVisible();
    await page.getByTestId('data-sources-header-back').click();
    await openTab(page, 'home');
    await expect(page.getByTestId('home-balance')).toContainText('5,000.00');
  });

  test('a camt.053 line merges with the purchase typed in by hand', async ({ page, request }) => {
    const email = uniqueEmail('camt');
    await signUp(page, email);
    const day = await today(page);

    await quickAdd(page, '23.40', 'groceries', 'Coop');
    await expect(page.getByTestId('home-balance')).toContainText('4,976.60');

    await importFile(page, 'statement.xml', 'application/xml', camt053(day));
    await expect(page.getByTestId('import-source')).toContainText(/camt\.053/i);
    await expect(page.getByTestId('import-count-merge')).toContainText('1');
    await page.getByTestId('import-confirm').click();
    await expect(page.getByTestId('import-result-merged')).toContainText('1');
    await page.getByTestId('import-done').click();

    // Counted once; the typed-in purchase gained the statement text.
    await openTab(page, 'home');
    await expect(page.getByTestId('home-balance')).toContainText('4,976.60');
    const api = await apiAs(request, email);
    const { items } = await api.rpc<{ items: (ListItem & { raw_text: string | null })[] }>(
      'list_transactions',
      { p: {} },
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ merchant: 'Coop', categorized_by: 'user' });
    expect(items[0]!.raw_text).toContain('Coop-4567');
  });

  test('a category question with "Always do this" sorts every Manor purchase', async ({
    page,
    request,
  }) => {
    const email = uniqueEmail('review');
    await signUp(page, email);
    const day = await today(page);
    const api = await apiAs(request, email);
    const row = (id: string, amount: number, merchant: string) => ({
      amount_rappen: amount,
      booked_on: day,
      merchant,
      raw_text: merchant,
      mcc: null,
      source: 'statement_import',
      external_id: `e2e-review-${id}`,
    });
    const added = await api.rpc<{ counts: Record<string, number> }>('add_transactions', {
      p: {
        rows: [
          row('1', -8400, 'MANOR AG ZUERICH'),
          row('2', -2990, 'Manor Bern'),
          row('3', -2340, 'Coop-4567 Zürich'),
        ],
        import: { file_name: 'e2e-review.csv', format: 'csv', bank: null },
      },
    });
    expect(added.counts).toMatchObject({ added: 3, needs_review: 2 });

    await page.reload();
    await expect(page.getByTestId('home-review')).toContainText('2 purchases need a category');
    await page.getByTestId('home-review').click();
    await expect(page.getByTestId('review-question')).toContainText(/manor/i);
    await page.getByTestId('review-category-other').click();
    await page.getByTestId('review-rule-yes').click();
    await expect(page.getByTestId('review-done')).toBeVisible();
    await page.getByTestId('review-done-action').click();

    const [other] = await api.get<{ id: string }[]>('categories?select=id&default_key=eq.other');
    const { items } = await api.rpc<{ items: ListItem[] }>('list_transactions', {
      p: { search: 'manor' },
    });
    expect(items).toHaveLength(2);
    for (const item of items) {
      expect(item).toMatchObject({ category_id: other!.id, needs_review: false });
    }
    expect(items.map((item) => item.categorized_by).sort()).toEqual(['rule', 'user']);

    await openTab(page, 'settings');
    await page.getByTestId('settings-rules').click();
    await expect(page.getByTestId('rules-list')).toContainText(/manor/i);
  });

  test('the data export downloads transactions as CSV and everything as JSON', async ({
    page,
  }) => {
    await signUp(page, uniqueEmail('export'));
    await quickAdd(page, '12.50', 'groceries', 'Bäckerei Exempla');
    await expect(page.getByTestId('home-balance')).toContainText('4,987.50');

    await openTab(page, 'settings');
    await page.getByTestId('settings-export').click();

    const csvDownload = page.waitForEvent('download');
    await page.getByTestId('export-csv').click();
    const csvFile = await csvDownload;
    expect(csvFile.suggestedFilename()).toMatch(/^batzen-transactions-\d{4}-\d{2}-\d{2}\.csv$/);
    const csv = await readFile(await csvFile.path(), 'utf8');
    expect(csv.startsWith('﻿')).toBe(true);
    const lines = csv.slice(1).trimEnd().split('\r\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('-12.50');
    expect(lines[1]).toContain('Bäckerei Exempla');

    const jsonDownload = page.waitForEvent('download');
    await page.getByTestId('export-json').click();
    const jsonFile = await jsonDownload;
    expect(jsonFile.suggestedFilename()).toMatch(/^batzen-data-\d{4}-\d{2}-\d{2}\.json$/);
    const data = JSON.parse(await readFile(await jsonFile.path(), 'utf8')) as {
      format_version: number;
      transactions: { amount_rappen: number }[];
      categories: unknown[];
    };
    expect(data.format_version).toBe(1);
    expect(data.transactions.map((transaction) => transaction.amount_rappen)).toEqual([-1250]);
    expect(data.categories.length).toBeGreaterThan(0);
  });
});

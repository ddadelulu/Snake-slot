import { it, expect } from 'vitest';
import { parseStatementText } from './index';
it('perf', () => {
  const lines = ['Datum von:;01.09.2026', 'Konto:;CH9300000000000000000', 'Buchungsdatum;Avisierungstext;Gutschrift;Lastschrift;Valuta;Saldo'];
  let i = 0;
  while (lines.join('\n').length < 4_900_000 && i < 60000) {
    lines.push(`30.09.2026;"KAUF/DIENSTLEISTUNG VOM 29.09.2026 KARTEN NR. XXXX1234 MUSTERMARKT-${i} ZUERICH";;-23.40;30.09.2026;1211.16`);
    i++;
  }
  const text = lines.join('\n');
  const started = Date.now();
  const result = parseStatementText(text);
  const ms = Date.now() - started;
  process.stdout.write(`rows=${i} chars=${text.length} ms=${ms} ok=${result.ok} ${result.ok ? '' : JSON.stringify(result.error).slice(0, 80)}\n`);
  expect(ms).toBeLessThan(10000);
  const ubs = ['Abschlussdatum;Abschlusszeit;Buchungsdatum;Valutadatum;Währung;Belastung;Gutschrift;Einzelbetrag;Saldo;Transaktions-Nr.;Beschreibung1;Beschreibung2;Beschreibung3;Fussnoten;'];
  for (let k = 0; k < 30000; k++) { ubs.push(`;;2026-09-28;2026-09-28;CHF;-150.00;;;;T${k};Sammelauftrag;;;;`, `;;2026-09-28;2026-09-28;CHF;;;-100.00;;T${k};A;;;;`, `;;2026-09-28;2026-09-28;CHF;;;-50.00;;T${k};B;;;;`); }
  const t2 = Date.now();
  const r2 = parseStatementText(ubs.join('\n').slice(0, 4_900_000));
  process.stdout.write(`ubs ms=${Date.now() - t2} ${r2.ok ? 'ok' : r2.error.code}\n`);
});

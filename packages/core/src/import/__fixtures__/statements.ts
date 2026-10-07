/**
 * SYNTHETIC TEST DATA. Every merchant, person, IBAN, card number and amount below is made up;
 * the files only copy the column layouts and number/date formats of the Swiss banks' exports.
 * IBANs are zero-filled (CH93 0000 0000 0000 0000 0), card numbers are masked test numbers,
 * references start with TEST. Never paste a real statement here.
 */

/** PostFinance, e-finance export before 2023 ("Avisierungstext", "Lastschrift" negative). */
export const POSTFINANCE_OLD = [
  'Datum von:;01.09.2026',
  'Datum bis:;30.09.2026',
  'Buchungsart:;Alle Buchungen',
  'Konto:;CH9300000000000000000',
  'Währung:;CHF',
  'Buchungsdatum;Avisierungstext;Gutschrift;Lastschrift;Valuta;Saldo',
  '30.09.2026;"KAUF/DIENSTLEISTUNG VOM 29.09.2026 KARTEN NR. XXXX1234 MUSTERMARKT-4567 ZUERICH";;-23.40;30.09.2026;1211.16',
  '29.09.2026;"GUTSCHRIFT VON FICTIVA ARBEITGEBER AG";5200.00;;29.09.2026;1234.56',
  '28.09.2026;"LASTSCHRIFT FICTIVA KRANKENKASSE AG";;-412.35;28.09.2026;',
  '27.09.2026;"TWINT KAUF/DIENSTLEISTUNG VOM 27.09.2026 BEISPIEL BAECKEREI BERN";;-6.80;27.09.2026;',
  '',
  'Disclaimer:',
  'Dies ist kein durch die Bank erstelltes Dokument (synthetische Testdaten).',
].join('\r\n');

/** PostFinance, export since 2023 (Excel text-forced metadata, "Lastschrift in CHF"). */
export const POSTFINANCE_NEW = [
  'Datum von:;="01.09.2026"',
  'Datum bis:;="30.09.2026"',
  'Kategorie:;="Alle"',
  'Konto:;="CH93 0000 0000 0000 0000 0"',
  'Währung:;="CHF"',
  '',
  'Datum;Bewegungstyp;Avisierungstext;Gutschrift in CHF;Lastschrift in CHF;Label;Kategorie',
  '30.09.2026;Belastung;"Einkauf vom 29.09.2026 Karten-Nr. XXXX1234 Mustermarkt-4567 Zürich";;-23.40;;Lebensmittel',
  '29.09.2026;Gutschrift;"Gutschrift Fictiva Arbeitgeber AG";5200.00;;;Lohn',
  '26.09.2026;Belastung;"Bargeldbezug vom 26.09.2026 Karten-Nr. XXXX1234 Bancomat Beispielplatz";;-100.00;;Bargeld',
].join('\n');

/** UBS e-banking (since 2023), German: metadata lines, trade date and time, collective order. */
export const UBS_DE = [
  'Kontonummer:;0000 00000000.00A;',
  'IBAN:;CH93 0000 0000 0000 0000 0;',
  'Von:;2026-09-01;',
  'Bis:;2026-09-30;',
  'Anfangssaldo:;1234.56;',
  'Schlusssaldo:;987.65;',
  'Bewertet in:;CHF;',
  'Anzahl Transaktionen in diesem Zeitraum:;6;',
  '',
  'Abschlussdatum;Abschlusszeit;Buchungsdatum;Valutadatum;Währung;Belastung;Gutschrift;Einzelbetrag;Saldo;Transaktions-Nr.;Beschreibung1;Beschreibung2;Beschreibung3;Fussnoten;',
  '2026-09-29;14:23:05;2026-09-30;2026-09-30;CHF;-23.40;;;1211.16;TEST0000000001;Mustermarkt-4567 Zürich;Zahlung Debitkarte;Kartennummer: XXXX 1234;;',
  ';;2026-09-28;2026-09-28;CHF;-150.00;;;1234.56;TEST0000000002;Sammelauftrag;e-banking-Auftrag;;;',
  ';;2026-09-28;2026-09-28;CHF;;;-100.00;;TEST0000000002;Fictiva Versicherung AG;;;;',
  ';;2026-09-28;2026-09-28;CHF;;;-50.00;;TEST0000000002;Beispiel Verein;;;;',
  ';;2026-09-25;2026-09-25;CHF;;5200.00;;1384.56;TEST0000000003;Fictiva Arbeitgeber AG;Gutschrift;Lohn September;;',
  '2026-09-24;09:05:00;2026-09-25;2026-09-25;CHF;-8.50;;;;TEST0000000004;Exempla Café Bern;Zahlung Debitkarte;;;',
].join('\r\n');

/** UBS e-banking, English. */
export const UBS_EN = [
  'Account number:;0000 00000000.00A;',
  'IBAN:;CH93 0000 0000 0000 0000 0;',
  'From:;2026-09-01;',
  'Until:;2026-09-30;',
  'Valued in:;CHF;',
  '',
  'Trade date;Trade time;Booking date;Value date;Currency;Debit;Credit;Individual amount;Balance;Transaction no.;Description1;Description2;Description3;Footnotes;',
  '2026-09-29;14:23:05;2026-09-30;2026-09-30;CHF;-23.40;;;1211.16;TEST0000000001;Mustermarkt-4567 Zurich;Debit card payment;Card number: XXXX 1234;;',
  ';;2026-09-25;2026-09-25;CHF;;5200.00;;1384.56;TEST0000000003;Fictiva Employer Ltd;Credit;Salary September;;',
].join('\r\n');

/** Zürcher Kantonalbank: everything quoted, positive debits, "Betrag Detail" for collective orders. */
export const ZKB = [
  '"Datum";"Buchungstext";"Whg";"Betrag Detail";"ZKB-Referenz";"Referenznummer";"Belastung CHF";"Gutschrift CHF";"Valuta";"Saldo CHF";"Zahlungszweck";"Details"',
  '"30.09.2026";"Einkauf ZKB Visa Debit Karte Nr. xxxx1234, Mustermarkt-4567 Zürich";"";"";"Z000000001";"";"23.40";"";"30.09.2026";"1\'211.16";"";""',
  '"28.09.2026";"Sammelauftrag e-banking";"";"";"Z000000002";"";"150.00";"";"28.09.2026";"1\'234.56";"";""',
  '"28.09.2026";"Fictiva Versicherung AG";"CHF";"100.00";"";"";"";"";"28.09.2026";"";"Police 000";""',
  '"28.09.2026";"Beispiel Verein";"CHF";"50.00";"";"";"";"";"28.09.2026";"";"Mitgliederbeitrag";""',
  '"25.09.2026";"Gutschrift Fictiva Arbeitgeber AG";"";"";"Z000000003";"";"";"5\'200.00";"25.09.2026";"1\'384.56";"Lohn September";""',
  '"24.09.2026";"Einkauf ZKB Visa Debit Karte Nr. xxxx1234, Exempla Shop Paris";"";"";"";"";"21.37";"";"24.09.2026";"";"";"EUR 22.50 Kurs 0.9498"',
].join('\r\n');

/** Raiffeisen e-banking: one IBAN column per row, timestamps with ".0". */
export const RAIFFEISEN = [
  'IBAN;Booked At;Text;Credit/Debit Amount;Balance;Valuta Date',
  'CH9300000000000000000;2026-09-30 00:00:00.0;Mustermarkt-4567 Zürich;-23.4;1211.16;2026-09-30 00:00:00.0',
  'CH9300000000000000000;2026-09-29 00:00:00.0;Gutschrift Fictiva Arbeitgeber AG;5200;1234.56;2026-09-29 00:00:00.0',
  'CH9300000000000000000;2026-09-27 00:00:00.0;Exempla Kiosk Luzern;-4.5;-3965.44;2026-09-27 00:00:00.0',
].join('\n');

/** Neon: merchant in "Description", foreign purchases with original amount and currency. */
export const NEON = [
  '"Date";"Amount";"Original amount";"Original currency";"Exchange rate";"Description";"Subject";"Category";"Tags";"Wise";"Spaces"',
  '"2026-09-30";"-23.40";"";"";"";"Mustermarkt";"";"groceries";"";"no";"no"',
  '"2026-09-28";"-21.37";"-22.50";"EUR";"0.9498";"Exempla Café Paris";"";"restaurants";"";"no";"no"',
  '"2026-09-27";"-11.80";"-1800";"JPY";"0.0066";"Exempla Ramen Tokyo";"";"restaurants";"";"no";"no"',
  '"2026-09-25";"5200.00";"";"";"";"Fictiva Arbeitgeber AG";"Lohn September";"income";"";"no";"no"',
].join('\n');

/** Revolut: comma separated, all currencies in one file, State and Fee columns. */
export const REVOLUT = [
  'Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance',
  'CARD_PAYMENT,Current,2026-09-29 14:23:11,2026-09-30 09:12:45,Mustermarkt,-23.40,0.00,CHF,COMPLETED,1211.16',
  'CARD_PAYMENT,Current,2026-09-29 18:00:00,,Exempla Bar,-12.00,0.00,CHF,PENDING,',
  'TRANSFER,Current,2026-09-28 10:00:00,2026-09-28 10:00:01,To Fictiva Shop,-100.00,1.50,CHF,COMPLETED,1234.56',
  'CARD_PAYMENT,Current,2026-09-27 12:00:00,2026-09-27 12:00:00,Exempla Paris,-25.00,0.00,EUR,COMPLETED,50.00',
  'TOPUP,Current,2026-09-26 08:00:00,2026-09-26 08:00:00,Top-Up by *1234,200.00,0.00,CHF,COMPLETED,1336.06',
  'CARD_PAYMENT,Current,2026-09-25 08:00:00,2026-09-25 08:00:00,Exempla Kiosk,-4.50,0.00,CHF,REVERTED,',
].join('\n');

const CAMT_04_ENTRIES = `
      <Ntry>
        <Amt Ccy="CHF">23.40</Amt>
        <CdtDbtInd>DBIT</CdtDbtInd>
        <RvslInd>false</RvslInd>
        <Sts>BOOK</Sts>
        <BookgDt><Dt>2026-09-30</Dt></BookgDt>
        <ValDt><Dt>2026-09-30</Dt></ValDt>
        <AcctSvcrRef>TEST-REF-0001</AcctSvcrRef>
        <NtryDtls>
          <TxDtls>
            <Refs><AcctSvcrRef>TEST-REF-0001</AcctSvcrRef></Refs>
            <Amt Ccy="CHF">23.40</Amt>
            <CdtDbtInd>DBIT</CdtDbtInd>
            <RltdPties><Cdtr><Nm>Mustermarkt-4567 Z&#252;rich</Nm></Cdtr></RltdPties>
            <RltdDts><AccptncDtTm>2026-09-29T14:23:00</AccptncDtTm></RltdDts>
            <AddtlTxInf>Einkauf ZKB Visa Debit Karte Nr. xxxx1234</AddtlTxInf>
          </TxDtls>
        </NtryDtls>
        <AddtlNtryInf>Einkauf ZKB Visa Debit Karte Nr. xxxx1234, Mustermarkt-4567 Zürich</AddtlNtryInf>
      </Ntry>
      <Ntry>
        <Amt Ccy="CHF">150.00</Amt>
        <CdtDbtInd>DBIT</CdtDbtInd>
        <Sts>BOOK</Sts>
        <BookgDt><Dt>2026-09-28</Dt></BookgDt>
        <ValDt><Dt>2026-09-28</Dt></ValDt>
        <AcctSvcrRef>TEST-REF-0002</AcctSvcrRef>
        <NtryDtls>
          <Btch><NbOfTxs>2</NbOfTxs></Btch>
          <TxDtls>
            <Amt Ccy="CHF">100.00</Amt>
            <CdtDbtInd>DBIT</CdtDbtInd>
            <RltdPties><Cdtr><Nm>Fictiva Versicherung AG</Nm></Cdtr></RltdPties>
            <RmtInf><Ustrd>Police 000 Oktober</Ustrd></RmtInf>
          </TxDtls>
          <TxDtls>
            <Amt Ccy="CHF">50.00</Amt>
            <CdtDbtInd>DBIT</CdtDbtInd>
            <RltdPties><Cdtr><Nm>Beispiel Verein</Nm></Cdtr></RltdPties>
            <RmtInf><Ustrd>Mitgliederbeitrag</Ustrd><Ustrd>2026</Ustrd></RmtInf>
          </TxDtls>
        </NtryDtls>
        <AddtlNtryInf>Sammelauftrag e-banking</AddtlNtryInf>
      </Ntry>
      <Ntry>
        <Amt Ccy="CHF">21.37</Amt>
        <CdtDbtInd>DBIT</CdtDbtInd>
        <Sts>BOOK</Sts>
        <BookgDt><Dt>2026-09-27</Dt></BookgDt>
        <AcctSvcrRef>TEST-REF-0003</AcctSvcrRef>
        <NtryDtls>
          <TxDtls>
            <AmtDtls>
              <InstdAmt><Amt Ccy="EUR">22.50</Amt></InstdAmt>
              <TxAmt><Amt Ccy="CHF">21.37</Amt></TxAmt>
            </AmtDtls>
            <RltdDts><AccptncDtTm>2026-09-26T19:45:00+02:00</AccptncDtTm></RltdDts>
          </TxDtls>
        </NtryDtls>
        <AddtlNtryInf>Einkauf ZKB Visa Debit Karte Nr. xxxx1234, Exempla Caf&#xE9; Paris EUR 22.50</AddtlNtryInf>
      </Ntry>
      <Ntry>
        <Amt Ccy="CHF">23.40</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <RvslInd>true</RvslInd>
        <Sts>BOOK</Sts>
        <BookgDt><Dt>2026-09-26</Dt></BookgDt>
        <NtryRef>TEST-NTRY-0004</NtryRef>
        <AddtlNtryInf>Storno Gutschrift Mustermarkt-4567 Z&#252;rich</AddtlNtryInf>
      </Ntry>
      <Ntry>
        <Amt Ccy="CHF">12.00</Amt>
        <CdtDbtInd>DBIT</CdtDbtInd>
        <Sts>PDNG</Sts>
        <BookgDt><Dt>2026-09-30</Dt></BookgDt>
        <AddtlNtryInf>Einkauf Exempla Bar</AddtlNtryInf>
      </Ntry>
      <Ntry>
        <Amt Ccy="CHF">5200.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Sts>BOOK</Sts>
        <BookgDt><Dt>2026-09-25</Dt></BookgDt>
        <AcctSvcrRef>TEST-REF-0006</AcctSvcrRef>
        <NtryDtls>
          <TxDtls>
            <RltdPties><Dbtr><Nm>Fictiva Arbeitgeber AG</Nm></Dbtr></RltdPties>
            <RmtInf><Ustrd>Lohn September</Ustrd></RmtInf>
          </TxDtls>
        </NtryDtls>
        <AddtlNtryInf>Gutschrift Fictiva Arbeitgeber AG</AddtlNtryInf>
      </Ntry>`;

/** camt.053.001.04 (ZKB-style): default namespace, Sts as text, Cdtr/Nm, BIC. */
export const CAMT_053_04 = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.04" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <BkToCstmrStmt>
    <GrpHdr><MsgId>TEST-MSG-0001</MsgId><CreDtTm>2026-10-01T06:00:00</CreDtTm></GrpHdr>
    <Stmt>
      <Id>TEST-STMT-0001</Id>
      <CreDtTm>2026-10-01T06:00:00</CreDtTm>
      <FrToDt><FrDtTm>2026-09-01T00:00:00</FrDtTm><ToDtTm>2026-09-30T23:59:59</ToDtTm></FrToDt>
      <Acct>
        <Id><IBAN>CH9300000000000000000</IBAN></Id>
        <Ccy>CHF</Ccy>
        <Svcr><FinInstnId><BIC>ZKBKCHZZ80A</BIC></FinInstnId></Svcr>
      </Acct>
      <Bal><Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp><Amt Ccy="CHF">1234.56</Amt><CdtDbtInd>CRDT</CdtDbtInd><Dt><Dt>2026-09-01</Dt></Dt></Bal>${CAMT_04_ENTRIES}
    </Stmt>
  </BkToCstmrStmt>
</Document>
`;

/** camt.053.001.08 (PostFinance-style): camt: prefix, Sts/Cd, Cdtr/Pty/Nm, BICFI, a EUR account. */
export const CAMT_053_08 = `<?xml version="1.0" encoding="UTF-8"?>
<camt:Document xmlns:camt="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08">
  <camt:BkToCstmrStmt>
    <camt:GrpHdr><camt:MsgId>TEST-MSG-0008</camt:MsgId><camt:CreDtTm>2026-10-01T06:00:00+02:00</camt:CreDtTm></camt:GrpHdr>
    <camt:Stmt>
      <camt:Id>TEST-STMT-0008-EUR</camt:Id>
      <camt:Acct>
        <camt:Id><camt:IBAN>CH0400000000000000001</camt:IBAN></camt:Id>
        <camt:Ccy>EUR</camt:Ccy>
        <camt:Svcr><camt:FinInstnId><camt:BICFI>POFICHBEXXX</camt:BICFI></camt:FinInstnId></camt:Svcr>
      </camt:Acct>
      <camt:Ntry>
        <camt:Amt Ccy="EUR">40.00</camt:Amt>
        <camt:CdtDbtInd>DBIT</camt:CdtDbtInd>
        <camt:Sts><camt:Cd>BOOK</camt:Cd></camt:Sts>
        <camt:BookgDt><camt:Dt>2026-09-29</camt:Dt></camt:BookgDt>
        <camt:AddtlNtryInf>Exempla Shop Milano</camt:AddtlNtryInf>
      </camt:Ntry>
    </camt:Stmt>
    <camt:Stmt>
      <camt:Id>TEST-STMT-0008-CHF</camt:Id>
      <camt:Acct>
        <camt:Id><camt:IBAN>CH9300000000000000000</camt:IBAN></camt:Id>
        <camt:Ccy>CHF</camt:Ccy>
        <camt:Svcr><camt:FinInstnId><camt:BICFI>POFICHBEXXX</camt:BICFI></camt:FinInstnId></camt:Svcr>
      </camt:Acct>
      <camt:Ntry>
        <camt:NtryRef>TEST-NTRY-0801</camt:NtryRef>
        <camt:Amt Ccy="CHF">6.80</camt:Amt>
        <camt:CdtDbtInd>DBIT</camt:CdtDbtInd>
        <camt:Sts><camt:Cd>BOOK</camt:Cd></camt:Sts>
        <camt:BookgDt><camt:DtTm>2026-09-30T00:00:00+02:00</camt:DtTm></camt:BookgDt>
        <camt:AcctSvcrRef>TEST-REF-0801</camt:AcctSvcrRef>
        <camt:NtryDtls>
          <camt:TxDtls>
            <camt:Amt Ccy="CHF">6.80</camt:Amt>
            <camt:CdtDbtInd>DBIT</camt:CdtDbtInd>
            <camt:RltdPties><camt:Cdtr><camt:Pty><camt:Nm>Beispiel Bäckerei Bern</camt:Nm></camt:Pty></camt:Cdtr></camt:RltdPties>
            <camt:RltdDts><camt:AccptncDtTm>2026-09-29T07:12:00.000+02:00</camt:AccptncDtTm></camt:RltdDts>
          </camt:TxDtls>
        </camt:NtryDtls>
        <camt:AddtlNtryInf>TWINT KAUF/DIENSTLEISTUNG VOM 29.09.2026 BEISPIEL BAECKEREI BERN</camt:AddtlNtryInf>
      </camt:Ntry>
      <camt:Ntry>
        <camt:Amt Ccy="CHF">60.00</camt:Amt>
        <camt:CdtDbtInd>CRDT</camt:CdtDbtInd>
        <camt:Sts><camt:Cd>BOOK</camt:Cd></camt:Sts>
        <camt:BookgDt><camt:Dt>2026-09-28</camt:Dt></camt:BookgDt>
        <camt:NtryDtls>
          <camt:TxDtls>
            <camt:RltdPties><camt:Dbtr><camt:Pty><camt:Nm>Muster Max</camt:Nm></camt:Pty></camt:Dbtr></camt:RltdPties>
            <camt:RmtInf><camt:Ustrd>Anteil Abendessen</camt:Ustrd></camt:RmtInf>
          </camt:TxDtls>
        </camt:NtryDtls>
      </camt:Ntry>
      <camt:Ntry>
        <camt:Amt Ccy="CHF">9.90</camt:Amt>
        <camt:CdtDbtInd>DBIT</camt:CdtDbtInd>
        <camt:Sts><camt:Cd>INFO</camt:Cd></camt:Sts>
        <camt:BookgDt><camt:Dt>2026-09-30</camt:Dt></camt:BookgDt>
      </camt:Ntry>
    </camt:Stmt>
  </camt:BkToCstmrStmt>
</camt:Document>
`;

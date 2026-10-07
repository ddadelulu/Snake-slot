# Importing a bank statement

Owner: **Morgan Freeman** (docs), **Benedict Cumberbatch** (parsers). For users and support.

Until banks can be connected directly (Milestone 6), the quickest way to get card, Twint and
e-banking payments into the app is the statement file your e-banking already offers.

## Which file

| Format             | What it is                                                                                                | Recommended                                                     |
| ------------------ | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| **camt.053** (XML) | The ISO 20022 account statement every Swiss bank provides (sometimes called "ISO 20022", "XML" or "camt") | Yes: exact amounts, booking references, often the purchase time |
| **CSV**            | The transaction list export of e-banking or a banking app                                                 | When your bank offers no camt.053                               |

Both work for any Swiss bank. CSV files from PostFinance, UBS, Zürcher Kantonalbank, Raiffeisen,
Neon and Revolut are recognized by their column names; for any other CSV the app asks which
column holds the date, the amount (or debit and credit), the text and, if there is one, the
debit/credit marker. Files up to 5 MB and 2,000 transactions per import. Import one format per
account: the same period as CSV and as camt.053 gives the same transactions (see below).

## Getting the file

In your e-banking or banking app, open the account (or card) and its list of transactions, choose
the period (for example since your last payday), then choose export or download and pick
camt.053 / ISO 20022 / XML if offered, otherwise CSV. Save the file where your phone can open it
(Files on iPhone, Downloads on Android, or a cloud drive).

## Importing

1. Settings → Data sources → **Import a statement** (or during setup, step 9).
2. Choose the file. It is read on your phone; nothing is saved until you confirm.
3. Check the preview:
   - the period the file covers and how many transactions it contains;
   - **skipped rows** with the reason:
     - not booked yet (pending, reverted or declined);
     - not in CHF (accounts in other currencies are not tracked; "CHF", "Fr." and "SFr." all
       count as francs);
     - no amount, amount of zero, amount or date not readable (also a debit/credit marker the app
       does not know, or a missing one);
     - a **balance or total line** ("Saldo", "Schlusssaldo", "Kontostand", "Total", "Summe",
       "Closing balance", "Solde", "Saldo finale", …): not a payment;
     - a **line with more cells than the file has columns**: usually an amount written as
       `-1,234.50` without quotes in a comma-separated file, so its cells cannot be told apart.
       Export the file again with ";" as separator if your e-banking offers it, or fix the line in
       a spreadsheet;
     - a **collective payment imported as its parts** (the total line), or a part of a collective
       payment whose parts do not add up to the total (then the total is imported);
   - transactions you **imported before** (never added twice);
   - **look-alikes** of transactions you already have from the same kind of source (same day,
     amount and merchant): unchecked, check them if they really are separate purchases.
4. Uncheck what is not spending from your budget: transfers between your own accounts, the
   payment of your credit-card bill (the card purchases themselves are the spending), or your
   savings transfer (saving is already in your plan).
5. Import. Purchases you had typed in by hand are merged with their statement line; payments of
   your fixed costs (rent, health insurance, phone) are recognized and do not count twice.
   Anything the app could not place is waiting under **To review**.

## How the file is read

- **Card purchases are dated on the day you paid**, not the day the bank booked them: from the
  purchase time in camt.053, or, in a CSV without a purchase-date column, from the day the text
  states ("Einkauf vom 02.10.2026", "KAUF/DIENSTLEISTUNG VOM 02.10.2026", "Achat du …",
  "Acquisto del …", "Purchase of …", also cash withdrawals "Bargeldbezug vom …"). A stated day
  later than the booking, or more than 31 days before it, is ignored and the booking date is used.
- **Collective payments** (several payments sent as one e-banking order and booked as one total)
  are imported as the individual payments when the file lists them and they add up exactly to the
  total, with the same sign and in CHF (UBS "Einzelbetrag", ZKB "Betrag Detail", camt.053 batch
  details). Otherwise the total is imported and the parts are listed as skipped.
- **Debit/credit columns**: when a file prints amounts without a sign and says in a separate
  column whether money went out or came in ("Soll/Haben" with S/H, "Debit/Credit" with D/C,
  "Belastung/Gutschrift", "Débit/Crédit", "Dare/Avere", camt-style DBIT/CRDT), that column gives
  the sign. An amount printed with a minus keeps it.
- **Dates** are read day first (30.09.2026, 30/09/2026). Files from abroad that write the month
  first (09/30/2026) are recognized when a date in the column has a day above 12.
- **The same statement as CSV and camt.053** gives the same transactions on the same days with the
  same amounts. If you import both, the second file's transactions are shown as imported before or
  as look-alikes (unchecked); leave them unchecked.
- Files in UTF-8, UTF-16 or Windows-1252 are read. A UTF-8 file with a few broken characters (for
  example a line pasted from another file) shows them as "�" instead of garbling every umlaut.

## Undoing an import

Settings → Data sources lists every import with its date and counts. **Remove** deletes the
transactions that came from that file (transactions you typed in yourself stay).

Imported two files whose periods overlap? The transactions in both belong to the file imported
first; the second one showed them as imported before. If you remove the first file, those
transactions go with it: import the second file again to get them back.

## Privacy

The file never leaves your phone. To show the preview, the transactions read from it are
checked against your account (already imported? already there from another source?) without
being stored. Only the transactions you import are stored, in your account,
in the region described in the privacy policy, and you can export or delete them at any time
(Settings → Export my data, Delete account).

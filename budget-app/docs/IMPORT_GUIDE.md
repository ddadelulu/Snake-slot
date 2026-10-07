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
column holds the date, the amount (or debit and credit) and the text. Files up to 5 MB and 2,000
transactions per import.

## Getting the file

In your e-banking or banking app, open the account (or card) and its list of transactions, choose
the period (for example since your last payday), then choose export or download and pick
camt.053 / ISO 20022 / XML if offered, otherwise CSV. Save the file where your phone can open it
(Files on iPhone, Downloads on Android, or a cloud drive).

## Importing

1. Settings → Data sources → **Import a statement** (or during setup, step 9).
2. Choose the file. It is read on your phone; nothing is uploaded until you confirm.
3. Check the preview:
   - the period the file covers and how many transactions it contains;
   - **skipped rows** with the reason: not booked yet, not in CHF (accounts in other currencies
     are not tracked), no amount, a detail line of a collective payment (the total is imported);
   - transactions you **imported before** (never added twice);
   - **look-alikes** of transactions you already have from the same kind of source (same day,
     amount and merchant): unchecked, check them if they really are separate purchases.
4. Uncheck what is not spending from your budget: transfers between your own accounts, the
   payment of your credit-card bill (the card purchases themselves are the spending), or your
   savings transfer (saving is already in your plan).
5. Import. Purchases you had typed in by hand are merged with their statement line; payments of
   your fixed costs (rent, health insurance, phone) are recognized and do not count twice.
   Anything the app could not place is waiting under **To review**.

## Undoing an import

Settings → Data sources lists every import with its date and counts. **Remove** deletes the
transactions that came from that file (transactions you typed in yourself stay).

## Privacy

The file never leaves your phone. Only the transactions you import are stored, in your account,
in the region described in the privacy policy, and you can export or delete them at any time
(Settings → Export my data, Delete account).

# Categorization, deduplication and fixed-cost detection

Owner: **Scarlett Johansson** (categorization), **Benedict Cumberbatch** (sources and
deduplication), **Matt Damon** (database). Spec sections 4, 6 and 7.

Every transaction passes the same steps in the database (`add_transactions`, see
[API.md](API.md#transactions-milestone-3)), so a purchase is treated the same whether it was typed
in, imported from a statement or (from M6) delivered by a bank feed.

## Merchant keys

Names are compared through a key: apostrophes dropped (`'` `’` `´` `` ` ``, so "McDonald's" and
"MCDONALDS" agree), accents removed by a fixed table (ä → a, ß → ss, …), ASCII lower case, every
"e" directly after "a", "o" or "u" dropped (so "Bäckerei" and "BAECKEREI", "Müller" and
"MUELLER", "Sprüngli" and "SPRUENGLI" agree; "Michael" becomes `michal`, which is harmless because
both sides are folded the same way), split into words at anything that is not a letter or digit,
words containing a digit dropped (store numbers, postal codes, card numbers), legal forms and web
noise dropped (`ag`, `gmbh`, `sa`, `sarl`, `sagl`, `ltd`, `llc`, `inc`, `kg`, `co`, `cie`, `www`,
`com`, `ch`). Letters outside the table (also accents written as separate combining marks) count
as separators.

| Printed by the source         | Key                 |
| ----------------------------- | ------------------- |
| `COOP-4567 ZÜRICH`            | `coop zurich`       |
| `TWINT *Coop Pronto`          | `twint coop pronto` |
| `Bäckerei Hug GmbH, 8001 Zug` | `backerei hug zug`  |
| `BAECKEREI HUG`               | `backerei hug`      |
| `McDonald's Bern`             | `mcdonalds bern`    |
| `XXXX1234 MANOR 0815`         | `manor`             |

A pattern **matches** when its words appear in the key as a contiguous run of whole words
(`coop` matches `twint coop pronto`, not `coopers`). The database function
`internal.merchant_key` and `merchantKey()` in `@budget/core` are mirrors, compared by a test.
A transaction's key is the key of its merchant, or of its statement text when the merchant is
empty or has no key; it is stored with the transaction (`merchant_key`), as rules store their
pattern's key and fixed costs their hint's.

## Word lists

Words that never identify a merchant on their own, written as keys (so "Dauerauftrag" appears as
`daurauftrag`). **Generic** words name a kind of place: two merchants whose keys start with the
same generic word ("Restaurant Krone", "Restaurant Sonne") are not the same merchant, and a
generic word is never proposed as a rule. **Payment** words say how or through whom something was
paid, or are statement boilerplate: they never make two merchants the same either, rules are never
proposed from them, and a fixed cost's merchant hint leaves them out. **Months** are left out of a
fixed cost's merchant hint, so next month's statement text still matches. The lists are
`internal.generic_words()`, `internal.payment_words()` and `internal.month_words()`.

| List    | Words                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Generic | restaurant, ristorante, pizzeria, trattoria, osteria, brasserie, bistro, cafe, caffe, bar, pub, club, lounge, hotel, gasthaus, gasthof, backerei, boulangerie, panetteria, metzgerei, boucherie, macelleria, confiserie, apotheke, pharmacie, farmacia, drogerie, drogurie, kiosk, garage, tankstelle, coiffeur, coiffure, salon, shop, store, laden, markt, boutiqu, online, take, imbiss, kebab, pizza, sushi, burger, parking, parkhaus, taxi, kino, cinema, fitness, florist, blumen, praxis, optik, studio, the, le, la, les, der, die, das, il, lo, el, zum, zur, chez                                                                         |
| Payment | twint, sumup, payrexx, paypal, stripe, kauf, einkauf, dienstleistung, zahlung, karte, karten, kartennummer, card, purchase, debit, debitkarte, kreditkarte, pos, mastro, visa, mastercard, pay, achat, paiement, carte, acquisto, pagamento, lastschrift, lsv, daurauftrag, auftrag, prelevement, virement, bonifico, addebito, uberweisung, gutschrift, belastung, e, banking, ebanking, ebill, rechnung, facture, fattura, invoice, an, von, vom, zugunsten, nr, ref, referenz, mitteilung, de, du, des, et, und, per, zkb, ubs, raiffeisen, postfinance, valiant, cler, bcv, bcge, bkb, bekb, lukb, sgkb, akb, glkb, tkb, szkb, gkb, yuh, revolut |
| Months  | januar, februar, marz, april, mai, juni, juli, august, september, oktober, november, dezember, jan, feb, mar, apr, jun, jul, aug, sep, sept, okt, nov, dez, janvier, fevrier, mars, avril, juin, juillet, aout, septembre, octobre, novembre, decembre, janv, fevr, avr, juil, oct, dec, gennaio, febbraio, marzo, aprile, maggio, giugno, luglio, agosto, settembre, ottobre, dicembre, gen, mag, giu, lug, ago, set, ott, dic, january, february, march, may, june, july, october, december                                                                                                                                                        |

## The steps, in order

"Days" are local dates in the person's time zone, compared as dates (D-040): two bookings are at
most four days apart when their dates are, whatever the hour or a daylight-saving change in
between. A date-only row is placed at 12:00 that day.

1. **Chosen by the person.** A row with a category or split is stored as
   `categorized_by = 'user'`, confidence 100. Steps 2–4 still run (the purchase may already be
   in the list from a statement); steps 5–9 do not. A row without a category (`category_id`
   absent or null, no split) is categorized by the steps below.
2. **Already imported.** Same source and same `external_id` as a stored row: not stored again.
3. **Duplicate from another source** (spec section 6, "Dedup"). An existing transaction is the
   same purchase when all hold:
   - it comes from a **different source** and is neither deleted nor merged itself;
   - **same amount** (`amount_rappen` equal);
   - booked at most **four days** before or after (statements book a few days after the card
     payment, later still over a weekend);
   - **same merchant**: both keys non-empty, and one key contains the other, or their first words
     are equal and that word is neither generic nor a payment word ("Coop Zürich" and
     "COOP-4567 BERN" are the same, "Restaurant Krone" and "Restaurant Sonne" are not);
   - neither has a split, and it has not already absorbed a row from this source (two identical
     coffees stay two).

   The closest in time wins (then the oldest). The new row is stored with `merged_into_id` (it
   never counts again) and the survivor **keeps the richest data**: it gains the merchant,
   statement text, MCC, line items, foreign amount and note it lacked, and the person's category
   unless the survivor was placed by the person or one of their rules, or is a fixed-cost payment.
   What it gained is recorded on the merged row, so removing that import puts it back (D-041).
   The merged row itself is categorized (steps 5–8) so its evidence is complete, but it never
   counts.

4. **Possible duplicate** (a look-alike): reported with `duplicate_of`, not stored, unless the row
   says `allow_duplicate` (the import preview leaves it unchecked; quick add offers "Add anyway").
   - **Same source** (statement files only): a row of the same source stored before this call
     with the same amount, at most four days apart, the same merchant (or both without a key) and
     a different id (deleted rows do not count; merged rows do). This catches the same statement
     imported once as CSV and once as camt.053, even when the CSV has only the booking day and
     the camt.053 the purchase day; two identical rows inside one file are both kept.
   - **Another source** (every row, also quick add): a visible transaction of another source with
     the same amount, at most four days apart, when the merchants cannot be compared: either has
     no merchant key, or either is a split (D-040). A typed-in purchase without a merchant and the
     statement row for it are therefore one question, not two silent purchases.
5. **Fixed cost by its merchant hint.** A money-out row whose hint words (its key without month
   names and payment words; from the merchant, else the statement text) contain the hint of an
   active fixed cost, with an amount within ±20 % of the fixed cost and no other payment of that
   fixed cost booked within 20 days, is that fixed cost's payment (`fixed_cost_id`): it is
   already in the plan and no longer counts as spending (spec section 4, "detected fixed costs are
   auto-marked as paid"). The longest hint wins.
6. **The person's rules** ("Always do this for Manor?"), **money out only**: highest `priority`
   first, then the longer pattern, then the newer rule. A rule on an archived category is
   skipped. `categorized_by = 'rule'`, confidence 100.
7. **Known merchants** (list below), **money out only**: the longest matching pattern wins (on
   equal length the higher confidence, then the one that appears first in the name). An entry can
   name a fixed-cost kind: when the person has an active fixed cost of that kind, the amount is
   within ±20 % of it and no other payment of it is booked within 20 days, the row is that fixed
   cost's payment. Otherwise the entry's category is used, if the person has that category active
   (`categorized_by = 'merchant_list'` with the entry's confidence). An entry that is **not
   spending** (a bank, a card issuer) stops here without a category, so the person is asked.
8. **MCC** (merchant category code, when the source has one), **money out only**: ranges below,
   if the person has the category active. `categorized_by = 'mcc'`.
9. **Fixed cost by exact amount.** A money-out row that is still without a category, from a
   source other than manual entry, whose amount equals exactly one active fixed cost, and no
   other payment of that fixed cost is booked within 20 days: that fixed cost's payment. The fixed
   cost learns a merchant hint (`merchant_hint`) when it has none: the first three of the row's
   hint words ("Dauerauftrag Mietzins Verwaltung Muster AG Oktober" → `mietzins verwaltung
muster`), so next month step 5 recognizes it whatever month the text names.
10. **AI guess**: arrives with the assistant in M5 (it needs the language-model provider
    agreement, see the task board). Until then rows the steps above cannot place stay without a
    category and are asked about.

**Money in** (D-039) is never placed by rules, known merchants or MCC: a salary from "SBB AG",
a transfer from "Migros Bank" or a cash deposit ("Einzahlung Bar") stays without a category and
does not change the budget. Instead, a **refund** is recognized: among the 200 most recent
purchases booked on the same day or up to 90 days before that are not deleted, merged or a
fixed-cost payment, have a category that is still active and are at least as large, the most
recent one from the same merchant gives its category, as `categorized_by = 'refund'` with
confidence 60, so it is asked about.

A guess with confidence below **70** (`REVIEW_CONFIDENCE`), or no category at all, makes the
transaction **need review** when it counts against the budget: the app asks "CHF 84.00 at Manor:
what was it?" with category buttons (Transactions tab and Home in M3; as a push notification,
alert type `categorize`, from M4). Every correction then offers "Always do this for Manor?" with
the pattern the database proposes (`suggested_rule`, D-042), built from the merchant only, never
from the statement text: the longest known-merchant pattern in the merchant's key that is not a
single generic or payment word (`coop vitality`, `manor food`, `migros restaurant`), else the key's
first word that is neither generic nor a payment word when it has at least three letters (`krone`
for "Restaurant Krone"), else that word and the next (`mc donalds`); nothing when no such word is
left ("TWINT", "Kauf Karte Visa"). Accepting it creates a rule and re-categorizes earlier money-out
transactions of that merchant that were not placed by the person.

## Known merchants

Confidence in brackets. Patterns are merchant keys, so ae/oe/ue appear folded (`blu cinema` for
Blue Cinema, `steuramt` for Steueramt). Fixed-cost kinds are marked "fixed: kind".

| Category             | Patterns                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Groceries            | migros, coop, coop pronto, migrolino, denner, aldi, lidl, volg, spar, alnatura, farmy, manor food, globus delicatessa, aldi suisse (90); avec, coop city, k kiosk, kkiosk, backerei, boulangerie (60)                                                                                                                                                                                                                                                                      |
| Eating out           | migros restaurant, coop restaurant, mcdonalds, mc donalds, burger king, kfc, subway, starbucks, vapiano, holy cow, tibits, hiltl, dean david, nordsee, pizza hut, dominos, uber eats, ubereats, smood (90); restaurant, ristorante, pizzeria, trattoria, migros take away (80); cafe, caffe, coffee, kebab (75); sprungli, too good to go (70)                                                                                                                             |
| Going out            | pathe, kitag, arena cinemas (90); blu cinema, ticketcorner, starticket, eventfrog, hallenstadion (85); cinema, kino, see tickets (80); pub (70)                                                                                                                                                                                                                                                                                                                            |
| Transport            | sbb, zvv, bernmobil, vbz, postauto (95); cff, ffs, bls, tpg, bvb, vbl, publibike, parkingpay, easypark, migrol, flixbus (90); uber, taxi, parkhaus, mobility, shell, avia, esso, eni, tamoil, socar, agrola, bp, coop mineralol (85); parking, lime, bolt, sixt, europcar, hertz, easyjet (80); tcs (70)                                                                                                                                                                   |
| Clothes              | zara, h m, uniqlo, zalando, about you, bershka, pull bear, stradivarius, massimo dutti, tally weijl, chicoree, primark, asos, ochsner shos (90); hm, c a, mango, vogele, dosenbach, snipes, foot locker, bata, pkz, schild, esprit, bonprix, shein, levis (85); nike, adidas (80); globus, jelmoli (60); manor (50)                                                                                                                                                        |
| Personal care        | dm drogerie (90); amavita, sun store, benu, topwell, apotheke, pharmacie, farmacia, drogerie, drogurie, douglas, marionnaud, import parfumerie, coiffeur, coiffure, coop vitality (85); barber (80); kosmetik (75)                                                                                                                                                                                                                                                         |
| Hobbies              | ochsner sport, sportxx, decathlon, intersport, transa, bachli, fitnesspark, update fitness (85); orell fussli, thalia, ex libris, kieser (80); fitness, steam, playstation, nintendo, xbox (75); coop bau hobby (70); jumbo, hornbach, bauhaus, obi, do it garden (60)                                                                                                                                                                                                     |
| Gifts                | fleurop (85); franz carl weber, florist (75); smyths, blumen (70)                                                                                                                                                                                                                                                                                                                                                                                                          |
| Shopping/Electronics | digitec, interdiscount, mediamarkt, media markt, melectronics (90); galaxus, fust, brack, microspot (85); aliexpress (75); amazon (70); ikea, pfister, conforama, jysk (60)                                                                                                                                                                                                                                                                                                |
| Hobbies + fixed      | netflix, spotify, disney plus, youtube premium (70, fixed: subscriptions)                                                                                                                                                                                                                                                                                                                                                                                                  |
| Fixed costs only     | health insurance: css, helsana, sanitas, swica, visana, concordia, assura, groupe mutul, kpt, atupri, egk, sympany, okk, agrisano · phone/internet: swisscom, sunrise, salt, upc, wingo, yallo, quickline, digital republic, coop mobile · other insurance: mobiliar, axa, allianz, generali, helvetia, baloise, vaudoise, smile direct, zurich versicherung · tax: steuramt, steurverwaltung, administration fiscale · leasing/debts: amag leasing, cembra, bmw financial |
| Not spending         | migros bank, bank cler, raiffeisen, postfinance, ubs, zkb, zurcher kantonalbank, credit suisse, valiant, bcv, bcge, bekb, berner kantonalbank, lukb, luzerner kantonalbank, bkb, basler kantonalbank, sgkb, st galler kantonalbank, akb, aargauische kantonalbank, swissquote, yuh, revolut, cornercard, viseca, swisscard                                                                                                                                                 |

Entries with only a fixed-cost kind have no confidence and never set a category: without a
matching fixed cost they go on to the MCC step. "Not spending" entries have neither: money sent
to a bank or a card issuer is a transfer or a card bill, so they stop the category steps and the
row is asked about ("Überweisung an Migros Bank" is not groceries, although it contains
`migros`). Short or ambiguous words that would catch unrelated names are not listed: `bar` (also
"Einzahlung Bar", cash), `muller` (a surname), `club` and `lounge`. Every pattern must be a
merchant key (a test checks this): a name whose only word contains a digit, such as Init7, has an
empty key and cannot be listed; its payments are found by the exact amount (step 9) or a rule.

## MCC ranges

| MCC                          | Category             | Confidence |
| ---------------------------- | -------------------- | ---------- |
| 5411                         | Groceries            | 80         |
| 5451                         | Groceries            | 75         |
| 5422, 5462, 5499             | Groceries            | 70         |
| 5441                         | Groceries            | 60         |
| 5310                         | Groceries            | 50         |
| 5812, 5814                   | Eating out           | 85         |
| 5811                         | Eating out           | 70         |
| 5813                         | Going out            | 80         |
| 7832                         | Going out            | 85         |
| 7922                         | Going out            | 80         |
| 7929, 7996                   | Going out            | 70         |
| 7991                         | Going out            | 60         |
| 4111, 4112                   | Transport            | 90         |
| 4121, 4131, 5542, 7523       | Transport            | 85         |
| 4784, 5541                   | Transport            | 80         |
| 4789, 7512                   | Transport            | 75         |
| 3000–3299, 4511              | Transport            | 60         |
| 5611, 5621, 5651, 5661, 5691 | Clothes              | 85         |
| 5641                         | Clothes              | 80         |
| 5631, 5699                   | Clothes              | 75         |
| 5655, 5681                   | Clothes              | 70         |
| 5311 (department stores)     | Clothes              | 40         |
| 7230                         | Personal care        | 90         |
| 5977                         | Personal care        | 85         |
| 5912, 7298                   | Personal care        | 80         |
| 8043                         | Personal care        | 70         |
| 8011, 8021, 8099             | Personal care        | 60         |
| 5941, 7997                   | Hobbies              | 80         |
| 5942, 5970, 5733, 7941       | Hobbies              | 75         |
| 5945                         | Hobbies              | 60         |
| 5815, 5816, 5817, 5818       | Hobbies              | 60         |
| 5200, 5251                   | Hobbies              | 50         |
| 7999                         | Hobbies              | 50         |
| 5947                         | Gifts                | 80         |
| 5992                         | Gifts                | 75         |
| 5193                         | Gifts                | 60         |
| 5732                         | Shopping/Electronics | 85         |
| 5045, 5722, 5734, 5946, 4812 | Shopping/Electronics | 75         |
| 5712, 5719                   | Other                | 60         |
| 5331                         | Other                | 50         |
| 5399                         | Other                | 40         |
| 5999                         | Other                | 30         |

Both lists live in the database (`internal.known_merchants`, `internal.mcc_categories`, seeded by
the migration; a test compares them with the tables above) and change through a new migration,
reviewed by Scarlett Johansson. The same holds for the word lists.

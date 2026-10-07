# Categorization, deduplication and fixed-cost detection

Owner: **Scarlett Johansson** (categorization), **Benedict Cumberbatch** (sources and
deduplication), **Matt Damon** (database). Spec sections 4, 6 and 7.

Every transaction passes the same steps in the database (`add_transactions`, see
[API.md](API.md#transactions-milestone-3)), so a purchase is treated the same whether it was typed
in, imported from a statement or (from M6) delivered by a bank feed.

## Merchant keys

Names are compared through a key: accents removed by a fixed table (ä → a, ß → ss, …), ASCII
lower case, split into words at anything that is not a letter or digit, words containing a digit
dropped (store numbers, postal codes, card numbers), legal forms and web noise dropped (`ag`,
`gmbh`, `sa`, `sarl`, `sagl`, `ltd`, `llc`, `inc`, `kg`, `co`, `cie`, `www`, `com`, `ch`).

| Printed by the source         | Key                 |
| ----------------------------- | ------------------- |
| `COOP-4567 ZÜRICH`            | `coop zurich`       |
| `TWINT *Coop Pronto`          | `twint coop pronto` |
| `Bäckerei Hug GmbH, 8001 Zug` | `backerei hug zug`  |
| `XXXX1234 MANOR 0815`         | `manor`             |

A pattern **matches** when its words appear in the key as a contiguous run of whole words
(`coop` matches `twint coop pronto`, not `coopers`). The database function
`private.merchant_key` and `merchantKey()` in `@budget/core` are mirrors, compared by a test.
A transaction's key is the key of its merchant, or of its statement text when the merchant is
empty or has no key.

## The steps, in order

1. **Chosen by the person.** A manual entry with a category or split is stored as
   `categorized_by = 'user'`, confidence 100. Steps 2–4 still run (the purchase may already be
   in the list from a statement); steps 5–9 do not. A row without a category (`category_id`
   absent or null, no split) is categorized by the steps below.
2. **Already imported.** Same source and same `external_id` as a stored row: not stored again.
3. **Duplicate from another source** (spec section 6, "Dedup"). An existing transaction is the
   same purchase when all hold:
   - it comes from a **different source** and is neither deleted nor merged itself;
   - **same amount** (`amount_rappen` equal);
   - booked within **72 hours** of each other (statements book a day or two after the card
     payment; a date-only row counts from 12:00 that day);
   - **same merchant**: both keys non-empty and either their first words are equal or one key
     contains the other;
   - it has not already absorbed a row from this source (two identical coffees stay two).

   The closest in time wins (then the oldest). The new row is stored with `merged_into_id` (it
   never counts again) and the survivor **keeps the richest data**: it gains the merchant,
   statement text, MCC, line items, foreign amount and note it lacked, and the person's category
   unless the survivor was placed by the person or one of their rules, or is a fixed-cost payment.
   Rows with a split are never merged. The merged row itself is categorized (steps 5–8) so its
   evidence is complete, but it never counts.

4. **Possible duplicate from the same source** (statement files only): same source, same amount,
   same local day, same merchant (or both without a key), a different id, stored before this call
   (deleted rows do not count; merged evidence rows do).
   It is reported, not stored, unless the row says `allow_duplicate`. This catches the same
   statement imported once as CSV and once as camt.053; two identical rows inside one file are
   both kept.
5. **Fixed cost by its merchant hint.** A money-out row whose key contains the key of an active
   fixed cost's `merchant_hint`, with an amount within ±20 % of the fixed cost, is that fixed
   cost's payment (`fixed_cost_id`): it is already in the plan and no longer counts as spending
   (spec section 4, "detected fixed costs are auto-marked as paid").
6. **The person's rules** ("Always do this for Manor?"): highest `priority` first, then the
   longer pattern, then the newer rule. A rule on an archived category is skipped.
   `categorized_by = 'rule'`, confidence 100.
7. **Known merchants** (list below): the longest matching pattern wins (on equal length the
   higher confidence, then the one that appears first in the name). An entry can name a
   fixed-cost kind: when the person has an active fixed cost of that kind and the amount is within
   ±20 % of it, the row is that fixed cost's payment. Otherwise the entry's category is used, if
   the person has that category active. `categorized_by = 'merchant_list'` with the entry's
   confidence.
8. **MCC** (merchant category code, when the source has one): ranges below, if the person has the
   category active. `categorized_by = 'mcc'`.
9. **Fixed cost by exact amount.** A money-out row that is still without a category, from a
   source other than manual entry, whose amount equals exactly one active fixed cost, and no
   other payment of that fixed cost is booked within 20 days: that fixed cost's payment. The fixed cost
   learns the merchant (`merchant_hint`) when it has none, so next month step 5 recognizes it.
10. **AI guess**: arrives with the assistant in M5 (it needs the language-model provider
    agreement, see the task board). Until then rows the steps above cannot place stay without a
    category and are asked about.

A guess with confidence below **70** (`REVIEW_CONFIDENCE`), or no category at all, makes the
transaction **need review** when it counts against the budget: the app asks "CHF 84.00 at Manor:
what was it?" with category buttons (Transactions tab and Home in M3; as a push notification,
alert type `categorize`, from M4). Every correction then offers "Always do this for Manor?",
which becomes a rule and re-categorizes earlier transactions of that merchant that were not
placed by the person.

## Known merchants

Confidence in brackets. Patterns are merchant keys. Fixed-cost kinds are marked "fixed: kind".

| Category             | Patterns                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Groceries            | migros, coop, coop pronto, migrolino, denner, aldi, lidl, volg, spar, alnatura, farmy, manor food, globus delicatessa, aldi suisse (90); avec, coop city (60); k kiosk, kkiosk (60); backerei, baeckerei, boulangerie (60)                                                                                                                                                                                                                                       |
| Eating out           | migros restaurant, coop restaurant, mcdonald, mc donald, burger king, kfc, subway, starbucks, vapiano, holy cow, tibits, hiltl, dean david, nordsee, pizza hut, dominos, domino s, uber eats, ubereats, smood (90); restaurant, ristorante, pizzeria, trattoria (80); migros take away (80); cafe, caffe, coffee, kebab (75); sprungli, spruengli, too good to go (70)                                                                                           |
| Going out            | pathe, kitag, arena cinemas (90); blue cinema, ticketcorner, starticket, eventfrog, hallenstadion (85); cinema, kino, see tickets (80); bar, pub (70); club, lounge (60)                                                                                                                                                                                                                                                                                         |
| Transport            | sbb, zvv, bernmobil, vbz, postauto (95); cff, ffs, bls, tpg, bvb, vbl, publibike, parkingpay, easypark, migrol, flixbus (90); uber, taxi, parkhaus, mobility, shell, avia, esso, eni, tamoil, socar, agrola, bp (85); parking, lime, bolt, sixt, europcar, hertz, easyjet (80); tcs (70)                                                                                                                                                                         |
| Clothes              | zara, h m, uniqlo, zalando, about you, bershka, pull bear, stradivarius, massimo dutti, tally weijl, chicoree, primark, asos, ochsner shoes (90); hm, c a, mango, vogele, voegele, dosenbach, snipes, foot locker, bata, pkz, schild, esprit, bonprix, shein, levi (85); nike, adidas (80); globus (60); jelmoli (60); manor (50)                                                                                                                                |
| Personal care        | dm drogerie (90); amavita, sun store, benu, topwell, apotheke, pharmacie, farmacia, drogerie, droguerie, douglas, marionnaud, import parfumerie, coiffeur, coiffure, coop vitality (85); barber (80); kosmetik (75); muller (70)                                                                                                                                                                                                                                 |
| Hobbies              | ochsner sport, sportxx, decathlon, intersport, transa, bachli, baechli, fitnesspark, update fitness (85); orell fussli, orell fuessli, thalia, ex libris, kieser (80); fitness, steam, playstation, nintendo, xbox (75); coop bau hobby (70); jumbo, hornbach, bauhaus, obi, do it garden (60)                                                                                                                                                                   |
| Gifts                | fleurop (85); franz carl weber, florist (75); smyths, blumen (70)                                                                                                                                                                                                                                                                                                                                                                                                |
| Shopping/Electronics | digitec, interdiscount, mediamarkt, media markt, melectronics (90); galaxus, fust, brack, microspot (85); aliexpress (75); amazon (70); ikea, pfister, conforama, jysk (60)                                                                                                                                                                                                                                                                                      |
| Hobbies + fixed      | netflix, spotify, disney plus, youtube premium (70, fixed: subscriptions)                                                                                                                                                                                                                                                                                                                                                                                        |
| Fixed costs only     | health insurance: css, helsana, sanitas, swica, visana, concordia, assura, groupe mutuel, kpt, atupri, egk, sympany, okk, agrisano · phone/internet: swisscom, sunrise, salt, upc, wingo, yallo, quickline, digital republic · other insurance: mobiliar, axa, allianz, generali, helvetia, baloise, vaudoise, smile direct, zurich versicherung · tax: steueramt, steuerverwaltung, administration fiscale · leasing/debts: amag leasing, cembra, bmw financial |

Entries with only a fixed-cost kind have no confidence and never set a category: without a
matching fixed cost they go on to the MCC step. Every pattern must be a merchant key (a test
checks this): a name whose only word contains a digit, such as Init7, has an empty key and cannot
be listed; its payments are found by the exact amount (step 9) or a rule.

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

Both lists live in the database (`private.known_merchants`, `private.mcc_categories`, seeded by
the migration) and change through a new migration, reviewed by Scarlett Johansson.

# Example bank statements

Fixture files for exercising Spendly's statement importer
(`ParsedStatement` shape, see `docs/DATA_MODEL.md` → "Statement import").
All data is synthetic — no real names, IBANs, or account numbers.

Every file's transactions reconcile exactly:
`closingBalance = openingBalance + sum(transaction amounts)`.

| File | Format | Delimiter / quirks | Tx count | Opening balance | Closing balance | Parser path |
|---|---|---|---|---|---|---|
| `bnp-paribas-compte-courant.csv` | CSV | `;`-delimited, French headers (`Date;Libellé;Débit;Crédit;Solde`), comma decimal separator, `JJ/MM/AAAA` dates, running balance column | 12 | 2 450,30 € | 5 613,75 € | Client CSV (`src/lib/statementParser.ts`) |
| `revolut-transactions.csv` | CSV | `,`-delimited, English headers (`Date,Description,Amount,Balance`), dot decimal separator, ISO `YYYY-MM-DD` dates, single signed Amount column (negative = spend) | 10 | 1 000.00 € | 1 335.07 € | Client CSV (`src/lib/statementParser.ts`) |
| `boursorama-releve.ofx` | OFX 1.x (SGML) | `<STMTTRN>` list inside `<BANKTRANLIST>`, `<BANKACCTFROM>` with masked `<ACCTID>`, closing balance in `<LEDGERBAL><BALAMT>`; no explicit opening-balance tag (derive from `sum(transactions)`) | 10 | 3 200.00 € (implied) | 4 429.97 € (from `LEDGERBAL`) | Client OFX (`src/lib/statementParser.ts`) |
| `credit-agricole.qif` | QIF | `!Type:Bank`, `D`/`T`/`P`/`M` fields per record, `MM/DD/YYYY` dates, no balance field in the format itself (derive from `sum(transactions)`) | 8 | 1 800.00 € (implied) | 2 882.67 € | Client QIF (`src/lib/statementParser.ts`) |
| `caisse-epargne-releve.txt` | Plain text | Simulates a PDF text-layer extraction: bank header block, partially masked IBAN (`FR76 XXXX XXXX XXXX XXXX XXXX 234`), fixed-width transaction table, explicit "Solde au ..." opening/closing balance lines | 12 | 5 120,75 € | 6 264,67 € | Server LLM (`POST /api/parse-statement`), same as PDF/image uploads |

## Notes

- All dates fall within November–December 2026, chosen as fixed fixture dates (not
  relative to "today") so the fixtures stay stable over time.
- Each file includes at least one credit transaction (salary/transfer) alongside a mix
  of everyday French retail-banking debits: Carrefour, SNCF, EDF, Free Mobile, Netflix,
  loyer (rent), pharmacie, retraits DAB, etc.
- All amounts are well within the Firestore rule bounds for `Transaction.amount`
  (±100,000) and all balances are within bounds for `Account.balance` /
  `openingBalance` (−1,000,000…10,000,000).
- OFX and QIF do not carry an explicit opening balance in their own grammar, so the
  "implied" opening balance above is only recoverable by subtracting
  `sum(transaction amounts)` from the closing balance (OFX) or is otherwise undefined
  by the format (QIF) — for QIF the importer should fall back to
  `closingBalance = sum(transactions)` with no `openingBalance` set, unless a starting
  balance is provided separately by the user during import.

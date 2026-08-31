# Spendly Data Model

This document is the source of truth for Spendly's data model. Code (`src/types.ts`),
security rules (`firestore.rules`), seeding, and the statement importer must all
comply with it.

## Guiding principle: money comes from linked accounts

All monetary values derive from **bank accounts** and their **transactions**. There is
no independent "user balance" and no money is ever conjured (no signup allowance, no
balance credited on account creation, no fake money from challenges).

- **Wallet / main balance** = sum of all account balances (`totalAssets`). It is always
  derived, never stored on the user.
- An **account balance** is set from an imported statement's closing balance (or a
  user-entered opening balance for a manually created account) and then moves only as
  transactions are added to that account.
- A **transaction** always belongs to exactly one account (`accountId`). `amount < 0` is
  a debit (expense), `amount > 0` is a credit (income).

## Collections

All user data lives under `users/{uid}`. Access is owner-only (see `firestore.rules`).

### `users/{uid}` — UserProfile

| Field | Type | Req | Notes |
|---|---|---|---|
| `name` | string (1–100) | ✅ | Display name. |
| `email` | string (≤255) | ✅ | |
| `tier` | `'free' \| 'pro'` | ✅ | `free` at creation; upgraded server-side only. |
| `limits` | map | ✅ | Spending budgets: `{ week, month, year }` (numbers). Not money. |
| `avatar` | string (≤500) | ⚪️ | |
| `insight` | string (≤1000) | ⚪️ | Latest AI coaching insight. |

**Removed:** `balance`. The wallet balance is derived from accounts.

### `users/{uid}/accounts/{accountId}` — Account

| Field | Type | Req | Notes |
|---|---|---|---|
| `name` | string (≤100) | ✅ | e.g. "Compte Courant". |
| `bankName` | string (≤100) | ✅ | |
| `balance` | number (−1e6…1e7) | ✅ | Current balance (closing balance at import, then transaction-adjusted). |
| `type` | `'current' \| 'paypal' \| 'livret_a' \| 'crypto'` | ✅ | `livret_a`/`crypto` require `tier == 'pro'`. |
| `iconName` | `'bank' \| 'wallet' \| 'bitcoin' \| 'card'` | ✅ | |
| `colorClass` | string (≤50) | ✅ | Tailwind bg class. |
| `currency` | string (≤8) | ⚪️ | ISO 4217, default `EUR`. |
| `openingBalance` | number (−1e6…1e7) | ⚪️ | Balance before imported transactions (audit/reconciliation). |
| `ibanLast4` | string (≤4) | ⚪️ | Last 4 of IBAN/account number for display. Never store the full IBAN. |
| `source` | `'manual' \| 'import'` | ⚪️ | How the account was created. |

### `users/{uid}/transactions/{transactionId}` — Transaction

| Field | Type | Req | Notes |
|---|---|---|---|
| `name` | string (≤100) | ✅ | Human label (merchant / counterparty). |
| `date` | string (≤50) | ✅ | ISO 8601. |
| `amount` | number (−1e5…1e5) | ✅ | `< 0` debit, `> 0` credit. |
| `category` | string (≤50) | ✅ | |
| `iconName` | string (≤50) | ✅ | |
| `accountId` | string (≤128) | ✅* | The owning account. *Required for all new writes; older docs may lack it. |
| `status` | `'completed' \| 'pending' \| 'failed'` | ⚪️ | |
| `rawLabel` | string (≤200) | ⚪️ | Original statement description, kept for traceability. |

### `users/{uid}/categories/{categoryId}` — CategoryBudget

| Field | Type | Req | Notes |
|---|---|---|---|
| `name` | string (≤50) | ✅ | |
| `limit` | number | ✅ | Monthly budget for the category. |
| `spent` | number | ✅ | Legacy denormalized field, kept for rule compatibility. **Not read** — actual spend is derived from transactions (`src/lib/finance.ts`). |
| `colorClass` | string (≤50) | ✅ | |
| `iconName` | string (≤50) | ✅ | |

### `users/{uid}/challenges/{challengeId}` — Challenge

Gamification only. Completing a challenge **never** changes any balance; it records
progress/status. "Total saved" is a derived stat (sum of completed challenges'
`potentialSaving`), shown for motivation, not added to money.

## Derived values (single source of truth: transactions)

Computed by `src/lib/finance.ts` — never stored, so pages cannot disagree:

- `totalAssets` = Σ account balances → the wallet/main balance.
- category spend, period totals, budget "used %" → from transactions within the period.

## Statement import

The bank-onboarding flow imports a statement file and creates one account plus its
transactions. Parsing normalizes any supported format to:

```ts
interface ParsedStatement {
  account: {
    name: string;
    bankName: string;
    currency: string;        // ISO 4217, default 'EUR'
    ibanLast4?: string;
    openingBalance?: number;
    closingBalance: number;  // becomes Account.balance
  };
  transactions: Array<{
    date: string;            // ISO 8601
    label: string;           // -> Transaction.name and rawLabel
    amount: number;          // signed: <0 debit, >0 credit
    category?: string;       // best-effort; defaults applied downstream
  }>;
}
```

- **CSV / OFX / QIF**: parsed deterministically client-side (`src/lib/statementParser.ts`).
- **PDF (and images)**: parsed by the server LLM endpoint `POST /api/parse-statement`,
  which returns the same `ParsedStatement` shape.
- After preview + confirm, the importer creates the account (`balance = closingBalance`,
  `source = 'import'`) and writes each transaction with its `accountId` and `rawLabel`.

Example files for testing live in `examples/statements/`.

## Lifecycle summary

1. **Signup** → profile created with `tier: 'free'`, default categories, no money, no
   default funded account.
2. **Link an account** → import a statement (or add a manual account with an opening
   balance). Account balance and transactions come from the statement.
3. **Add a transaction** → adjusts the owning account's balance; wallet total re-derives.
4. **Budgets/insights/challenges** → computed from transactions; never move money.

## Migrating an existing database

Profiles created before this model carry a now-removed `balance` field. The updated
`isValidUserProfile` rule rejects it, so a profile that still has `balance` cannot be
updated until the field is removed. One-time migration per existing user:

```js
// Firebase Admin SDK (or a client update for the signed-in user)
import { deleteField } from 'firebase/firestore';
await updateDoc(doc(db, 'users', uid), { balance: deleteField() });
```

New users need no migration. Account/transaction changes are additive (new optional
fields), so existing account and transaction documents remain valid.

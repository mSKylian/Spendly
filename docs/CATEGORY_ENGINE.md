# Category Engine — design

Design for making categories a real dimension of the data model. Companion to
[DATA_MODEL.md](DATA_MODEL.md); implementation tracked on the `category-engine`
branch. Full illustrated proposal: claude.ai artifact "Spendly Category Engine".

## Problems addressed

- `Transaction.category` is a free string joined to budget cards by
  `name.toLowerCase()`; importer/LLM/seeder invent labels that fall out of views.
- The dashboard renders only the 4 seeded `CategoryBudget` docs.
- Single-month views: no trend, no month navigation, no drill-down, no way to
  see or fix the transactions behind a number.
- Économies page: hardcoded filter pills and icons that don't match
  LLM-produced challenge categories.

## Principles

1. **Charts derive from transactions** — client-side selectors in
   `lib/finance.ts`; no stored aggregates, no LLM-produced numbers.
2. **The LLM classifies, never computes** — its only quantitative job is
   mapping a label to a category from a closed enum.

## Taxonomy

~12 canonical categories keyed by stable slugs (rules-validated
`^[a-z0-9_]{2,30}$`):

```
logement · courses · restaurants · transport · abonnements
energie_telecom · sante · shopping · loisirs · voyages
revenus · epargne_virements · autre
```

- `revenus` is classified like everything else but **never enters spend**; it
  feeds only the global Revenus vs Dépenses chart.
- `epargne_virements` **counts as spend** (no transfer exclusion).
- Transactions store `categoryId` (slug) + `categorySource`
  (`user | rule | llm | default`); the `categories/{slug}` docs are a user
  overlay (name, budget `limit`, colorClass, iconName, sortOrder, isArchived).
- New subcollection `merchantRules/{hash}`:
  `{ normalizedLabel, categoryId, createdAt }`.

## Tiering

Classification always happens at **full 12-slug depth**; the tier gates
presentation and editing, never data:

| | Free | Pro |
|---|---|---|
| Categories shown | 4 groups (Courses, Transport, Abonnements, Loisirs) + Autre rollup | Full 12 + custom `custom_*` slugs (~8 cap) |
| Budgets | On the 4 groups | Per category |
| Recategorization | **Not available** — automatic categorization as-is | Manual override + "always classify X as Y" merchant rules |

Upgrade is instant (rollup change only, no reclassification). Enforcement in
Firestore rules: writes setting `categorySource: 'user'` or touching
`merchantRules` require `tier == 'pro'`.

## Categorization pipeline

1. **User override** (pro) — always wins, `categorySource: 'user'`.
2. **Merchant rules** (pro-authored) — applied to all future imports.
3. **Keyword rules** — existing `guessCategory`, extended per-taxonomy.
4. **LLM batch at import** — leftovers only, enum-constrained, validated.
5. **Fallback** — `autre` (debits) / `revenus` (credits).

## Surfaces

- **Dashboard**: top 4–6 categories by actual spend for the reference month
  (budget bar + 6-month sparkline); tap → drill-down sheet with the month's
  transactions (recategorize on pro); month-fallback labeling stays.
- **Stats**: Revenus vs Dépenses paired-bar chart (only place income charts);
  stacked spend trend by category over 6–12 months (tap a bar to set the
  reference month); month navigation; breakdown rows expand to their
  transactions (read-only on free); per-category budget editing.
- **Économies**: `Challenge.categoryId` from the same enum; filter pills and
  icons generated from challenge categories present (tier-rolled); cards show
  category monthly spend next to `potentialSaving` and link to the drill-down;
  phase 3 verifies completed challenges against the category's actual
  before/after trend. Remove the `challenge.id === '1'/'2'` demo footer strings.

## LLM / API changes

- `/api/parse-statement`: category constrained to the slug enum, French
  bank-label few-shots; `response_format: json_schema` where supported;
  server re-maps off-enum values through keyword rules.
- `/api/analyze`: receives a compact digest (per-category monthly totals for
  3–6 months, top merchants, deterministically detected recurring payments)
  instead of raw transactions; challenge output gains `categoryId`.
- Recurring detection is a pure function in `lib/finance.ts`, not a prompt.

## Phasing

1. **Phase 1 — no schema change**: selectors (`monthlySeries`,
   `incomeVsSpendSeries`, `transactionsForCategory`); dashboard top-N +
   sparklines; Stats charts + month nav + drill-down; dynamic Économies pills.
2. **Phase 2 — schema + pipeline**: slugs + tier rollup, `categorySource`,
   merchant rules, enum prompts, `Challenge.categoryId`, pro-gated
   recategorize UI, migration script, rules update, DATA_MODEL.md revision.
3. **Phase 3 — intelligence**: digest-fed analyze, recurring detection,
   data-verified challenge savings, pro custom categories.

## Open

- Cap and budget behavior for pro custom categories (proposed: ~8, budgets allowed).

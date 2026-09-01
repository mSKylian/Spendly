// Canonical category taxonomy (see docs/CATEGORY_ENGINE.md).
//
// Every transaction is classified against the full taxonomy regardless of
// tier; the tier only changes the DISPLAY rollup (free sees 4 groups + Autre,
// pro sees all categories). Slugs are stable identifiers — display names,
// colors and budgets are an overlay and can change freely.
//
// Shared by the client and server.ts (LLM prompt enums), so keep it
// dependency-free.

export type CategorySlug =
  | 'logement'
  | 'courses'
  | 'restaurants'
  | 'transport'
  | 'abonnements'
  | 'energie_telecom'
  | 'sante'
  | 'shopping'
  | 'loisirs'
  | 'voyages'
  | 'revenus'
  | 'epargne_virements'
  | 'autre';

export type CategorySource = 'user' | 'rule' | 'llm' | 'default';

/** Free-tier display groups. Each system category rolls up into one of these. */
export type FreeGroup = 'courses' | 'transport' | 'abonnements' | 'loisirs' | 'autre';

export interface SystemCategory {
  id: CategorySlug;
  name: string;        // display name (fr)
  colorClass: string;  // Tailwind bg class, mapped to chart hex by finance.ts
  iconName: string;
  group: FreeGroup;    // free-tier rollup target
  isIncome?: boolean;  // never part of spend
}

export const SYSTEM_CATEGORIES: SystemCategory[] = [
  { id: 'logement',          name: 'Logement',          colorClass: 'bg-slate-500',  iconName: 'home',          group: 'autre' },
  { id: 'courses',           name: 'Courses',           colorClass: 'bg-orange-500', iconName: 'shopping-cart', group: 'courses' },
  { id: 'restaurants',       name: 'Restaurants',       colorClass: 'bg-red-500',    iconName: 'utensils',      group: 'loisirs' },
  { id: 'transport',         name: 'Transport',         colorClass: 'bg-blue-500',   iconName: 'car',           group: 'transport' },
  { id: 'abonnements',       name: 'Abonnements',       colorClass: 'bg-teal-500',   iconName: 'play',          group: 'abonnements' },
  { id: 'energie_telecom',   name: 'Énergie & Télécom', colorClass: 'bg-yellow-500', iconName: 'zap',           group: 'abonnements' },
  { id: 'sante',             name: 'Santé',             colorClass: 'bg-pink-500',   iconName: 'heart',         group: 'autre' },
  { id: 'shopping',          name: 'Shopping',          colorClass: 'bg-purple-500', iconName: 'shopping-bag',  group: 'loisirs' },
  { id: 'loisirs',           name: 'Loisirs',           colorClass: 'bg-green-500',  iconName: 'music',         group: 'loisirs' },
  { id: 'voyages',           name: 'Voyages',           colorClass: 'bg-blue-500',   iconName: 'plane',         group: 'loisirs' },
  { id: 'revenus',           name: 'Revenus',           colorClass: 'bg-green-500',  iconName: 'zap',           group: 'autre', isIncome: true },
  { id: 'epargne_virements', name: 'Épargne & Virements', colorClass: 'bg-slate-500', iconName: 'wallet',       group: 'autre' },
  { id: 'autre',             name: 'Autre',             colorClass: 'bg-slate-500',  iconName: 'package',       group: 'autre' },
];

/** The four free-tier groups + Autre, with display metadata. */
export const FREE_GROUPS: Array<{ id: FreeGroup; name: string; colorClass: string; iconName: string }> = [
  { id: 'courses',     name: 'Courses',     colorClass: 'bg-orange-500', iconName: 'shopping-cart' },
  { id: 'transport',   name: 'Transport',   colorClass: 'bg-blue-500',   iconName: 'car' },
  { id: 'abonnements', name: 'Abonnements', colorClass: 'bg-teal-500',   iconName: 'play' },
  { id: 'loisirs',     name: 'Loisirs',     colorClass: 'bg-purple-500', iconName: 'music' },
  { id: 'autre',       name: 'Autre',       colorClass: 'bg-slate-500',  iconName: 'package' },
];

export const CATEGORY_SLUGS = SYSTEM_CATEGORIES.map((c) => c.id);
export const SLUG_PATTERN = /^[a-z0-9_]{2,30}$/;

const BY_ID = new Map(SYSTEM_CATEGORIES.map((c) => [c.id, c]));

export function categoryById(id: string): SystemCategory | undefined {
  return BY_ID.get(id as CategorySlug);
}

export function isValidSlug(id: string): id is CategorySlug {
  return BY_ID.has(id as CategorySlug);
}

/** User-created category slug (pro feature). Doc id in `categories/{slug}`. */
export const CUSTOM_SLUG_PATTERN = /^custom_[a-z0-9_]{1,23}$/;

export function isCustomSlug(id: string): boolean {
  return CUSTOM_SLUG_PATTERN.test(id);
}

/** Any slug the data model accepts on a transaction. */
export function isKnownSlug(id: string): boolean {
  return isValidSlug(id) || isCustomSlug(id);
}

/** Derive a custom slug from a display name ("Mes Chats" → "custom_mes_chats"). */
export function customSlugFor(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 23);
  return `custom_${base || 'categorie'}`;
}

/** Cap on user-created categories (enforced in UI/store, not rules). */
export const MAX_CUSTOM_CATEGORIES = 8;

/**
 * Legacy free-string category name → slug (migration + joining old data).
 * Matches loosely so LLM-invented labels ("Abonnement", "Télécom", "Charges
 * fixes"…) land somewhere sensible; unknown labels fall back to 'autre'.
 */
export function slugFromLegacy(name: string | undefined | null): CategorySlug {
  const n = (name || '').toLowerCase().trim();
  if (!n) return 'autre';
  if (isValidSlug(n)) return n;
  if (n.includes('nourriture') || n.includes('course') || n.includes('aliment') || n.includes('supermarch')) return 'courses';
  if (n.includes('restau') || n.includes('bar') || n.includes('café') || n.includes('cafe')) return 'restaurants';
  if (n.includes('transport') || n.includes('carburant') || n.includes('essence') || n.includes('auto')) return 'transport';
  if (n.includes('abo') || n.includes('streaming')) return 'abonnements';
  if (n.includes('énergie') || n.includes('energie') || n.includes('télécom') || n.includes('telecom') || n.includes('électric') || n.includes('electric') || n.includes('charge') || n.includes('internet') || n.includes('mobile')) return 'energie_telecom';
  if (n.includes('santé') || n.includes('sante') || n.includes('pharma') || n.includes('médec') || n.includes('medec')) return 'sante';
  if (n.includes('shopping') || n.includes('vêtement') || n.includes('vetement') || n.includes('mode')) return 'shopping';
  if (n.includes('loisir') || n.includes('sortie') || n.includes('culture') || n.includes('divertissement')) return 'loisirs';
  if (n.includes('voyage') || n.includes('vacance') || n.includes('hôtel') || n.includes('hotel')) return 'voyages';
  if (n.includes('revenu') || n.includes('salaire') || n.includes('income')) return 'revenus';
  if (n.includes('logement') || n.includes('loyer') || n.includes('immobilier')) return 'logement';
  if (n.includes('épargne') || n.includes('epargne') || n.includes('virement')) return 'epargne_virements';
  return 'autre';
}

/** Roll a slug up for display: identity on pro, free group otherwise.
 * Custom slugs (pro-only data) fold into 'autre' if ever seen on free. */
export function rollupSlug(slug: string, tier: 'free' | 'pro'): string {
  if (tier === 'pro') return slug;
  if (slug === 'revenus') return 'revenus'; // income is never rolled into spend groups
  return BY_ID.get(slug as CategorySlug)?.group ?? 'autre';
}

/** Display metadata for a rollup key (slug on pro, group on free). */
export function displayMeta(key: string, tier: 'free' | 'pro'): { name: string; colorClass: string; iconName: string } {
  if (tier === 'pro') {
    const c = categoryById(key);
    if (c) return { name: c.name, colorClass: c.colorClass, iconName: c.iconName };
  } else {
    const g = FREE_GROUPS.find((x) => x.id === key);
    if (g) return { name: g.name, colorClass: g.colorClass, iconName: g.iconName };
    if (key === 'revenus') return { name: 'Revenus', colorClass: 'bg-green-500', iconName: 'zap' };
  }
  return { name: key.charAt(0).toUpperCase() + key.slice(1), colorClass: 'bg-slate-500', iconName: 'package' };
}

/**
 * Normalize a transaction label for merchant-rule matching: uppercase, strip
 * digits/dates and payment noise, collapse whitespace.
 */
export function normalizeLabel(label: string): string {
  return (label || '')
    .toUpperCase()
    .replace(/\d+[/.-]?\d*/g, ' ')
    .replace(/\b(CB|CARTE|PRLV|PRELEVEMENT|VIR|VIREMENT|SEPA|PAIEMENT|ACHAT|LE|DU)\b/g, ' ')
    .replace(/[^A-ZÀ-Ü&' -]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

/** Deterministic doc id for a merchant rule (FNV-1a over the normalized label). */
export function merchantRuleId(normalizedLabel: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < normalizedLabel.length; i++) {
    h ^= normalizedLabel.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36).padStart(7, '0');
}

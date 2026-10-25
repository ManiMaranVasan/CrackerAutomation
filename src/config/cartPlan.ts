/**
 * Business rules for the "₹3000 cart" scenario:
 *  - Mostly night crackers that are suitable for kids (sparklers, flower pots, chakkars, pencils...)
 *  - A minimal set of day crackers (small sound crackers only, no big garlands / atom bombs)
 *
 * Everything can be overridden through env vars so the same suite can run other budgets.
 */

export interface BucketRule {
  key: BucketKey;
  label: string;
  /** Share of the total budget reserved for this bucket (0..1). */
  share: number;
  /** Matched against "<site category> <product name>" (case-insensitive). */
  include: RegExp;
  /** Items matching this are never picked for the bucket. */
  exclude: RegExp;
  /** Upper limit of units per product, keeps the cart varied. */
  maxQtyPerItem: number;
}

export type BucketKey = 'nightKids' | 'dayMinimal';

const num = (v: string | undefined, fallback: number) => (v && !Number.isNaN(Number(v)) ? Number(v) : fallback);

export const PRODUCTS_PATH = process.env.PRODUCTS_PATH ?? '/products.php?device=mobile';

export const CART_BUDGET = num(process.env.CART_BUDGET, 3000);

/**
 * How far below the budget the cart may land. 0 = exactly the budget, which also
 * meets sathyapyro.com's Tamil Nadu minimum order of ₹3000.
 */
export const BUDGET_TOLERANCE = num(process.env.BUDGET_TOLERANCE, 0);

/**
 * Aerial / loud / large items are never treated as kid friendly or "minimal".
 * "Fancy pipes" (2', 3 1/2', 4' fancy, chotta fancy) are aerial shells; "lar" is a chain of sound crackers.
 */
const NOT_FOR_KIDS =
  /rocket|aerial|sky\s*shot|multi\s*shot|\bshots?\b|repeat|mega|atom|hydro|thunder|king|bullet|bomb|cake|display|\b(1000|2000|5000|10000)\s*wala|pipe|chotta\s*fancy|\d'\s*fancy|dhamaka|double\s*ball|nayagara|niagara|\blar\b/i;

export const BUCKETS: BucketRule[] = [
  {
    key: 'nightKids',
    label: 'Night crackers for kids',
    share: num(process.env.NIGHT_SHARE, 0.7),
    include:
      /sparkler|flower\s*pots?|chakk?ar|chakra|wheel|pencil|fountain|twinkl|star|candle|magic|snake|colou?r\s*(match|smoke)|fancy|kids|children|night/i,
    exclude: NOT_FOR_KIDS,
    maxQtyPerItem: num(process.env.MAX_QTY_PER_ITEM, 5),
  },
  {
    key: 'dayMinimal',
    label: 'Day crackers (minimal)',
    share: 1 - num(process.env.NIGHT_SHARE, 0.7),
    include: /bijili|bijli|kuruvi|lakshmi|chorsa|chit?\s*put|red\s*fort|deluxe|sound|garland|\b(28|50|100|24)\s*(wala|chain)|one\s*sound|two\s*sound|day/i,
    // "Minimal": no big garlands, no bombs or anything aerial.
    exclude: /rocket|aerial|shot|atom|hydro|king|bullet|mega|\b(1000|2000|5000|10000)\s*wala|bomb/i,
    maxQtyPerItem: num(process.env.DAY_MAX_QTY_PER_ITEM, 2),
  },
];

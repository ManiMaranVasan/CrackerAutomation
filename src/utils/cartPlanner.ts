import { BucketKey, BucketRule } from '../config/cartPlan';

export interface Product {
  /** Stable index assigned while scraping; used to locate the qty input again. */
  idx: number;
  name: string;
  category: string;
  /** Net (selling) price per unit after site discount. */
  price: number;
  /** Original / MRP price if shown. */
  mrp?: number;
}

export interface CartLine {
  product: Product;
  bucket: BucketKey;
  qty: number;
  lineTotal: number;
}

export interface CartPlan {
  lines: CartLine[];
  total: number;
  budget: number;
  byBucket: Record<BucketKey, number>;
}

export function classify(product: Product, buckets: BucketRule[]): BucketKey | undefined {
  const haystack = `${product.category} ${product.name}`;
  // Category is the strongest signal (e.g. "Sound Crackers" vs "Flower Pots"), so try it alone first.
  for (const b of buckets) {
    if (b.include.test(product.category) && !b.exclude.test(haystack)) return b.key;
  }
  for (const b of buckets) {
    if (b.include.test(haystack) && !b.exclude.test(haystack)) return b.key;
  }
  return undefined;
}

/**
 * Builds a varied cart that never exceeds the budget.
 * Each bucket gets its share; inside a bucket items are added one unit at a time,
 * cheapest first, round-robin, so the cart has many different products rather
 * than a big quantity of one. Money a bucket could not spend is then offered to
 * every bucket (in priority order) to get as close to the budget as possible.
 * Bucket order is priority order: the first bucket is the main one.
 */
export function planCart(products: Product[], buckets: BucketRule[], budget: number): CartPlan {
  const qty = new Map<number, number>();
  const bucketOf = new Map<number, BucketKey>();
  const byBucket = Object.fromEntries(buckets.map((b) => [b.key, 0])) as Record<BucketKey, number>;
  let total = 0;

  const candidates = new Map<BucketKey, Product[]>();
  for (const b of buckets) candidates.set(b.key, []);
  for (const p of products) {
    if (!(p.price > 0)) continue;
    const key = classify(p, buckets);
    if (!key) continue;
    bucketOf.set(p.idx, key);
    candidates.get(key)!.push(p);
  }
  for (const list of candidates.values()) list.sort((a, b) => a.price - b.price || a.name.localeCompare(b.name));

  const fill = (rule: BucketRule, limit: number, maxQty = rule.maxQtyPerItem) => {
    const list = candidates.get(rule.key)!;
    let added = true;
    while (added) {
      added = false;
      for (const p of list) {
        const q = qty.get(p.idx) ?? 0;
        if (q >= maxQty) continue;
        if (byBucket[rule.key] + p.price > limit || total + p.price > budget) continue;
        qty.set(p.idx, q + 1);
        byBucket[rule.key] += p.price;
        total += p.price;
        added = true;
      }
    }
  };

  for (const b of buckets) fill(b, Math.floor(budget * b.share));
  for (const b of buckets) fill(b, budget);
  // Small catalogues can hit the per-item caps early; top up the priority bucket only,
  // so the secondary ("minimal") bucket stays minimal.
  if (buckets[0]) fill(buckets[0], budget, Infinity);
  if (buckets[0]) {
    for (const p of exactTopUp(candidates.get(buckets[0].key)!, budget - total)) {
      qty.set(p.idx, (qty.get(p.idx) ?? 0) + 1);
      byBucket[buckets[0].key] += p.price;
      total += p.price;
    }
  }

  const lines: CartLine[] = [];
  for (const p of products) {
    const q = qty.get(p.idx);
    if (q) lines.push({ product: p, bucket: bucketOf.get(p.idx)!, qty: q, lineTotal: round2(q * p.price) });
  }
  return { lines, total: round2(total), budget, byBucket };
}

/**
 * Greedy filling usually stops a few rupees short. Picks the combination of items
 * (repeats allowed) whose sum is the largest amount <= remaining, ideally exactly it.
 * Unbounded knapsack over paise; the remainder is small so this is cheap.
 */
export function exactTopUp(items: Product[], remaining: number): Product[] {
  const cap = Math.round(remaining * 100);
  if (cap <= 0 || !items.length) return [];
  const cents = items.map((p) => Math.round(p.price * 100));
  // from[s] = index of the item that last reached sum s, -1 = unreachable.
  const from = new Int32Array(cap + 1).fill(-1);
  const reached = new Uint8Array(cap + 1);
  reached[0] = 1;
  for (let s = 1; s <= cap; s++) {
    for (let i = 0; i < cents.length; i++) {
      if (cents[i] <= s && reached[s - cents[i]]) {
        reached[s] = 1;
        from[s] = i;
        break;
      }
    }
  }
  let s = cap;
  while (s > 0 && !reached[s]) s--;
  const picked: Product[] = [];
  while (s > 0) {
    picked.push(items[from[s]]);
    s -= cents[from[s]];
  }
  return picked;
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

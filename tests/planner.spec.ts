import { expect, test } from '@playwright/test';
import { BUCKETS } from '../src/config/cartPlan';
import { classify, planCart, Product } from '../src/utils/cartPlanner';

const p = (idx: number, name: string, category: string, price: number): Product => ({ idx, name, category, price });

const catalogue: Product[] = [
  p(0, '10 cm Electric Sparklers', 'Sparklers', 20),
  p(1, '30 cm Sparklers', 'Sparklers', 90),
  p(2, 'Flower Pots Big', 'Flower Pots', 100),
  p(3, 'Ground Chakkar Special', 'Ground Chakkar', 75),
  p(4, 'Colour Pencil', 'Pencil', 55),
  p(5, '4" Lakshmi', 'Sound Crackers', 30),
  p(6, 'Red Bijili', 'Bijili', 50),
  p(7, 'Atom Bomb', 'Bombs', 60),
  p(8, '1000 Wala', 'Garlands', 400),
  p(9, '12 Shot Multi Colour', 'Repeating Shots', 250),
  p(10, 'Whistling Rocket', 'Rockets', 80),
];

test.describe('cart planner', () => {
  test('classifies kid-friendly night items and minimal day items', () => {
    const bucket = (i: number) => classify(catalogue[i], BUCKETS);
    expect([0, 1, 2, 3, 4].map(bucket)).toEqual(Array(5).fill('nightKids'));
    expect([5, 6].map(bucket)).toEqual(['dayMinimal', 'dayMinimal']);
    expect([7, 8, 9, 10].map(bucket)).toEqual([undefined, undefined, undefined, undefined]);
  });

  test('stays within ₹3000, close to it, mostly night items', () => {
    const plan = planCart(catalogue, BUCKETS, 3000);
    const sum = plan.lines.reduce((s, l) => s + l.lineTotal, 0);
    expect(plan.total).toBe(sum);
    expect(plan.total).toBeLessThanOrEqual(3000);
    expect(plan.total).toBeGreaterThanOrEqual(3000 - 20);
    expect(plan.byBucket.nightKids).toBeGreaterThan(plan.byBucket.dayMinimal);
    // Day crackers stay minimal; only the night bucket is topped up past its per-item cap.
    const dayCap = BUCKETS.find((b) => b.key === 'dayMinimal')!.maxQtyPerItem;
    for (const line of plan.lines.filter((l) => l.bucket === 'dayMinimal')) expect(line.qty).toBeLessThanOrEqual(dayCap);
  });

  test('keeps per-item caps when the catalogue is large enough', () => {
    const big = Array.from({ length: 40 }, (_, i) => p(i, `Sparkler ${i}`, 'Sparklers', 20 + i));
    const plan = planCart(big, BUCKETS, 3000);
    expect(Math.max(...plan.lines.map((l) => l.qty))).toBeLessThanOrEqual(5);
    expect(plan.total).toBeLessThanOrEqual(3000);
  });

  test('never exceeds a small budget', () => {
    const plan = planCart(catalogue, BUCKETS, 45);
    expect(plan.total).toBeLessThanOrEqual(45);
  });
});

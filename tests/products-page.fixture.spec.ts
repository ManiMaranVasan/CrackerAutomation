import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';
import { BUCKETS } from '../src/config/cartPlan';
import { ProductsPage } from '../src/pages/ProductsPage';
import { planCart } from '../src/utils/cartPlanner';

const fixture = (name: string) => pathToFileURL(path.join(__dirname, 'fixtures', name)).href;

test.describe('ProductsPage against local fixtures', () => {
  test('scrapes table layout: name, net price, MRP and category', async ({ page }) => {
    const products = new ProductsPage(page);
    await products.open(fixture('products-table.html'));
    const list = await products.scrapeProducts();

    expect(list).toHaveLength(11);
    expect(list[0]).toEqual({ idx: 0, name: '10 cm Electric Sparklers', category: 'SPARKLERS', price: 20, mrp: 100 });
    expect(list.find((p) => p.name === 'Red Bijili')).toMatchObject({ category: 'SOUND CRACKERS', price: 50 });
  });

  test('scrapes card layout using headings as categories', async ({ page }) => {
    const products = new ProductsPage(page);
    await products.open(fixture('products-cards.html'));
    const list = await products.scrapeProducts();

    expect(list.map((p) => [p.name, p.category, p.price, p.mrp])).toEqual([
      ['Twinkling Star', 'Kids Special Night Fancy', 18, 90],
      ['Pencil (5 pcs)', 'Kids Special Night Fancy', 24, 120],
      ['2 3/4" Kuruvi', 'One Sound Crackers', 12, 60],
    ]);
  });

  test('fills planned quantities and site total matches the plan', async ({ page }) => {
    const products = new ProductsPage(page);
    await products.open(fixture('products-table.html'));
    const plan = planCart(await products.scrapeProducts(), BUCKETS, 1000);

    const names = plan.lines.map((l) => l.product.name);
    expect(names).not.toContain('Hydro Bomb');
    expect(names).not.toContain('1000 Wala Garland');
    expect(names).not.toContain('Baby Rocket');

    for (const line of plan.lines) await products.setQuantity(line.product.idx, line.qty);
    expect(await products.readCartTotal()).toBe(plan.total);
    expect(plan.total).toBeLessThanOrEqual(1000);
  });
});

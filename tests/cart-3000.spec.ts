import { expect, test } from '@playwright/test';
import { BUCKETS, BUDGET_TOLERANCE, CART_BUDGET, PRODUCTS_PATH } from '../src/config/cartPlan';
import { ProductsPage } from '../src/pages/ProductsPage';
import { planCart } from '../src/utils/cartPlanner';
import { cartPlanToMarkdown, writeReport } from '../src/utils/report';

test.describe(`Cart of ₹${CART_BUDGET}: night crackers for kids + minimal day crackers`, () => {
  test('builds the cart within budget and shares the list', async ({ page }, testInfo) => {
    const products = new ProductsPage(page);

    await test.step('Open products page (mobile)', async () => {
      await products.open(PRODUCTS_PATH);
    });

    const catalogue = await test.step('Read product catalogue', async () => {
      const list = await products.scrapeProducts();
      await testInfo.attach('catalogue.json', { body: JSON.stringify(list, null, 2), contentType: 'application/json' });
      expect(list.length, 'products with a price and quantity box').toBeGreaterThan(0);
      return list;
    });

    const plan = await test.step(`Plan a cart within ₹${CART_BUDGET}`, async () => {
      const p = planCart(catalogue, BUCKETS, CART_BUDGET);
      for (const b of BUCKETS) {
        expect.soft(p.lines.some((l) => l.bucket === b.key), `at least one "${b.label}" item`).toBe(true);
      }
      expect(p.total).toBeLessThanOrEqual(CART_BUDGET);
      expect(p.total, `cart should be close to ₹${CART_BUDGET}`).toBeGreaterThanOrEqual(CART_BUDGET - BUDGET_TOLERANCE);
      return p;
    });

    await test.step('Add planned quantities to the cart', async () => {
      for (const line of plan.lines) {
        await products.setQuantity(line.product.idx, line.qty);
        await expect(products.qtyInput(line.product.idx)).toHaveValue(String(line.qty));
      }
    });

    const siteTotal = await test.step('Verify cart total shown by the site', async () => {
      // Quantities are saved via AJAX one by one; wait for the last update to land.
      await expect.poll(() => products.readCartTotal(), { timeout: 20_000 }).toBe(plan.total).catch(() => {});
      const total = await products.readCartTotal();
      if (total === null) {
        testInfo.annotations.push({ type: 'warning', description: 'Cart total element not found; set CART_TOTAL_SELECTOR.' });
      } else {
        expect.soft(total, 'site cart total matches planned total').toBeCloseTo(plan.total, 0);
        expect(total).toBeLessThanOrEqual(CART_BUDGET);
      }
      return total;
    });

    await test.step('Share the cart list', async () => {
      const url = page.url();
      const markdown = cartPlanToMarkdown(plan, BUCKETS, { url, siteTotal });
      const file = writeReport('cart-list', markdown, { url, siteTotal, ...plan });
      await testInfo.attach('cart-list.md', { body: markdown, contentType: 'text/markdown' });
      await page.screenshot({ path: testInfo.outputPath('cart.png'), fullPage: true });
      await testInfo.attach('cart.png', { path: testInfo.outputPath('cart.png'), contentType: 'image/png' });
      console.log(`\n${markdown}\nSaved to ${file}`);
    });
  });
});

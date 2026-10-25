import { Locator, Page } from '@playwright/test';
import { Product } from '../utils/cartPlanner';

/**
 * Page object for the products / quick-order page.
 *
 * Cracker shop sites change their markup every season, so instead of hard-coding a
 * single layout the scraper finds every quantity input and reads the product name,
 * price and category from the row / card around it. Selectors can still be pinned
 * through env vars if the heuristics ever pick the wrong thing.
 */
export const SELECTORS = {
  qtyInput:
    process.env.QTY_SELECTOR ??
    'input[type="number"], input[name*="qty" i], input[id*="qty" i], input[class*="qty" i], input[name*="quantity" i], input[class*="quantity" i]',
  /** Tried in order; the first one showing a positive amount wins (grand/net total before plain totals). */
  cartTotal: (process.env.CART_TOTAL_SELECTOR
    ? [process.env.CART_TOTAL_SELECTOR]
    : [
        '[id*="grand" i], [class*="grand" i]',
        '[id*="net_total" i], [id*="nettotal" i], [class*="net-total" i], [class*="nettotal" i]',
        '[id*="total_amount" i], [id*="totalamount" i], [class*="total-amount" i], [id*="cart_total" i], [class*="cart-total" i], [id*="overall" i]',
      ]) as string[],
};

const QA_ATTR = 'data-qa-idx';

export class ProductsPage {
  constructor(readonly page: Page) {}

  async open(path: string) {
    await this.page.goto(path, { waitUntil: 'domcontentloaded' });
    await this.page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
    await this.dismissPopups();
    await this.page.locator(SELECTORS.qtyInput).first().waitFor({ state: 'attached', timeout: 30_000 });
  }

  /** Best effort: close "minimum order" / offer modals that cover the list. */
  async dismissPopups() {
    await this.page.keyboard.press('Escape').catch(() => {});
    const closers = this.page.locator(
      '.modal.show button.close, .modal.show [data-dismiss="modal"], .modal.show [data-bs-dismiss="modal"], .swal2-confirm, .swal-button, [class*="popup" i] [class*="close" i]',
    );
    for (const closer of await closers.all()) {
      if (await closer.isVisible().catch(() => false)) await closer.click({ timeout: 2_000 }).catch(() => {});
    }
  }

  async scrapeProducts(): Promise<Product[]> {
    return this.page.evaluate(
      ({ qtySelector, attr }) => {
        const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
        const priceOf = (s: string) => {
          const m = s.replace(/,/g, '').match(/(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)/i);
          return m ? Number(m[1]) : NaN;
        };
        const looksLikePrice = (s: string) => /^(?:₹|rs\.?|inr)?\s*[\d,]+(?:\.\d{1,2})?\s*(?:\/-)?$/i.test(s);
        const hasCurrency = (s: string) => /₹|rs\.?|inr|\.\d{2}\b|\/-/i.test(s);
        const struck = (el: Element) =>
          !!el.closest('del, s, strike') ||
          /line-through/.test(getComputedStyle(el).textDecorationLine) ||
          /mrp|actual|old|original|strike|cut/i.test(`${el.className} ${el.id}`);

        // Category headings in document order, used for card layouts.
        const headings = [
          ...document.querySelectorAll(
            'h1, h2, h3, h4, h5, h6, [class*="cat" i][class*="title" i], [class*="category" i] > :first-child, [class*="cat-head" i], .accordion-button, .panel-title',
          ),
        ].filter((h) => clean(h.textContent).length > 1 && clean(h.textContent).length < 80 && !h.querySelector('input'));

        const precedingHeading = (el: Element) => {
          let best = '';
          for (const h of headings) {
            if (h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) best = clean(h.textContent);
          }
          return best;
        };

        const tableHeaders = (table: HTMLTableElement) => {
          const headRow = table.tHead?.rows[0] ?? [...table.rows].find((r) => r.querySelector('th') && r.cells.length > 2);
          return headRow ? [...headRow.cells].map((c) => clean(c.textContent).toLowerCase()) : [];
        };

        const categoryRowAbove = (row: HTMLTableRowElement) => {
          for (let r = row.previousElementSibling; r; r = r.previousElementSibling) {
            if (!(r instanceof HTMLTableRowElement) || r.querySelector('input')) continue;
            const text = clean(r.textContent);
            if (text && (r.cells.length === 1 || r.cells[0]?.colSpan > 1 || /cat/i.test(r.className))) return text;
          }
          // Categories rendered as a <tbody> caption or a heading above the table.
          return precedingHeading(row);
        };

        const products: { idx: number; name: string; category: string; price: number; mrp?: number }[] = [];
        const inputs = [...document.querySelectorAll<HTMLInputElement>(qtySelector)].filter(
          (i) => i.type !== 'hidden' && !i.readOnly && !/search|phone|mobile|pin|email|name/i.test(`${i.name} ${i.id}`),
        );

        inputs.forEach((input, idx) => {
          input.setAttribute(attr, String(idx));
          const row = input.closest('tr');
          let name = '';
          let category = '';
          let price = NaN;
          let mrp: number | undefined;

          if (row) {
            const table = row.closest('table')!;
            const headers = tableHeaders(table);
            const cells = [...row.cells];
            const col = (re: RegExp, not?: RegExp) => headers.findIndex((h) => re.test(h) && !(not && not.test(h)));
            const nameCol = col(/product|name|item|description/);
            const mrpCol = col(/actual|mrp|original|old|list/);
            const priceCol = headers.reduce(
              (found, h, i) => (/price|rate|net|offer|disc|our|amount/.test(h) && !/actual|mrp|original|old|list|total/.test(h) ? i : found),
              -1,
            );
            if (nameCol >= 0 && cells[nameCol]) name = clean(cells[nameCol].textContent);
            if (priceCol >= 0 && cells[priceCol]) price = priceOf(clean(cells[priceCol].textContent));
            if (mrpCol >= 0 && cells[mrpCol]) mrp = priceOf(clean(cells[mrpCol].textContent));
            category = categoryRowAbove(row);
          }

          const container =
            row ??
            input.closest('[class*="product" i], [class*="item" i], [class*="card" i], li') ??
            input.parentElement?.parentElement?.parentElement ??
            document.body;

          if (!name) {
            const named = container.querySelector('[class*="name" i], [class*="title" i], h4, h5, h6, strong, b');
            name = clean(named?.textContent);
            if (!name) {
              const texts = [...container.querySelectorAll('td, div, span, p')]
                .filter((e) => !e.children.length)
                .map((e) => clean(e.textContent))
                .filter((t) => t.length > 2 && !looksLikePrice(t));
              name = texts.sort((a, b) => b.length - a.length)[0] ?? '';
            }
          }

          if (Number.isNaN(price)) {
            const leaves = [...container.querySelectorAll('*')].filter(
              (e) => !e.children.length && !e.contains(input) && looksLikePrice(clean(e.textContent)),
            );
            const withCurrency = leaves.filter((e) => hasCurrency(clean(e.textContent)));
            const pool = (withCurrency.length ? withCurrency : leaves).filter((e) => priceOf(clean(e.textContent)) > 0);
            const net = pool.filter((e) => !struck(e)).map((e) => priceOf(clean(e.textContent)));
            const old = pool.filter((e) => struck(e)).map((e) => priceOf(clean(e.textContent)));
            if (net.length) price = Math.min(...net);
            if (old.length) mrp = Math.max(...old);
          }

          if (!category) category = precedingHeading(input);
          if (name && price > 0) products.push({ idx, name, category, price, ...(mrp && mrp > 0 ? { mrp } : {}) });
        });

        return products;
      },
      { qtySelector: SELECTORS.qtyInput, attr: QA_ATTR },
    );
  }

  qtyInput(idx: number): Locator {
    return this.page.locator(`[${QA_ATTR}="${idx}"]`);
  }

  async setQuantity(idx: number, qty: number) {
    const input = this.qtyInput(idx);
    await input.scrollIntoViewIfNeeded().catch(() => {});
    if (!(await input.isVisible())) await this.expandSectionOf(input);
    await input.fill(String(qty));
    // Sites recalculate on keyup/change/blur depending on the theme.
    await input.dispatchEvent('keyup');
    await input.dispatchEvent('change');
    await input.press('Tab').catch(() => {});
  }

  /** Mobile layouts often collapse categories into accordions. */
  private async expandSectionOf(input: Locator) {
    const toggle = input.locator(
      'xpath=ancestor::*[contains(@class,"collapse") or contains(@class,"accordion")][1]/preceding-sibling::*[1]',
    );
    if (await toggle.count()) await toggle.first().click().catch(() => {});
    await input.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {});
  }

  /** Reads the cart / grand total shown by the site, or null if it cannot be found. */
  async readCartTotal(): Promise<number | null> {
    for (const selector of SELECTORS.cartTotal) {
      const values = await this.page.locator(selector).evaluateAll((els) =>
        els
          .map((e) => ((e as HTMLInputElement).value ?? e.textContent ?? '').replace(/,/g, ''))
          .map((t) => t.match(/(\d+(?:\.\d+)?)/))
          .filter((m): m is RegExpMatchArray => !!m)
          .map((m) => Number(m[1]))
          .filter((v) => v > 0),
      );
      if (values.length) return values[0];
    }
    return null;
  }
}

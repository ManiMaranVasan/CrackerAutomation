# CrackerAutomation

Playwright + TypeScript automation for <https://sathyapyro.com/products.php?device=mobile>.

## Scenario: ₹3000 cart

`tests/cart-3000.spec.ts` (project `live-mobile`, Pixel 7 emulation):

1. Opens the products page in mobile mode and closes any popup.
2. Reads every product that has a quantity box: name, net price, MRP, site category.
3. Plans a cart of **exactly ₹3000** (never more; the site's Tamil Nadu minimum order is ₹3000):
   - **~70% night crackers for kids**: sparklers, flower pots, ground chakkars, pencils, fountains, twinkling stars…
     Rockets, shots, bombs, aerial fancy pipes, "lar" chains and big garlands are excluded.
   - **~30% minimal day crackers**: small sound crackers such as Lakshmi, Kuruvi, Bijili, 28/50/100 wala chains.
     Max 2 units per item, no bombs, no 1000+ wala garlands.
   - Items are added one unit at a time, cheapest first, round-robin, so the cart has many different products;
     a final exact-fit step closes the last few rupees with night items.
4. Types the quantities into the page (each one is saved to the site cart via AJAX) and checks the site's
   cart sub total (`.sub_total`) matches the plan.
5. **Shares the list** in `reports/cart-list.md` (+ `cart-list.json`), prints it in the console and attaches it,
   the scraped catalogue and a full-page screenshot to the HTML report.

## Notes

- Plain `curl` gets a Cloudflare block page; a real browser (Playwright) loads the site fine.
- The test only fills the cart; it never presses *Confirm Estimate*, so no order is placed.

## Run

```bash
npm ci
npx playwright install chromium   # first time only
npm run test:offline              # planner + page object against local fixtures (no network)
npm run test:live                 # real site
npm run test:live:headed          # watch it run
npm run report                    # open the HTML report
```

## Tuning (env vars)

| Variable | Default | Meaning |
|---|---|---|
| `CART_BUDGET` | `3000` | Max cart value (₹) |
| `BUDGET_TOLERANCE` | `0` | Cart must be at least `budget - tolerance` (0 = exact) |
| `NIGHT_SHARE` | `0.7` | Share of budget for night/kids crackers |
| `MAX_QTY_PER_ITEM` / `DAY_MAX_QTY_PER_ITEM` | `5` / `2` | Variety caps per product |
| `BASE_URL`, `PRODUCTS_PATH` | site / `/products.php?device=mobile` | Target page |
| `QTY_SELECTOR`, `NAME_SELECTOR`, `PRICE_SELECTOR`, `MRP_SELECTOR`, `CATEGORY_SELECTOR`, `CART_TOTAL_SELECTOR` | site markup + heuristics | Pin selectors if the site markup changes |

Category keywords live in `src/config/cartPlan.ts`.

## Layout

```
src/config/cartPlan.ts     budget + category rules
src/pages/ProductsPage.ts  page object (scrape, set qty, read total)
src/utils/cartPlanner.ts   cart selection logic
src/utils/report.ts        markdown/json cart list
tests/cart-3000.spec.ts    live end-to-end scenario
tests/planner.spec.ts      unit tests for the planner
tests/products-page.fixture.spec.ts + tests/fixtures/  page object tests on sample HTML (made-up data)
```

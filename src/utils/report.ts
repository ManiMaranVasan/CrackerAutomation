import fs from 'node:fs';
import path from 'node:path';
import { BucketRule } from '../config/cartPlan';
import { CartPlan } from './cartPlanner';

const inr = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function cartPlanToMarkdown(plan: CartPlan, buckets: BucketRule[], meta: { url: string; siteTotal: number | null }) {
  const out: string[] = [
    `# Cart list – budget ${inr(plan.budget)}`,
    '',
    `- Source: ${meta.url}`,
    `- Generated: ${new Date().toISOString()}`,
    `- Planned total: **${inr(plan.total)}**`,
    `- Total shown by site: ${meta.siteTotal === null ? '_not detected_' : `**${inr(meta.siteTotal)}**`}`,
    '',
  ];
  for (const b of buckets) {
    const lines = plan.lines.filter((l) => l.bucket === b.key);
    out.push(`## ${b.label} – ${inr(plan.byBucket[b.key])}`, '');
    if (!lines.length) {
      out.push('_No matching products found on the page._', '');
      continue;
    }
    out.push('| # | Product | Site category | Unit price | Qty | Line total |', '|---|---|---|---:|---:|---:|');
    lines.forEach((l, i) =>
      out.push(`| ${i + 1} | ${l.product.name} | ${l.product.category || '-'} | ${inr(l.product.price)} | ${l.qty} | ${inr(l.lineTotal)} |`),
    );
    out.push('');
  }
  out.push(`**Grand total: ${inr(plan.total)}** (${plan.lines.length} products, ${plan.lines.reduce((s, l) => s + l.qty, 0)} units)`, '');
  return out.join('\n');
}

export function writeReport(name: string, markdown: string, json: unknown) {
  const dir = path.resolve(process.cwd(), 'reports');
  fs.mkdirSync(dir, { recursive: true });
  const md = path.join(dir, `${name}.md`);
  fs.writeFileSync(md, markdown);
  fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(json, null, 2));
  return md;
}

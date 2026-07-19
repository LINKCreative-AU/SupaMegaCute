// One-off cleanup: remove prototype placeholder products that were seeded
// with invented merchant refs (fake Amazon ASINs like B0SMCPLUSH1,
// sequential Etsy/eBay listing ids, and shop.cutepartner.example URLs).
// Real crawled products all carry provenance and live store URLs.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const path = join(root, "data", "products.json");
const catalog = JSON.parse(readFileSync(path, "utf8"));

const isPlaceholder = (p) =>
  p.merchant !== "shopify-partner" || p.merchantRef.includes(".example/");

const removed = catalog.products.filter(isPlaceholder);
catalog.products = catalog.products.filter((p) => !isPlaceholder(p));

writeFileSync(path, JSON.stringify(catalog));
console.log(`removed ${removed.length} placeholder products, ${catalog.products.length} remain`);
for (const p of removed) console.log(`  - ${p.id} (${p.merchant}: ${p.merchantRef})`);

// Remap products from the single legacy "shopify-partner" merchant to their
// per-store merchant id (bellzi, sanrio, blippo, …), taken from each
// product's recorded provenance.source. This lets each store carry its own
// affiliate id / direct program, with the aggregator layer covering the rest.
// Marketplace merchants (amazon/etsy/ebay) are left untouched.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const productsPath = join(root, "data", "products.json");
const merchants = JSON.parse(readFileSync(join(root, "data", "merchants.json"), "utf8")).merchants;
const catalog = JSON.parse(readFileSync(productsPath, "utf8"));

let remapped = 0, unmatched = 0;
const unknown = new Set();
for (const p of catalog.products) {
  if (p.merchant !== "shopify-partner") continue;
  const src = p.provenance?.source;
  if (src && merchants[src]) {
    p.merchant = src;
    remapped++;
  } else {
    unmatched++;
    unknown.add(src || "(no source)");
  }
}

writeFileSync(productsPath, JSON.stringify(catalog));
console.log(`Remapped ${remapped} products to per-store merchants; ${unmatched} unmatched.`);
if (unknown.size) console.log("Unmatched sources:", [...unknown].join(", "));

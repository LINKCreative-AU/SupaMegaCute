#!/usr/bin/env node
/* Refresh promoted products against the latest crawled feeds.
   Run after crawl-shopify.mjs. For every promoted product sourced from a
   Shopify feed: update price if changed, mark availability, and flag records
   whose product disappeared from the feed (discontinued -> hidden from site).
   The graph is never silently shrunk — records are flagged, not deleted. */

import { readFile, writeFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const RAW_DIR = join(here, "raw");
const PRODUCTS_PATH = join(here, "..", "data", "products.json");

const db = JSON.parse(await readFile(PRODUCTS_PATH, "utf8"));

// Index the latest feeds: "<domain>/products/<handle>" -> {price, available}
const feed = new Map();
for (const f of (await readdir(RAW_DIR)).filter((f) => f.endsWith(".json"))) {
  const raw = JSON.parse(await readFile(join(RAW_DIR, f), "utf8"));
  for (const p of raw.products || []) {
    const variants = p.variants || [];
    const available = variants.some((v) => v.available !== false);
    const priced = variants.find((v) => v.available !== false) || variants[0];
    feed.set(`${raw.domain}/products/${p.handle}`, {
      price: priced ? parseFloat(priced.price) : null,
      available,
      checkedAt: raw.fetchedAt,
    });
  }
}

let priceChanges = 0, unavailable = 0, gone = 0, checked = 0;
for (const product of db.products) {
  if (product.merchant !== "shopify-partner") continue;
  checked++;
  const live = feed.get(product.merchantRef);
  if (!live) {
    // Not in the crawled pages — could be beyond crawl depth; flag, don't delete.
    product.availability = { status: "not-seen", lastSeenAt: product.provenance?.fetchedAt };
    gone++;
    continue;
  }
  if (live.price && Math.abs(live.price - product.price) >= 0.01) {
    product.price = live.price;
    priceChanges++;
  }
  product.availability = { status: live.available ? "in-stock" : "out-of-stock", checkedAt: live.checkedAt };
  if (!live.available) unavailable++;
}

await writeFile(PRODUCTS_PATH, JSON.stringify(db, null, 2));
console.log(`Refreshed ${checked} feed-sourced products: ${priceChanges} price updates, ${unavailable} out-of-stock, ${gone} not seen in latest crawl.`);

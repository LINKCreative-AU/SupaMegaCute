#!/usr/bin/env node
/* Shopify connector: pulls each verified store's public products.json feed.
   Identifies itself honestly, rate-limits, and stops at maxPagesPerStore.
   Raw responses land in ingest/raw/<store>.json for the normalize step. */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(await readFile(join(here, "sources.json"), "utf8"));
const RAW_DIR = join(here, "raw");
await mkdir(RAW_DIR, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function crawlStore(source) {
  const products = [];
  for (let page = 1; page <= config.maxPagesPerStore; page++) {
    const url = `https://${source.domain}/products.json?limit=250&page=${page}`;
    const res = await fetch(url, {
      headers: { "User-Agent": config.userAgent, Accept: "application/json" },
    });
    if (!res.ok) {
      console.warn(`  ${source.domain} page ${page}: HTTP ${res.status} — stopping`);
      break;
    }
    const body = await res.json();
    const batch = body.products || [];
    products.push(...batch);
    console.log(`  ${source.domain} page ${page}: ${batch.length} products`);
    if (batch.length < 250) break;
    await sleep(config.rateLimitMs);
  }
  return products;
}

const only = process.argv[2]; // optional: crawl a single source id
const shopifySources = config.sources.filter(
  (s) => s.type === "shopify" && s.verified && (!only || s.id === only)
);

for (const source of shopifySources) {
  console.log(`Crawling ${source.id} (${source.domain})…`);
  try {
    const products = await crawlStore(source);
    const out = {
      source: source.id,
      domain: source.domain,
      brandHint: source.brandHint,
      fetchedAt: new Date().toISOString(),
      count: products.length,
      products,
    };
    await writeFile(join(RAW_DIR, `${source.id}.json`), JSON.stringify(out, null, 2));
    console.log(`  wrote ingest/raw/${source.id}.json (${products.length} products)`);
  } catch (err) {
    console.error(`  ${source.id} failed:`, err.message);
  }
  await sleep(config.rateLimitMs);
}

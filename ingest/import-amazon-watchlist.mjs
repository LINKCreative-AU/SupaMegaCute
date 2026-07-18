#!/usr/bin/env node
/* Import curated Amazon records (ingest/amazon-watchlist.json) into the graph.
   Entries with status "ready" become products with merchant "amazon":
   price is the band midpoint marked approximate (cards render "~$X"), no
   imagery. When PA-API access lands, the sync job upgrades these records
   in place with live prices and official images by ASIN. */

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const watchlist = JSON.parse(await readFile(join(here, "amazon-watchlist.json"), "utf8"));
const PRODUCTS_PATH = join(here, "..", "data", "products.json");
const taxonomy = JSON.parse(await readFile(join(here, "..", "data", "taxonomy.json"), "utf8"));
const db = JSON.parse(await readFile(PRODUCTS_PATH, "utf8"));

const bands = Object.fromEntries(taxonomy.facets.priceBand.map((b) => [b.slug, b]));
const existing = new Set(db.products.map((p) => `${p.merchant}:${p.merchantRef}`));

let imported = 0;
for (const e of watchlist.entries) {
  if (e.status !== "ready") continue;
  if (existing.has(`amazon:${e.asin}`)) continue;
  const band = bands[e.priceBand];
  if (!band) { console.warn(`${e.asin}: unknown priceBand ${e.priceBand}`); continue; }

  db.products.push({
    id: `amazon-${e.asin.toLowerCase()}`,
    name: e.name,
    blurb: e.blurb,
    brand: e.brand,
    pillars: e.pillars,
    price: band.max ? (band.min + band.max) / 2 : band.min * 1.5,
    priceApprox: true,
    currency: "USD",
    merchant: "amazon",
    merchantRef: e.asin,
    aesthetics: e.aesthetics, moods: e.moods, recipients: e.recipients,
    occasions: e.occasions, rooms: e.rooms, colours: e.colours,
    themes: e.themes, tags: e.tags,
    art: e.art,
    provenance: { source: "amazon-watchlist", curated: true },
  });
  imported++;
}

await writeFile(PRODUCTS_PATH, JSON.stringify(db, null, 2));
console.log(`Imported ${imported} curated Amazon products. Graph: ${db.products.length}.`);

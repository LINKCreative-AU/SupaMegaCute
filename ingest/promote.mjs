#!/usr/bin/env node
/* Promote reviewed drafts from ingest/inbox into data/products.json.
   Only drafts with status "approved" are merged (set by a human reviewer, or
   pass --auto to promote every "tagged" draft — fine for staging, not prod).
   Dedupes on {merchant, merchantRef}; existing records are never overwritten.

   Usage: node ingest/promote.mjs [--auto] [--limit N] [--source id] */

import { readFile, writeFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const INBOX_DIR = join(here, "inbox");
const PRODUCTS_PATH = join(here, "..", "data", "products.json");

const args = process.argv.slice(2);
const AUTO = args.includes("--auto");
const LIMIT = parseInt(args[args.indexOf("--limit") + 1], 10) || Infinity;
const ONLY = args.includes("--source") ? args[args.indexOf("--source") + 1] : null;

const db = JSON.parse(await readFile(PRODUCTS_PATH, "utf8"));
const existing = new Set(db.products.map((p) => `${p.merchant}:${p.merchantRef}`));
const existingIds = new Set(db.products.map((p) => p.id));

let promoted = 0;
for (const file of (await readdir(INBOX_DIR)).filter((f) => f.endsWith(".json"))) {
  const inbox = JSON.parse(await readFile(join(INBOX_DIR, file), "utf8"));
  if (ONLY && inbox.source !== ONLY) continue;

  for (const d of inbox.drafts) {
    if (promoted >= LIMIT) break;
    const eligible = d.status === "approved" || (AUTO && d.status === "tagged");
    if (!eligible) continue;
    const key = `${d.merchant}:${d.merchantRef}`;
    if (existing.has(key) || existingIds.has(d.id)) { d.status = "promoted"; continue; }

    db.products.push({
      id: d.id,
      name: d.name,
      blurb: d.blurb,
      brand: d.brand,
      pillars: d.pillars,
      price: d.price,
      currency: d.currency,
      merchant: d.merchant,
      merchantRef: d.merchantRef,
      aesthetics: d.aesthetics, moods: d.moods, recipients: d.recipients,
      occasions: d.occasions, rooms: d.rooms, colours: d.colours,
      themes: d.themes, tags: d.tags,
      image: d.image,
      art: d.art,
      provenance: { source: d.image?.source, sourceUrl: d.sourceMeta.sourceUrl, fetchedAt: d.sourceMeta.fetchedAt, tagMethod: d.tagMethod },
    });
    existing.add(key);
    existingIds.add(d.id);
    d.status = "promoted";
    promoted++;
  }
  await writeFile(join(INBOX_DIR, file), JSON.stringify(inbox, null, 2));
}

await writeFile(PRODUCTS_PATH, JSON.stringify(db, null, 2));
console.log(`Promoted ${promoted} products. Knowledge graph now has ${db.products.length} products.`);

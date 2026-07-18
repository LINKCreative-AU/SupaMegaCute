#!/usr/bin/env node
/* Integrity gate for the knowledge graph. Run after any promotion — exits
   non-zero on violations so automated (bot) pipelines can't corrupt the graph.
   Checks: unique ids, unique merchant refs, facet slugs exist in taxonomy,
   required fields, sane prices, image/provenance shape. */

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const taxonomy = JSON.parse(await readFile(join(here, "..", "data", "taxonomy.json"), "utf8"));
const db = JSON.parse(await readFile(join(here, "..", "data", "products.json"), "utf8"));

const valid = {
  pillars: new Set(taxonomy.pillars.map((p) => p.slug)),
  aesthetics: new Set(taxonomy.facets.aesthetic.map((f) => f.slug)),
  moods: new Set(taxonomy.facets.mood.map((f) => f.slug)),
  recipients: new Set(taxonomy.facets.recipient.map((f) => f.slug)),
  occasions: new Set(taxonomy.facets.occasion.map((f) => f.slug)),
  rooms: new Set(taxonomy.facets.room.map((f) => f.slug)),
  colours: new Set(taxonomy.facets.colour.map((f) => f.slug)),
  themes: new Set(taxonomy.facets.theme.map((f) => f.slug)),
  brands: new Set(taxonomy.brands.map((b) => b.slug)),
};
const FACET_KEYS = ["pillars", "aesthetics", "moods", "recipients", "occasions", "rooms", "colours", "themes"];

const errors = [];
const ids = new Set();
const refs = new Set();

for (const p of db.products) {
  const where = p.id || "(missing id)";
  if (!p.id) errors.push(`${where}: missing id`);
  else if (ids.has(p.id)) errors.push(`${where}: duplicate id`);
  ids.add(p.id);

  const ref = `${p.merchant}:${p.merchantRef}`;
  if (refs.has(ref)) errors.push(`${where}: duplicate merchant ref ${ref}`);
  refs.add(ref);

  for (const field of ["name", "blurb", "brand", "merchant", "merchantRef", "currency"])
    if (!p[field]) errors.push(`${where}: missing ${field}`);
  if (typeof p.price !== "number" || !(p.price > 0) || p.price > 10000)
    errors.push(`${where}: bad price ${p.price}`);
  if (!valid.brands.has(p.brand)) errors.push(`${where}: unknown brand "${p.brand}"`);
  if (!Array.isArray(p.pillars) || !p.pillars.length) errors.push(`${where}: no pillars`);
  if (!p.art || !p.art.emoji) errors.push(`${where}: missing fallback art`);
  if (p.image && (!p.image.src || !p.image.license)) errors.push(`${where}: image missing src/license`);

  for (const key of FACET_KEYS) {
    for (const slug of p[key] || []) {
      if (!valid[key].has(slug)) errors.push(`${where}: unknown ${key} slug "${slug}"`);
    }
  }
  for (const tag of p.tags || []) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(tag)) errors.push(`${where}: malformed tag "${tag}"`);
  }
}

// Collection queries must still resolve against the taxonomy
const collections = JSON.parse(await readFile(join(here, "..", "data", "collections.json"), "utf8"));
for (const c of collections.collections) {
  for (const [key, val] of Object.entries(c.query)) {
    if (FACET_KEYS.includes(key)) {
      for (const slug of val) if (!valid[key].has(slug)) errors.push(`collection ${c.slug}: unknown ${key} slug "${slug}"`);
    }
  }
}

if (errors.length) {
  console.error(`INVALID — ${errors.length} problem(s):`);
  for (const e of errors.slice(0, 50)) console.error("  " + e);
  if (errors.length > 50) console.error(`  …and ${errors.length - 50} more`);
  process.exit(1);
}
console.log(`OK — ${db.products.length} products, ${collections.collections.length} collections, all facets valid.`);

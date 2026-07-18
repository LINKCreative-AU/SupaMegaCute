#!/usr/bin/env node
/* Normalize raw merchant feeds into draft knowledge-graph records.
   Output: ingest/inbox/<store>.json — drafts with provenance, awaiting
   facet tagging (tag.mjs) and review before promotion into data/products.json.
   Blurbs here are placeholders stripped from merchant HTML for the tagger's
   benefit only; promoted products always get our own editorial copy. */

import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const RAW_DIR = join(here, "raw");
const INBOX_DIR = join(here, "inbox");
await mkdir(INBOX_DIR, { recursive: true });

const stripHtml = (html) =>
  (html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

const slugify = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

for (const file of (await readdir(RAW_DIR)).filter((f) => f.endsWith(".json"))) {
  const raw = JSON.parse(await readFile(join(RAW_DIR, file), "utf8"));
  // Re-crawls must not reset pipeline state: carry over status/classification
  // for drafts we already processed (promoted/approved/rejected/tagged).
  let previous = new Map();
  try {
    const old = JSON.parse(await readFile(join(INBOX_DIR, file), "utf8"));
    previous = new Map(old.drafts.map((d) => [d.id, d]));
  } catch { /* first run for this source */ }
  const drafts = [];
  const seenIds = new Set();

  for (const p of raw.products || []) {
    const variant = (p.variants || []).find((v) => v.available !== false) || (p.variants || [])[0];
    const price = variant ? parseFloat(variant.price) : NaN;
    const image = (p.images || [])[0]?.src;
    if (!price || Number.isNaN(price) || !image) continue; // unusable record

    // slugify truncates long handles, so near-identical titles can collide
    let id = `${raw.source}-${slugify(p.handle || p.title)}`;
    for (let n = 2; seenIds.has(id); n++) id = `${raw.source}-${slugify(p.handle || p.title)}-${n}`;
    seenIds.add(id);

    const prior = previous.get(id);
    if (prior && prior.status !== "pending") {
      // keep the processed record, but refresh price + fetch metadata
      prior.price = price;
      prior.sourceMeta.fetchedAt = raw.fetchedAt;
      drafts.push(prior);
      continue;
    }

    drafts.push({
      id,
      status: "pending", // pending → tagged → approved (promote.mjs consumes approved)
      name: p.title.trim(),
      blurb: stripHtml(p.body_html).slice(0, 260),
      brand: raw.brandHint || "generic",
      vendor: p.vendor || null,
      price,
      currency: "USD",
      merchant: "shopify-partner",
      merchantRef: `${raw.domain}/products/${p.handle}`,
      image: { src: image, source: raw.source, license: "merchant-feed" },
      sourceMeta: {
        productType: p.product_type || null,
        tags: p.tags || [],
        fetchedAt: raw.fetchedAt,
        sourceUrl: `https://${raw.domain}/products/${p.handle}`,
      },
    });
  }

  const out = join(INBOX_DIR, file);
  await writeFile(out, JSON.stringify({ source: raw.source, count: drafts.length, drafts }, null, 2));
  console.log(`${raw.source}: ${drafts.length} usable drafts → ingest/inbox/${file}`);
}

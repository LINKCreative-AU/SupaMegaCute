#!/usr/bin/env node
/* Merge classification-bot output into the inbox.
   Bots write review files to ingest/review/<name>.json:
     { "source": "<inbox source id>", "items": [ {id, relevant, blurb, brand,
       pillars, aesthetics, moods, recipients, occasions, rooms, colours,
       themes, tags, emoji, bg}, ... ] }
   Facet slugs are validated against the taxonomy here — anything invalid is
   dropped from the record (and reported) rather than poisoning the graph.
   Relevant items become status "approved"; irrelevant become "rejected". */

import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const REVIEW_DIR = join(here, "review");
const INBOX_DIR = join(here, "inbox");
await mkdir(REVIEW_DIR, { recursive: true });

const taxonomy = JSON.parse(await readFile(join(here, "..", "data", "taxonomy.json"), "utf8"));
const valid = {
  pillars: new Set(taxonomy.pillars.map((p) => p.slug).filter((s) => s !== "explore")),
  aesthetics: new Set(taxonomy.facets.aesthetic.map((f) => f.slug)),
  moods: new Set(taxonomy.facets.mood.map((f) => f.slug)),
  recipients: new Set(taxonomy.facets.recipient.map((f) => f.slug)),
  occasions: new Set(taxonomy.facets.occasion.map((f) => f.slug)),
  rooms: new Set(taxonomy.facets.room.map((f) => f.slug)),
  colours: new Set(taxonomy.facets.colour.map((f) => f.slug)),
  themes: new Set(taxonomy.facets.theme.map((f) => f.slug)),
};
const validBrands = new Set(taxonomy.brands.map((b) => b.slug));
const FACETS = Object.keys(valid);
const BGS = new Set(["blush", "lilac", "mint", "peach", "cream"]);

const inboxes = new Map();
for (const f of (await readdir(INBOX_DIR)).filter((f) => f.endsWith(".json"))) {
  inboxes.set(f.replace(".json", ""), JSON.parse(await readFile(join(INBOX_DIR, f), "utf8")));
}

let applied = 0, rejected = 0, dropped = 0, missing = 0;
for (const f of (await readdir(REVIEW_DIR)).filter((f) => f.endsWith(".json"))) {
  const review = JSON.parse(await readFile(join(REVIEW_DIR, f), "utf8"));
  const inbox = inboxes.get(review.source);
  if (!inbox) { console.warn(`${f}: unknown source "${review.source}"`); continue; }
  const byId = new Map(inbox.drafts.map((d) => [d.id, d]));

  for (const item of review.items || []) {
    const draft = byId.get(item.id);
    if (!draft) { missing++; continue; }
    if (draft.status === "promoted") continue; // never re-touch promoted records

    if (!item.relevant) {
      draft.status = "rejected";
      draft.tagMethod = "agent";
      rejected++;
      continue;
    }

    const clean = {};
    for (const key of FACETS) {
      const input = Array.isArray(item[key]) ? item[key] : [];
      clean[key] = input.filter((s) => valid[key].has(s));
      dropped += input.length - clean[key].length;
    }
    if (!clean.pillars.length) clean.pillars = ["gifts"];

    Object.assign(draft, clean, {
      status: "approved",
      tagMethod: "agent",
      blurb: String(item.blurb || draft.blurb).slice(0, 220),
      brand: validBrands.has(item.brand) ? item.brand : draft.brand,
      tags: (item.tags || []).slice(0, 5).map((t) => String(t).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")).filter(Boolean),
      art: { emoji: item.emoji || "🎀", bg: BGS.has(item.bg) ? item.bg : "blush" },
    });
    applied++;
  }
}

for (const [name, inbox] of inboxes) {
  await writeFile(join(INBOX_DIR, `${name}.json`), JSON.stringify(inbox, null, 2));
}
console.log(`Applied ${applied} approvals, ${rejected} rejections (${dropped} invalid facet slugs dropped, ${missing} unknown ids).`);

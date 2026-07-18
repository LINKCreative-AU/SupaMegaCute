#!/usr/bin/env node
/* Facet tagger: classifies inbox drafts into the controlled taxonomy and
   writes original editorial blurbs, using Claude with structured JSON output.
   The model only ever picks from taxonomy slugs — it cannot invent facets.

   Usage:
     node ingest/tag.mjs                 # Claude tagging (needs Anthropic credentials)
     node ingest/tag.mjs --heuristic     # keyword fallback, no API needed
     node ingest/tag.mjs --limit 40      # cap drafts per source (default 40)
     node ingest/tag.mjs --source blippo # single source */

import { readFile, writeFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const INBOX_DIR = join(here, "inbox");
const taxonomy = JSON.parse(await readFile(join(here, "..", "data", "taxonomy.json"), "utf8"));

const args = process.argv.slice(2);
const HEURISTIC = args.includes("--heuristic");
const LIMIT = parseInt(args[args.indexOf("--limit") + 1], 10) || 40;
const ONLY = args.includes("--source") ? args[args.indexOf("--source") + 1] : null;
const MODEL = args.includes("--model") ? args[args.indexOf("--model") + 1] : "claude-opus-4-8";

const slugs = (type) => taxonomy.facets[type].map((f) => f.slug);
const pillarSlugs = taxonomy.taxonomyPillars ?? taxonomy.pillars.filter((p) => !["explore"].includes(p.slug)).map((p) => p.slug);

/* ---------- structured output schema (batch of classifications) ---------- */

const ITEM_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["id", "relevant", "blurb", "pillars", "aesthetics", "moods", "recipients", "occasions", "rooms", "colours", "themes", "tags", "emoji", "bg"],
  properties: {
    id: { type: "string" },
    relevant: { type: "boolean", description: "true only if this belongs on a cute-things discovery site (adorable, aesthetic, giftable). Vapes, adult items, plain utilitarian goods: false." },
    blurb: { type: "string", description: "Original one-sentence editorial blurb in SuperMegaCute's playful voice. Never copy merchant copy." },
    pillars: { type: "array", items: { enum: pillarSlugs } },
    aesthetics: { type: "array", items: { enum: slugs("aesthetic") } },
    moods: { type: "array", items: { enum: slugs("mood") } },
    recipients: { type: "array", items: { enum: slugs("recipient") } },
    occasions: { type: "array", items: { enum: slugs("occasion") } },
    rooms: { type: "array", items: { enum: slugs("room") } },
    colours: { type: "array", items: { enum: slugs("colour") } },
    themes: { type: "array", items: { enum: slugs("theme") } },
    tags: { type: "array", items: { type: "string" }, description: "2-4 lowercase kebab-case free tags, e.g. plush, blind-box, sticker" },
    emoji: { type: "string", description: "single emoji for fallback card art" },
    bg: { enum: ["blush", "lilac", "mint", "peach", "cream"] },
  },
};

const BATCH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: { items: { type: "array", items: ITEM_SCHEMA } },
};

const SYSTEM = `You classify products for SuperMegaCute.com, a discovery platform for cute things (audience: adults, mostly women 20-38, into aesthetics, gifting, collectibles, room décor).
For each product return facet slugs ONLY from the allowed enums. Choose 1-2 pillars, 1-2 aesthetics, 1-2 moods, and only clearly-applicable recipients/occasions/rooms/colours/themes (empty arrays are fine). Write blurbs in a warm, witty, concise voice — never copy the merchant's text. Mark relevant=false for anything that is not genuinely cute/giftable/aesthetic.`;

/* ---------- Claude batch classification ---------- */

async function classifyWithClaude(drafts) {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();
  const results = new Map();
  const BATCH = 8;

  for (let i = 0; i < drafts.length; i += BATCH) {
    const batch = drafts.slice(i, i + BATCH);
    const payload = batch.map((d) => ({
      id: d.id,
      name: d.name,
      merchantDescription: d.blurb,
      vendor: d.vendor,
      productType: d.sourceMeta.productType,
      merchantTags: d.sourceMeta.tags,
      price: d.price,
    }));

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      output_config: { format: { type: "json_schema", schema: BATCH_SCHEMA } },
      messages: [{ role: "user", content: `Classify these products:\n${JSON.stringify(payload, null, 1)}` }],
    });

    if (response.stop_reason === "refusal") {
      console.warn(`  batch ${i / BATCH + 1}: refused — skipping`);
      continue;
    }
    const text = response.content.find((b) => b.type === "text")?.text ?? "{}";
    for (const item of JSON.parse(text).items || []) results.set(item.id, item);
    console.log(`  classified ${Math.min(i + BATCH, drafts.length)}/${drafts.length}`);
  }
  return results;
}

/* ---------- heuristic fallback ---------- */

const KEYWORDS = {
  pillars: {
    collectibles: /blind box|figure|figurine|collectible|plush|charm|sonny angel|smiski|series/i,
    "desk-workspace": /pen|pencil|notebook|sticker|stationery|planner|washi|eraser|desk|keyboard|journal/i,
    "home-decor": /lamp|light|rug|mirror|shelf|cushion|pillow|mug|blanket|vase|decor/i,
    aesthetics: /hair|clip|bag|pouch|keychain|accessory|jewelry|phone/i,
  },
  aesthetics: { kawaii: /kawaii|cute|sanrio|chibi/i, cottagecore: /mushroom|daisy|floral|frog|garden/i, coquette: /bow|ribbon|lace|heart/i, y2k: /y2k|retro|90s|butterfly/i, "dreamy-cloud": /cloud|moon|star|celestial/i, "pastel-minimal": /pastel|minimal/i },
  themes: { animals: /cat|bear|bunny|rabbit|dog|duck|frog|panda|animal|capybara/i, "food-drink": /strawberry|fruit|candy|dessert|boba|food|cookie/i, characters: /hello kitty|kuromi|cinnamoroll|pompompurin|melody|miffy|character|sanrio/i, hearts: /heart|love/i, celestial: /star|moon|cloud/i, florals: /flower|daisy|floral|sakura/i },
};

function classifyHeuristic(d) {
  const hay = `${d.name} ${d.blurb} ${d.sourceMeta.productType} ${(d.sourceMeta.tags || []).join(" ")}`;
  const pick = (map) => Object.entries(map).filter(([, re]) => re.test(hay)).map(([slug]) => slug);
  const pillars = pick(KEYWORDS.pillars);
  return {
    id: d.id,
    relevant: true, // heuristic can't judge relevance — review before promoting
    blurb: d.blurb.slice(0, 140),
    pillars: pillars.length ? pillars.slice(0, 2) : ["gifts"],
    aesthetics: pick(KEYWORDS.aesthetics).slice(0, 2),
    moods: ["playful"],
    recipients: d.price <= 25 ? ["best-friend", "self-treat"] : ["self-treat"],
    occasions: ["just-because"],
    rooms: [],
    colours: [],
    themes: pick(KEYWORDS.themes).slice(0, 2),
    tags: (d.sourceMeta.tags || []).slice(0, 3).map((t) => t.toLowerCase().replace(/\s+/g, "-")),
    emoji: "🎀",
    bg: "blush",
  };
}

/* ---------- main ---------- */

for (const file of (await readdir(INBOX_DIR)).filter((f) => f.endsWith(".json"))) {
  const inbox = JSON.parse(await readFile(join(INBOX_DIR, file), "utf8"));
  if (ONLY && inbox.source !== ONLY) continue;

  const pending = inbox.drafts.filter((d) => d.status === "pending").slice(0, LIMIT);
  if (!pending.length) { console.log(`${inbox.source}: nothing pending`); continue; }
  console.log(`${inbox.source}: tagging ${pending.length} drafts (${HEURISTIC ? "heuristic" : MODEL})`);

  const results = HEURISTIC
    ? new Map(pending.map((d) => [d.id, classifyHeuristic(d)]))
    : await classifyWithClaude(pending);

  for (const draft of inbox.drafts) {
    const r = results.get(draft.id);
    if (!r) continue;
    Object.assign(draft, {
      status: r.relevant ? "tagged" : "rejected",
      blurb: r.blurb,
      pillars: r.pillars, aesthetics: r.aesthetics, moods: r.moods,
      recipients: r.recipients, occasions: r.occasions, rooms: r.rooms,
      colours: r.colours, themes: r.themes, tags: r.tags,
      art: { emoji: r.emoji, bg: r.bg },
      tagMethod: HEURISTIC ? "heuristic" : MODEL,
    });
  }

  await writeFile(join(INBOX_DIR, file), JSON.stringify(inbox, null, 2));
  const tagged = inbox.drafts.filter((d) => d.status === "tagged").length;
  const rejected = inbox.drafts.filter((d) => d.status === "rejected").length;
  console.log(`  ${inbox.source}: ${tagged} tagged, ${rejected} rejected`);
}

#!/usr/bin/env node
/* Split unclassified inbox drafts into small work-queue files for
   classification bots. Each queue file carries only what a classifier needs.
   Usage: node ingest/prep-queue.mjs '{"sanrio":200,"blippo":150}' [batchSize] */

import { readFile, writeFile, mkdir, readdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const INBOX_DIR = join(here, "inbox");
const QUEUE_DIR = join(here, "review-queue");
await rm(QUEUE_DIR, { recursive: true, force: true });
await mkdir(QUEUE_DIR, { recursive: true });

const plan = JSON.parse(process.argv[2] || "{}");
const BATCH = parseInt(process.argv[3], 10) || 50;
const written = [];

for (const f of (await readdir(INBOX_DIR)).filter((f) => f.endsWith(".json"))) {
  const inbox = JSON.parse(await readFile(join(INBOX_DIR, f), "utf8"));
  const take = plan[inbox.source] ?? 0;
  if (!take) continue;

  const eligible = inbox.drafts
    .filter((d) => d.status === "pending" || d.status === "tagged")
    .slice(0, take)
    .map((d) => ({
      id: d.id,
      name: d.name,
      merchantDescription: d.blurb,
      vendor: d.vendor,
      productType: d.sourceMeta.productType,
      merchantTags: (d.sourceMeta.tags || []).slice(0, 8),
      price: d.price,
    }));

  for (let i = 0; i < eligible.length; i += BATCH) {
    const n = i / BATCH + 1;
    const file = join(QUEUE_DIR, `${inbox.source}-${n}.json`);
    await writeFile(file, JSON.stringify({ source: inbox.source, batch: n, items: eligible.slice(i, i + BATCH) }, null, 1));
    written.push(`${inbox.source}-${n}`);
  }
}
console.log(JSON.stringify(written));

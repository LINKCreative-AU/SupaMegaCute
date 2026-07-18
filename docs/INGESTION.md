# Product Ingestion — pipeline & policy

## Policy (best-practice basis)

We build the catalog from data that merchants publish for programmatic access, or from official APIs — never by scraping HTML from marketplaces that prohibit it.

| Source | Method | Status |
|---|---|---|
| Indie/boutique Shopify stores | Public `products.json` feed (published by every Shopify store), honest bot user-agent, rate-limited | **Live** — 4 verified stores in `ingest/sources.json` |
| Etsy | Official Open API v3 (free developer key) | Pending key |
| eBay | Official Browse API (free developer signup) | Pending key |
| Amazon | PA-API once Associates account is approved | Pending — until then Amazon products are **curated manually**: ASIN + our own editorial copy + price band; no Amazon images, no live prices |

Why: scraping Amazon/Etsy violates their ToS and is the standard reason Associates applications get rejected or banned; republishing their images/copy is a copyright exposure; and duplicated merchant text reads as thin content to Google, undermining the SEO pillar. Structured feeds + original editorial copy avoid all three while producing better pages.

Content rules for promoted products:

- **Blurbs are always ours.** Merchant descriptions are used only as classification input; the published blurb is original editorial copy.
- **Images carry provenance.** `image.license` records the basis for use (`merchant-feed` = the store's own published product feed, displayed while linking to that store; `press-kit`; `api` for Etsy/eBay/PA-API imagery).
- **Every record keeps `provenance`** (source, source URL, fetch time, tag method).

## Pipeline

```
crawl-shopify.mjs → ingest/raw/<source>.json          (raw feed pages)
normalize.mjs     → ingest/inbox/<source>.json        (draft graph records, status: pending)
tag.mjs           → same file, status: tagged|rejected (facets + editorial blurb)
   (review)       → status: approved                   (human or agent editorial pass)
promote.mjs       → data/products.json                 (dedup merge; status: promoted)
validate.mjs      → integrity gate                     (exit non-zero on any violation)
refresh.mjs       → price/availability sync            (run after a re-crawl; flags gone products)
```

## Bot fan-out (classification at scale)

For bulk classification, the review step runs as a fleet of agents instead of `tag.mjs`:

```
prep-queue.mjs '{"sanrio":200,...}' 50   → ingest/review-queue/<source>-<n>.json (50-draft work units)
  <classification bots>                  → ingest/review/<source>-<n>.json      (classifications + editorial blurbs)
apply-review.mjs                         → merges reviews into inbox (validates every facet slug; invalid slugs dropped, not written)
promote.mjs && validate.mjs              → graph updated, then integrity-checked
```

Each bot gets one work unit and must emit, per product: pillars, brand, aesthetics, moods, recipients, occasions, rooms, colours, themes plus 2–5 kebab-case discovery tags (product type first, then franchise, then attributes) — the tag conventions the Explore engine sorts on. Two independent guards keep bot output safe: `apply-review.mjs` drops any slug not in the taxonomy at merge time, and `validate.mjs` fails the pipeline if anything invalid reaches the graph.

Run it:

```bash
node ingest/crawl-shopify.mjs            # all verified Shopify sources
node ingest/normalize.mjs
node ingest/tag.mjs                      # Claude classification (needs Anthropic credentials)
node ingest/tag.mjs --heuristic          # keyword fallback, no API needed
node ingest/promote.mjs                  # promotes approved drafts only
node ingest/promote.mjs --auto           # staging: promote everything tagged
```

Note: `raw/` and `inbox/` are gitignored working artifacts; only promoted records in `data/products.json` are committed.

## AI tagging (`tag.mjs`)

Classification uses the Claude API (`claude-opus-4-8`) with **structured JSON output** constrained to the taxonomy: every facet field in the response schema is an enum of `taxonomy.json` slugs, so the model cannot invent vocabulary. It also writes the original editorial blurb, judges relevance (vapes and plain utilitarian goods from mixed stores get `relevant: false` → rejected), and picks fallback card art. Batches of 8 products per request; the system prompt is cached (`cache_control`) across batches.

Requires Anthropic credentials (`ANTHROPIC_API_KEY` or an `ant auth login` profile) and `npm install`. Without credentials, `--heuristic` runs a keyword classifier so the pipeline stays testable — heuristic output is rougher and must be reviewed before promotion.

## Next connectors

1. **Etsy/eBay API connectors** — same normalize → tag → promote path, new `crawl-*.mjs` per API.
2. **Refresh job** — re-crawl on a schedule (Vercel cron or GitHub Action), update price/availability on promoted records by `merchant:merchantRef`, flag gone products.
3. **Amazon curated track** — `data/inbox/amazon-watchlist.json` of ASINs researched editorially; upgraded automatically when PA-API lands.

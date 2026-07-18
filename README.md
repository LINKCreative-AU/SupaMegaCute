# SuperMegaCute.com — discovery platform prototype

> We help you discover cute things that make you smile.

Working prototype of the SuperMegaCute discovery platform: a product **knowledge graph** + **Explore engine** + **merchant connector registry**, skinned with the supplied brand asset pack. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full platform design and the RenoGuide reuse map.

## Run it

No build step — serve the folder statically. Internal links are extensionless (Vercel `cleanUrls` style), so use a clean-URL-aware server:

```bash
npx serve .
# open http://localhost:3000
```

Deploys as a static site on Vercel (`vercel.json` sets `cleanUrls`).

## What's here

| Path | What it is |
|---|---|
| `index.html` | Homepage: hero, pillar tiles, trending grid, collections, release calendar |
| `explore.html` | The Explore engine — faceted discovery over the whole graph, shareable URLs |
| `gifts` / `collectibles` / `home-decor` / `desk-workspace` / `aesthetics` | Pillar pages (thin shells over graph queries) |
| `guides/blind-box-collecting-101.html` | Sample collectibles guide with live graph-query product embeds |
| `data/` | The knowledge graph: taxonomy, products, merchants (affiliate config), collections, releases |
| `js/graph.js` | Graph client: loading, query engine, affiliate link builder, card rendering |
| `js/explore.js` | Explore UI: facet chips (incl. brand), search, surprise-me, related collections |
| `assets/brand/` | Brand asset pack (logos, icons, patterns, tokens) — source of truth for styling |
| `ingest/` | Ingestion pipeline: crawl → normalize → tag/bot-review → promote → validate → refresh — see [`docs/INGESTION.md`](docs/INGESTION.md) |
| `.github/workflows/` | Scheduled catalog refresh (weekly price/availability sync) |

## Key ideas to review

- **Everything is a graph query.** Pillar pages, collections and guide embeds all declare `data-smc-grid='{...}'` queries; nothing hard-codes product lists.
- **Affiliate IDs live only in `data/merchants.json`.** Products store `{merchant, merchantRef}`; links are built at render time. While a merchant's `affiliateId` is `null`, plain direct links are emitted; setting the ID flips every link for that merchant to its monetised form with `rel="sponsored"`.
- **Explore URLs are state.** `explore?aesthetics=coquette&priceBand=under-25` is shareable and becomes an SEO landing page later.
- **Collectibles are first-class**: release calendar entities with rarity odds and retirement risk, plus collectible metadata on products.

# SuperMegaCute — Platform Architecture

**Vision:** the world's best discovery platform for cute things. Not an affiliate website — a discovery engine where affiliate revenue is a natural outcome of helping users find products they love.

**Audience:** adults (core: women ~20–38) into aesthetics, gifting, collectibles, room décor and lifestyle products; secondary: gift buyers looking for recommendations.

## 1. The product knowledge graph

Everything on the site is a query over structured data, never a scrape of article text. The AI layer searches this graph directly.

```
data/
  taxonomy.json     controlled vocabulary: 6 pillars, 8 facet dimensions, brand registry
  products.json     product entities with full metadata
  merchants.json    merchant connector registry (affiliate config)
  collections.json  curated collections = saved queries over the graph
  releases.json     collectibles release calendar entities
```

### Product entity schema

Every product carries rich metadata (all slugs resolve against `taxonomy.json`):

| Field | Purpose |
|---|---|
| `pillars[]` | which of the 6 content pillars it belongs to (products can span pillars) |
| `aesthetics[]`, `moods[]`, `themes[]`, `colours[]` | vibe-based discovery (the primary UX) |
| `recipients[]`, `occasions[]` | gift discovery |
| `rooms[]` | décor discovery |
| `price` + derived price band | budget filtering |
| `brand`, `tags[]` | entity linking, collection queries |
| `merchant`, `merchantRef` | connector reference — never a hard-coded URL |
| `collectible{series, figures, secretOdds, retiredRisk, limited}` | collectibles-pillar intelligence |

Query semantics (implemented in `js/graph.js → SMC.matches`): **OR within a facet, AND across facets.** The Explore UI, collection resolution and the future AI layer all share these semantics, so a natural-language request like *"a calming lilac gift for a coworker under $50"* compiles to `{moods:[calming], colours:[lilac], recipients:[coworker], priceBand:"25-50"}` and runs through the same engine.

### Collections are queries, not lists

`collections.json` stores a `query` per collection. New products that match join automatically — this is the commerce version of RenoGuide's dynamic internal-linking hubs, and it's what keeps hundreds of future landing pages fresh with zero editorial maintenance.

## 2. Merchant connectors

`merchants.json` is the connector registry. Each connector declares its network, affiliate ID and a deep-link template:

```json
"amazon": {
  "network": "amazon-associates",
  "affiliateId": null,
  "linkTemplate": "https://www.amazon.com/dp/{ref}?tag={affiliateId}",
  "directTemplate": "https://www.amazon.com/dp/{ref}"
}
```

Rules:

- **Affiliate IDs live only in config.** Products reference `{merchant, merchantRef}`; `SMC.affiliateLink()` builds the outbound URL at render time and appends UTM defaults.
- **Monetisation is deferred, not blocked.** While `affiliateId` is `null` (network approval pending), links use `directTemplate` with `rel="nofollow noopener"`. Setting the ID flips that merchant's links to the affiliate template with `rel="sponsored nofollow noopener"` — zero content edits.
- Swapping a network (e.g. Etsy direct → Awin) or rotating an ID is a one-line config change with zero content edits.
- Current connectors: Amazon Associates, Etsy (via Awin), eBay Partner Network, direct Shopify partners. Future networks are new entries, not new code.
- Next step: ingestion connectors (Amazon PA-API, Etsy API, eBay Browse API) that populate/refresh `products.json` — price, availability and imagery sync on a schedule via the automation framework.

## 3. The Explore engine

`explore.html` + `js/explore.js` is the discovery UX and the human-visible face of the AI engine:

- Facet chips across pillar, aesthetic, mood, recipient, occasion, room, colour and budget.
- Free-text search over name/blurb/brand/tags.
- **URL = state**: every filter combination is a shareable, indexable link — pillar pages deep-link into pre-filtered Explore views (`explore?aesthetics=coquette`), which later become SEO landing pages.
- "Surprise me" serendipity: random aesthetic × mood pairings that are guaranteed non-empty.
- Related collections are computed from result overlap, giving every dead end a next step.

The AI upgrade path: an LLM endpoint translates natural language ("gifts for my plant-obsessed best friend") into a graph query + a one-line editorial rationale. The retrieval stays structured — the model never free-associates products that don't exist.

## 4. Collectibles as a first-class pillar

Collectibles get their own entity types, not just products:

- `releases.json` — release calendar entities (brand, series, date, format, figure count, rarity odds, retirement risk). Renders on the homepage and `/collectibles`; designed to be generated/refreshed by the publishing pipeline.
- `collectible` metadata on products (series, secret odds, retired risk).
- Guide articles (`guides/`) that embed **live graph queries** instead of hard-coded product lists — see `guides/blind-box-collecting-101.html`, where the "starter series" grid is `data-smc-grid='{"tags":["blind-box"]}'`.

This is the evergreen SEO pillar: release calendars and rarity guides earn repeat visits even where monetisation is indirect.

## 5. RenoGuide reuse map

| RenoGuide component | SuperMegaCute reuse |
|---|---|
| Entity architecture | Product/brand/release entities in the knowledge graph (`data/*.json`) |
| Taxonomy system | `taxonomy.json` controlled vocabulary; same slug-referencing pattern |
| Internal linking | Collections-as-queries + pillar→Explore deep links replicate the dynamic hub-and-spoke model |
| Article generation | Guide template established (`guides/`); AI pipeline ports directly — articles embed graph queries |
| AI publishing pipeline | Targets structured entities here (products, releases, collections) instead of articles only |
| Search/explore concepts | Faceted engine in `js/explore.js`; same OR-within/AND-across semantics |
| Image pipeline | Pending — cards currently use emoji-on-pastel placeholder art; port the pipeline for product imagery |
| Automation framework | Will drive merchant ingestion sync + release-calendar refresh (Vercel crons, as DASPA does) |

## 6. Long-term: the reusable AI publishing platform

SuperMegaCute is deliberately built as **data + engine + skin**:

1. **Data layer** — a knowledge graph with a domain taxonomy (here: cute products; for RenoGuide: renovation entities).
2. **Engine** — graph query semantics, connector registry, collection resolution, explore UX. Domain-agnostic.
3. **Skin** — brand tokens (`assets/brand/tokens/`) and page shells.

The extraction test for every future feature: *could this power a third knowledge-graph site by swapping the data layer and the tokens?* SuperMegaCute is the first commerce-focused implementation and proves out the monetised-connector half of the platform.

## 7. Current status & deployment

- Standalone repo (`LINKCreative-AU/supermegacute`), deploying as its own Vercel project on supermegacute.com (same static + serverless + Supabase stack the team already runs).
- Target market for v1 is **US / USD** (amazon.com, US-shipping Etsy sellers); AU and geo-routed links (Amazon OneLink) come later.
- Static HTML + vanilla JS, no build step. Header/footer are JS-rendered for prototype speed; production should pre-render page shells (static generation) for SEO before launch.
- `merchantRef` values are placeholders until real ingestion lands; affiliate IDs are `null` until network approvals land (direct links in the meantime).

# Phase 2 — Database migration plan (30k+ products)

The static-JSON graph holds comfortably to ~10k products. Phase 2 moves storage
and querying server-side while keeping everything else — taxonomy, connectors,
bot pipeline, static SEO pages — unchanged. Target trigger: **~30k products**
or the first marketplace API connector (Etsy/eBay), whichever lands first.

## Stack

- **Supabase Postgres** (the stack already run for DASPA) as the system of record
- **Postgres full-text search** first; **Meilisearch** when typo-tolerance and
  facet-count performance start to matter (~100k+)
- Vercel serverless functions for the Explore API
- The static build keeps generating product/collection/brand pages from the DB
  (build queries Postgres instead of reading products.json)

## Schema sketch

```sql
create table products (
  id            text primary key,
  name          text not null,
  blurb         text not null,
  brand         text not null references brands(slug),
  price         numeric(10,2) not null,
  price_approx  boolean default false,
  currency      text not null default 'USD',
  merchant      text not null,
  merchant_ref  text not null,
  image_src     text,
  image_license text,
  art_emoji     text,
  art_bg        text,
  availability  text not null default 'in-stock',   -- in-stock | out-of-stock | not-seen
  tier          text not null default 'core',        -- core (curated) | longtail (auto-indexed)
  -- facets as arrays; GIN-indexed for the exact OR-within/AND-across semantics
  pillars       text[] not null,
  aesthetics    text[] default '{}',
  moods         text[] default '{}',
  recipients    text[] default '{}',
  occasions     text[] default '{}',
  rooms         text[] default '{}',
  colours       text[] default '{}',
  themes        text[] default '{}',
  tags          text[] default '{}',
  source        text,           -- provenance
  source_url    text,
  tag_method    text,
  fetched_at    timestamptz,
  search        tsvector generated always as (
    to_tsvector('english', name || ' ' || blurb || ' ' || array_to_string(tags, ' '))
  ) stored,
  unique (merchant, merchant_ref)
);

create index products_pillars_gin    on products using gin (pillars);
create index products_aesthetics_gin on products using gin (aesthetics);
create index products_tags_gin       on products using gin (tags);
create index products_search_gin     on products using gin (search);
create index products_brand          on products (brand);
create index products_price          on products (price);

create table brands      (slug text primary key, name text, blurb text, collectible boolean);
create table collections (slug text primary key, name text, blurb text, query jsonb, art jsonb);
create table releases    (id text primary key, brand text, series text, date date, format text,
                          figures int, rrp numeric, rarity jsonb, notes text);
```

Facet queries translate directly: `aesthetics && '{kawaii}'::text[] AND moods && '{cozy}'::text[]`.

## API surface

```
GET /api/explore?aesthetics=kawaii&moods=cozy&priceBand=under-25&page=2
  → { count, facetCounts, products: [...] }   (facetCounts powers chip counts)
GET /api/product/<id>       → single record + related (precomputed or query-time)
GET /api/suggest?q=smis     → typeahead
```

The Explore UI swaps `SMC.find()` for API calls; URL-as-state semantics stay
identical. The AI Explore endpoint (natural language → graph query) lands here
too — the LLM emits the same query JSON the API already accepts.

## Tier model (the 1M plan)

- **core** — bot-classified + QA'd, editorial blurbs, gets static product pages
  and full sitemap presence (the quality surface: target ~50-100k)
- **longtail** — marketplace-API records (Etsy/eBay/Amazon), auto-tagged,
  searchable via API and rendered client-side, `noindex` until they earn
  promotion to core (protects SEO from thin-content dilution at 1M scale)

Promotion long-tail → core is a bot job: pick products with engagement/clicks,
run the full classification + editorial pass, regenerate their static pages.

## Migration steps

1. `supabase db push` the schema; one-shot importer reads products.json → tables
2. Point `build/build.mjs` loadGraph at Postgres (same shape back)
3. Ship /api/explore; switch explore.js to it behind a flag; remove client
   full-catalog fetch
4. Ingestion writes to Postgres (promote/refresh get a pg client); JSON files
   retire to build artifacts
5. Meilisearch when facet-count latency or typo-tolerance demands it
```

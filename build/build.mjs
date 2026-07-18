#!/usr/bin/env node
/* Static site build (SEO layer). Outputs dist/:
   - copies the root pages/assets/js, injecting pre-rendered chrome + grids
     so crawlers see full content without executing JS
   - /p/<id>/       product pages (Product + BreadcrumbList JSON-LD, canonical,
                    related products, merchant CTA) — JS-free
   - /c/<slug>/     collection landing pages (ItemList JSON-LD)
   - sitemap index + per-type sitemaps, robots.txt
   - data/*.json minified for the client engine
   Run: node build/build.mjs   (Vercel: buildCommand) */

import { readFile, writeFile, mkdir, rm, cp, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SITE, BG, esc, loadGraph, find, related, affiliateLink, money,
  productCard, chromeHeader, chromeFooter, pageShell,
} from "./render.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const g = await loadGraph(ROOT);

await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });

/* ---------- 1. copy static site + minify data ---------- */

await cp(join(ROOT, "assets"), join(DIST, "assets"), { recursive: true });
await cp(join(ROOT, "js"), join(DIST, "js"), { recursive: true });
await cp(join(ROOT, "guides"), join(DIST, "guides"), { recursive: true });
await mkdir(join(DIST, "data"));
for (const f of await readdir(join(ROOT, "data"))) {
  const json = JSON.parse(await readFile(join(ROOT, "data", f), "utf8"));
  await writeFile(join(DIST, "data", f), JSON.stringify(json)); // minified
}

/* ---------- 2. root pages with pre-rendered chrome + grids ---------- */

const grid = (query, { order, limit } = {}) => {
  let items = find(g, query);
  if (order === "newest") items = items.slice().reverse();
  if (limit) items = items.slice(0, limit);
  return items.map((p) => productCard(g, p)).join("");
};

const collectionCard = (c) => {
  const count = find(g, c.query).length;
  const bg = BG[c.art.bg] || BG.cream;
  return `
    <a class="collection-card smc-card" href="/c/${esc(c.slug)}">
      <div class="collection-art" style="background:${bg}"><span aria-hidden="true">${c.art.emoji}</span></div>
      <div class="collection-body">
        <h3>${esc(c.name)}</h3>
        <p>${esc(c.blurb)}</p>
        <span class="collection-count">${count} finds →</span>
      </div>
    </a>`;
};

const releasesHtml = () => g.releases.map((r) => {
  const b = g.brand(r.brand);
  const d = new Date(r.date + "T00:00:00");
  const when = d.toLocaleDateString("en-US", { month: "short" });
  const rarity = r.rarity.secret ? `Secret chase ${r.rarity.secretOdds}` : r.rarity.limited ? "Limited numbered run" : r.rarity.retiredRisk ? `Retires — ${r.rarity.retiredRisk} risk` : "Open run";
  return `
    <div class="release-row smc-card">
      <div class="release-date"><span>${when}</span><strong>${d.getDate()}</strong></div>
      <div class="release-info">
        <h3>${esc(b.name)} — ${esc(r.series)}</h3>
        <p>${esc(r.notes)}</p>
        <div class="product-chips"><span class="chip chip-soft">${esc(r.format)}</span><span class="chip chip-soft">$${r.rrp} RRP</span><span class="chip chip-gold">${esc(rarity)}</span></div>
      </div>
    </div>`;
}).join("");

function prerender(html, activeSlug) {
  html = html.replace(/<header class="site-header" data-smc-header><\/header>/,
    `<header class="site-header" data-smc-header>${chromeHeader(g, activeSlug)}</header>`);
  html = html.replace(/<footer class="site-footer" data-smc-footer><\/footer>/,
    `<footer class="site-footer" data-smc-footer>${chromeFooter(g)}</footer>`);
  html = html.replace(/<div class="product-grid" data-smc-grid='([^']*)'([^>]*)><\/div>/g, (m, q, attrs) => {
    const order = /data-order="newest"/.test(attrs) ? "newest" : undefined;
    const limit = (attrs.match(/data-limit="(\d+)"/) || [])[1];
    return `<div class="product-grid" data-smc-grid='${q}'${attrs}>${grid(JSON.parse(q), { order, limit: limit ? +limit : undefined })}</div>`;
  });
  html = html.replace(/<div class="collection-rail" data-smc-collection-rail data-limit="(\d+)"><\/div>/g,
    (m, limit) => `<div class="collection-rail" data-smc-collection-rail data-limit="${limit}">${g.collections.slice(0, +limit).map(collectionCard).join("")}</div>`);
  html = html.replace(/<div class="release-list" data-smc-releases><\/div>/g,
    `<div class="release-list" data-smc-releases>${releasesHtml()}</div>`);
  return html;
}

const ROOT_PAGES = { "index.html": "home", "explore.html": "explore", "gifts.html": "gifts", "collectibles.html": "collectibles", "home-decor.html": "home-decor", "desk-workspace.html": "desk-workspace", "aesthetics.html": "aesthetics" };
for (const [file, slug] of Object.entries(ROOT_PAGES)) {
  let html = await readFile(join(ROOT, file), "utf8");
  html = prerender(html, slug);
  if (file === "index.html") {
    const website = { "@context": "https://schema.org", "@type": "WebSite", name: "SuperMegaCute", url: SITE,
      potentialAction: { "@type": "SearchAction", target: `${SITE}/explore?q={search_term_string}`, "query-input": "required name=search_term_string" } };
    html = html.replace("</head>", `  <link rel="canonical" href="${SITE}/">\n  <script type="application/ld+json">${JSON.stringify(website)}</script>\n</head>`);
  } else if (slug !== "explore") {
    html = html.replace("</head>", `  <link rel="canonical" href="${SITE}/${slug}">\n</head>`);
  }
  await writeFile(join(DIST, file), html);
}

/* ---------- 3. product pages ---------- */

const breadcrumbLd = (items) => ({
  "@context": "https://schema.org", "@type": "BreadcrumbList",
  itemListElement: items.map(([name, url], i) => ({ "@type": "ListItem", position: i + 1, name, item: SITE + url })),
});

let productPages = 0;
for (const p of g.visible) {
  const link = affiliateLink(g, p);
  const brandName = g.brand(p.brand).name;
  const pillar = g.pillar(p.pillars[0]);
  const title = p.brand === "generic" ? `${p.name} | SuperMegaCute` : `${p.name} — ${brandName} | SuperMegaCute`;
  const facts = [
    ["Brand", brandName],
    ["Pillar", p.pillars.map((s) => g.pillar(s)?.name).filter(Boolean).join(", ")],
    p.aesthetics?.length && ["Aesthetic", p.aesthetics.map((s) => g.facet("aesthetic", s).name).join(", ")],
    p.moods?.length && ["Mood", p.moods.map((s) => g.facet("mood", s).name).join(", ")],
    p.recipients?.length && ["Great for", p.recipients.map((s) => g.facet("recipient", s).name).join(", ")],
    p.occasions?.length && ["Occasions", p.occasions.map((s) => g.facet("occasion", s).name).join(", ")],
  ].filter(Boolean);

  const productLd = {
    "@context": "https://schema.org", "@type": "Product",
    name: p.name, description: p.blurb, sku: p.merchantRef,
    ...(p.image?.src ? { image: [p.image.src] } : {}),
    brand: { "@type": "Brand", name: brandName },
    offers: {
      "@type": "Offer", priceCurrency: p.currency, price: p.price,
      availability: "https://schema.org/InStock",
      url: link ? link.url : `${SITE}/p/${p.id}`,
    },
  };

  const relatedHtml = related(g, p, 4).map((r) => productCard(g, r)).join("");
  const art = p.image?.src
    ? `<img class="pdp-image" src="${esc(p.image.src)}" alt="${esc(p.name)}">`
    : `<div class="pdp-image pdp-emoji" style="background:${BG[p.art?.bg] || BG.cream}">${p.art?.emoji || "🎀"}</div>`;

  const body = `
<header class="site-header">${chromeHeader(g, p.pillars[0])}</header>
<main class="wrap pdp">
  <nav class="pdp-breadcrumb" aria-label="Breadcrumb">
    <a href="/">Home</a> › <a href="/${esc(pillar.slug)}">${esc(pillar.name)}</a> › <span>${esc(p.name)}</span>
  </nav>
  <div class="pdp-layout">
    <div class="pdp-media smc-card">${art}</div>
    <div class="pdp-info">
      <p class="product-brand">${esc(brandName)}</p>
      <h1>${esc(p.name)}</h1>
      <p class="pdp-blurb">${esc(p.blurb)}</p>
      <p class="pdp-price">${money(p)} <span class="pdp-currency">${esc(p.currency)}</span></p>
      ${link ? `<a class="smc-button-primary pdp-cta" href="${esc(link.url)}" rel="${esc(link.rel)}" target="_blank">View at ${esc(link.merchantName)} →</a>` : ""}
      <dl class="pdp-facts">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>
      <div class="product-chips">${(p.tags || []).map((t) => `<span class="chip chip-soft">${esc(t.replace(/-/g, " "))}</span>`).join("")}</div>
    </div>
  </div>
  <section class="section">
    <h2 class="section-title">You might also melt for</h2>
    <div class="product-grid">${relatedHtml}</div>
  </section>
</main>
<footer class="site-footer">${chromeFooter(g)}</footer>`;

  const html = pageShell({
    title,
    description: `${p.blurb} ${money(p)} at ${link ? link.merchantName : "our partner store"}.`.slice(0, 158),
    canonical: `${SITE}/p/${p.id}`,
    jsonLd: [productLd, breadcrumbLd([["Home", "/"], [pillar.name, `/${pillar.slug}`], [p.name, `/p/${p.id}`]])],
    og: { "og:type": "product", ...(p.image?.src ? { "og:image": p.image.src } : {}) },
    body,
  });
  await mkdir(join(DIST, "p", p.id), { recursive: true });
  await writeFile(join(DIST, "p", p.id, "index.html"), html);
  productPages++;
}

/* ---------- 4. collection landing pages ---------- */

for (const c of g.collections) {
  const items = find(g, c.query);
  const listLd = {
    "@context": "https://schema.org", "@type": "ItemList",
    name: c.name, numberOfItems: items.length,
    itemListElement: items.slice(0, 50).map((p, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE}/p/${p.id}` })),
  };
  const body = `
<header class="site-header">${chromeHeader(g)}</header>
<main>
  <section class="pillar-hero">
    <div class="wrap">
      <span class="section-kicker">Collection</span>
      <h1>${esc(c.name)}</h1>
      <p>${esc(c.blurb)} <strong>${items.length} finds</strong>, refreshed as new products join the catalog.</p>
    </div>
  </section>
  <section class="section" style="padding-top:0">
    <div class="wrap">
      <div class="product-grid">${items.slice(0, 96).map((p) => productCard(g, p)).join("")}</div>
      ${items.length > 96 ? `<p class="empty-state">Browse all ${items.length} in <a href="/explore?collection=${esc(c.slug)}">Explore →</a></p>` : ""}
    </div>
  </section>
</main>
<footer class="site-footer">${chromeFooter(g)}</footer>`;
  const html = pageShell({
    title: `${c.name} — cute finds | SuperMegaCute`,
    description: `${c.blurb} ${items.length} hand-tagged finds.`.slice(0, 158),
    canonical: `${SITE}/c/${c.slug}`,
    jsonLd: [listLd, breadcrumbLd([["Home", "/"], [c.name, `/c/${c.slug}`]])],
    body,
  });
  await mkdir(join(DIST, "c", c.slug), { recursive: true });
  await writeFile(join(DIST, "c", c.slug, "index.html"), html);
}

/* ---------- 5. sitemaps + robots ---------- */

const url = (loc, priority, lastmod) =>
  `  <url><loc>${loc}</loc>${lastmod ? `<lastmod>${lastmod.slice(0, 10)}</lastmod>` : ""}<priority>${priority}</priority></url>`;
const wrapUrls = (urls) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>`;

const staticUrls = [
  url(`${SITE}/`, "1.0"),
  ...Object.values(ROOT_PAGES).filter((s) => !["home", "explore"].includes(s)).map((s) => url(`${SITE}/${s}`, "0.8")),
  url(`${SITE}/guides/blind-box-collecting-101`, "0.7"),
  ...g.collections.map((c) => url(`${SITE}/c/${c.slug}`, "0.8")),
];
await writeFile(join(DIST, "sitemap-pages.xml"), wrapUrls(staticUrls));

const CHUNK = 10000;
const productUrls = g.visible.map((p) => url(`${SITE}/p/${p.id}`, "0.6", p.provenance?.fetchedAt));
const productSitemaps = [];
for (let i = 0; i < productUrls.length; i += CHUNK) {
  const name = `sitemap-products-${i / CHUNK + 1}.xml`;
  await writeFile(join(DIST, name), wrapUrls(productUrls.slice(i, i + CHUNK)));
  productSitemaps.push(name);
}
await writeFile(join(DIST, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  ["sitemap-pages.xml", ...productSitemaps].map((s) => `  <sitemap><loc>${SITE}/${s}</loc></sitemap>`).join("\n") +
  `\n</sitemapindex>`);
await writeFile(join(DIST, "robots.txt"), `User-agent: *\nAllow: /\nDisallow: /explore\nSitemap: ${SITE}/sitemap.xml\n`);
await writeFile(join(DIST, "llms.txt"), await readFile(join(ROOT, "llms.txt"), "utf8"));

console.log(`Built dist/: ${productPages} product pages, ${g.collections.length} collection pages, ${productSitemaps.length + 1} sitemaps.`);

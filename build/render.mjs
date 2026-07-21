/* Server-side render helpers for the static build.
   Mirrors js/graph.js semantics (OR within facet, AND across facets) — the
   browser engine re-renders identical markup at runtime, so bots and users
   see the same content. Phase 2 unifies the two into one shared module. */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const SITE = "https://supamegacute.com";
export const SITE_NAME = "SupaMegaCute";
export const OG_IMAGE = `${SITE}/assets/brand/social/og-default.png`;
export const BG = { blush: "#FFC7D6", lilac: "#DCC7F7", mint: "#BDEAD7", peach: "#FFDCC2", cream: "#FFF6EC" };

export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export async function loadGraph(root) {
  const read = async (name) => JSON.parse(await readFile(join(root, "data", `${name}.json`), "utf8"));
  const [taxonomy, productsFile, merchants, collectionsFile, releasesFile] = await Promise.all(
    ["taxonomy", "products", "merchants", "collections", "releases"].map(read)
  );
  const g = {
    taxonomy,
    merchants,
    products: productsFile.products,
    collections: collectionsFile.collections,
    releases: releasesFile.releases,
  };
  g.visible = g.products.filter((p) => !p.availability || p.availability.status === "in-stock");
  g.brand = (slug) => taxonomy.brands.find((b) => b.slug === slug) || { slug, name: slug };
  g.pillar = (slug) => taxonomy.pillars.find((p) => p.slug === slug);
  g.facet = (type, slug) => (taxonomy.facets[type] || []).find((f) => f.slug === slug) || { slug, name: slug };
  return g;
}

const ARRAY_KEYS = ["pillars", "aesthetics", "moods", "recipients", "occasions", "rooms", "colours", "themes", "tags"];

export function matches(g, product, query) {
  for (const key of ARRAY_KEYS) {
    const wanted = query[key];
    if (wanted && wanted.length) {
      const have = product[key] || [];
      if (!wanted.some((w) => have.includes(w))) return false;
    }
  }
  if (query.brands && query.brands.length && !query.brands.includes(product.brand)) return false;
  if (query.priceBand) {
    const band = g.taxonomy.facets.priceBand.find((b) => b.slug === query.priceBand);
    if (band && !(product.price >= band.min && (band.max === null || band.max > product.price))) return false;
  }
  return true;
}

export const find = (g, query) => g.visible.filter((p) => matches(g, p, query));

export function related(g, product, limit = 4) {
  const score = (other) => {
    if (other.id === product.id) return -1;
    let s = 0;
    for (const key of ["aesthetics", "moods", "themes", "pillars", "recipients"]) {
      const a = product[key] || [], b = other[key] || [];
      s += a.filter((x) => b.includes(x)).length * (key === "aesthetics" ? 3 : key === "themes" ? 2 : 1);
    }
    if (other.brand === product.brand && product.brand !== "generic") s += 3;
    return s;
  };
  return g.visible
    .map((p) => ({ p, s: score(p) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.p);
}

const addParams = (url, pairs) => {
  const qs = pairs.filter(Boolean).join("&");
  if (!qs) return url;
  return url + (url.includes("?") ? "&" : "?") + qs;
};

// Resolve a product's outbound link. Priority: (1) the merchant's own direct
// affiliate program if its affiliateId is set; (2) the aggregator wrap if a
// publisherId is set and the merchant isn't excluded; (3) a plain direct link.
// Marketplace merchants (amazon/etsy/ebay) carry a full linkTemplate and are
// handled separately from the boutique-store merchants.
export function affiliateLink(g, product) {
  const m = g.merchants.merchants[product.merchant];
  if (!m) return null;
  const d = g.merchants.defaults;
  const agg = d.aggregator || {};
  const utmPairs = Object.entries(d.utm || {}).map(([k, v]) => `${k}=${encodeURIComponent(v)}`);

  // Marketplace merchants: full-template model.
  if (m.linkTemplate) {
    const affiliate = Boolean(m.affiliateId);
    const url = (affiliate ? m.linkTemplate : m.directTemplate)
      .replace("{ref}", product.merchantRef)
      .replace("{affiliateId}", m.affiliateId || "");
    return { url, merchantName: m.name, rel: affiliate ? d.relAffiliate : d.relDirect };
  }

  // Boutique-store merchants: direct URL + utm, then direct-program / aggregator / plain.
  const dest = addParams(m.directTemplate.replace("{ref}", product.merchantRef), utmPairs);

  if (m.affiliateId && m.affiliateParam) {
    const url = addParams(dest, [m.affiliateParam.replace("{affiliateId}", m.affiliateId)]);
    return { url, merchantName: m.name, rel: d.relAffiliate };
  }
  if (agg.publisherId && !(agg.excludeMerchants || []).includes(product.merchant)) {
    const url = agg.wrapTemplate
      .replace("{publisherId}", agg.publisherId)
      .replace("{url}", encodeURIComponent(dest));
    return { url, merchantName: m.name, rel: d.relAffiliate };
  }
  return { url: dest, merchantName: m.name, rel: d.relDirect };
}

export const money = (p) => (p.priceApprox ? "~" : "") + `$${p.price.toFixed(2).replace(/\.00$/, "")}`;

export function productCard(g, product) {
  const link = affiliateLink(g, product);
  const bg = BG[product.art?.bg] || BG.cream;
  const art = product.image?.src
    ? `<img src="${esc(product.image.src)}" alt="${esc(product.name)}" loading="lazy">`
    : `<span aria-hidden="true">${product.art?.emoji || "🎀"}</span>`;
  const chips = (product.aesthetics || []).slice(0, 2)
    .map((a) => `<span class="chip chip-soft">${esc(g.facet("aesthetic", a).name)}</span>`).join("");
  return `
    <article class="product-card smc-card" data-id="${esc(product.id)}">
      <a class="product-link" href="/p/${esc(product.id)}">
        <div class="product-art" style="background:${bg}">${art}</div>
      </a>
      <div class="product-body">
        <p class="product-brand">${esc(g.brand(product.brand).name)}</p>
        <h3 class="product-name"><a href="/p/${esc(product.id)}">${esc(product.name)}</a></h3>
        <p class="product-blurb">${esc(product.blurb)}</p>
        <div class="product-chips">${chips}</div>
        <div class="product-foot">
          <span class="product-price">${money(product)}</span>
          ${link ? `<a class="smc-button-primary product-cta" href="${esc(link.url)}" rel="${esc(link.rel)}" target="_blank">View at ${esc(link.merchantName)}</a>` : ""}
        </div>
      </div>
    </article>`;
}

export function chromeHeader(g, activeSlug = "") {
  const nav = g.taxonomy.pillars
    .filter((p) => p.slug !== "explore")
    .map((p) => `<a href="/${p.slug}" class="${p.slug === activeSlug ? "active" : ""}">${esc(p.name)}</a>`)
    .join("");
  return `
      <div class="header-inner">
        <a class="header-logo" href="/"><img src="/assets/brand/logos/primary-logo-horizontal.svg" alt="SupaMegaCute — discover cute things you love" height="52"></a>
        <nav class="header-nav" aria-label="Pillars">${nav}</nav>
        <a class="smc-button-primary header-cta" href="/explore">✨ Explore</a>
      </div>`;
}

export function chromeFooter(g) {
  const collections = g.collections
    .map((c) => `<a href="/c/${esc(c.slug)}">${esc(c.name)}</a>`).join(" · ");
  const brands = g.taxonomy.brands.filter((b) => b.slug !== "generic" && (!g.brandHasPage || g.brandHasPage.has(b.slug)))
    .map((b) => `<a href="/b/${esc(b.slug)}">${esc(b.name)}</a>`).join(" · ");
  const has = g.facetHasPage || { aesthetic: null, occasion: null, recipient: null };
  const keep = (set, slug) => !set || set.has(slug);
  const styles = (g.taxonomy.facets.aesthetic || []).filter((a) => keep(has.aesthetic, a.slug))
    .map((a) => `<a href="/style/${esc(a.slug)}">${esc(a.name)}</a>`).join(" · ");
  const occasions = (g.taxonomy.facets.occasion || []).filter((o) => keep(has.occasion, o.slug))
    .map((o) => `<a href="/occasion/${esc(o.slug)}">${esc(o.name)} gifts</a>`).join(" · ");
  const recipients = (g.taxonomy.facets.recipient || []).filter((r) => keep(has.recipient, r.slug))
    .map((r) => `<a href="/for/${esc(r.slug)}">${esc(r.name)}</a>`).join(" · ");
  return `
      <div class="footer-inner">
        <img src="/assets/brand/submarks/smc-monogram-circle.svg" alt="" width="64" height="64">
        <p class="footer-mission">We help you discover cute things that make you smile.</p>
        <nav class="footer-links" aria-label="Collections"><span class="footer-label">Collections</span>${collections}</nav>
        <nav class="footer-links" aria-label="Brands"><span class="footer-label">Brands</span>${brands}</nav>
        <nav class="footer-links" aria-label="Shop by aesthetic"><span class="footer-label">Aesthetics</span>${styles}</nav>
        <nav class="footer-links" aria-label="Shop by occasion"><span class="footer-label">Occasions</span>${occasions}</nav>
        <nav class="footer-links" aria-label="Shop by recipient"><span class="footer-label">For</span>${recipients}</nav>
        <p class="footer-collections"><a href="/guides">Guides &amp; buying advice</a></p>
        <p class="footer-disclosure">SupaMegaCute is reader-supported. When you buy through our links we may earn an affiliate commission, at no extra cost to you.</p>
        <p class="footer-copy">© 2026 SupaMegaCute.com</p>
      </div>`;
}

export const FONT_LINKS = `
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;0,700;1,600&family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet" media="print" onload="this.media='all'">`;

// Skimlinks auto-monetisation. Rewrites outbound merchant links to affiliate
// links at click-time across ~48.5k merchants; keeps clean direct links in the
// HTML (SEO-safe) and covers every store — including those with no direct
// programme — plus future ones. Loaded async so it never blocks render.
export const HEAD_SCRIPTS = `
  <script async src="https://s.skimresources.com/js/306502X1794748.skimlinks.js"></script>`;

export function pageShell({ title, description, canonical, body, jsonLd = [], og = {}, robots = null }) {
  const ld = jsonLd.map((o) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join("\n  ");
  const image = og["og:image"] || OG_IMAGE;
  const ogTags = Object.entries({
    "og:site_name": SITE_NAME,
    "og:title": title,
    "og:description": description,
    "og:url": canonical,
    "og:image": image,
    "og:type": "website",
    ...og,
  }).map(([k, v]) => `<meta property="${k}" content="${esc(v)}">`).join("\n  ");
  const twitterTags = [
    ["twitter:card", "summary_large_image"],
    ["twitter:title", title],
    ["twitter:description", description],
    ["twitter:image", image],
  ].map(([k, v]) => `<meta name="${k}" content="${esc(v)}">`).join("\n  ");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  ${robots ? `<meta name="robots" content="${robots}">` : ""}
  <link rel="canonical" href="${esc(canonical)}">
  <link rel="icon" type="image/svg+xml" href="/assets/brand/submarks/favicon.svg">${FONT_LINKS}
  <link rel="stylesheet" href="/assets/smc.css">${HEAD_SCRIPTS}
  ${ogTags}
  ${twitterTags}
  ${ld}
</head>
<body>
${body}
</body>
</html>`;
}

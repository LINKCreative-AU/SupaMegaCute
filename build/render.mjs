/* Server-side render helpers for the static build.
   Mirrors js/graph.js semantics (OR within facet, AND across facets) — the
   browser engine re-renders identical markup at runtime, so bots and users
   see the same content. Phase 2 unifies the two into one shared module. */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const SITE = "https://supermegacute.com";
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

export function affiliateLink(g, product) {
  const m = g.merchants.merchants[product.merchant];
  if (!m) return null;
  const affiliate = Boolean(m.affiliateId);
  let url = (affiliate ? m.linkTemplate : m.directTemplate)
    .replace("{ref}", product.merchantRef)
    .replace("{affiliateId}", m.affiliateId);
  const utm = g.merchants.defaults.utm;
  if (utm && !url.includes("awin1.com")) {
    const qs = Object.entries(utm).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
    url += (url.includes("?") ? "&" : "?") + qs;
  }
  return {
    url,
    merchantName: m.name,
    rel: affiliate ? g.merchants.defaults.relAffiliate : g.merchants.defaults.relDirect,
  };
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
        <a class="header-logo" href="/"><img src="/assets/brand/logos/primary-logo-horizontal.svg" alt="SuperMegaCute — discover cute things you love" height="52"></a>
        <nav class="header-nav" aria-label="Pillars">${nav}</nav>
        <a class="smc-button-primary header-cta" href="/explore">✨ Explore</a>
      </div>`;
}

export function chromeFooter(g) {
  const collections = g.collections
    .map((c) => `<a href="/c/${esc(c.slug)}">${esc(c.name)}</a>`).join(" · ");
  return `
      <div class="footer-inner">
        <img src="/assets/brand/submarks/smc-monogram-circle.svg" alt="" width="64" height="64">
        <p class="footer-mission">We help you discover cute things that make you smile.</p>
        <p class="footer-collections">${collections}</p>
        <p class="footer-disclosure">SuperMegaCute is reader-supported. When you buy through our links we may earn an affiliate commission, at no extra cost to you.</p>
        <p class="footer-copy">© 2026 SuperMegaCute.com</p>
      </div>`;
}

export const FONT_LINKS = `
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;0,700;1,600&family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet" media="print" onload="this.media='all'">`;

export function pageShell({ title, description, canonical, body, jsonLd = [], og = {}, robots = null }) {
  const ld = jsonLd.map((o) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join("\n  ");
  const ogTags = Object.entries({ "og:title": title, "og:description": description, ...og })
    .map(([k, v]) => `<meta property="${k}" content="${esc(v)}">`).join("\n  ");
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
  <link rel="stylesheet" href="/assets/smc.css">
  ${ogTags}
  ${ld}
</head>
<body>
${body}
</body>
</html>`;
}

/* SuperMegaCute knowledge-graph client.
   Loads the structured data layer, builds affiliate links from merchant
   connector config, resolves collection queries and renders product cards.
   Discovery pages are thin shells over this module. */

(function () {
  "use strict";

  const DATA = ["taxonomy", "products", "merchants", "collections", "releases"];
  const BASE = document.currentScript && document.currentScript.dataset.base !== undefined
    ? document.currentScript.dataset.base
    : ".";

  const BG = { blush: "#FFC7D6", lilac: "#DCC7F7", mint: "#BDEAD7", peach: "#FFDCC2", cream: "#FFF6EC" };

  const SMC = { ready: null };
  window.SMC = SMC;

  SMC.ready = Promise.all(
    DATA.map((name) => fetch(`${BASE}/data/${name}.json`).then((r) => {
      if (!r.ok) throw new Error(`Failed to load ${name}.json (${r.status})`);
      return r.json();
    }))
  ).then(([taxonomy, products, merchants, collections, releases]) => {
    SMC.taxonomy = taxonomy;
    SMC.products = products.products;
    SMC.merchants = merchants;
    SMC.collections = collections.collections;
    SMC.releases = releases.releases;
    return SMC;
  });

  /* ---------- lookups ---------- */

  SMC.facet = function (type, slug) {
    const list = SMC.taxonomy.facets[type] || [];
    return list.find((f) => f.slug === slug) || { slug, name: slug };
  };

  SMC.pillar = function (slug) {
    return SMC.taxonomy.pillars.find((p) => p.slug === slug);
  };

  SMC.brand = function (slug) {
    return SMC.taxonomy.brands.find((b) => b.slug === slug) || { slug, name: slug };
  };

  SMC.priceBand = function (price) {
    return SMC.taxonomy.facets.priceBand.find(
      (b) => price >= b.min && (b.max === null || price < b.max)
    );
  };

  /* ---------- merchant connectors ---------- */

  function addParams(url, pairs) {
    const qs = pairs.filter(Boolean).join("&");
    if (!qs) return url;
    return url + (url.includes("?") ? "&" : "?") + qs;
  }

  // Mirrors build/render.mjs affiliateLink. Priority: (1) the merchant's own
  // direct affiliate program when its affiliateId is set; (2) the aggregator
  // wrap when a publisherId is set and the merchant isn't excluded; (3) a plain
  // direct link. Marketplace merchants (amazon/etsy/ebay) use the full template.
  SMC.affiliateLink = function (product) {
    const m = SMC.merchants.merchants[product.merchant];
    if (!m) return null;
    const d = SMC.merchants.defaults;
    const agg = d.aggregator || {};
    const utmPairs = Object.entries(d.utm || {}).map(([k, v]) => `${k}=${encodeURIComponent(v)}`);

    if (m.linkTemplate) {
      const affiliate = Boolean(m.affiliateId);
      const url = (affiliate ? m.linkTemplate : m.directTemplate)
        .replace("{ref}", product.merchantRef)
        .replace("{affiliateId}", m.affiliateId || "");
      return { url, merchantName: m.name, rel: affiliate ? d.relAffiliate : d.relDirect, target: d.target };
    }

    const dest = addParams(m.directTemplate.replace("{ref}", product.merchantRef), utmPairs);

    if (m.affiliateId && m.affiliateParam) {
      const url = addParams(dest, [m.affiliateParam.replace("{affiliateId}", m.affiliateId)]);
      return { url, merchantName: m.name, rel: d.relAffiliate, target: d.target };
    }
    if (agg.publisherId && !(agg.excludeMerchants || []).includes(product.merchant)) {
      const url = agg.wrapTemplate
        .replace("{publisherId}", agg.publisherId)
        .replace("{url}", encodeURIComponent(dest));
      return { url, merchantName: m.name, rel: d.relAffiliate, target: d.target };
    }
    return { url: dest, merchantName: m.name, rel: d.relDirect, target: d.target };
  };

  /* ---------- query engine ---------- */

  // A query is {pillars?, aesthetics?, moods?, recipients?, occasions?, rooms?,
  // colours?, themes?, tags?, brands?, priceBand?, text?}. Array-valued keys
  // match if the product shares ANY value (OR within a facet); separate keys
  // must all match (AND across facets) — same semantics the AI layer uses.
  const ARRAY_KEYS = ["pillars", "aesthetics", "moods", "recipients", "occasions", "rooms", "colours", "themes", "tags"];

  SMC.matches = function (product, query) {
    for (const key of ARRAY_KEYS) {
      const wanted = query[key];
      if (wanted && wanted.length) {
        const have = product[key] || [];
        if (!wanted.some((w) => have.includes(w))) return false;
      }
    }
    if (query.brands && query.brands.length && !query.brands.includes(product.brand)) return false;
    if (query.priceBand) {
      const band = SMC.taxonomy.facets.priceBand.find((b) => b.slug === query.priceBand);
      if (band && !(product.price >= band.min && (band.max === null || band.max > product.price))) return false;
    }
    if (query.text) {
      const hay = [product.name, product.blurb, SMC.brand(product.brand).name]
        .concat(product.tags || []).join(" ").toLowerCase();
      if (!query.text.toLowerCase().split(/\s+/).every((t) => hay.includes(t))) return false;
    }
    return true;
  };

  SMC.find = function (query) {
    // Products flagged by the refresh job (out of stock / gone from feed)
    // stay in the graph but are hidden from discovery surfaces.
    return SMC.products.filter(
      (p) => (!p.availability || p.availability.status === "in-stock") && SMC.matches(p, query)
    );
  };

  SMC.resolveCollection = function (col) {
    return SMC.find(col.query);
  };

  // Related products: shared aesthetics/moods/themes weighted scoring.
  SMC.related = function (product, limit) {
    const score = (other) => {
      if (other.id === product.id) return -1;
      let s = 0;
      for (const key of ["aesthetics", "moods", "themes", "pillars", "recipients"]) {
        const a = product[key] || [], b = other[key] || [];
        s += a.filter((x) => b.includes(x)).length * (key === "aesthetics" ? 3 : key === "themes" ? 2 : 1);
      }
      return s;
    };
    return SMC.products
      .map((p) => ({ p, s: score(p) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, limit || 4)
      .map((x) => x.p);
  };

  /* ---------- rendering ---------- */

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  SMC.esc = esc;

  SMC.money = function (product) {
    const amount = `$${product.price.toFixed(2).replace(/\.00$/, "")}`;
    return product.priceApprox ? `~${amount}` : amount; // curated records carry band-midpoint prices until live data lands
  };

  SMC.productCard = function (product) {
    const link = SMC.affiliateLink(product);
    const bg = BG[product.art.bg] || BG.cream;
    const art = product.image && product.image.src
      ? `<img src="${esc(product.image.src)}" alt="${esc(product.name)}" loading="lazy">`
      : `<span aria-hidden="true">${product.art.emoji}</span>`;
    const chips = (product.aesthetics || []).slice(0, 2)
      .map((a) => `<span class="chip chip-soft">${esc(SMC.facet("aesthetic", a).name)}</span>`)
      .join("");
    const pdp = `${BASE}/p/${esc(product.id)}`;
    return `
    <article class="product-card smc-card" data-id="${esc(product.id)}">
      <a class="product-link" href="${pdp}"><div class="product-art" style="background:${bg}">${art}</div></a>
      <div class="product-body">
        <p class="product-brand">${esc(SMC.brand(product.brand).name)}</p>
        <h3 class="product-name"><a href="${pdp}">${esc(product.name)}</a></h3>
        <p class="product-blurb">${esc(product.blurb)}</p>
        <div class="product-chips">${chips}</div>
        <div class="product-foot">
          <span class="product-price">${SMC.money(product)}</span>
          ${link ? `<a class="smc-button-primary product-cta" href="${esc(link.url)}" rel="${esc(link.rel)}" target="${esc(link.target)}">View at ${esc(link.merchantName)}</a>` : ""}
        </div>
      </div>
    </article>`;
  };

  SMC.collectionCard = function (col) {
    const count = SMC.resolveCollection(col).length;
    const bg = BG[col.art.bg] || BG.cream;
    return `
    <a class="collection-card smc-card" href="${BASE}/explore?collection=${esc(col.slug)}">
      <div class="collection-art" style="background:${bg}"><span aria-hidden="true">${col.art.emoji}</span></div>
      <div class="collection-body">
        <h3>${esc(col.name)}</h3>
        <p>${esc(col.blurb)}</p>
        <span class="collection-count">${count} finds →</span>
      </div>
    </a>`;
  };

  // Cap DOM size on big result sets; filters narrow long before this matters.
  SMC.GRID_CAP = 96;

  SMC.renderGrid = function (el, products, emptyMessage) {
    if (!products.length) {
      el.innerHTML = `<div class="empty-state"><img src="${BASE}/assets/brand/decorative/cloud-face.svg" alt="" width="90"><p>${esc(emptyMessage || "Nothing this cute yet — try loosening a filter.")}</p></div>`;
      return;
    }
    const shown = products.slice(0, SMC.GRID_CAP);
    let html = shown.map(SMC.productCard).join("");
    if (products.length > shown.length) {
      html += `<div class="empty-state grid-more">Showing ${shown.length} of ${products.length} — add a filter to narrow the vibe ✨</div>`;
    }
    el.innerHTML = html;
  };

  /* ---------- shared chrome ---------- */

  SMC.renderChrome = function () {
    const header = document.querySelector("[data-smc-header]");
    const footer = document.querySelector("[data-smc-footer]");
    const here = document.body.dataset.pillar || document.body.dataset.page || "";
    if (header) {
      const nav = SMC.taxonomy.pillars
        .filter((p) => p.slug !== "explore")
        .map((p) => `<a href="${BASE}/${p.slug}" class="${p.slug === here ? "active" : ""}">${esc(p.name)}</a>`)
        .join("");
      header.innerHTML = `
      <div class="header-inner">
        <a class="header-logo" href="${BASE}/"><img src="${BASE}/assets/brand/logos/primary-logo-horizontal.svg" alt="SuperMegaCute — discover cute things you love" height="52"></a>
        <nav class="header-nav" aria-label="Pillars">${nav}</nav>
        <a class="smc-button-primary header-cta" href="${BASE}/explore">✨ Explore</a>
      </div>`;
    }
    if (footer) {
      const collectionLinks = SMC.collections
        .map((c) => `<a href="${BASE}/c/${esc(c.slug)}">${esc(c.name)}</a>`)
        .join(" · ");
      const brandLinks = SMC.taxonomy.brands.filter((b) => b.slug !== "generic")
        .map((b) => `<a href="${BASE}/b/${esc(b.slug)}">${esc(b.name)}</a>`)
        .join(" · ");
      footer.innerHTML = `
      <div class="footer-inner">
        <img src="${BASE}/assets/brand/submarks/smc-monogram-circle.svg" alt="" width="64" height="64">
        <p class="footer-mission">We help you discover cute things that make you smile.</p>
        <p class="footer-collections">${collectionLinks}</p>
        <p class="footer-collections">${brandLinks}</p>
        <p class="footer-disclosure">SuperMegaCute is reader-supported. When you buy through our links we may earn an affiliate commission, at no extra cost to you.</p>
        <p class="footer-copy">© 2026 SuperMegaCute.com</p>
      </div>`;
    }
  };

  /* ---------- page bootstrap ---------- */

  SMC.ready.then(() => {
    SMC.renderChrome();
    document.querySelectorAll("[data-smc-collection-rail]").forEach((el) => {
      const limit = parseInt(el.dataset.limit || "4", 10);
      el.innerHTML = SMC.collections.slice(0, limit).map(SMC.collectionCard).join("");
    });
    document.querySelectorAll("[data-smc-grid]").forEach((el) => {
      const query = JSON.parse(el.dataset.smcGrid || "{}");
      let items = SMC.find(query);
      if (el.dataset.order === "newest") items = items.slice().reverse(); // file order = insertion order
      if (el.dataset.limit) items = items.slice(0, parseInt(el.dataset.limit, 10));
      SMC.renderGrid(el, items);
    });
    document.querySelectorAll("[data-smc-releases]").forEach((el) => {
      el.innerHTML = SMC.releases.map((r) => {
        const b = SMC.brand(r.brand);
        const d = new Date(r.date + "T00:00:00");
        const when = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        const rarity = r.rarity.secret ? `Secret chase ${r.rarity.secretOdds}` : r.rarity.limited ? "Limited numbered run" : r.rarity.retiredRisk ? `Retires — ${r.rarity.retiredRisk} risk` : "Open run";
        return `
        <div class="release-row smc-card">
          <div class="release-date"><span>${when.split(" ")[0]}</span><strong>${d.getDate()}</strong></div>
          <div class="release-info">
            <h3>${esc(b.name)} — ${esc(r.series)}</h3>
            <p>${esc(r.notes)}</p>
            <div class="product-chips">
              <span class="chip chip-soft">${esc(r.format)}</span>
              <span class="chip chip-soft">$${r.rrp} RRP</span>
              <span class="chip chip-gold">${esc(rarity)}</span>
            </div>
          </div>
        </div>`;
      }).join("");
    });
    document.dispatchEvent(new CustomEvent("smc:ready"));
  }).catch((err) => {
    console.error("SuperMegaCute graph failed to load", err);
  });
})();

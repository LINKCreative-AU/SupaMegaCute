/* Explore engine UI — faceted discovery over the knowledge graph.
   Filters are OR within a facet, AND across facets (mirrors SMC.matches).
   State lives in the URL so every explore result is shareable/linkable. */

(function () {
  "use strict";

  const FACET_GROUPS = [
    { key: "pillars", type: null, label: "Pillar" },
    { key: "brands", type: "brand", label: "Brand" },
    { key: "aesthetics", type: "aesthetic", label: "Aesthetic" },
    { key: "moods", type: "mood", label: "Mood" },
    { key: "recipients", type: "recipient", label: "Who's it for" },
    { key: "occasions", type: "occasion", label: "Occasion" },
    { key: "rooms", type: "room", label: "Room" },
    { key: "colours", type: "colour", label: "Colour" },
  ];

  const state = { text: "", priceBand: null, collection: null };
  FACET_GROUPS.forEach((g) => (state[g.key] = new Set()));
  state.tags = new Set(); // no chip UI, but tag deep-links (?tags=blind-box) are honored

  function readURL() {
    const params = new URLSearchParams(location.search);
    FACET_GROUPS.forEach((g) => {
      (params.get(g.key) || "").split(",").filter(Boolean).forEach((v) => state[g.key].add(v));
    });
    (params.get("tags") || "").split(",").filter(Boolean).forEach((v) => state.tags.add(v));
    state.text = params.get("q") || "";
    state.priceBand = params.get("priceBand") || null;
    state.collection = params.get("collection") || null;
  }

  function writeURL() {
    const params = new URLSearchParams();
    FACET_GROUPS.forEach((g) => {
      if (state[g.key].size) params.set(g.key, [...state[g.key]].join(","));
    });
    if (state.tags.size) params.set("tags", [...state.tags].join(","));
    if (state.text) params.set("q", state.text);
    if (state.priceBand) params.set("priceBand", state.priceBand);
    if (state.collection) params.set("collection", state.collection);
    const qs = params.toString();
    history.replaceState(null, "", qs ? `?${qs}` : location.pathname);
  }

  function currentQuery() {
    const q = { text: state.text || undefined, priceBand: state.priceBand || undefined };
    FACET_GROUPS.forEach((g) => (q[g.key] = [...state[g.key]]));
    q.tags = [...state.tags];
    return q;
  }

  function buildFilters() {
    const host = document.getElementById("explore-filters");
    const groups = FACET_GROUPS.map((g) => {
      const options =
        g.key === "brands"
          ? SMC.taxonomy.brands.filter((b) => b.slug !== "generic")
          : g.type
            ? SMC.taxonomy.facets[g.type]
            : SMC.taxonomy.pillars.filter((p) => p.slug !== "explore" && p.slug !== "aesthetics");
      const chips = options.map((o) => {
        const dot = o.hex ? `<span class="colour-dot" style="background:${o.hex}"></span>` : "";
        return `<button type="button" class="chip chip-filter" data-group="${g.key}" data-value="${o.slug}" aria-pressed="false">${dot}${SMC.esc(o.name)}</button>`;
      }).join("");
      return `<div class="filter-group"><h4>${g.label}</h4><div class="chip-row">${chips}</div></div>`;
    });
    const priceChips = SMC.taxonomy.facets.priceBand.map((b) =>
      `<button type="button" class="chip chip-filter" data-group="priceBand" data-value="${b.slug}" aria-pressed="false">${SMC.esc(b.name)}</button>`
    ).join("");
    groups.push(`<div class="filter-group"><h4>Budget</h4><div class="chip-row">${priceChips}</div></div>`);
    host.innerHTML = groups.join("");

    host.addEventListener("click", (e) => {
      const chip = e.target.closest(".chip-filter");
      if (!chip) return;
      const { group, value } = chip.dataset;
      state.collection = null; // manual filtering leaves collection mode
      if (group === "priceBand") {
        state.priceBand = state.priceBand === value ? null : value;
      } else {
        state[group].has(value) ? state[group].delete(value) : state[group].add(value);
      }
      render();
    });
  }

  function syncChips() {
    document.querySelectorAll(".chip-filter").forEach((chip) => {
      const { group, value } = chip.dataset;
      const on = group === "priceBand" ? state.priceBand === value : state[group].has(value);
      chip.classList.toggle("on", on);
      chip.setAttribute("aria-pressed", String(on));
    });
  }

  function relatedCollections(results) {
    const ids = new Set(results.map((p) => p.id));
    return SMC.collections
      .map((c) => ({ c, overlap: SMC.resolveCollection(c).filter((p) => ids.has(p.id)).length }))
      .filter((x) => x.overlap > 0 && x.c.slug !== state.collection)
      .sort((a, b) => b.overlap - a.overlap)
      .slice(0, 3)
      .map((x) => x.c);
  }

  function render() {
    writeURL();
    syncChips();

    const heading = document.getElementById("explore-heading");
    const sub = document.getElementById("explore-sub");
    let results;

    const col = state.collection && SMC.collections.find((c) => c.slug === state.collection);
    if (col) {
      results = SMC.resolveCollection(col);
      heading.textContent = col.name;
      sub.textContent = col.blurb;
    } else {
      results = SMC.find(currentQuery());
      heading.textContent = "Explore everything cute";
      sub.textContent = "Mix and match the vibe — every filter narrows the whole knowledge graph.";
    }

    document.getElementById("explore-count").textContent =
      `${results.length} ${results.length === 1 ? "find" : "finds"}`;
    SMC.renderGrid(document.getElementById("explore-results"), results);

    const relHost = document.getElementById("explore-collections");
    const rel = relatedCollections(results);
    relHost.innerHTML = rel.length
      ? `<h2 class="section-title">Keep exploring</h2><div class="collection-rail">${rel.map(SMC.collectionCard).join("")}</div>`
      : "";
  }

  function surpriseMe() {
    if (!SMC.taxonomy) return; // engine still loading
    // Deterministic-ish serendipity: random aesthetic + mood pairing that has results.
    const aes = SMC.taxonomy.facets.aesthetic, moods = SMC.taxonomy.facets.mood;
    for (let tries = 0; tries < 20; tries++) {
      const a = aes[Math.floor(Math.random() * aes.length)].slug;
      const m = moods[Math.floor(Math.random() * moods.length)].slug;
      if (SMC.find({ aesthetics: [a], moods: [m] }).length >= 3) {
        FACET_GROUPS.forEach((g) => state[g.key].clear());
        state.text = ""; state.priceBand = null; state.collection = null;
        state.aesthetics.add(a); state.moods.add(m);
        document.getElementById("explore-search").value = "";
        render();
        return;
      }
    }
  }

  // Immediate feedback: the product graph is a ~1MB payload, so on slower
  // connections there's a beat before the engine is live. Show a loading state
  // (instead of a dead-looking page) the moment this script runs.
  function showLoading() {
    const results = document.getElementById("explore-results");
    const count = document.getElementById("explore-count");
    if (count) count.textContent = "Loading…";
    if (results) {
      results.innerHTML =
        '<div class="empty-state explore-loading">' +
        '<img src="assets/brand/decorative/cloud-face.svg" alt="" width="90">' +
        "<p>Gathering all the cute things…</p></div>";
    }
  }

  function showError() {
    const results = document.getElementById("explore-results");
    const count = document.getElementById("explore-count");
    if (count) count.textContent = "";
    if (results) {
      results.innerHTML =
        '<div class="empty-state">' +
        '<img src="assets/brand/decorative/cloud-face.svg" alt="" width="90">' +
        "<p>Hmm, the cuteverse didn't load. Please " +
        '<a href="explore">refresh the page</a> to try again.</p></div>';
    }
  }

  function init() {
    readURL();
    buildFilters();

    const search = document.getElementById("explore-search");
    // Honour anything the visitor typed before the engine finished loading,
    // otherwise seed the box from the URL's ?q= state.
    if (search.value.trim() && !state.text) state.text = search.value.trim();
    search.value = state.text;
    search.addEventListener("input", () => {
      state.text = search.value.trim();
      state.collection = null;
      render();
    });

    document.getElementById("explore-clear").addEventListener("click", () => {
      FACET_GROUPS.forEach((g) => state[g.key].clear());
      state.tags.clear();
      state.text = ""; state.priceBand = null; state.collection = null;
      search.value = "";
      render();
    });

    document.getElementById("explore-surprise").addEventListener("click", surpriseMe);

    render();
  }

  showLoading();

  // Prefer the promise (can't be missed) but keep the event as a fallback.
  let started = false;
  const boot = () => { if (started) return; started = true; init(); };
  if (window.SMC && SMC.ready && typeof SMC.ready.then === "function") {
    SMC.ready.then(boot).catch(showError);
  } else {
    document.addEventListener("smc:ready", boot);
  }
  // Safety net: if the graph never loads, don't leave a permanently dead page.
  setTimeout(() => { if (!started && !(window.SMC && SMC.taxonomy)) showError(); }, 20000);
})();

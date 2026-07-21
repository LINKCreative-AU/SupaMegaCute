# SupaMegaCute — Project Handoff & Status

**Last updated:** 2026-07-21
**Purpose:** Single source of truth to continue work on any machine. Pull the
repo and read this file first. A friendly, non-technical version of this doc
exists as a shareable "Owner's Handover Pack" (ask James for the link).

**Ownership note:** James is handing day-to-day ownership to **Ayu**. See
"Onboarding a new owner" at the bottom.

---

## 🔗 Live links

| What | URL |
|------|-----|
| Live site | https://www.supamegacute.com (apex redirects to www) |
| GitHub repo | https://github.com/LINKCreative-AU/SupaMegaCute |
| Vercel project | `supermegacute` (team **link-hq** / `team_deEf9rlBg0yNvgLZANcZwsjw`) |
| Email inbox | hello@supamegacute.com (Google Workspace) |
| Search Console | Verified (meta tag in `index.html`) |

**Brand name/spelling:** **supamegacute** (SUPA, not super). Domain, repo,
email and logo all use SUPA. (The Vercel *project* is coincidentally named
"supermegacute" — cosmetic only, ignore.)

---

## ✅ Status snapshot

- **Site:** LIVE with valid HTTPS. **6,682 visible products**, full SEO build
  (per-product pages, 12 collections, 21 brand pages, 15 guides, 21 facet
  landing pages, JSON-LD, sitemaps, robots).
- **Catalog:** 9 boutique Shopify stores + **107 curated Amazon** products.
- **Explore engine:** client-side filter/search over the whole graph. Fixed
  2026-07-21 (added loading state; preserves early input; graceful failure).
- **Email:** `hello@supamegacute.com` on Google Workspace (MX/SPF/DKIM live;
  re-check DMARC at `_dmarc.supamegacute.com`).
- **Monetisation:** Skimlinks live site-wide; Amazon connected. Most boutique
  stores still need connecting — see below.
- **Deploy:** **Native GitHub → Vercel integration** (via `vercel.json`:
  `buildCommand: node build/build.mjs`, `outputDirectory: dist`). Pushing to
  `main` auto-deploys in ~2–4 min. (The old clone-shim is gone.)

---

## 💰 Affiliate / monetisation — REAL STATUS (audited 2026-07-21)

**Bottom line:** only **Amazon** is confirmed earning. ~1,900 products
(Blippo, Bellzi, uwuMarket) currently earn **$0**. The two biggest catalogs
(Cute Things from Japan, JapanLA) have **no confirmed program** and may only
earn if Skimlinks/Sovrn covers them.

### Connected
| Store | Products | How | Status |
|-------|---------:|-----|--------|
| Amazon | 107 | Direct — tag `supamegacute-20` | ✅ live |
| Skimlinks (aggregator) | sitewide | JS snippet in every `<head>` | ✅ live, client-side |

### Per-store plan (from affiliate research)
> **Key fact:** Skimlinks is now part of **Sovrn Commerce** (Sovrn absorbed
> Skimlinks + VigLink). So merchants listed on "Sovrn/VigLink" may **already
> be monetised by our Skimlinks snippet**. FIRST ACTION: log into the
> Skimlinks/Sovrn dashboard → check merchant coverage for all 9 domains.

| Store | Products | Program | Route | Action |
|-------|---------:|---------|-------|--------|
| Sugoi Mart | 57 | **Sovrn** (merchant 228534, "Open") | aggregator | Verify in Sovrn/Skimlinks — likely already earning |
| Bellzi | 332 | **Sovrn/VigLink** (merchant 72497) + in-house app | aggregator or direct | Verify Sovrn coverage first; direct app needs public social + monthly #Bellzi post |
| Sanrio | 178 | FlexOffers (4%/14-day, new signups paused) / aggregators | aggregator | Best via Skimlinks/Sovrn; verify coverage |
| uwuMarket | 90 | **GoAffPro** | direct, self-serve | Instant signup: uwumarket.goaffpro.com/create-account |
| Kawaii Pen Shop | 418 | In-house | direct, email | Email info@kawaiipenshop.com (name + channel + audience). **US$5 flat/order** |
| Blippo | 1,465 | In-house | direct, email | Email hello@blippo.com (web form is broken). *In progress.* |
| Cute Things from Japan | 2,382 | **None found** | unclear | Email store to ask about partnership; else relies on Skimlinks coverage only |
| JapanLA | 1,536 | **None** (loyalty only) | unclear | Email store to ask; else Skimlinks coverage only |
| Squishable | 117 | **None found** | unclear | Deprioritise; relies on Skimlinks coverage only |

**Recommended connect order:** (1) verify Skimlinks/Sovrn coverage in dashboard
→ (2) uwuMarket (instant GoAffPro) → (3) Kawaii Pen Shop (email) →
(4) Blippo (email) → (5) ask CTFJ/JapanLA directly about a program.

### How to flip a merchant on (once you have an ID)
`data/merchants.json` → set the merchant's `affiliateId` (and confirm
`affiliateParam`/`linkTemplate` matches the program's link format). If a store
carries its own direct program, add its domain to
`defaults.aggregator.excludeMerchants` so it isn't double-counted. The link
builder (`build/render.mjs` + `js/graph.js`, kept in sync) does the rest.
Rebuild + push → auto-deploys.

---

## ✉️ Newsletter (own-data build — pending keys)

Plan: store subscribers in **Supabase** (private project), send via **Resend**
(private account, domain-verified for supamegacute.com). No Beehiiv/Mailchimp.
- Homepage capture form + `js/newsletter.js` already in place (mailto fallback
  until wired).
- **Blocked on:** James adding keys to Vercel env vars
  (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`,
  `NEWSLETTER_FROM`). Then build `/api/subscribe` + table + send/unsub flow.
- **Rule:** secrets live in Vercel env vars only — never in git or chat.

---

## 🔒 Privacy migration (planned)

Repo + Vercel currently sit inside the shared LINK workspace. To make fully
private: transfer the GitHub repo to a personal account (make private) and
transfer/re-import the Vercel project under a personal Vercel account (Hobby is
private by default); re-add env vars + domain. Deploy is native GitHub
integration, so going private won't break builds as long as the Vercel GitHub
app keeps repo access. Also delete leftover `smc-src-*` projects in LINK HQ.

---

## 🔧 Pipeline / catalog ops (reference)

- Crawl → normalise → classify (bot fleet) → apply-review → promote →
  validate → build. Scripts in `ingest/`.
- Amazon: curated watchlist model — `ingest/amazon-watchlist.json` +
  `ingest/import-amazon-watchlist.mjs`. **Never fabricate ASINs**; verify every
  one resolves before import (`verify-asins.mjs` pattern).
- **Classification fleet:** ~110 of 226 batches unprocessed (hit monthly spend
  limit). To finish: re-run when credits reset, then
  `node ingest/apply-review.mjs && node ingest/promote.mjs &&
  node ingest/validate.mjs && node build/build.mjs`.

---

## 📱 Social (Ayu is taking this over)

Assets in `assets/brand/social/` (avatar + 3 starter post graphics). Aim for
**@supamegacute** on Instagram / Pinterest / TikTok; website link
`https://supamegacute.com`. Bios and setup notes were emailed to Ayu; the
Owner's Handover Pack has the strategy. Pinterest is high-value for shopping
traffic. If pursuing Bellzi's *direct* program, it needs a public social +
monthly #Bellzi post.

---

## 👤 Onboarding a new owner (Ayu)

1. Create a Claude account (claude.ai); Pro/Max for Claude Code.
2. James adds her as a GitHub collaborator on the repo.
3. Open claude.ai/code → connect GitHub → pick `SupaMegaCute`.
4. Tell Claude: "Read docs/HANDOFF.md and get me up to speed."
5. Grant Vercel + Google Workspace + Amazon/Skimlinks + socials access.

---

## 📋 Open TODOs (priority order)
1. **Connect affiliates** — verify Skimlinks/Sovrn coverage; sign up uwuMarket,
   Kawaii Pen Shop, Blippo; ask CTFJ/JapanLA. (~1,900 products at $0 now.)
2. **Newsletter** — add Supabase/Resend keys to Vercel → build capture+send.
3. **Privacy migration** — move repo + Vercel to personal accounts.
4. **Social ramp** — IG/Pinterest/TikTok (Ayu).
5. **Grow catalog** — more curated Amazon (highest margin) + guides.
6. **Housekeeping** — DMARC re-check; Search Console; optional affiliate
   disclosure page; optional Skimlinks server-side wrap
   (`defaults.aggregator.publisherId`).
7. **Finish classification fleet** (~110 batches) when credits allow.

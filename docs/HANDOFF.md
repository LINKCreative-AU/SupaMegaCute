# SupaMegaCute — Project Handoff & Status

**Last updated:** 2026-07-20
**Purpose:** Single source of truth to continue work on any machine. Pull the
repo and read this file.

---

## 🔗 Live links

| What | URL |
|------|-----|
| Live site (Vercel URL) | https://supermegacute.vercel.app |
| Custom domain | https://supamegacute.com (cert settling; add-to-project done) |
| GitHub repo | https://github.com/LINKCreative-AU/SupaMegaCute |
| Vercel project | `supermegacute` (team **link-hq** / `team_deEf9rlBg0yNvgLZANcZwsjw`) |
| Vercel domains | https://vercel.com/link-hq/~/domains/supamegacute.com |

**Brand name/spelling:** **supamegacute** (SUPA, not super). Domain, repo,
email and logo all use SUPA. (The Vercel *project* is coincidentally named
"supermegacute" — cosmetic only, ignore.)

---

## ✅ Status snapshot

- **Site:** LIVE. 6,777 products, 6,575 visible pages. Full SEO build
  (per-product pages, collections, brands, JSON-LD, sitemaps, robots).
- **Catalog:** 100% boutique Shopify stores (9 of them). All links verified
  resolving. No Amazon/Etsy/eBay products yet.
- **Email:** `hello@supamegacute.com` on Google Workspace. MX + SPF + DKIM
  live; DMARC may still be propagating — re-check `_dmarc.supamegacute.com`.
- **Monetisation:** Skimlinks LIVE site-wide (see below). Amazon tag armed.
- **Deploy method (temporary):** Vercel project's build command clones the
  GitHub repo and runs `node build/build.mjs`. **TODO:** connect the repo
  directly in Vercel (Settings → Git) so pushes auto-deploy and this shim
  can go away.

---

## 💰 Affiliate / monetisation

### Skimlinks — LIVE (primary earner)
- Account: **306502X1794748**
- Method: JS snippet in every page `<head>` (via `build/render.mjs`
  `HEAD_SCRIPTS`). Rewrites outbound store links to affiliate at click-time
  across ~48.5k merchants. Covers all 9 stores + future ones automatically.
- This is already earning on the live site.

### Amazon Associates — armed, not yet earning
- Tag **`supamegacute-20`** set in `data/merchants.json`.
- Added as a second store under the existing jimmy.web US Associates account
  (not a separate account). Only earns once Amazon *products* are ingested
  AND the account clears 3 qualifying sales (also unlocks their product API).

### Direct store programs — optional top-ups (better rates than Skimlinks)
Sign up, then paste the ID to set `<merchant>.affiliateId` in
`data/merchants.json` (and exclude that domain in the Skimlinks dashboard so
it isn't double-counted):

| Store | Sign up | Notes |
|-------|---------|-------|
| Bellzi | https://bellzi.com/pages/affiliate-program | 5% flat; needs public IG/FB/TikTok + monthly post tagging @Bellzi_Official #Bellzi |
| Blippo | https://www.blippo.com/pages/affiliate | rate on approval |
| uwu Market | https://uwumarket.goaffpro.com/create-account | GoAffPro |

### No direct program (Skimlinks covers them)
Squishable, Sanrio, JapanLA, Cute Things From Japan. Kawaii Pen Shop only does
product-gifting (not commission).

### How to flip any merchant on
`data/merchants.json` → set the merchant's `affiliateId` (or
`defaults.aggregator.publisherId` for the server-side wrap). The link builder
(`build/render.mjs` + `js/graph.js`, kept in sync) does the rest. Rebuild +
redeploy.

---

## 📱 Social media setup (in progress — continue here)

**Goal:** create Instagram + Facebook Page + TikTok for supamegacute (required
for the Bellzi program; good for the brand generally).

**Assets ready in repo** (`assets/brand/social/`):
- `profile-avatar.svg` — square profile picture (all 3 platforms)
- `post-1-welcome.svg` — starter post 1
- `post-2-finds.svg` — starter post 2
- `post-3-collections.svg` — starter post 3

(Render any SVG to PNG in a browser, or open directly to upload.)

**Handle:** aim for **@supamegacute** on all three. Fallback (use the SAME one
everywhere): `@supamegacute.official` or `@supamegacutedotcom`.

**Bios:**
- *Instagram:* `🎀 Discovering the cutest things on the internet / Gifts · collectibles · décor · desk joy / ✨ Shop the finds ↓ / supamegacute.com`
- *TikTok:* `the cutest things on the internet 🎀 new finds daily ✨ shop ↓`
- *Facebook (Page, category Shopping & Retail):* `SupaMegaCute is a discovery platform for adorable things — gifts, collectibles, home décor and desk joy, matched to your vibe. Discover. Smile. Shop. → supamegacute.com`

**Setup notes:**
- Facebook: make a **Page**, not a personal profile.
- Instagram: switch to **Business/Creator** account after signup.
- All: website link = `https://supamegacute.com`.

**First 3 posts:** use the 3 starter images above.

**Bellzi ongoing requirement:** once live, post monthly tagging
@Bellzi_Official with #Bellzi to stay eligible for their 5%.

---

## 🔧 Pipeline / catalog ops (reference)

- Crawl → normalise → classify (bot fleet) → apply-review → promote →
  validate → build. Scripts in `ingest/`.
- **Classification fleet:** ~110 of 226 batches done (~6,000 more products
  classified but NOT yet promoted — they hit the account's monthly spend limit
  mid-run). To finish: re-run the fleet when credits reset, then
  `node ingest/apply-review.mjs && node ingest/promote.mjs &&
  node ingest/validate.mjs && node build/build.mjs`.
- Weekly GitHub Action refreshes prices/availability.

## 🚀 Deploy (current shim)
Vercel project `supermegacute` build command:
```
git clone --depth 1 https://github.com/LINKCreative-AU/SupaMegaCute.git smc && cd smc && node build/build.mjs && mv dist ..
```
Output dir `dist`. **TODO:** replace with direct GitHub→Vercel Git connection.

---

## 📋 Open TODOs
1. **Custom domain cert** — confirm supamegacute.com serves with valid HTTPS
   (was settling; hit Refresh in Vercel domains if not).
2. **Connect GitHub → Vercel** for auto-deploy (drop the clone shim).
3. **Finish classification fleet** (~6k more products) when credits allow.
4. **Social accounts** — create IG/FB/TikTok using the kit above.
5. **Direct affiliate programs** — join Bellzi/Blippo/uwu; paste IDs to wire in.
6. **DMARC** — confirm `_dmarc.supamegacute.com` is live.
7. Optional: affiliate-disclosure page (good practice; Skimlinks/Amazon like it).

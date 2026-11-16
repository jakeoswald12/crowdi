# Crowdi

**Ads made by the crowd. Funded by the crowd.**

Anyone can make an ad. Anyone can fund one. Crowdi runs it on TikTok, and the creator earns from every dollar it raises. Organizations (nonprofits *and* businesses) can post **briefs** asking their audience to make ads for them, approve the ones they like, and keep funding whatever performs.

This repo is the reimagined front end. It reuses Cooper's backend work from `Cooper2Rich/adoption-project` (commit `b50f518`).

## Run it

```sh
npm install
npm run dev        # http://localhost:5173
```

Node 20.19+ (or 22.12+). `npm run build` type-checks and builds for production.

## What's here

| Route | What it is |
| --- | --- |
| `/` | Branded, always-dark marketing homepage. Its hero is a draggable WebGL wall of ads (inspired by phantom.land): drag to pan, hover to play the ad in the tile, click to open it. The page then covers why Crowdi exists, how it works, an interactive money-split calculator, the live leaderboard, the case for organizations, the first partner and a closing call to action. |
| `/explore` | Every ad, live and archived. Filter by status, grassroots vs. commissioned, cause or organization, and sort by trending, funded, views, clicks, CTR, creator earnings or newest. Switch between a grid (hover plays the video) and a "race" view, a leaderboard that keeps moving. |
| `/ads/:slug` | Ad page with the player, creator and organization, a **Fund this ad** flow (no account needed), eight metrics, performance charts (funding vs. spend, views, clicks/CTR over 7 days, 30 days or all time), where the money goes, platforms and a timeline. |
| `/create` | Create-an-ad wizard: **Upload → Who it's for → Link → Details → Review → Account → Payouts**. Account creation comes *last*. If this device already has an account, it asks you to sign in first. |
| `/briefs`, `/briefs/:slug` | Public requests for ads from organizations (an RFP for ads): brand feel, must-include items, things to avoid, the required link and budget. Each brief links to "Make an ad for this brief". |
| `/organizations` | Pitch and sign-up for nonprofits and brands, with email/domain verification. |
| `/org` | Organization portal: overview with charts and "back the winners" top-ups, a **review queue** (approve, request changes, decline), briefs and ads. |
| `/org/briefs/new` | Post a brief, with a live preview and the total budget commitment. |
| `/studio` | Creator studio: lifetime earnings, next monthly payout, Stripe payout status, earnings by month, and your ads with review notes. |
| `/signin` | Sign-in, with prototype shortcuts for a creator demo (Yakira) and an organization demo (Adoption Is An Option). |

Everything behind the homepage has **light and dark mode**. Use the toggle in the header; the choice is remembered.

## Product decisions baked in (change freely)

- **Money split:** 90% ad spend · 7.5% creator · 2.5% Crowdi. Set in `SPLIT` in `src/data/types.ts`. Card processing fees are not modeled yet.
- **Payouts:** monthly on the 1st once a creator has earned $25. Bank details go through **Stripe Connect** onboarding. Crowdi never collects bank numbers itself.
- **Who approves what:**
  - Grassroots ad with no organization and no link → automated safety check only, then it runs once funded.
  - Ad for an organization or brand → that organization approves it first. If they aren't on Crowdi yet, they get invited to review it.
  - Any ad with a link → the owner of that site approves it.
  - Ad for a brief → the organization behind the brief approves it.
  - On upload, a mock "AI scan" checks the format and looks for logos and brand mentions. That scan is the hook for real video analysis.
- **Briefs:** an organization sets how many ads it will fund, the ad budget for each, and a fee paid to each creator whose ad gets picked. Creators also earn 7.5% of everything their ad raises after that.
- **Returning users:** the request was IP-based detection. IPs are shared and change too often to be reliable, so the prototype remembers the account *on this device* instead. In production that would be Clerk's session or a "last signed in as" cookie.
- **Leaderboard:** there is no prize money. Rank is just a sort order ("trending" = funding in the last 7 days).
- **Platforms:** TikTok first. Instagram and Facebook appear as "coming soon".

## What's real and what's sample

- **Real:** *The Girl in the Middle* (Yakira, ACU TikTok ad competition for Adoption Is An Option) and Cooper's three Nocturne Coffee demo films.
- **Sample:** the other ads are 8-second vertical placeholders made from Lorem Picsum (Unsplash) photos with ffmpeg. All metrics, the other organizations and the creators are fictional. Pages that show numbers are labeled "Sample data · prototype".
- **Mocked:** auth, payments, payouts and approvals run client-side in `src/lib/store.tsx` and persist in `localStorage`. Clear site data to reset.

## Wiring the backend

`convex/` is Cooper's Convex backend, copied unchanged: Clerk auth, Stripe fundraising and commissions, Blob/Mux video, TikTok/Meta paid metrics, incidents, readiness and more. `docs/upstream/` holds his launch PRD, ADRs, glossary and ticket plan for context.

The front end talks only to `useStore()` (`src/lib/store.tsx`) and the types in `src/data/types.ts`. To go live, replace those functions with Convex queries and mutations. Some parts of the new model aren't in Cooper's schema yet and will need backend work:

1. Multiple organizations, including for-profit brands. His schema is built around a single nonprofit campaign.
2. Briefs: org-created requests, with seed budget and a selection fee per creator.
3. Grassroots ads with no organization, where approval is decided by the target or link.
4. The 90/7.5/2.5 split, replacing campaign-defined commission rates.
5. Dropping daily and weekly prizes in favor of a sort-only leaderboard.

## Stack

Vite + React 19 + TypeScript · Tailwind CSS v4 · Framer Motion · three.js (homepage wall) · Recharts · Lenis · Geist / Geist Mono / Instrument Serif.

```
src/
  pages/        Home, Explore, AdDetail, Create, Briefs, Organizations (+SignIn), OrgPortal (+NewBrief), Studio
  home/AdWall   WebGL draggable ad wall
  components/   AppShell, AdCard, Charts, ui primitives
  data/         types + sample catalog (deterministic performance generator)
  lib/          store (mock backend), theme, formatting
public/media/   ad videos, posters, thumbnails
convex/         Cooper's backend (not yet connected)
```

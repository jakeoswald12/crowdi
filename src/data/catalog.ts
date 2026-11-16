import type { Ad, AdStatus, Brief, Category, Creator, DailyPoint, Org, Origin } from "./types";
import { SPLIT } from "./types";

/** Fixed "today" so the sample data is stable. Real data replaces this with Convex queries. */
export const TODAY = "2026-11-16";

export const ORGS: Org[] = [
  { id: "o-aiao", slug: "adoption-is-an-option", name: "Adoption Is An Option", kind: "nonprofit", website: "adoptionisanoption.org", city: "Austin, TX", color: "#FF5A1F", blurb: "Telling the truth about adoption — one story, one family at a time.", verified: true, sample: false },
  { id: "o-nocturne", slug: "nocturne-coffee", name: "Nocturne Coffee", kind: "business", website: "nocturne.coffee", city: "Minneapolis, MN", color: "#8B5A3C", blurb: "Small-batch coffee for the late shift.", verified: true, sample: true },
  { id: "o-openshelf", slug: "open-shelf", name: "Open Shelf Literacy", kind: "nonprofit", website: "openshelf.org", city: "St. Paul, MN", color: "#6E5BFF", blurb: "Books in every kid's hands by age five.", verified: true, sample: true },
  { id: "o-secondchance", slug: "second-chance-rescue", name: "Second Chance Rescue", kind: "nonprofit", website: "secondchancerescue.org", city: "Round Rock, TX", color: "#0FB48C", blurb: "Every dog deserves a couch.", verified: true, sample: true },
  { id: "o-prairie", slug: "prairie-wind", name: "Prairie Wind Co-op", kind: "business", website: "prairiewind.coop", city: "Mankato, MN", color: "#3AA0FF", blurb: "Community-owned wind power.", verified: true, sample: true },
  { id: "o-wander", slug: "wanderwagon", name: "Wanderwagon", kind: "business", website: "wanderwagon.com", city: "Denver, CO", color: "#E8A200", blurb: "Camper vans for long weekends.", verified: true, sample: true },
  { id: "o-northside", slug: "northside-food-shelf", name: "Northside Food Shelf", kind: "nonprofit", website: "northsidefood.org", city: "Minneapolis, MN", color: "#D9467A", blurb: "Groceries with dignity, no questions asked.", verified: true, sample: true },
  { id: "o-lakeside", slug: "lakeside-community-center", name: "Lakeside Community Center", kind: "nonprofit", website: "lakesidecc.org", city: "Georgetown, TX", color: "#18A0B4", blurb: "Pools, courts and a place to belong.", verified: true, sample: true },
  { id: "o-steep", slug: "steep-and-co", name: "Steep & Co.", kind: "business", website: "steepandco.com", city: "Portland, OR", color: "#7A9A3A", blurb: "Loose-leaf tea, slowly.", verified: true, sample: true },
  { id: "o-baymade", slug: "bay-made-market", name: "Bay Made Market", kind: "business", website: "baymade.market", city: "San Francisco, CA", color: "#F2603C", blurb: "A marketplace for makers on your block.", verified: true, sample: true },
  { id: "o-saltwater", slug: "saltwater-collective", name: "Saltwater Collective", kind: "nonprofit", website: "saltwatercollective.org", city: "Corpus Christi, TX", color: "#1C8FD6", blurb: "Monthly beach and bay cleanups.", verified: true, sample: true },
  { id: "o-northlines", slug: "northlines-climate", name: "Northlines Climate", kind: "nonprofit", website: "northlines.org", city: "Duluth, MN", color: "#4F7CFF", blurb: "Keeping northern winters cold.", verified: true, sample: true },
  { id: "o-harmony", slug: "harmony-music-project", name: "Harmony Music Project", kind: "nonprofit", website: "harmonymusic.org", city: "Nashville, TN", color: "#B44FE0", blurb: "Instruments and teachers for public schools.", verified: true, sample: true },
  { id: "o-northbound", slug: "northbound-trails", name: "Northbound Trails Fund", kind: "nonprofit", website: "northboundtrails.org", city: "Boulder, CO", color: "#2E9E5B", blurb: "Building and maintaining free public trails.", verified: true, sample: true },
];

export const CREATORS: Creator[] = [
  { id: "c-yakira", handle: "yakira", name: "Yakira", city: "Austin, TX", color: "#FF5A1F", bio: "Filmmaker. ACU ad competition finalist." },
  { id: "c-studio", handle: "nocturne.studio", name: "Nocturne Studio", city: "Minneapolis, MN", color: "#8B5A3C", bio: "Coffee, film and very little sleep." },
  { id: "c-marcus", handle: "marcus.rides", name: "Marcus Hale", city: "Waco, TX", color: "#3AA0FF", bio: "Rider. Wants you to look twice." },
  { id: "c-salt", handle: "saltandsand", name: "Mari Okafor", city: "Corpus Christi, TX", color: "#1C8FD6", bio: "Underwater camera, above-water opinions." },
  { id: "c-juniper", handle: "juniper.walks", name: "Juniper Cole", city: "Boulder, CO", color: "#2E9E5B", bio: "Trail runner and part-time narrator." },
  { id: "c-priya", handle: "pagesbypriya", name: "Priya Raman", city: "St. Paul, MN", color: "#6E5BFF", bio: "Children's librarian who edits on her phone." },
  { id: "c-dana", handle: "dana.films", name: "Dana Whitfield", city: "Round Rock, TX", color: "#0FB48C", bio: "Shelter volunteer. Shoots dogs (with a camera)." },
  { id: "c-theo", handle: "theo.makes", name: "Theo Brandt", city: "Mankato, MN", color: "#5A8BFF", bio: "Motion designer, wind nerd." },
  { id: "c-ellie", handle: "ellie.outthere", name: "Ellie Park", city: "Denver, CO", color: "#E8A200", bio: "Van life on weekends only." },
  { id: "c-ramon", handle: "chef.ramon", name: "Ramón Ibarra", city: "Minneapolis, MN", color: "#D9467A", bio: "Line cook, storyteller." },
  { id: "c-quiet", handle: "quietkid", name: "Jordan Lee", city: "Georgetown, TX", color: "#9A8F80", bio: "Student. Saying the quiet part out loud." },
  { id: "c-jay", handle: "bandkid.jay", name: "Jay Morrison", city: "Nashville, TN", color: "#B44FE0", bio: "Drummer, teacher, recovering band kid." },
  { id: "c-lena", handle: "lakeside.lena", name: "Lena Ortiz", city: "Georgetown, TX", color: "#18A0B4", bio: "Lifeguard who learned Premiere." },
  { id: "c-ritual", handle: "morning.ritual", name: "Sam Achterberg", city: "Portland, OR", color: "#7A9A3A", bio: "Product photographer." },
  { id: "c-garden", handle: "gardengrl", name: "Ava Lindqvist", city: "Duluth, MN", color: "#C2549A", bio: "Pollinator garden evangelist." },
  { id: "c-north", handle: "north.lines", name: "Nils Erikson", city: "Duluth, MN", color: "#4F7CFF", bio: "Ski bum documenting shorter winters." },
  { id: "c-sam", handle: "sam.v", name: "Sam Vasquez", city: "El Paso, TX", color: "#F2603C", bio: "Lost a friend to a drunk driver. Makes PSAs." },
  { id: "c-grace", handle: "grace.notes", name: "Grace Mbeki", city: "Austin, TX", color: "#E07A5F", bio: "Adoptee. Writer. ACU student." },
  { id: "c-bay", handle: "baymade", name: "Kai Nakamura", city: "San Francisco, CA", color: "#F2603C", bio: "Shoots small businesses at golden hour." },
  { id: "c-ana", handle: "coach.ana", name: "Ana Ruiz", city: "Georgetown, TX", color: "#18A0B4", bio: "Swim coach with a tripod." },
  { id: "c-benjamin", handle: "benjamin.k", name: "Benjamin Kurt", city: "Abilene, TX", color: "#7C6A55", bio: "ACU film student." },
];

interface Seed {
  slug: string;
  title: string;
  description: string;
  creator: string;
  org?: string;
  brief?: string;
  category: Category;
  status: AdStatus;
  cta?: { label: string; url: string };
  aspect?: "9:16" | "16:9";
  duration?: number;
  days: number; // days running
  endedDaysAgo?: number;
  heat: number; // 0..1 how well it performs
  seed?: number; // org seed funding
  real?: boolean;
  submittedDaysAgo?: number;
  reviewNote?: string;
}

const SEEDS: Seed[] = [
  { slug: "the-girl-in-the-middle", title: "The Girl in the Middle", description: "A young woman stands between two loud crowds and makes the quietest, bravest choice in the room.", creator: "c-yakira", org: "o-aiao", brief: "b-aiao", category: "Adoption & foster", status: "live", cta: { label: "Learn more", url: "https://adoptionisanoption.org" }, aspect: "16:9", duration: 60, days: 34, heat: 0.78, seed: 500, real: true },
  { slug: "nocturne-espresso", title: "Espresso, After Dark", description: "Steam, low light and the first shot of the night shift.", creator: "c-studio", org: "o-nocturne", brief: "b-nocturne", category: "Food & drink", status: "live", cta: { label: "Shop coffee", url: "https://nocturne.coffee" }, aspect: "16:9", duration: 16, days: 21, heat: 0.7, seed: 1000 },
  { slug: "nocturne-afterhours", title: "After Hours", description: "The café after close — the best seat in the house.", creator: "c-studio", org: "o-nocturne", brief: "b-nocturne", category: "Food & drink", status: "live", cta: { label: "Shop coffee", url: "https://nocturne.coffee" }, aspect: "16:9", duration: 16, days: 18, heat: 0.55, seed: 1000 },
  { slug: "nocturne-midnight", title: "Midnight Pour", description: "A slow pour for people who do their best work late.", creator: "c-studio", org: "o-nocturne", brief: "b-nocturne", category: "Food & drink", status: "archived", cta: { label: "Shop coffee", url: "https://nocturne.coffee" }, aspect: "16:9", duration: 16, days: 24, endedDaysAgo: 12, heat: 0.35, seed: 1000 },
  { slug: "look-twice", title: "Look Twice", description: "A no-link, crowd-funded reminder that riders are everywhere. Funded entirely by people who ride.", creator: "c-marcus", category: "Road safety", status: "live", days: 46, heat: 0.88 },
  { slug: "leave-it-bluer", title: "Leave It Bluer", description: "Join a Saturday cleanup and leave the bay better than you found it.", creator: "c-salt", org: "o-saltwater", category: "Environment", status: "live", cta: { label: "Join a cleanup", url: "https://saltwatercollective.org" }, days: 29, heat: 0.62 },
  { slug: "get-outside", title: "The Trail Is Free", description: "No membership, no fees. Just a path and an afternoon.", creator: "c-juniper", org: "o-northbound", category: "Travel & outdoors", status: "live", cta: { label: "Find a trail", url: "https://northboundtrails.org" }, days: 38, heat: 0.58 },
  { slug: "one-more-chapter", title: "One More Chapter", description: "Bedtime stories start with a book on the shelf. Donate one.", creator: "c-priya", org: "o-openshelf", category: "Education", status: "live", cta: { label: "Donate a book", url: "https://openshelf.org" }, days: 25, heat: 0.66 },
  { slug: "adopt-dont-shop", title: "Otis Has Waited 143 Days", description: "Meet Otis. He likes naps, peanut butter and you, probably.", creator: "c-dana", org: "o-secondchance", category: "Animals", status: "live", cta: { label: "Meet Otis", url: "https://secondchancerescue.org" }, days: 15, heat: 0.92 },
  { slug: "clean-power-local-jobs", title: "Clean Power. Local Jobs.", description: "The co-op that keeps the lights on and the paychecks local.", creator: "c-theo", org: "o-prairie", brief: "b-prairie", category: "Environment", status: "live", cta: { label: "Join the co-op", url: "https://prairiewind.coop" }, days: 19, heat: 0.4, seed: 1000 },
  { slug: "wanderwagon", title: "Your Weekend Has Wheels", description: "Friday at five, somewhere better by seven.", creator: "c-ellie", org: "o-wander", category: "Travel & outdoors", status: "archived", cta: { label: "Book a van", url: "https://wanderwagon.com" }, days: 30, endedDaysAgo: 20, heat: 0.5, seed: 1000 },
  { slug: "nobody-eats-alone", title: "Nobody Eats Alone", description: "One meal, one neighbor, one table. Give a meal this week.", creator: "c-ramon", org: "o-northside", category: "Food & drink", status: "live", cta: { label: "Give a meal", url: "https://northsidefood.org" }, days: 22, heat: 0.74 },
  { slug: "say-it-out-loud", title: "Say It Out Loud", description: "A grassroots ad for anyone holding something in. No link — just permission to talk.", creator: "c-quiet", category: "Health & wellbeing", status: "live", days: 33, heat: 0.7 },
  { slug: "keep-music-loud", title: "Keep Music in Schools", description: "Every drum kit in a school started with somebody funding it.", creator: "c-jay", org: "o-harmony", category: "Arts & music", status: "live", cta: { label: "Fund a classroom", url: "https://harmonymusic.org" }, days: 12, heat: 0.6 },
  { slug: "jump-in", title: "Jump In", description: "Summer passes for every kid in Georgetown.", creator: "c-lena", org: "o-lakeside", brief: "b-lakeside", category: "Community", status: "archived", cta: { label: "Get a pass", url: "https://lakesidecc.org" }, days: 40, endedDaysAgo: 60, heat: 0.64, seed: 1000 },
  { slug: "slow-down-steep", title: "Slow Down. Steep.", description: "Five minutes, one cup, zero notifications.", creator: "c-ritual", org: "o-steep", category: "Food & drink", status: "live", cta: { label: "Shop tea", url: "https://steepandco.com" }, days: 9, heat: 0.45, seed: 1000 },
  { slug: "plant-for-pollinators", title: "Plant One for the Bees", description: "Grassroots and no link. Just a nudge to plant something native this spring.", creator: "c-garden", category: "Environment", status: "live", days: 27, heat: 0.52 },
  { slug: "protect-winter", title: "Protect Our Winters", description: "Shorter seasons, thinner ice. Here's what you can do.", creator: "c-north", org: "o-northlines", category: "Environment", status: "archived", cta: { label: "Take action", url: "https://northlines.org" }, days: 35, endedDaysAgo: 30, heat: 0.48 },
  { slug: "drive-home-sober", title: "The Road Will Wait", description: "A crowd-funded PSA from someone who lost a friend. No link, no logo.", creator: "c-sam", category: "Road safety", status: "live", days: 51, heat: 0.8 },
  { slug: "golden-hour-city", title: "Shop Your Block", description: "The best things in the city are made three doors down.", creator: "c-bay", org: "o-baymade", category: "Local business", status: "live", cta: { label: "Find local", url: "https://baymade.market" }, days: 14, heat: 0.38 },
  { slug: "first-light", title: "Every Morning Counts", description: "6 a.m. lap swim, open to everyone.", creator: "c-ana", org: "o-lakeside", brief: "b-lakeside", category: "Health & wellbeing", status: "live", cta: { label: "Start today", url: "https://lakesidecc.org" }, days: 8, heat: 0.5, seed: 1000 },
  // Waiting for organization review (shown in the organization portal)
  { slug: "be-the-lighthouse", title: "Be Someone's Lighthouse", description: "For the kids waiting in the dark for someone to show up.", creator: "c-grace", org: "o-aiao", brief: "b-aiao", category: "Adoption & foster", status: "in_review", cta: { label: "Learn more", url: "https://adoptionisanoption.org" }, days: 0, heat: 0, submittedDaysAgo: 1 },
  { slug: "family-is-a-choice", title: "Family Is a Choice", description: "A street, a crowd, and one decision that changes everything.", creator: "c-yakira", org: "o-aiao", brief: "b-aiao", category: "Adoption & foster", status: "in_review", cta: { label: "Learn more", url: "https://adoptionisanoption.org" }, days: 0, heat: 0, submittedDaysAgo: 2 },
  { slug: "save-a-seat", title: "Save a Seat", description: "There's a seat at someone's table with your name on it.", creator: "c-benjamin", org: "o-aiao", brief: "b-aiao", category: "Adoption & foster", status: "changes_requested", cta: { label: "Learn more", url: "https://adoptionisanoption.org" }, days: 0, heat: 0, submittedDaysAgo: 5, reviewNote: "Love the concept. Can you add our end card with the website for the last 2 seconds?" },
];

export const BRIEFS: Brief[] = [
  {
    id: "b-aiao", slug: "every-kid-deserves-a-family", orgId: "o-aiao",
    title: "Every kid deserves a family",
    summary: "We're looking for honest, emotional short films that show adoption as a brave, loving option. No stock-footage clichés — real stories, real faces, real stakes.",
    brandFeel: ["Honest", "Cinematic", "Hopeful", "Quiet over loud"],
    mustInclude: ["End card with adoptionisanoption.org", "Under 60 seconds", "Captions on screen"],
    avoid: ["Shaming anyone's choices", "Political slogans"],
    cta: { label: "Learn more", url: "https://adoptionisanoption.org", required: true },
    fundedSlots: 25, seedPerAd: 500, creatorFee: 100, deadline: "2026-12-15", status: "open", cover: "/media/ads/the-girl-in-the-middle.jpg", createdAt: "2026-10-01",
  },
  {
    id: "b-nocturne", slug: "the-late-shift", orgId: "o-nocturne",
    title: "The late shift",
    summary: "Show us what coffee means to people who work while everyone else sleeps — nurses, bakers, coders, night-shift parents.",
    brandFeel: ["Moody", "Warm low light", "Slow", "No voiceover"],
    mustInclude: ["A Nocturne cup or bag on screen", "Under 30 seconds"],
    avoid: ["Daytime scenes", "Other coffee brands"],
    cta: { label: "Shop coffee", url: "https://nocturne.coffee", required: true },
    fundedSlots: 100, seedPerAd: 1000, creatorFee: 100, deadline: "2026-12-01", status: "open", cover: "/media/ads/nocturne-espresso.jpg", createdAt: "2026-10-20",
  },
  {
    id: "b-lakeside", slug: "a-place-to-belong", orgId: "o-lakeside",
    title: "A place to belong",
    summary: "Help more families discover the pool, courts and classes at Lakeside — especially families who think it isn't for them.",
    brandFeel: ["Bright", "Joyful", "Community", "Real members, not models"],
    mustInclude: ["Lakeside logo or building", "Spanish or English captions"],
    avoid: ["Competitive gym vibes"],
    cta: { label: "Get a pass", url: "https://lakesidecc.org", required: true },
    fundedSlots: 20, seedPerAd: 750, creatorFee: 100, deadline: "2027-01-10", status: "open", cover: "/media/ads/first-light.jpg", createdAt: "2026-11-02",
  },
  {
    id: "b-prairie", slug: "power-that-stays-home", orgId: "o-prairie",
    title: "Power that stays home",
    summary: "Explain community-owned wind in 20 seconds to people who've never thought about where their power comes from.",
    brandFeel: ["Plainspoken", "Midwest", "Optimistic", "Data-friendly"],
    mustInclude: ["The word 'co-op'", "Under 20 seconds"],
    avoid: ["Politics", "Doom"],
    cta: { label: "Join the co-op", url: "https://prairiewind.coop", required: false },
    fundedSlots: 40, seedPerAd: 1000, creatorFee: 100, deadline: "2026-11-30", status: "open", cover: "/media/ads/clean-power-local-jobs.jpg", createdAt: "2026-10-12",
  },
  {
    id: "b-steep", slug: "five-quiet-minutes", orgId: "o-steep",
    title: "Five quiet minutes",
    summary: "A sensory, ASMR-ish moment with loose-leaf tea. We'll fund the 30 favorites and keep backing the winners.",
    brandFeel: ["Calm", "Tactile", "Natural light"],
    mustInclude: ["Steeping on screen"],
    avoid: ["Fast cuts", "Music with lyrics"],
    cta: { label: "Shop tea", url: "https://steepandco.com", required: true },
    fundedSlots: 30, seedPerAd: 600, creatorFee: 75, deadline: "2026-10-30", status: "closed", cover: "/media/ads/slow-down-steep.jpg", createdAt: "2026-09-15",
  },
];

/* ------------------------------------------------------------------ */
/* Deterministic performance generator                                 */
/* ------------------------------------------------------------------ */

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}
export function addDays(iso: string, n: number) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const round2 = (n: number) => Math.round(n * 100) / 100;

function simulate(s: Seed): DailyPoint[] {
  if (s.days <= 0) return [];
  const r = rng(hash(s.slug));
  const heat = Math.min(s.heat, 0.84);
  const end = addDays(TODAY, -(s.endedDaysAgo ?? 0));
  const start = addDays(end, -(s.days - 1));
  const cpm = 6.5 + r() * 4; // TikTok-ish CPM in USD
  const ctr = 0.008 + heat * 0.014 + r() * 0.004;
  const conv = 0.004 + heat * 0.008; // share of link clicks that come back and fund the ad
  const gift = 18 + r() * 17;
  const organic = 4 + heat * 34; // daily giving from people browsing Crowdi itself
  let pool = 0;
  const out: DailyPoint[] = [];
  for (let i = 0; i < s.days; i++) {
    const date = addDays(start, i);
    let org = 0;
    if (i === 0 && s.seed) org = s.seed;
    if (s.seed && heat > 0.6 && i > 0 && i % 10 === 0) org = Math.round(s.seed * 0.5); // org keeps backing winners
    const prev = out[i - 1];
    const fatigue = Math.max(0.4, 1 - i / (s.days * 2.5));
    let crowd = (i === 0 ? 60 + r() * 140 : 0) + organic * (0.4 + r() * 1.2) * fatigue;
    if (prev) crowd += prev.clicks * conv * gift * (0.7 + r() * 0.6);
    if (r() < 0.08) crowd += 40 + r() * 160 * heat; // a big backer
    crowd = round2(crowd);
    pool += (crowd + org) * SPLIT.adSpend;
    // budgets are paced: spend a share of what's available each day
    const spent = round2(pool * (i === s.days - 1 && s.endedDaysAgo ? 1 : 0.35 + r() * 0.2));
    pool -= spent;
    const impressions = Math.round((spent / cpm) * 1000);
    const clicks = Math.round(impressions * ctr * (0.8 + r() * 0.4));
    out.push({ date, impressions, clicks, crowd, org, spent });
  }
  return out;
}

export function totalsOf(series: DailyPoint[]) {
  const t = series.reduce(
    (a, p) => ({
      impressions: a.impressions + p.impressions,
      clicks: a.clicks + p.clicks,
      crowd: a.crowd + p.crowd,
      org: a.org + p.org,
      spent: a.spent + p.spent,
    }),
    { impressions: 0, clicks: 0, crowd: 0, org: 0, spent: 0 },
  );
  const funded = t.crowd + t.org;
  return {
    ...t,
    crowd: round2(t.crowd),
    spent: round2(Math.min(t.spent, funded * SPLIT.adSpend)),
    funded: round2(funded),
    ctr: t.impressions ? t.clicks / t.impressions : 0,
    creatorEarned: round2(funded * SPLIT.creator),
    backers: Math.max(series.length ? 3 : 0, Math.round(t.crowd / 27)),
  };
}

function build(s: Seed): Ad {
  const series = simulate(s);
  const origin: Origin = s.org ? "commissioned" : "grassroots";
  return {
    id: "a-" + s.slug,
    slug: s.slug,
    title: s.title,
    description: s.description,
    creatorId: s.creator,
    orgId: s.org,
    briefId: s.brief,
    category: s.category,
    origin,
    status: s.status,
    cta: s.cta,
    video: `/media/ads/${s.slug}.mp4`,
    poster: s.aspect === "16:9" ? `/media/ads/${s.slug}.jpg` : `/media/ads/${s.slug}-clean.jpg`,
    wall: `/media/ads/${s.slug}.jpg`,
    thumb: `/media/ads/${s.slug}-sm.webp`,
    aspect: s.aspect ?? "9:16",
    duration: s.duration ?? 8,
    platforms: ["tiktok"],
    launchedAt: series[0]?.date ?? "",
    endedAt: s.status === "archived" ? series[series.length - 1]?.date : undefined,
    submittedAt: s.submittedDaysAgo !== undefined ? addDays(TODAY, -s.submittedDaysAgo) : undefined,
    reviewNote: s.reviewNote,
    real: s.real,
    series,
    totals: totalsOf(series),
  };
}

export const ADS: Ad[] = SEEDS.map(build);

export const orgById = (id?: string): Org | undefined => {
  if (id === "o-mine") {
    // an organization created in this browser (prototype)
    try {
      const u = JSON.parse(localStorage.getItem("crowdi.v1") ?? "{}").user;
      return { id: "o-mine", slug: "my-organization", name: u?.orgName ?? "Your organization", kind: u?.orgKind ?? "nonprofit", website: u?.orgSite ?? "", city: "", color: "#6E5BFF", blurb: "", verified: false, sample: true };
    } catch {
      return undefined;
    }
  }
  return ORGS.find((o) => o.id === id);
};
export const creatorById = (id?: string): Creator | undefined => {
  if (id === "me") {
    // the signed-in visitor's own profile (prototype: read from local storage)
    try {
      const u = JSON.parse(localStorage.getItem("crowdi.v1") ?? "{}").user;
      const name: string = u?.name ?? "You";
      return { id: "me", handle: u?.handle ?? name.toLowerCase().replace(/[^a-z0-9]+/g, ""), name, city: "", color: "#FF5A1F", bio: "" };
    } catch {
      return { id: "me", handle: "you", name: "You", city: "", color: "#FF5A1F", bio: "" };
    }
  }
  return CREATORS.find((c) => c.id === id);
};
export const briefById = (id?: string) => BRIEFS.find((b) => b.id === id);

/** The creator behind an ad — uses the profile captured at submission when there is one. */
export const creatorOf = (ad: Pick<Ad, "creatorId" | "creatorSnapshot">) => ad.creatorSnapshot ?? creatorById(ad.creatorId);

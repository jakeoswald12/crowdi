export type Category =
  | "Adoption & foster"
  | "Animals"
  | "Environment"
  | "Education"
  | "Health & wellbeing"
  | "Community"
  | "Road safety"
  | "Arts & music"
  | "Food & drink"
  | "Travel & outdoors"
  | "Local business";

export const CATEGORIES: Category[] = [
  "Adoption & foster",
  "Animals",
  "Environment",
  "Education",
  "Health & wellbeing",
  "Community",
  "Road safety",
  "Arts & music",
  "Food & drink",
  "Travel & outdoors",
  "Local business",
];

/** grassroots = no organization behind it; commissioned = made for an organization or brief */
export type Origin = "grassroots" | "commissioned";

export type AdStatus = "live" | "archived" | "in_review" | "changes_requested" | "declined";

export type Platform = "tiktok" | "meta";

export interface Org {
  id: string;
  slug: string;
  name: string;
  kind: "nonprofit" | "business";
  website: string;
  city: string;
  color: string;
  blurb: string;
  verified: boolean;
  sample: boolean;
}

export interface Creator {
  id: string;
  handle: string;
  name: string;
  city: string;
  color: string;
  bio: string;
}

export interface DailyPoint {
  date: string; // YYYY-MM-DD
  impressions: number;
  clicks: number;
  crowd: number; // public donations to this ad (USD)
  org: number; // organization funding to this ad (USD)
  spent: number; // ad spend delivered on platforms (USD)
}

export interface AdTotals {
  impressions: number;
  clicks: number;
  ctr: number;
  crowd: number;
  org: number;
  funded: number;
  spent: number;
  creatorEarned: number;
  backers: number;
}

export interface Ad {
  id: string;
  slug: string;
  title: string;
  description: string;
  creatorId: string;
  /** profile captured at submission for accounts created in this browser */
  creatorSnapshot?: Creator;
  orgId?: string;
  briefId?: string;
  category: Category;
  origin: Origin;
  status: AdStatus;
  cta?: { label: string; url: string };
  video: string;
  poster: string;
  /** frame with the ad's headline, used on the homepage wall */
  wall: string;
  thumb: string;
  aspect: "9:16" | "16:9";
  duration: number;
  platforms: Platform[];
  launchedAt: string;
  endedAt?: string;
  submittedAt?: string;
  reviewNote?: string;
  /** Real creative supplied by a partner (vs. sample placeholder) */
  real?: boolean;
  series: DailyPoint[];
  totals: AdTotals;
}

export interface Brief {
  id: string;
  slug: string;
  orgId: string;
  title: string;
  summary: string;
  brandFeel: string[];
  mustInclude: string[];
  avoid: string[];
  cta: { label: string; url: string; required: boolean };
  fundedSlots: number;
  seedPerAd: number;
  creatorFee: number;
  deadline: string;
  status: "open" | "closed";
  cover: string;
  createdAt: string;
}

export const SPLIT = { adSpend: 0.9, creator: 0.075, platform: 0.025 } as const;

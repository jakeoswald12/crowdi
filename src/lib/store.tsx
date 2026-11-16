import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ADS, BRIEFS, creatorById, TODAY, totalsOf } from "../data/catalog";
import type { Ad, AdStatus, Brief, Category } from "../data/types";

/**
 * Client-side stand-in for the Convex backend. Everything a visitor creates
 * (accounts, ads, briefs, review decisions) is kept in this browser so the
 * prototype is fully clickable. Swap these functions for Convex queries/mutations.
 */

export type Role = "creator" | "org";
export interface User {
  id: string;
  role: Role;
  name: string;
  email: string;
  handle?: string;
  /** creator profile id this account owns ("me" for accounts made in this browser) */
  creatorId?: string;
  orgId?: string;
  /** for organizations created in this browser */
  orgName?: string;
  orgSite?: string;
  orgKind?: "nonprofit" | "business";
  payouts: "connected" | "pending" | "none";
  createdAt: string;
}

interface Persisted {
  user: User | null;
  /** remembered on this device after the first sign-up — drives "welcome back, sign in first" */
  knownAccount: { name: string; email: string; role: Role } | null;
  myAds: Ad[];
  decisions: Record<string, { status: AdStatus; note?: string; at: string }>;
  myBriefs: Brief[];
  donations: Record<string, number>;
}

const KEY = "crowdi.v1";
const empty: Persisted = { user: null, knownAccount: null, myAds: [], decisions: {}, myBriefs: [], donations: {} };

function load(): Persisted {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...empty, ...JSON.parse(raw) } : empty;
  } catch {
    return empty;
  }
}

export interface AdDraft {
  title: string;
  description: string;
  category: Category;
  target: "cause" | "org" | "brief";
  orgId?: string;
  orgName?: string;
  briefId?: string;
  cta?: { label: string; url: string };
  videoUrl?: string;
  posterUrl?: string;
  aspect: "9:16" | "16:9";
  duration: number;
}

interface Store {
  user: User | null;
  knownAccount: Persisted["knownAccount"];
  ads: Ad[];
  briefs: Brief[];
  signUp: (u: Omit<User, "id" | "createdAt">) => User;
  signIn: (email: string) => User;
  signOut: () => void;
  forgetDevice: () => void;
  setPayouts: (s: User["payouts"]) => void;
  submitAd: (draft: AdDraft, creatorId: string) => Ad;
  decide: (adId: string, status: AdStatus, note?: string) => void;
  createBrief: (b: Omit<Brief, "id" | "slug" | "createdAt" | "status">) => Brief;
  donate: (adId: string, amount: number) => void;
}

const Ctx = createContext<Store | null>(null);

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 48) || "untitled";

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Persisted>(load);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* storage full or disabled — prototype keeps working in memory */
    }
  }, [state]);

  const ads = useMemo(() => {
    const all = [...state.myAds, ...ADS].map((a) => {
      const d = state.decisions[a.id];
      let ad = d ? { ...a, status: d.status, reviewNote: d.note ?? a.reviewNote } : a;
      const extra = state.donations[a.id];
      if (extra && ad.series.length) {
        const series = ad.series.map((p, i) => (i === ad.series.length - 1 ? { ...p, crowd: p.crowd + extra } : p));
        ad = { ...ad, series, totals: totalsOf(series) };
      }
      if (d?.status === "live" && !ad.launchedAt) ad = { ...ad, launchedAt: TODAY };
      return ad;
    });
    return all;
  }, [state.myAds, state.decisions, state.donations]);

  const briefs = useMemo(() => [...state.myBriefs, ...BRIEFS], [state.myBriefs]);

  const signUp: Store["signUp"] = useCallback((u) => {
    const user: User = {
      ...u,
      id: "u-" + Math.random().toString(36).slice(2, 9),
      creatorId: u.role === "creator" ? "me" : undefined,
      orgId: u.role === "org" ? "o-mine" : undefined,
      createdAt: TODAY,
    };
    setState((s) => ({ ...s, user, knownAccount: { name: user.name, email: user.email, role: user.role } }));
    return user;
  }, []);

  const signIn: Store["signIn"] = useCallback(
    (email) => {
      const known = state.knownAccount;
      const e = email.trim().toLowerCase();
      let user: User;
      if (e.endsWith("@adoptionisanoption.org")) {
        user = { id: "u-aiao", role: "org", name: "Adoption Is An Option", email: e, orgId: "o-aiao", payouts: "none", createdAt: TODAY };
      } else if (e.startsWith("yakira@")) {
        user = { id: "u-yakira", role: "creator", name: "Yakira", email: e, handle: "yakira", creatorId: "c-yakira", payouts: "connected", createdAt: TODAY };
      } else if (state.user && state.user.email === e) {
        user = state.user;
      } else if (known && known.email === e && known.role === "org") {
        user = { id: "u-org", role: "org", name: known.name, email: e, orgId: "o-mine", orgName: known.name, payouts: "none", createdAt: TODAY };
      } else {
        const name = known?.email === e ? known.name : e.split("@")[0];
        user = { id: "u-me", role: "creator", name, email: e, handle: e.split("@")[0], creatorId: "me", payouts: "connected", createdAt: TODAY };
      }
      setState((s) => ({ ...s, user, knownAccount: { name: user.name, email: e, role: user.role } }));
      return user;
    },
    [state.knownAccount, state.user],
  );

  const value: Store = {
    user: state.user,
    knownAccount: state.knownAccount,
    ads,
    briefs,
    signUp,
    signIn,
    signOut: () => setState((s) => ({ ...s, user: null })),
    forgetDevice: () => setState((s) => ({ ...s, user: null, knownAccount: null })),
    setPayouts: (p) => setState((s) => (s.user ? { ...s, user: { ...s.user, payouts: p } } : s)),
    submitAd: (draft, creatorId) => {
      const slug = slugify(draft.title) + "-" + Math.random().toString(36).slice(2, 6);
      const needsApproval = draft.target !== "cause" || !!draft.cta?.url;
      const ad: Ad = {
        id: "a-" + slug,
        slug,
        title: draft.title,
        description: draft.description,
        creatorId,
        creatorSnapshot: creatorId === "me" && state.user
          ? { id: "me", handle: state.user.handle ?? state.user.name.toLowerCase().replace(/[^a-z0-9]+/g, ""), name: state.user.name, city: "", color: "#FF5A1F", bio: "New on Crowdi" }
          : creatorById(creatorId),
        orgId: draft.orgId,
        briefId: draft.briefId,
        category: draft.category,
        origin: draft.target === "cause" ? "grassroots" : "commissioned",
        status: needsApproval ? "in_review" : "live",
        cta: draft.cta,
        video: draft.videoUrl ?? "/media/ads/family-is-a-choice.mp4",
        poster: draft.posterUrl ?? "/media/ads/family-is-a-choice-clean.jpg",
        wall: draft.posterUrl ?? "/media/ads/family-is-a-choice.jpg",
        thumb: draft.posterUrl ?? "/media/ads/family-is-a-choice-sm.webp",
        aspect: draft.aspect,
        duration: draft.duration,
        platforms: ["tiktok"],
        launchedAt: needsApproval ? "" : TODAY,
        submittedAt: TODAY,
        series: [],
        totals: totalsOf([]),
      };
      // blob: URLs die with the tab; keep the record but fall back to sample media after reload
      const persistable = draft.videoUrl?.startsWith("blob:")
        ? { ...ad, video: "/media/ads/family-is-a-choice.mp4", poster: "/media/ads/family-is-a-choice-clean.jpg", wall: "/media/ads/family-is-a-choice.jpg", thumb: "/media/ads/family-is-a-choice-sm.webp" }
        : ad;
      setState((s) => ({ ...s, myAds: [persistable, ...s.myAds] }));
      return ad;
    },
    decide: (adId, status, note) =>
      setState((s) => ({ ...s, decisions: { ...s.decisions, [adId]: { status, note, at: TODAY } } })),
    createBrief: (b) => {
      const brief: Brief = { ...b, id: "b-" + Math.random().toString(36).slice(2, 8), slug: slugify(b.title), status: "open", createdAt: TODAY };
      setState((s) => ({ ...s, myBriefs: [brief, ...s.myBriefs] }));
      return brief;
    },
    donate: (adId, amount) =>
      setState((s) => ({ ...s, donations: { ...s.donations, [adId]: (s.donations[adId] ?? 0) + amount } })),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside StoreProvider");
  return s;
}

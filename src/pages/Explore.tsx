import clsx from "clsx";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { ArrowDownWideNarrow, LayoutGrid, ListOrdered, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AdCard } from "../components/AdCard";
import { Avatar, CountUp, OrgMark, Reveal, SampleNote, Segmented } from "../components/ui";
import { creatorOf, ORGS, orgById } from "../data/catalog";
import { CATEGORIES, type Ad } from "../data/types";
import { compact, pct, usd, usdCompact } from "../lib/format";
import { useStore } from "../lib/store";

type SortKey = "trending" | "funded" | "impressions" | "clicks" | "ctr" | "newest" | "earned";
const SORTS: { value: SortKey; label: string }[] = [
  { value: "trending", label: "Trending (7 days)" },
  { value: "funded", label: "Most funded" },
  { value: "impressions", label: "Most views" },
  { value: "clicks", label: "Most clicks" },
  { value: "ctr", label: "Highest click-through" },
  { value: "earned", label: "Creator earnings" },
  { value: "newest", label: "Newest" },
];

export const last7 = (ad: Ad) => ad.series.slice(-7).reduce((a, p) => a + p.crowd + p.org, 0);

function sortAds(ads: Ad[], key: SortKey) {
  const v = (a: Ad) => {
    switch (key) {
      case "trending": return a.status === "live" ? last7(a) : -1;
      case "funded": return a.totals.funded;
      case "impressions": return a.totals.impressions;
      case "clicks": return a.totals.clicks;
      case "ctr": return a.totals.ctr;
      case "earned": return a.totals.creatorEarned;
      case "newest": return new Date(a.launchedAt || 0).getTime();
    }
  };
  return [...ads].sort((a, b) => v(b) - v(a));
}

export default function Explore() {
  const { ads } = useStore();
  const [params, setParams] = useSearchParams();
  const status = (params.get("status") ?? "all") as "all" | "live" | "archived";
  const origin = (params.get("origin") ?? "all") as "all" | "grassroots" | "commissioned";
  const category = params.get("category") ?? "";
  const org = params.get("org") ?? "";
  const sort = (params.get("sort") ?? "trending") as SortKey;
  const view = (params.get("view") ?? "grid") as "grid" | "race";
  const [q, setQ] = useState(params.get("q") ?? "");

  const set = (k: string, v: string, def = "") => {
    const n = new URLSearchParams(params);
    if (!v || v === def) n.delete(k);
    else n.set(k, v);
    setParams(n, { replace: true });
  };
  useEffect(() => {
    const t = setTimeout(() => set("q", q.trim()), 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const publicAds = useMemo(() => ads.filter((a) => a.status === "live" || a.status === "archived"), [ads]);
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = publicAds.filter((a) => {
      if (status !== "all" && a.status !== status) return false;
      if (origin !== "all" && a.origin !== origin) return false;
      if (category && a.category !== category) return false;
      if (org && a.orgId !== org) return false;
      if (term) {
        const hay = [a.title, a.description, a.category, orgById(a.orgId)?.name, creatorOf(a)?.handle, creatorOf(a)?.name].join(" ").toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
    return sortAds(list, sort);
  }, [publicAds, status, origin, category, org, q, sort]);

  const totals = useMemo(() => {
    const live = publicAds.filter((a) => a.status === "live");
    return {
      live: live.length,
      funded: publicAds.reduce((s, a) => s + a.totals.funded, 0),
      spent: publicAds.reduce((s, a) => s + a.totals.spent, 0),
      earned: publicAds.reduce((s, a) => s + a.totals.creatorEarned, 0),
      views: publicAds.reduce((s, a) => s + a.totals.impressions, 0),
    };
  }, [publicAds]);

  const activeFilters = [status !== "all", origin !== "all", !!category, !!org, !!q].filter(Boolean).length;

  return (
    <div className="mx-auto max-w-[1440px] px-5 sm:px-8">
      <section className="pb-8 pt-10 sm:pt-16">
        <div className="flex flex-col gap-10 lg:flex-row lg:items-end lg:justify-between">
          <Reveal>
            <div className="label mb-4 flex items-center gap-2">
              <span className="size-1.5 animate-pulse-dot rounded-full bg-mint" /> {totals.live} ads live on TikTok right now
            </div>
            <h1 className="max-w-[14ch] text-[44px] font-semibold leading-[0.95] tracking-[-0.045em] sm:text-[72px]">
              Every ad. Every dollar. <span className="font-serif font-normal italic tracking-[-0.02em] text-flare">In the open.</span>
            </h1>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="grid grid-cols-2 gap-x-10 gap-y-6 xl:grid-cols-4 xl:gap-x-12">
              <Kpi label="Raised for ads" value={totals.funded} fmt={(n) => usd(n)} />
              <Kpi label="Spent on TikTok" value={totals.spent} fmt={(n) => usd(n)} />
              <Kpi label="Paid to creators" value={totals.earned} fmt={(n) => usd(n)} />
              <Kpi label="Views" value={totals.views} fmt={(n) => compact(n)} />
            </div>
          </Reveal>
        </div>
      </section>

      {/* Filter bar */}
      <div className="z-30 -mx-5 border-b md:sticky md:top-16 border-line bg-bg/85 px-5 py-3 backdrop-blur-xl sm:-mx-8 sm:px-8">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
            <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ads, creators, organizations" className="h-10 w-full rounded-full border border-line bg-surface pl-9 pr-9 text-[13.5px] outline-none transition focus:border-ink/30 focus:ring-4 focus:ring-flare/10" />
            {q && (
              <button onClick={() => setQ("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink" aria-label="Clear search"><X size={14} /></button>
            )}
          </div>
          <Segmented size="sm" value={status} onChange={(v) => set("status", v, "all")} options={[{ value: "all", label: "All" }, { value: "live", label: "Live" }, { value: "archived", label: "Archived" }]} />
          <Segmented size="sm" value={origin} onChange={(v) => set("origin", v, "all")} options={[{ value: "all", label: "Any origin" }, { value: "grassroots", label: "Grassroots" }, { value: "commissioned", label: "Commissioned" }]} />
          <Select value={org} onChange={(v) => set("org", v)} options={[{ value: "", label: "All organizations" }, ...ORGS.map((o) => ({ value: o.id, label: o.name }))]} />
          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-muted">
              <ArrowDownWideNarrow size={15} />
              <Select value={sort} onChange={(v) => set("sort", v, "trending")} options={SORTS} bare />
            </div>
            <div className="flex rounded-full border border-line bg-surface p-1">
              {(["grid", "race"] as const).map((v) => (
                <button key={v} onClick={() => set("view", v, "grid")} aria-label={v === "grid" ? "Grid view" : "Race view"} className={clsx("grid size-8 place-items-center rounded-full transition", view === v ? "bg-ink text-bg" : "text-muted hover:text-ink")}>
                  {v === "grid" ? <LayoutGrid size={15} /> : <ListOrdered size={15} />}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="no-scrollbar -mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1">
          <Chip active={!category} onClick={() => set("category", "")}>All causes</Chip>
          {CATEGORIES.map((c) => (
            <Chip key={c} active={category === c} onClick={() => set("category", category === c ? "" : c)}>{c}</Chip>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between py-5">
        <div className="text-[13px] text-muted">
          <span className="font-medium text-ink">{filtered.length}</span> ads
          {activeFilters > 0 && (
            <button onClick={() => { setQ(""); setParams(new URLSearchParams(view !== "grid" ? { view } : {}), { replace: true }); }} className="ml-3 underline-offset-4 hover:text-ink hover:underline">
              Clear filters
            </button>
          )}
        </div>
        <SampleNote />
      </div>

      {filtered.length === 0 ? (
        <div className="grid place-items-center rounded-3xl border border-dashed border-line-2 py-24 text-center">
          <div className="text-[18px] font-medium">No ads match those filters</div>
          <p className="mt-1 text-[14px] text-muted">Try another cause, or be the first to make one.</p>
          <Link to="/create" className="mt-5 rounded-full bg-flare px-5 py-2.5 text-[14px] font-medium text-white">Make an ad</Link>
        </div>
      ) : view === "grid" ? (
        <LayoutGroup>
          <motion.div layout className="grid grid-cols-1 gap-x-5 gap-y-9 min-[520px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <AnimatePresence mode="popLayout">
              {filtered.map((ad, i) => (
                <AdCard key={ad.id} ad={ad} index={i} />
              ))}
            </AnimatePresence>
          </motion.div>
        </LayoutGroup>
      ) : (
        <Race ads={filtered} sort={sort} />
      )}
    </div>
  );
}

function Kpi({ label, value, fmt }: { label: string; value: number; fmt: (n: number) => string }) {
  return (
    <div>
      <div className="label whitespace-nowrap">{label}</div>
      <div className="mt-1.5 text-[26px] font-semibold tracking-[-0.03em]">
        <CountUp value={value} format={fmt} />
      </div>
    </div>
  );
}

function Chip({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className={clsx("focus-ring shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium transition", active ? "border-ink bg-ink text-bg" : "border-line bg-surface text-ink-2 hover:border-line-2 hover:text-ink")}>
      {children}
    </button>
  );
}

export function Select({ value, onChange, options, bare }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; bare?: boolean }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={clsx(
        "focus-ring h-10 cursor-pointer appearance-none rounded-full text-[13px] font-medium text-ink outline-none",
        bare ? "bg-transparent pr-1" : "border border-line bg-surface bg-[length:12px] bg-[right_14px_center] bg-no-repeat pl-4 pr-9",
      )}
      style={bare ? undefined : { backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238d8b85' stroke-width='2.5'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

/* --------------------------- Race view --------------------------- */

function Spark({ values, className }: { values: number[]; className?: string }) {
  const max = Math.max(1, ...values);
  const w = 120, h = 32;
  const pts = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * w},${h - (v / max) * (h - 4) - 2}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={className} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Race({ ads, sort }: { ads: Ad[]; sort: SortKey }) {
  // Visual "infinite race": live ads pick up small simulated donations so the order keeps moving.
  const [bump, setBump] = useState<Record<string, number>>({});
  useEffect(() => {
    const live = ads.filter((a) => a.status === "live");
    if (!live.length) return;
    const t = setInterval(() => {
      const pick = live[Math.floor(Math.random() * live.length)];
      setBump((b) => ({ ...b, [pick.id]: (b[pick.id] ?? 0) + 5 + Math.round(Math.random() * 60) }));
    }, 1800);
    return () => clearInterval(t);
  }, [ads]);

  const metric = (a: Ad) => (sort === "trending" ? last7(a) : a.totals.funded) + (bump[a.id] ?? 0);
  const ordered = sort === "trending" || sort === "funded" ? [...ads].sort((a, b) => metric(b) - metric(a)) : ads;
  const max = Math.max(1, ...ordered.map(metric));

  return (
    <div className="card overflow-hidden">
      <div className="hidden grid-cols-[48px_minmax(0,2.4fr)_minmax(0,1.6fr)_120px_90px_90px] items-center gap-4 border-b border-line px-5 py-3 md:grid">
        <span className="label">#</span>
        <span className="label">Ad</span>
        <span className="label">{sort === "trending" ? "Funded · last 7 days" : "Funded · all time"}</span>
        <span className="label">30-day trend</span>
        <span className="label text-right">Views</span>
        <span className="label text-right">CTR</span>
      </div>
      <LayoutGroup>
        {ordered.map((ad, i) => {
          const creator = creatorOf(ad);
          const org = orgById(ad.orgId);
          const m = metric(ad);
          return (
            <motion.div layout key={ad.id} transition={{ type: "spring", stiffness: 300, damping: 34 }} className="border-b border-line last:border-0">
              <Link to={`/ads/${ad.slug}`} className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-4 px-5 py-3.5 transition hover:bg-surface-2 md:grid-cols-[48px_minmax(0,2.4fr)_minmax(0,1.6fr)_120px_90px_90px]">
                <span className={clsx("font-mono text-[15px] font-semibold tabular", i < 3 ? "text-flare" : "text-muted")}>{String(i + 1).padStart(2, "0")}</span>
                <div className="flex min-w-0 items-center gap-3">
                  <img src={ad.thumb} alt="" className="h-14 w-11 shrink-0 rounded-lg object-cover" />
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-medium">{ad.title}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-muted">
                      <Avatar creator={creator} size={16} /> @{creator?.handle}
                      {org && (<><span>·</span><OrgMark org={org} size={14} /><span className="truncate">{org.name}</span></>)}
                    </div>
                  </div>
                </div>
                <div className="hidden items-center gap-3 md:flex">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <motion.div className="h-full rounded-full bg-flare" initial={{ width: 0 }} animate={{ width: `${(m / max) * 100}%` }} transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }} />
                  </div>
                  <span className="w-[72px] text-right font-mono text-[13px] tabular">{usd(m)}</span>
                </div>
                <Spark values={ad.series.slice(-30).map((p) => p.crowd + p.org)} className="hidden h-8 w-[120px] text-ink-2 md:block" />
                <span className="hidden text-right font-mono text-[13px] tabular md:block">{compact(ad.totals.impressions)}</span>
                <span className="text-right font-mono text-[13px] tabular md:block">
                  <span className="md:hidden">{usdCompact(m)}</span>
                  <span className="hidden md:inline">{pct(ad.totals.ctr, 1)}</span>
                </span>
              </Link>
            </motion.div>
          );
        })}
      </LayoutGroup>
    </div>
  );
}

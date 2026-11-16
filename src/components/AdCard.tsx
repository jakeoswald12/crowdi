import clsx from "clsx";
import { motion } from "framer-motion";
import { Link2, Play } from "lucide-react";
import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { creatorOf, orgById } from "../data/catalog";
import type { Ad } from "../data/types";
import { compact, pct, usdCompact } from "../lib/format";
import { Avatar, Badge, OrgMark } from "./ui";

export function StatusBadge({ ad }: { ad: Ad }) {
  if (ad.status === "live") return <Badge tone="live">Live</Badge>;
  if (ad.status === "archived") return <Badge tone="muted">Archived</Badge>;
  if (ad.status === "in_review") return <Badge tone="gold">Awaiting approval</Badge>;
  if (ad.status === "changes_requested") return <Badge tone="violet">Changes requested</Badge>;
  return <Badge tone="flare">Declined</Badge>;
}

export function AdCard({ ad, index = 0, rank }: { ad: Ad; index?: number; rank?: number }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [hover, setHover] = useState(false);
  const creator = creatorOf(ad);
  const org = orgById(ad.orgId);
  const enter = () => {
    setHover(true);
    const v = ref.current;
    if (v) {
      if (ad.aspect === "16:9" && v.currentTime < 5) v.currentTime = 6;
      v.play().catch(() => {});
    }
  };
  const leave = () => {
    setHover(false);
    ref.current?.pause();
  };
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.6, delay: Math.min(index, 12) * 0.035, ease: [0.16, 1, 0.3, 1] }}
    >
      <Link
        to={`/ads/${ad.slug}`}
        onMouseEnter={enter}
        onMouseLeave={leave}
        onFocus={enter}
        onBlur={leave}
        className="focus-ring group block rounded-[22px]"
      >
        <div className="relative aspect-[4/5] overflow-hidden rounded-[22px] bg-surface-2">
          <img
            src={ad.poster}
            alt=""
            loading="lazy"
            className={clsx("absolute inset-0 size-full object-cover transition-all duration-700 ease-out-expo", hover ? "scale-[1.04] opacity-0" : "scale-100 opacity-100")}
          />
          <video
            ref={ref}
            src={ad.video}
            muted
            loop
            playsInline
            preload="none"
            className={clsx("absolute inset-0 size-full object-cover transition-all duration-700 ease-out-expo", hover ? "scale-[1.04] opacity-100" : "scale-100 opacity-0")}
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/0 to-black/30" />
          <div className="absolute inset-x-3 top-3 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              {rank !== undefined && (
                <span className="grid h-6 min-w-6 place-items-center rounded-full bg-white px-1.5 font-mono text-[11px] font-semibold text-black">{rank}</span>
              )}
              <span className={clsx("rounded-full px-2 py-0.5 text-[11px] font-medium backdrop-blur-md", ad.status === "live" ? "bg-black/40 text-white" : "bg-black/40 text-white/70")}>
                {ad.status === "live" ? (
                  <span className="inline-flex items-center gap-1.5"><span className="size-1.5 animate-pulse-dot rounded-full bg-[#3BF0B4]" />Live</span>
                ) : ad.status === "archived" ? "Archived" : "In review"}
              </span>
            </div>
            <span className="rounded-full bg-black/40 px-2 py-0.5 text-[11px] font-medium text-white/90 backdrop-blur-md">
              {ad.origin === "grassroots" ? "Grassroots" : "Commissioned"}
            </span>
          </div>
          <div className="absolute inset-x-0 bottom-0 p-4 text-white">
            <div className="mb-2 flex items-center gap-2 text-[12px] text-white/80">
              {org ? <OrgMark org={org} size={18} /> : <span className="grid size-[18px] place-items-center rounded-full border border-white/40 text-[9px]">✦</span>}
              <span className="truncate">{org?.name ?? ad.category}</span>
              {ad.cta && <Link2 size={12} className="shrink-0 opacity-70" />}
            </div>
            <h3 className="text-[19px] font-semibold leading-[1.1] tracking-[-0.02em]">{ad.title}</h3>
            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-white/15 pt-3 font-mono text-[11px]">
              <Stat label="Funded" value={usdCompact(ad.totals.funded)} />
              <Stat label="Views" value={compact(ad.totals.impressions)} />
              <Stat label="CTR" value={pct(ad.totals.ctr, 1)} />
            </div>
          </div>
          <div className={clsx("absolute right-4 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-white backdrop-blur-md transition-all duration-500", hover ? "scale-75 opacity-0" : "opacity-100")}>
            <Play size={16} fill="currentColor" />
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 px-1">
          <Avatar creator={creator} size={22} />
          <span className="truncate text-[13px] text-ink-2">@{creator?.handle}</span>
          <span className="ml-auto font-mono text-[11.5px] text-muted">earned {usdCompact(ad.totals.creatorEarned)}</span>
        </div>
      </Link>
    </motion.div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9.5px] uppercase tracking-[0.12em] text-white/55">{label}</div>
      <div className="mt-0.5 text-[13px] font-medium text-white tabular">{value}</div>
    </div>
  );
}

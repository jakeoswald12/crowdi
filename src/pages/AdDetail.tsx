import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowUpRight, BadgeCheck, Check, Heart, Play, Share2, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AdCard, StatusBadge } from "../components/AdCard";
import { MoneyFlow, PerformanceChart, type ChartKind } from "../components/Charts";
import { Avatar, Badge, Button, CountUp, OrgMark, Reveal, SampleNote, Segmented } from "../components/ui";
import { briefById, creatorOf, orgById, TODAY } from "../data/catalog";
import { SPLIT, type Ad } from "../data/types";
import { compact, daysBetween, int, longDate, usd } from "../lib/format";
import { useStore } from "../lib/store";

export default function AdDetail() {
  const { slug } = useParams();
  const { ads } = useStore();
  const ad = ads.find((a) => a.slug === slug);
  const [kind, setKind] = useState<ChartKind>("money");
  const [range, setRange] = useState<"7" | "30" | "all">("all");
  const [fund, setFund] = useState(false);

  const series = useMemo(() => {
    if (!ad) return [];
    return range === "all" ? ad.series : ad.series.slice(-Number(range));
  }, [ad, range]);

  if (!ad)
    return (
      <div className="mx-auto grid max-w-xl place-items-center px-6 py-32 text-center">
        <h1 className="text-3xl font-semibold">That ad isn't here</h1>
        <p className="mt-2 text-muted">It may have been withdrawn or the link is wrong.</p>
        <Link to="/explore" className="mt-6 underline underline-offset-4">Back to Explore</Link>
      </div>
    );

  const creator = creatorOf(ad);
  const org = orgById(ad.orgId);
  const brief = briefById(ad.briefId);
  const t = ad.totals;
  const running = ad.launchedAt ? daysBetween(ad.launchedAt, ad.endedAt ?? TODAY) + 1 : 0;
  const more = ads.filter((a) => a.id !== ad.id && (a.status === "live" || a.status === "archived") && (a.creatorId === ad.creatorId || a.category === ad.category)).slice(0, 4);
  const isPublic = ad.status === "live" || ad.status === "archived";

  return (
    <div className="mx-auto max-w-[1440px] px-5 pb-10 pt-6 sm:px-8">
      <Link to="/explore" className="group inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink">
        <ArrowLeft size={14} className="transition group-hover:-translate-x-0.5" /> All ads
      </Link>

      <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-14">
        <Reveal>
          <Player ad={ad} />
        </Reveal>

        <div>
          <Reveal delay={0.05}>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge ad={ad} />
              <Badge>{ad.origin === "grassroots" ? "Grassroots" : "Commissioned"}</Badge>
              <Badge tone="muted">{ad.category}</Badge>
              {ad.real && <Badge tone="flare">ACU ad competition</Badge>}
            </div>
            <h1 className="mt-4 text-[40px] font-semibold leading-[0.98] tracking-[-0.04em] sm:text-[56px]">{ad.title}</h1>
            <p className="mt-4 max-w-[52ch] text-[16px] leading-relaxed text-ink-2">{ad.description}</p>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              <div className="card flex items-center gap-3 p-3.5">
                <Avatar creator={creator} size={40} />
                <div className="min-w-0">
                  <div className="label !text-[10px]">Made by</div>
                  <div className="truncate text-[14.5px] font-medium">{creator?.name}</div>
                  <div className="truncate text-[12.5px] text-muted">@{creator?.handle} · {creator?.city}</div>
                </div>
              </div>
              <div className="card flex items-center gap-3 p-3.5">
                {org ? <OrgMark org={org} size={40} /> : <span className="grid size-10 place-items-center rounded-[28%] border border-dashed border-line-2 text-muted">✦</span>}
                <div className="min-w-0">
                  <div className="label !text-[10px]">{org ? (org.kind === "nonprofit" ? "For nonprofit" : "For brand") : "Cause"}</div>
                  <div className="flex items-center gap-1 truncate text-[14.5px] font-medium">
                    {org?.name ?? ad.category} {org?.verified && <BadgeCheck size={15} className="shrink-0 text-flare" />}
                  </div>
                  <div className="truncate text-[12.5px] text-muted">{org ? "Approved by the organization" : "Grassroots · no organization"}</div>
                </div>
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.15}>
            <div className="mt-6 flex flex-wrap gap-2.5">
              {ad.status === "live" && (
                <Button variant="flare" size="lg" onClick={() => setFund(true)}>
                  <Heart size={16} /> Fund this ad
                </Button>
              )}
              {ad.cta && (
                <a href={ad.cta.url} target="_blank" rel="noreferrer" className="focus-ring inline-flex h-13 items-center gap-2 rounded-full border border-line-2 px-6 text-[15px] font-medium hover:border-ink/50">
                  {ad.cta.label} <ArrowUpRight size={16} />
                </a>
              )}
              <ShareButton />
            </div>
            {ad.status === "live" && (
              <p className="mt-3 text-[12.5px] text-muted">
                Every $10 you give buys about {compact(Math.round((10 * SPLIT.adSpend / Math.max(0.0001, t.spent)) * t.impressions) || 1000)} more views of this ad.
              </p>
            )}
          </Reveal>

          {isPublic && (
            <Reveal delay={0.2}>
              <div className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-4">
                <Metric label="Funded" value={t.funded} fmt={(n) => usd(n)} accent />
                <Metric label="Spent on ads" value={t.spent} fmt={(n) => usd(n)} />
                <Metric label="Creator earned" value={t.creatorEarned} fmt={(n) => usd(n)} />
                <Metric label="Backers" value={t.backers} fmt={(n) => int(n)} />
                <Metric label="Views" value={t.impressions} fmt={(n) => compact(n)} />
                <Metric label={ad.cta ? "Link clicks" : "Profile taps"} value={t.clicks} fmt={(n) => int(n)} />
                <Metric label="Click-through" value={t.ctr * 100} fmt={(n) => n.toFixed(2) + "%"} />
                <Metric label={ad.status === "live" ? "Days running" : "Ran for"} value={running} fmt={(n) => Math.round(n) + "d"} />
              </div>
            </Reveal>
          )}
        </div>
      </div>

      {isPublic && (
        <>
          <section className="mt-16 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Reveal>
              <div className="card p-5 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="label">Performance</div>
                    <h2 className="mt-1 text-[22px] font-semibold tracking-tight">
                      {kind === "money" ? "Money in vs. money spent" : kind === "views" ? "Daily views on TikTok" : "Clicks and click-through rate"}
                    </h2>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Segmented size="sm" value={kind} onChange={setKind} options={[{ value: "money", label: "Funding" }, { value: "views", label: "Views" }, { value: "clicks", label: "Clicks" }]} />
                    <Segmented size="sm" value={range} onChange={setRange} options={[{ value: "7", label: "7d" }, { value: "30", label: "30d" }, { value: "all", label: "All" }]} />
                  </div>
                </div>
                <div className="mt-6">
                  <PerformanceChart series={series} kind={kind} />
                </div>
                <div className="mt-3 flex justify-end"><SampleNote /></div>
              </div>
            </Reveal>
            <Reveal delay={0.1}>
              <div className="card h-full p-5 sm:p-6">
                <div className="label">Where the money goes</div>
                <h2 className="mt-1 text-[22px] font-semibold tracking-tight">{usd(t.funded)} funded</h2>
                <p className="mt-1 text-[13.5px] text-muted">90% buys ads. 7.5% goes to the creator. 2.5% keeps Crowdi running.</p>
                <div className="mt-6"><MoneyFlow funded={t.funded} spent={t.spent} /></div>
                <div className="mt-6 grid grid-cols-2 gap-3 text-[13px]">
                  <div className="rounded-xl bg-surface-2 p-3"><div className="text-muted">From the crowd</div><div className="mt-0.5 font-mono text-[15px] font-medium">{usd(t.crowd)}</div></div>
                  <div className="rounded-xl bg-surface-2 p-3"><div className="text-muted">From {org ? "the organization" : "organizations"}</div><div className="mt-0.5 font-mono text-[15px] font-medium">{usd(t.org)}</div></div>
                </div>
              </div>
            </Reveal>
          </section>

          <section className="mt-6 grid gap-6 md:grid-cols-2">
            <Reveal>
              <div className="card p-5 sm:p-6">
                <div className="label">Running on</div>
                <div className="mt-4 space-y-3">
                  <Platform name="TikTok" note={ad.status === "live" ? `Live · ${usd(t.spent / Math.max(1, running))}/day average` : `Ended ${longDate(ad.endedAt ?? "")}`} on />
                  <Platform name="Instagram & Facebook" note="Coming soon" />
                </div>
              </div>
            </Reveal>
            <Reveal delay={0.08}>
              <div className="card p-5 sm:p-6">
                <div className="label">Timeline</div>
                <ol className="mt-4 space-y-3 text-[13.5px]">
                  <Step done>Uploaded by @{creator?.handle}{brief ? <> for the brief <Link className="underline underline-offset-4" to={`/briefs/${brief.slug}`}>“{brief.title}”</Link></> : null}</Step>
                  <Step done>{org ? `Approved by ${org.name}` : "Passed automated safety review"}</Step>
                  <Step done>Went live on TikTok · {longDate(ad.launchedAt)}</Step>
                  {ad.status === "archived" ? <Step done>Archived · {longDate(ad.endedAt ?? "")}</Step> : <Step>Still running — funded by {int(t.backers)} backers</Step>}
                </ol>
              </div>
            </Reveal>
          </section>
        </>
      )}

      {more.length > 0 && (
        <section className="mt-20">
          <div className="mb-6 flex items-end justify-between">
            <h2 className="text-[28px] font-semibold tracking-[-0.03em]">More like this</h2>
            <Link to="/explore" className="text-[13.5px] text-muted hover:text-ink">See all ads →</Link>
          </div>
          <div className="grid grid-cols-1 gap-5 min-[520px]:grid-cols-2 lg:grid-cols-4">
            {more.map((a, i) => <AdCard key={a.id} ad={a} index={i} />)}
          </div>
        </section>
      )}

      <AnimatePresence>{fund && <FundDialog ad={ad} onClose={() => setFund(false)} />}</AnimatePresence>
    </div>
  );
}

function Player({ ad }: { ad: Ad }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const vertical = ad.aspect === "9:16";
  return (
    <div className={clsx("relative overflow-hidden rounded-[28px] bg-black", vertical ? "mx-auto aspect-[9/16] max-h-[78vh] max-w-[440px]" : "aspect-video w-full")}>
      <video ref={ref} src={ad.video} poster={ad.poster} playsInline controls={playing} onPlay={() => setPlaying(true)} className="absolute inset-0 size-full object-contain" />
      <AnimatePresence>
        {!playing && (
          <motion.button
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => ref.current?.play()}
            className="group absolute inset-0 grid place-items-center bg-black/20"
            aria-label="Play ad with sound"
          >
            <span className="grid size-20 place-items-center rounded-full bg-white/95 text-black shadow-2xl transition duration-300 group-hover:scale-110">
              <Play size={26} fill="currentColor" className="translate-x-0.5" />
            </span>
            <span className="absolute bottom-5 left-5 rounded-full bg-black/50 px-3 py-1 font-mono text-[11px] text-white backdrop-blur-md">
              {Math.floor(ad.duration / 60)}:{String(Math.round(ad.duration % 60)).padStart(2, "0")} · sound on
            </span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

function Metric({ label, value, fmt, accent }: { label: string; value: number; fmt: (n: number) => string; accent?: boolean }) {
  return (
    <div className="bg-surface p-4">
      <div className="label !text-[10px]">{label}</div>
      <div className={clsx("mt-1.5 text-[22px] font-semibold tracking-[-0.03em]", accent && "text-flare")}>
        <CountUp value={value} format={fmt} />
      </div>
    </div>
  );
}

function Platform({ name, note, on }: { name: string; note: string; on?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line p-3">
      <span className={clsx("grid size-9 place-items-center rounded-lg text-[13px] font-bold", on ? "bg-ink text-bg" : "bg-surface-2 text-muted")}>{name[0]}</span>
      <div>
        <div className="text-[14px] font-medium">{name}</div>
        <div className="text-[12.5px] text-muted">{note}</div>
      </div>
      {on && <span className="ml-auto size-2 animate-pulse-dot rounded-full bg-mint" />}
    </div>
  );
}

function Step({ children, done }: { children: React.ReactNode; done?: boolean }) {
  return (
    <li className="flex gap-3">
      <span className={clsx("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full", done ? "bg-ink text-bg" : "border border-dashed border-line-2")}>
        {done && <Check size={11} strokeWidth={3} />}
      </span>
      <span className="text-ink-2">{children}</span>
    </li>
  );
}

function ShareButton() {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(window.location.href).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
      className="focus-ring inline-flex h-13 items-center gap-2 rounded-full px-5 text-[15px] font-medium text-ink-2 hover:bg-surface-2"
    >
      {copied ? <Check size={16} /> : <Share2 size={16} />} {copied ? "Link copied" : "Share"}
    </button>
  );
}

function FundDialog({ ad, onClose }: { ad: Ad; onClose: () => void }) {
  const { donate } = useStore();
  const [amount, setAmount] = useState(25);
  const [stage, setStage] = useState<"pick" | "paying" | "done">("pick");
  const views = Math.round((amount * SPLIT.adSpend * ad.totals.impressions) / Math.max(1, ad.totals.spent));
  const pay = () => {
    setStage("paying");
    setTimeout(() => {
      donate(ad.id, amount);
      setStage("done");
    }, 1300);
  };
  return (
    <motion.div className="fixed inset-0 z-[70] grid place-items-end bg-black/50 backdrop-blur-sm sm:place-items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={{ y: 40, opacity: 0, scale: 0.98 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ type: "spring", stiffness: 380, damping: 34 }}
        className="relative w-full max-w-[460px] rounded-t-[28px] border border-line bg-surface p-6 shadow-2xl sm:rounded-[28px]"
      >
        <button onClick={onClose} className="absolute right-4 top-4 grid size-8 place-items-center rounded-full hover:bg-surface-2" aria-label="Close"><X size={16} /></button>
        {stage === "done" ? (
          <div className="py-6 text-center">
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 15 }} className="mx-auto grid size-16 place-items-center rounded-full bg-flare text-white">
              <Check size={28} strokeWidth={3} />
            </motion.div>
            <h3 className="mt-5 text-[24px] font-semibold tracking-tight">You just bought ~{compact(views)} views</h3>
            <p className="mt-2 text-[14px] text-muted">{usd(amount)} added to “{ad.title}”. We'll put it to work on TikTok within the day.</p>
            <Button className="mt-6 w-full" onClick={onClose}>Back to the ad</Button>
            <p className="mt-3 text-[11.5px] text-muted">Prototype — no card was charged.</p>
          </div>
        ) : (
          <>
            <div className="label">Fund this ad</div>
            <h3 className="mt-1 text-[24px] font-semibold tracking-tight">Put more eyes on “{ad.title}”</h3>
            <div className="mt-5 grid grid-cols-5 gap-2">
              {[5, 10, 25, 50, 100].map((v) => (
                <button key={v} onClick={() => setAmount(v)} className={clsx("rounded-xl border py-3 font-mono text-[15px] font-medium transition", amount === v ? "border-ink bg-ink text-bg" : "border-line hover:border-line-2")}>
                  ${v}
                </button>
              ))}
            </div>
            <div className="relative mt-3">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted">$</span>
              <input type="number" min={1} value={amount} onChange={(e) => setAmount(Math.max(1, Number(e.target.value) || 1))} className="field pl-8 font-mono" />
            </div>
            <div className="mt-5 space-y-2 rounded-2xl bg-surface-2 p-4 text-[13.5px]">
              <Row label="Buys TikTok ads" value={usd(amount * SPLIT.adSpend, true)} strong />
              <Row label={`Thanks @${creatorOf(ad)?.handle}`} value={usd(amount * SPLIT.creator, true)} />
              <Row label="Keeps Crowdi running" value={usd(amount * SPLIT.platform, true)} />
              <div className="!mt-3 border-t border-line pt-3 text-muted">≈ {compact(views)} more views at this ad's current cost</div>
            </div>
            <Button variant="flare" size="lg" className="mt-5 w-full" onClick={pay} disabled={stage === "paying"}>
              {stage === "paying" ? <motion.span animate={{ opacity: [1, 0.4, 1] }} transition={{ repeat: Infinity, duration: 1 }}>Processing…</motion.span> : <>Give {usd(amount)} with Apple Pay or card</>}
            </Button>
            <p className="mt-3 text-center text-[11.5px] text-muted">No account needed · Payments by Stripe · Prototype, no charge</p>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={strong ? "font-medium" : "text-muted"}>{label}</span>
      <span className="font-mono tabular">{value}</span>
    </div>
  );
}

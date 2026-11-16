import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check, CheckCircle2, Inbox, MessageSquareText, Plus, ShieldCheck, Sparkles, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { StatusBadge } from "../components/AdCard";
import { PerformanceChart, type ChartKind } from "../components/Charts";
import { Avatar, Button, ButtonLink, CountUp, OrgMark, SampleNote, Segmented } from "../components/ui";
import { creatorOf, orgById } from "../data/catalog";
import type { Ad, Brief, DailyPoint } from "../data/types";
import { compact, int, longDate, pct, shortDate, usd } from "../lib/format";
import { useStore } from "../lib/store";
import { BriefCard } from "./Briefs";

type Tab = "overview" | "review" | "briefs" | "ads";

export default function OrgPortal() {
  const { user, ads, briefs } = useStore();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") ?? "overview") as Tab;
  if (!user || user.role !== "org") return <Navigate to="/signin" replace />;
  const org = orgById(user.orgId);
  const mine = ads.filter((a) => a.orgId === user.orgId);
  const queue = mine.filter((a) => a.status === "in_review" || a.status === "changes_requested");
  const running = mine.filter((a) => a.status === "live" || a.status === "archived");
  const myBriefs = briefs.filter((b) => b.orgId === user.orgId);
  const setTab = (t: Tab) => setParams(t === "overview" ? {} : { tab: t }, { replace: true });

  return (
    <div className="mx-auto max-w-[1440px] px-5 pt-8 sm:px-8">
      {params.get("welcome") && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6 flex items-center gap-3 rounded-2xl border border-mint/30 bg-mint/8 p-4 text-[14px]">
          <CheckCircle2 size={18} className="text-mint" /> Your organization is set up. Post your first brief so creators know what you're looking for.
          <ButtonLink to="/org/briefs/new" size="sm" className="ml-auto">Post a brief</ButtonLink>
        </motion.div>
      )}
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-4">
          <OrgMark org={org} size={56} />
          <div>
            <div className="label">Organization portal</div>
            <h1 className="mt-1 text-[32px] font-semibold tracking-[-0.035em] sm:text-[40px]">{org?.name}</h1>
          </div>
        </div>
        <ButtonLink to="/org/briefs/new" variant="flare"><Plus size={16} /> New brief</ButtonLink>
      </div>
      <div className="mt-8 flex gap-1 overflow-x-auto border-b border-line no-scrollbar">
        {([
          ["overview", "Overview", null],
          ["review", "Review queue", queue.filter((a) => a.status === "in_review").length],
          ["briefs", "Briefs", myBriefs.length],
          ["ads", "Ads", running.length],
        ] as const).map(([k, l, n]) => (
          <button key={k} onClick={() => setTab(k)} className={clsx("relative flex shrink-0 items-center gap-2 px-4 pb-3.5 pt-2 text-[14px] font-medium transition", tab === k ? "text-ink" : "text-muted hover:text-ink")}>
            {l}
            {n !== null && n > 0 && <span className={clsx("rounded-full px-1.5 py-px font-mono text-[11px]", k === "review" ? "bg-flare text-white" : "bg-surface-2")}>{n}</span>}
            {tab === k && <motion.span layoutId="org-tab" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-ink" />}
          </button>
        ))}
      </div>
      <div className="pt-8">
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }}>
            {tab === "overview" && <Overview ads={running} queue={queue.length} onReview={() => setTab("review")} />}
            {tab === "review" && <Review queue={queue} />}
            {tab === "briefs" && <BriefsTab briefs={myBriefs} />}
            {tab === "ads" && <AdsTab ads={running} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function aggregate(ads: Ad[]): DailyPoint[] {
  const m = new Map<string, DailyPoint>();
  for (const a of ads)
    for (const p of a.series) {
      const x = m.get(p.date) ?? { date: p.date, impressions: 0, clicks: 0, crowd: 0, org: 0, spent: 0 };
      x.impressions += p.impressions;
      x.clicks += p.clicks;
      x.crowd += p.crowd;
      x.org += p.org;
      x.spent += p.spent;
      m.set(p.date, x);
    }
  return [...m.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function Overview({ ads, queue, onReview }: { ads: Ad[]; queue: number; onReview: () => void }) {
  const [kind, setKind] = useState<ChartKind>("money");
  const series = useMemo(() => aggregate(ads), [ads]);
  const t = ads.reduce(
    (s, a) => ({ funded: s.funded + a.totals.funded, crowd: s.crowd + a.totals.crowd, org: s.org + a.totals.org, spent: s.spent + a.totals.spent, views: s.views + a.totals.impressions, clicks: s.clicks + a.totals.clicks }),
    { funded: 0, crowd: 0, org: 0, spent: 0, views: 0, clicks: 0 },
  );
  if (!ads.length)
    return (
      <Empty icon={Sparkles} title="No ads running yet" body="Post a brief and approve your first submissions — performance shows up here the day they go live.">
        <ButtonLink to="/org/briefs/new" variant="flare">Post a brief</ButtonLink>
      </Empty>
    );
  const top = [...ads].sort((a, b) => b.totals.ctr - a.totals.ctr).slice(0, 4);
  return (
    <div className="space-y-6">
      {queue > 0 && (
        <button onClick={onReview} className="flex w-full items-center gap-3 rounded-2xl bg-ink p-4 text-left text-bg transition hover:opacity-90">
          <Inbox size={18} /> <span className="font-medium">{queue} ads are waiting for your review</span>
          <ArrowRight size={16} className="ml-auto" />
        </button>
      )}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-5">
        {[
          ["Raised from the crowd", usd(t.crowd), t.crowd],
          ["Your funding", usd(t.org), t.org],
          ["Spent on TikTok", usd(t.spent), t.spent],
          ["Views", compact(t.views), t.views],
          ["Click-through", pct(t.views ? t.clicks / t.views : 0), 0],
        ].map(([l, v, n], i) => (
          <div key={l as string} className="bg-surface p-5">
            <div className="label !text-[10px]">{l}</div>
            <div className="mt-1.5 text-[26px] font-semibold tracking-[-0.03em]">
              {i < 3 ? <CountUp value={n as number} format={(x) => usd(x)} /> : (v as string)}
            </div>
          </div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="card p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-[20px] font-semibold tracking-tight">All your ads</h2>
            <Segmented size="sm" value={kind} onChange={setKind} options={[{ value: "money", label: "Funding" }, { value: "views", label: "Views" }, { value: "clicks", label: "Clicks" }]} />
          </div>
          <div className="mt-6"><PerformanceChart series={series} kind={kind} /></div>
          <div className="mt-2 flex justify-end"><SampleNote /></div>
        </div>
        <div className="card p-5 sm:p-6">
          <h2 className="text-[20px] font-semibold tracking-tight">Back the winners</h2>
          <p className="mt-1 text-[13.5px] text-muted">Highest click-through first. Add budget and it goes straight into ad spend.</p>
          <div className="mt-5 space-y-3">
            {top.map((a) => <TopUp key={a.id} ad={a} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

function TopUp({ ad }: { ad: Ad }) {
  const { donate } = useStore();
  const [done, setDone] = useState(false);
  return (
    <div className="flex items-center gap-3">
      <img src={ad.thumb} alt="" className="h-12 w-9 rounded-md object-cover" />
      <div className="min-w-0 flex-1">
        <Link to={`/ads/${ad.slug}`} className="block truncate text-[14px] font-medium hover:underline">{ad.title}</Link>
        <div className="font-mono text-[11.5px] text-muted">{pct(ad.totals.ctr)} CTR · {compact(ad.totals.impressions)} views</div>
      </div>
      <Button size="sm" variant={done ? "subtle" : "outline"} disabled={done || ad.status !== "live"} onClick={() => { donate(ad.id, 500); setDone(true); }}>
        {done ? <><Check size={14} /> Added</> : "+$500"}
      </Button>
    </div>
  );
}

function Review({ queue }: { queue: Ad[] }) {
  const { decide } = useStore();
  const [sel, setSel] = useState<string | null>(queue[0]?.id ?? null);
  const [mode, setMode] = useState<"none" | "changes" | "decline">("none");
  const [note, setNote] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const ad = queue.find((a) => a.id === sel) ?? queue[0];

  const act = (status: Ad["status"], msg: string) => {
    if (!ad) return;
    decide(ad.id, status, note || undefined);
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
    setMode("none");
    setNote("");
    const next = queue.find((a) => a.id !== ad.id);
    setSel(next?.id ?? null);
  };

  if (!queue.length)
    return (
      <Empty icon={CheckCircle2} title="You're all caught up" body="New submissions that name you, link to your site, or answer one of your briefs will land here.">
        {toast && <p className="text-[14px] text-mint">{toast}</p>}
      </Empty>
    );

  const creator = ad ? creatorOf(ad) : undefined;
  return (
    <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
      <div className="space-y-2">
        <AnimatePresence initial={false}>
          {queue.map((a) => (
            <motion.button
              layout
              key={a.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 60, height: 0, marginTop: 0, transition: { duration: 0.35 } }}
              onClick={() => { setSel(a.id); setMode("none"); }}
              className={clsx("flex w-full items-center gap-3 rounded-2xl border p-2.5 text-left transition", ad?.id === a.id ? "border-ink bg-surface" : "border-line bg-surface/50 hover:border-line-2")}
            >
              <img src={a.thumb} alt="" className="h-16 w-12 rounded-lg object-cover" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14.5px] font-medium">{a.title}</div>
                <div className="truncate text-[12.5px] text-muted">@{creatorOf(a)?.handle} · {shortDate(a.submittedAt ?? "")}</div>
                <div className="mt-1"><StatusBadge ad={a} /></div>
              </div>
            </motion.button>
          ))}
        </AnimatePresence>
      </div>

      {ad && (
        <motion.div key={ad.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="card grid gap-6 p-5 sm:p-6 md:grid-cols-[260px_minmax(0,1fr)]">
          <div className="mx-auto w-full max-w-[260px]">
            <div className={clsx("overflow-hidden rounded-2xl bg-black", ad.aspect === "16:9" ? "aspect-video" : "aspect-[9/16]")}>
              <video key={ad.video} src={ad.video} poster={ad.poster} controls playsInline className="size-full object-contain" />
            </div>
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2"><StatusBadge ad={ad} /><span className="text-[12.5px] text-muted">Submitted {longDate(ad.submittedAt ?? "")}</span></div>
            <h2 className="mt-3 text-[28px] font-semibold leading-tight tracking-[-0.03em]">{ad.title}</h2>
            <p className="mt-2 text-[14.5px] text-ink-2">{ad.description}</p>
            <div className="mt-5 flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
              <Avatar creator={creator} size={36} />
              <div className="text-[13.5px]"><div className="font-medium">{creator?.name}</div><div className="text-muted">@{creator?.handle} · {creator?.bio}</div></div>
            </div>
            <div className="mt-4 grid gap-2 text-[13.5px] sm:grid-cols-2">
              <Check2>Safety review passed</Check2>
              <Check2>Captions detected</Check2>
              <Check2>{ad.cta ? `Links to ${ad.cta.url.replace(/^https?:\/\//, "")}` : "No link"}</Check2>
              <Check2>{Math.round(ad.duration)}s · {ad.aspect} · TikTok-ready</Check2>
            </div>
            {ad.reviewNote && ad.status === "changes_requested" && (
              <div className="mt-4 flex gap-2.5 rounded-2xl border border-violet/25 bg-violet/8 p-3 text-[13.5px]">
                <MessageSquareText size={16} className="mt-0.5 shrink-0 text-violet" />
                <div><span className="font-medium">You asked:</span> {ad.reviewNote}<div className="mt-1 text-muted">Waiting on a new version from the creator.</div></div>
              </div>
            )}
            <AnimatePresence>
              {mode !== "none" && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <textarea
                    autoFocus
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                    placeholder={mode === "changes" ? "What should they change? Be specific — they'll see this." : "Optional: tell the creator why."}
                    className="field mt-5 resize-none"
                  />
                </motion.div>
              )}
            </AnimatePresence>
            <div className="mt-auto flex flex-wrap gap-2 pt-6">
              {mode === "none" ? (
                <>
                  <Button variant="flare" onClick={() => act("live", `Approved “${ad.title}” — it's live in the gallery.`)}><Check size={16} /> Approve &amp; publish</Button>
                  <Button variant="outline" onClick={() => setMode("changes")}><MessageSquareText size={16} /> Request changes</Button>
                  <Button variant="ghost" onClick={() => setMode("decline")}><X size={16} /> Decline</Button>
                </>
              ) : (
                <>
                  <Button variant={mode === "changes" ? "primary" : "outline"} disabled={mode === "changes" && note.trim().length < 4} onClick={() => act(mode === "changes" ? "changes_requested" : "declined", mode === "changes" ? "Sent your notes to the creator." : "Declined. The creator has been told.")}>
                    {mode === "changes" ? "Send to creator" : "Decline ad"}
                  </Button>
                  <Button variant="ghost" onClick={() => { setMode("none"); setNote(""); }}>Cancel</Button>
                </>
              )}
            </div>
          </div>
        </motion.div>
      )}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-5 py-3 text-[14px] text-bg shadow-2xl">
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Check2({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-2"><ShieldCheck size={15} className="text-mint" /> {children}</div>;
}

function BriefsTab({ briefs }: { briefs: Brief[] }) {
  if (!briefs.length)
    return (
      <Empty icon={Sparkles} title="No briefs yet" body="A brief tells creators what you need: the goal, the feel, the link, and how many ads you'll fund.">
        <ButtonLink to="/org/briefs/new" variant="flare">Post your first brief</ButtonLink>
      </Empty>
    );
  return <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{briefs.map((b, i) => <BriefCard key={b.id} b={b} i={i} />)}</div>;
}

function AdsTab({ ads }: { ads: Ad[] }) {
  if (!ads.length) return <Empty icon={Sparkles} title="Nothing live yet" body="Approved ads appear here with their performance." />;
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[720px] text-[13.5px]">
        <thead>
          <tr className="border-b border-line text-left">
            {["Ad", "Status", "Funded", "Spent", "Views", "CTR", "Creator earned"].map((h) => <th key={h} className="label px-5 py-3 font-normal">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {ads.map((a) => (
            <tr key={a.id} className="border-b border-line last:border-0 hover:bg-surface-2">
              <td className="px-5 py-3"><Link to={`/ads/${a.slug}`} className="flex items-center gap-3 font-medium"><img src={a.thumb} alt="" className="h-11 w-8 rounded object-cover" />{a.title}</Link></td>
              <td className="px-5 py-3"><StatusBadge ad={a} /></td>
              <td className="px-5 py-3 font-mono tabular">{usd(a.totals.funded)}</td>
              <td className="px-5 py-3 font-mono tabular">{usd(a.totals.spent)}</td>
              <td className="px-5 py-3 font-mono tabular">{int(a.totals.impressions)}</td>
              <td className="px-5 py-3 font-mono tabular">{pct(a.totals.ctr)}</td>
              <td className="px-5 py-3 font-mono tabular">{usd(a.totals.creatorEarned)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Empty({ icon: Icon, title, body, children }: { icon: typeof Sparkles; title: string; body: string; children?: React.ReactNode }) {
  return (
    <div className="grid place-items-center rounded-3xl border border-dashed border-line-2 px-6 py-20 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-surface-2"><Icon size={20} /></span>
      <div className="mt-4 text-[19px] font-semibold tracking-tight">{title}</div>
      <p className="mt-1 max-w-[46ch] text-[14px] text-muted">{body}</p>
      {children && <div className="mt-6 flex flex-col items-center gap-3">{children}</div>}
    </div>
  );
}

/* ----------------------------- New brief ----------------------------- */

const COVERS = ["/media/how-connect.jpg", "/media/why-community.jpg", "/media/why-creators.jpg", "/media/how-amplify.jpg", "/media/ads/first-light.jpg", "/media/ads/get-outside.jpg"];

export function NewBrief() {
  const { user, createBrief } = useStore();
  const navigate = useNavigate();
  const [f, setF] = useState({
    title: "",
    summary: "",
    brandFeel: ["Honest", "Hopeful"],
    mustInclude: ["Under 60 seconds"],
    avoid: [] as string[],
    url: "",
    label: "Learn more",
    required: true,
    fundedSlots: 25,
    seedPerAd: 1000,
    creatorFee: 100,
    deadline: "2026-12-31",
    cover: COVERS[0],
  });
  if (!user || user.role !== "org") return <Navigate to="/signin" replace />;
  const up = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const commit = f.fundedSlots * (f.seedPerAd + f.creatorFee);
  const valid = f.title.trim().length > 3 && f.summary.trim().length > 10 && f.url.includes(".");
  const org = orgById(user.orgId);

  return (
    <div className="mx-auto max-w-[1300px] px-5 pt-8 sm:px-8">
      <Link to="/org?tab=briefs" className="text-[13px] text-muted hover:text-ink">← Portal</Link>
      <h1 className="mt-4 text-[40px] font-semibold tracking-[-0.04em] sm:text-[52px]">Post a brief</h1>
      <p className="mt-2 max-w-[60ch] text-[15.5px] text-muted">It shows up publicly on Crowdi. Creators make ads for it; you review every one before anything runs.</p>
      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="space-y-8">
          <Field label="What do you want ads about?">
            <input className="field text-[17px] font-medium" placeholder="e.g. Every kid deserves a family" value={f.title} onChange={(e) => up({ title: e.target.value })} />
          </Field>
          <Field label="The brief" hint="The goal, the audience, what a great ad does.">
            <textarea className="field resize-none" rows={4} value={f.summary} onChange={(e) => up({ summary: e.target.value })} placeholder="We're looking for honest short films that…" />
          </Field>
          <Tags label="Brand feel" values={f.brandFeel} onChange={(v) => up({ brandFeel: v })} suggestions={["Cinematic", "Funny", "Raw", "Bright", "Quiet over loud", "Data-driven", "Warm"]} />
          <div className="grid gap-8 sm:grid-cols-2">
            <Tags label="Must include" values={f.mustInclude} onChange={(v) => up({ mustInclude: v })} suggestions={["Our logo", "Captions", "End card with URL"]} />
            <Tags label="Please avoid" values={f.avoid} onChange={(v) => up({ avoid: v })} suggestions={["Politics", "Competitors", "Stock footage"]} />
          </div>
          <Field label="Call to action">
            <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
              <input className="field" placeholder={org?.website || "yourorg.org/page"} value={f.url} onChange={(e) => up({ url: e.target.value })} />
              <select className="field" value={f.label} onChange={(e) => up({ label: e.target.value })}>
                {["Learn more", "Donate", "Sign up", "Shop now", "Get involved"].map((l) => <option key={l}>{l}</option>)}
              </select>
            </div>
            <label className="mt-3 flex cursor-pointer items-center gap-2.5 text-[14px]">
              <input type="checkbox" checked={f.required} onChange={(e) => up({ required: e.target.checked })} className="size-4 accent-[var(--flare)]" /> Every ad must use this link
            </label>
          </Field>
          <div>
            <div className="mb-3 text-[14px] font-medium">Budget</div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Num label="Ads you'll fund" value={f.fundedSlots} onChange={(v) => up({ fundedSlots: v })} />
              <Num label="Ad budget each" value={f.seedPerAd} onChange={(v) => up({ seedPerAd: v })} prefix="$" />
              <Num label="Paid to each picked creator" value={f.creatorFee} onChange={(v) => up({ creatorFee: v })} prefix="$" />
            </div>
          </div>
          <Field label="Deadline">
            <input type="date" className="field max-w-[240px]" value={f.deadline} onChange={(e) => up({ deadline: e.target.value })} />
          </Field>
          <Field label="Cover image">
            <div className="flex flex-wrap gap-2">
              {COVERS.map((c) => (
                <button key={c} onClick={() => up({ cover: c })} className={clsx("size-16 overflow-hidden rounded-xl border-2 transition", f.cover === c ? "border-flare" : "border-transparent opacity-70 hover:opacity-100")}>
                  <img src={c} alt="" className="size-full object-cover" />
                </button>
              ))}
            </div>
          </Field>
        </div>
        <aside>
          <div className="sticky top-24 space-y-4">
            <div className="label">Preview</div>
            <BriefCard
              b={{
                id: "preview", slug: "", orgId: user.orgId ?? "o-mine", title: f.title || "Your brief title", summary: f.summary || "Your brief summary shows here.", brandFeel: f.brandFeel, mustInclude: f.mustInclude, avoid: f.avoid,
                cta: { label: f.label, url: f.url, required: f.required }, fundedSlots: f.fundedSlots, seedPerAd: f.seedPerAd, creatorFee: f.creatorFee, deadline: f.deadline, status: "open", cover: f.cover, createdAt: "",
              }}
            />
            <div className="card p-5">
              <div className="flex items-baseline justify-between">
                <span className="text-[14px] text-muted">Total commitment</span>
                <span className="font-mono text-[24px] font-semibold">{usd(commit)}</span>
              </div>
              <p className="mt-2 text-[12.5px] text-muted">
                {f.fundedSlots} × ({usd(f.seedPerAd)} ad budget + {usd(f.creatorFee)} creator fee). You only pay for ads you approve and choose to fund.
              </p>
              <Button
                variant="flare"
                size="lg"
                className="mt-5 w-full"
                disabled={!valid}
                onClick={() => {
                  const b = createBrief({
                    orgId: user.orgId ?? "o-mine", title: f.title.trim(), summary: f.summary.trim(), brandFeel: f.brandFeel, mustInclude: f.mustInclude, avoid: f.avoid,
                    cta: { label: f.label, url: /^https?:\/\//.test(f.url) ? f.url : "https://" + f.url, required: f.required },
                    fundedSlots: f.fundedSlots, seedPerAd: f.seedPerAd, creatorFee: f.creatorFee, deadline: f.deadline, cover: f.cover,
                  });
                  navigate(`/briefs/${b.slug}`);
                }}
              >
                Publish brief <ArrowRight size={16} />
              </Button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between text-[14px] font-medium">{label}{hint && <span className="text-[12.5px] font-normal text-muted">{hint}</span>}</div>
      {children}
    </div>
  );
}

function Num({ label, value, onChange, prefix }: { label: string; value: number; onChange: (v: number) => void; prefix?: string }) {
  return (
    <label className="block rounded-2xl border border-line bg-surface p-3">
      <span className="text-[12px] text-muted">{label}</span>
      <div className="mt-1 flex items-center font-mono text-[20px] font-semibold">
        {prefix && <span className="text-muted">{prefix}</span>}
        <input type="number" min={0} value={value} onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))} className="w-full bg-transparent outline-none" />
      </div>
    </label>
  );
}

function Tags({ label, values, onChange, suggestions }: { label: string; values: string[]; onChange: (v: string[]) => void; suggestions: string[] }) {
  const [v, setV] = useState("");
  const add = (t: string) => {
    const x = t.trim();
    if (x && !values.includes(x)) onChange([...values, x]);
    setV("");
  };
  return (
    <div>
      <div className="mb-2 text-[14px] font-medium">{label}</div>
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-line bg-surface p-2">
        {values.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full bg-surface-2 py-1 pl-3 pr-1.5 text-[13px]">
            {t}
            <button onClick={() => onChange(values.filter((x) => x !== t))} className="grid size-4 place-items-center rounded-full hover:bg-line" aria-label={`Remove ${t}`}><X size={11} /></button>
          </span>
        ))}
        <input value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(v); } }} placeholder="Type and press Enter" className="min-w-[140px] flex-1 bg-transparent px-2 py-1 text-[13.5px] outline-none" />
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {suggestions.filter((s) => !values.includes(s)).map((s) => (
          <button key={s} onClick={() => add(s)} className="rounded-full border border-dashed border-line-2 px-2.5 py-0.5 text-[12px] text-muted hover:text-ink">+ {s}</button>
        ))}
      </div>
    </div>
  );
}

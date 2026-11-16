import clsx from "clsx";
import { motion } from "framer-motion";
import { ArrowRight, Banknote, CalendarDays, MessageSquareText, Plus, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { StatusBadge } from "../components/AdCard";
import { Avatar, Button, ButtonLink, CountUp, Reveal, SampleNote } from "../components/ui";
import { creatorById, orgById, TODAY } from "../data/catalog";
import { SPLIT } from "../data/types";
import { compact, pct, usd } from "../lib/format";
import { useStore } from "../lib/store";
import { Empty } from "./OrgPortal";

const MIN_PAYOUT = 25;

export default function Studio() {
  const { user, ads, setPayouts } = useStore();
  const [connecting, setConnecting] = useState(false);
  const mine = useMemo(() => ads.filter((a) => user && a.creatorId === (user.creatorId ?? "me")), [ads, user]);

  const monthly = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of mine) for (const p of a.series) {
      const k = p.date.slice(0, 7);
      m.set(k, (m.get(k) ?? 0) + (p.crowd + p.org) * SPLIT.creator);
    }
    return [...m.entries()].sort().map(([k, v]) => ({ month: k, label: new Date(k + "-15").toLocaleDateString("en-US", { month: "short" }), earned: Math.round(v * 100) / 100 }));
  }, [mine]);

  if (!user) return <Navigate to="/signin" replace />;
  if (user.role === "org") return <Navigate to="/org" replace />;

  const creator = creatorById(user.creatorId ?? "me");
  const lifetime = mine.reduce((s, a) => s + a.totals.creatorEarned, 0);
  const thisMonth = monthly.find((m) => m.month === TODAY.slice(0, 7))?.earned ?? 0;
  const paid = lifetime - thisMonth;
  const nextPayout = "December 1";

  return (
    <div className="mx-auto max-w-[1440px] px-5 pt-8 sm:px-8">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-4">
          <Avatar creator={creator} size={56} />
          <div>
            <div className="label">Creator studio</div>
            <h1 className="mt-1 text-[32px] font-semibold tracking-[-0.035em] sm:text-[40px]">Hey, {user.name.split(" ")[0]}</h1>
          </div>
        </div>
        <ButtonLink to="/create" variant="flare"><Plus size={16} /> Make an ad</ButtonLink>
      </div>

      {user.payouts !== "connected" && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mt-6 flex flex-col gap-3 rounded-2xl border border-gold/30 bg-gold/8 p-4 text-[14px] sm:flex-row sm:items-center">
          <Banknote size={18} className="text-gold" />
          <span><span className="font-medium">Connect payouts to get paid.</span> <span className="text-muted">Your earnings are safe and waiting until you do.</span></span>
          <Button size="sm" className="!bg-[#635BFF] !text-white sm:ml-auto" disabled={connecting} onClick={() => { setConnecting(true); setTimeout(() => setPayouts("connected"), 1400); }}>
            {connecting ? "Opening Stripe…" : "Connect with Stripe"}
          </Button>
        </motion.div>
      )}

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <Reveal>
          <div className="relative overflow-hidden rounded-[24px] bg-ink p-6 text-bg">
            <div className="label !text-bg/50">Lifetime earnings</div>
            <div className="mt-2 text-[44px] font-semibold tracking-[-0.04em]"><CountUp value={lifetime} format={(n) => usd(n, true)} /></div>
            <div className="mt-1 text-[13px] opacity-60">7.5% of {usd(lifetime / SPLIT.creator)} raised across {mine.filter((a) => a.series.length).length} ads</div>
            <div className="absolute -right-8 -top-8 size-32 rounded-full bg-flare/30 blur-2xl" />
          </div>
        </Reveal>
        <Reveal delay={0.05}>
          <div className="card h-full p-6">
            <div className="label flex items-center gap-1.5"><CalendarDays size={13} /> Next payout · {nextPayout}</div>
            <div className="mt-2 text-[36px] font-semibold tracking-[-0.04em]"><CountUp value={thisMonth} format={(n) => usd(n, true)} /></div>
            <div className="mt-1 text-[13px] text-muted">
              {thisMonth >= MIN_PAYOUT ? (user.payouts === "connected" ? "Goes to your bank via Stripe" : "Connect payouts to receive it") : `Rolls over until you reach ${usd(MIN_PAYOUT)}`}
            </div>
          </div>
        </Reveal>
        <Reveal delay={0.1}>
          <div className="card h-full p-6">
            <div className="label">Already paid out</div>
            <div className="mt-2 text-[36px] font-semibold tracking-[-0.04em]"><CountUp value={paid} format={(n) => usd(n, true)} /></div>
            <div className="mt-1 text-[13px] text-muted">{user.payouts === "connected" ? "Payouts connected ✓" : "Payouts not connected"}</div>
          </div>
        </Reveal>
      </div>

      {mine.length === 0 ? (
        <div className="mt-10">
          <Empty icon={Sparkles} title="Your first ad is one upload away" body="Make an ad for a cause you care about or answer an open brief. You'll earn 7.5% of every dollar it raises.">
            <ButtonLink to="/create" variant="flare">Make an ad</ButtonLink>
            <Link to="/briefs" className="text-[13.5px] text-muted hover:text-ink">or browse open briefs →</Link>
          </Empty>
        </div>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.4fr]">
          <div className="card p-6">
            <h2 className="text-[20px] font-semibold tracking-tight">Earnings by month</h2>
            <div className="mt-6 h-[240px]">
              {monthly.length ? (
                <ResponsiveContainer>
                  <BarChart data={monthly}>
                    <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 4" />
                    <XAxis dataKey="label" stroke="var(--muted)" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="var(--muted)" fontSize={11} tickLine={false} axisLine={false} width={40} tickFormatter={(v) => "$" + v} />
                    <Tooltip cursor={{ fill: "var(--surface-2)" }} contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, fontSize: 12 }} formatter={(v) => [usd(Number(v), true), "Earned"]} />
                    <Bar dataKey="earned" fill="var(--flare)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="grid h-full place-items-center text-[14px] text-muted">Earnings show up once your first ad goes live.</div>
              )}
            </div>
            <div className="mt-2 flex justify-end"><SampleNote /></div>
          </div>
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-6 py-4">
              <h2 className="text-[20px] font-semibold tracking-tight">Your ads</h2>
              <span className="text-[13px] text-muted">{mine.length} total</span>
            </div>
            <div>
              {mine.map((a, i) => (
                <motion.div key={a.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                  <Link to={a.status === "live" || a.status === "archived" ? `/ads/${a.slug}` : "#"} className="flex items-center gap-4 border-b border-line px-6 py-4 last:border-0 hover:bg-surface-2">
                    <img src={a.thumb} alt="" className="h-16 w-12 rounded-lg object-cover" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-medium">{a.title}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
                        <StatusBadge ad={a} /> {orgById(a.orgId)?.name ?? "Grassroots"}
                      </div>
                      {a.status === "changes_requested" && a.reviewNote && (
                        <div className="mt-2 flex gap-1.5 text-[12.5px] text-violet"><MessageSquareText size={13} className="mt-0.5 shrink-0" /> {a.reviewNote}</div>
                      )}
                    </div>
                    <div className={clsx("hidden text-right sm:block", !a.series.length && "opacity-40")}>
                      <div className="font-mono text-[15px] font-medium">{usd(a.totals.creatorEarned, true)}</div>
                      <div className="font-mono text-[11.5px] text-muted">{compact(a.totals.impressions)} views · {pct(a.totals.ctr, 1)}</div>
                    </div>
                    <ArrowRight size={15} className="text-muted" />
                  </Link>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

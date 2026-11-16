import clsx from "clsx";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, BadgeCheck, CalendarClock, Check, Link2, X } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { AdCard } from "../components/AdCard";
import { Badge, ButtonLink, OrgMark, Reveal, Segmented } from "../components/ui";
import { orgById, TODAY } from "../data/catalog";
import type { Brief } from "../data/types";
import { daysBetween, longDate, usd } from "../lib/format";
import { useStore } from "../lib/store";
import { useState } from "react";

export function BriefCard({ b, i = 0 }: { b: Brief; i?: number }) {
  const { ads } = useStore();
  const org = orgById(b.orgId);
  const subs = ads.filter((a) => a.briefId === b.id).length;
  const left = daysBetween(TODAY, b.deadline);
  return (
    <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}>
      <Link to={`/briefs/${b.slug}`} className="group card flex h-full flex-col overflow-hidden transition duration-500 hover:-translate-y-1 hover:shadow-2xl">
        <div className="relative h-44 overflow-hidden">
          <img src={b.cover} alt="" className="size-full object-cover transition duration-700 group-hover:scale-105" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
          <div className="absolute left-4 top-4">{b.status === "open" ? <Badge tone="live" className="!bg-black/40 !text-white backdrop-blur-md">Open</Badge> : <Badge className="!border-white/20 !bg-black/40 !text-white/80 backdrop-blur-md">Closed</Badge>}</div>
          <div className="absolute bottom-4 left-4 right-4 flex items-center gap-2 text-white">
            <OrgMark org={org} size={26} />
            <span className="text-[13px] font-medium">{org?.name}</span>
            {org?.verified && <BadgeCheck size={14} />}
          </div>
        </div>
        <div className="flex flex-1 flex-col p-5">
          <h3 className="text-[21px] font-semibold leading-tight tracking-[-0.02em]">{b.title}</h3>
          <p className="mt-2 line-clamp-2 text-[14px] text-muted">{b.summary}</p>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {b.brandFeel.slice(0, 3).map((t) => <span key={t} className="rounded-full bg-surface-2 px-2.5 py-1 text-[12px] text-ink-2">{t}</span>)}
          </div>
          <div className="mt-auto grid grid-cols-3 gap-2 border-t border-line pt-4 text-[12px]">
            <div><div className="font-mono text-[15px] font-semibold text-ink">{b.fundedSlots}</div><div className="text-muted">ads funded</div></div>
            <div><div className="font-mono text-[15px] font-semibold text-ink">{usd(b.seedPerAd)}</div><div className="text-muted">ad budget each</div></div>
            <div><div className="font-mono text-[15px] font-semibold text-ink">{b.status === "open" ? `${left}d` : subs}</div><div className="text-muted">{b.status === "open" ? "left" : "submitted"}</div></div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

export default function Briefs() {
  const { briefs } = useStore();
  const [tab, setTab] = useState<"open" | "closed">("open");
  const list = briefs.filter((b) => b.status === tab);
  const pot = briefs.filter((b) => b.status === "open").reduce((s, b) => s + b.fundedSlots * (b.seedPerAd + b.creatorFee), 0);
  return (
    <div className="mx-auto max-w-[1440px] px-5 sm:px-8">
      <section className="pb-10 pt-10 sm:pt-16">
        <div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
          <Reveal>
            <div className="label mb-4">Briefs · requests for ads</div>
            <h1 className="max-w-[16ch] text-[44px] font-semibold leading-[0.95] tracking-[-0.045em] sm:text-[72px]">
              Organizations want <span className="font-serif font-normal italic text-flare">your</span> ad.
            </h1>
            <p className="mt-5 max-w-[56ch] text-[16px] text-muted">
              Each brief says what an organization is looking for. Make an ad for it. If they pick yours, they put real budget behind it and you get paid up front — then 7.5% of everything it raises.
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="card p-5">
              <div className="label">Up for grabs right now</div>
              <div className="mt-1 text-[40px] font-semibold tracking-[-0.04em]">{usd(pot)}</div>
              <div className="text-[13px] text-muted">in ad budget and creator fees across open briefs</div>
            </div>
          </Reveal>
        </div>
      </section>
      <div className="mb-6 flex items-center justify-between">
        <Segmented value={tab} onChange={setTab} options={[{ value: "open", label: "Open" }, { value: "closed", label: "Closed" }]} />
        <ButtonLink to="/organizations" variant="outline" size="sm">Post a brief</ButtonLink>
      </div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((b, i) => <BriefCard key={b.id} b={b} i={i} />)}
      </div>
    </div>
  );
}

export function BriefDetail() {
  const { slug } = useParams();
  const { briefs, ads } = useStore();
  const b = briefs.find((x) => x.slug === slug);
  if (!b)
    return (
      <div className="grid place-items-center py-32 text-center">
        <h1 className="text-3xl font-semibold">Brief not found</h1>
        <Link to="/briefs" className="mt-4 underline underline-offset-4">All briefs</Link>
      </div>
    );
  const org = orgById(b.orgId);
  const made = ads.filter((a) => a.briefId === b.id && (a.status === "live" || a.status === "archived"));
  const left = daysBetween(TODAY, b.deadline);
  return (
    <div className="mx-auto max-w-[1440px] px-5 pt-6 sm:px-8">
      <Link to="/briefs" className="group inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink">
        <ArrowLeft size={14} className="transition group-hover:-translate-x-0.5" /> All briefs
      </Link>
      <div className="relative mt-6 h-[300px] overflow-hidden rounded-[32px] sm:h-[380px]">
        <motion.img initial={{ scale: 1.1 }} animate={{ scale: 1 }} transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1] }} src={b.cover} alt="" className="size-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-black/10" />
        <div className="absolute inset-x-6 bottom-6 text-white sm:inset-x-10 sm:bottom-10">
          <div className="flex items-center gap-2 text-[14px]">
            <OrgMark org={org} size={28} /> {org?.name} {org?.verified && <BadgeCheck size={15} />}
          </div>
          <h1 className="mt-3 text-[40px] font-semibold leading-[0.95] tracking-[-0.045em] sm:text-[68px]">{b.title}</h1>
        </div>
      </div>

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div>
          <Reveal>
            <p className="text-[20px] leading-relaxed text-ink-2">{b.summary}</p>
          </Reveal>
          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            <Reveal><List title="Brand feel" items={b.brandFeel} chips /></Reveal>
            <Reveal delay={0.05}><List title="Must include" items={b.mustInclude} icon="check" /></Reveal>
            <Reveal delay={0.1}><List title="Please avoid" items={b.avoid} icon="x" /></Reveal>
            <Reveal delay={0.15}>
              <div>
                <div className="label mb-3">Call to action</div>
                <div className="card flex items-center gap-3 p-4">
                  <Link2 size={16} className="text-muted" />
                  <div>
                    <div className="text-[14.5px] font-medium">{b.cta.label}</div>
                    <div className="text-[12.5px] text-muted">{b.cta.url.replace(/^https?:\/\//, "")} · {b.cta.required ? "required" : "suggested"}</div>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
        <aside>
          <div className="card sticky top-24 p-6">
            <div className="grid grid-cols-2 gap-4">
              <Big label="Ads they'll fund" value={String(b.fundedSlots)} />
              <Big label="Ad budget each" value={usd(b.seedPerAd)} />
              <Big label="Paid to you if picked" value={usd(b.creatorFee)} />
              <Big label="Then you earn" value="7.5%" />
            </div>
            <div className={clsx("mt-5 flex items-center gap-2 rounded-xl p-3 text-[13.5px]", b.status === "open" ? "bg-mint/10 text-mint" : "bg-surface-2 text-muted")}>
              <CalendarClock size={16} />
              {b.status === "open" ? `${left} days left · closes ${longDate(b.deadline)}` : `Closed ${longDate(b.deadline)}`}
            </div>
            {b.status === "open" ? (
              <ButtonLink to={`/create?brief=${b.slug}`} variant="flare" size="lg" className="mt-5 w-full">
                Make an ad for this brief <ArrowRight size={16} />
              </ButtonLink>
            ) : (
              <ButtonLink to="/briefs" variant="outline" size="lg" className="mt-5 w-full">See open briefs</ButtonLink>
            )}
            <p className="mt-3 text-center text-[12px] text-muted">{org?.name} reviews every submission in their portal.</p>
          </div>
        </aside>
      </div>

      {made.length > 0 && (
        <section className="mt-20">
          <h2 className="mb-6 text-[28px] font-semibold tracking-[-0.03em]">Made for this brief</h2>
          <div className="grid grid-cols-1 gap-5 min-[520px]:grid-cols-2 lg:grid-cols-4">
            {made.map((a, i) => <AdCard key={a.id} ad={a} index={i} />)}
          </div>
        </section>
      )}
    </div>
  );
}

function List({ title, items, icon, chips }: { title: string; items: string[]; icon?: "check" | "x"; chips?: boolean }) {
  return (
    <div>
      <div className="label mb-3">{title}</div>
      {chips ? (
        <div className="flex flex-wrap gap-2">{items.map((t) => <span key={t} className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-[13.5px]">{t}</span>)}</div>
      ) : (
        <ul className="space-y-2.5">
          {items.map((t) => (
            <li key={t} className="flex gap-2.5 text-[14.5px]">
              {icon === "x" ? <X size={16} className="mt-0.5 shrink-0 text-flare" /> : <Check size={16} className="mt-0.5 shrink-0 text-mint" />} {t}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Big({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="label !text-[10px]">{label}</div>
      <div className="mt-1 text-[24px] font-semibold tracking-[-0.03em]">{value}</div>
    </div>
  );
}

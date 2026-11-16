import clsx from "clsx";
import { AnimatePresence, LayoutGroup, motion, useMotionValueEvent, useScroll, useSpring, useTransform, type MotionValue } from "framer-motion";
import Lenis from "lenis";
import { ArrowRight, ArrowUpRight, Hand, Plus } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Avatar, ButtonLink, CountUp, Logo, OrgMark } from "../components/ui";
import { creatorOf, orgById } from "../data/catalog";
import { SPLIT, type Ad } from "../data/types";
import type { WallHover } from "../home/AdWall";
import { compact, usd } from "../lib/format";
import { useStore } from "../lib/store";
import { last7 } from "./Explore";

const AdWall = lazy(() => import("../home/AdWall"));
const ease = [0.16, 1, 0.3, 1] as const;

export default function Home() {
  const { ads } = useStore();
  const publicAds = useMemo(() => ads.filter((a) => a.status === "live" || a.status === "archived"), [ads]);
  const totals = useMemo(
    () => ({
      funded: publicAds.reduce((s, a) => s + a.totals.funded, 0),
      earned: publicAds.reduce((s, a) => s + a.totals.creatorEarned, 0),
      views: publicAds.reduce((s, a) => s + a.totals.impressions, 0),
      live: publicAds.filter((a) => a.status === "live").length,
    }),
    [publicAds],
  );

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({ lerp: 0.1 });
    let id = 0;
    const raf = (t: number) => {
      lenis.raf(t);
      id = requestAnimationFrame(raf);
    };
    id = requestAnimationFrame(raf);
    return () => {
      cancelAnimationFrame(id);
      lenis.destroy();
    };
  }, []);

  return (
    <div className="dark grain min-h-dvh bg-[#0A0A0A] text-[#F2F0EA] [--bg:#0a0a0a]">
      <Hero ads={publicAds} totals={totals} />
      <Ticker totals={totals} />
      <Manifesto />
      <HowItWorks ads={publicAds} />
      <Split ads={publicAds} />
      <TheRace ads={publicAds} />
      <ForOrganizations ads={publicAds} />
      <Spotlight ad={publicAds.find((a) => a.slug === "the-girl-in-the-middle")} />
      <FinalCta />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function HomeNav() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center gap-6 px-5 py-5 sm:px-8">
      <Link to="/" className="pointer-events-auto text-[24px] text-white">
        <Logo />
      </Link>
      <div className="hidden flex-1 justify-center gap-24 font-mono text-[11px] uppercase tracking-[0.18em] text-white/55 lg:flex">
        <span>Crowd-made ads®</span>
        <span>Crowd-funded reach</span>
      </div>
      <nav className="pointer-events-auto ml-auto flex items-center gap-1 text-[13.5px] font-medium lg:ml-0">
        <Link to="/explore" className="hidden rounded-full px-3.5 py-2 text-white/75 transition hover:text-white sm:block">Explore</Link>
        <Link to="/briefs" className="hidden rounded-full px-3.5 py-2 text-white/75 transition hover:text-white sm:block">Briefs</Link>
        <Link to="/organizations" className="hidden rounded-full px-3.5 py-2 text-white/75 transition hover:text-white md:block">Organizations</Link>
        <Link to="/signin" className="rounded-full px-3.5 py-2 text-white/75 transition hover:text-white">Sign in</Link>
        <Link to="/create" className="ml-1 inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-4 text-black transition hover:bg-[#FF5A1F] hover:text-white">
          <Plus size={15} strokeWidth={2.5} /> Make an ad
        </Link>
      </nav>
    </div>
  );
}

function Hero({ ads, totals }: { ads: Ad[]; totals: { funded: number; live: number } }) {
  const navigate = useNavigate();
  const [hover, setHover] = useState<WallHover>({ ad: null, x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [hinted, setHinted] = useState(false);
  const lastAd = useRef<Ad | null>(null);
  const onHover = (h: WallHover) => {
    if (h.ad !== lastAd.current || h.ad) {
      lastAd.current = h.ad;
      setHover(h);
    }
  };
  return (
    <section className="relative h-[100svh] min-h-[640px] overflow-hidden">
      <Suspense fallback={null}>
        <AdWall
          ads={ads}
          onHover={onHover}
          onOpen={(ad) => navigate(`/ads/${ad.slug}`)}
          onDragChange={(d) => {
            setDragging(d);
            if (d) setHinted(true);
          }}
        />
      </Suspense>
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(10,10,10,0.75)_0%,rgba(10,10,10,0)_22%,rgba(10,10,10,0)_45%,rgba(10,10,10,0.92)_100%)]" />
      <HomeNav />

      {/* hover label */}
      <AnimatePresence>
        {hover.ad && !dragging && (
          <motion.div
            key={hover.ad.id}
            initial={{ opacity: 0, scale: 0.9, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="pointer-events-none absolute z-30 hidden w-[230px] rounded-2xl border border-white/10 bg-black/70 p-3.5 backdrop-blur-xl md:block"
            style={{ left: Math.min(hover.x + 22, window.innerWidth - 260), top: hover.y + 22 }}
          >
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/50">{orgById(hover.ad.orgId)?.name ?? "Grassroots · " + hover.ad.category}</div>
            <div className="mt-1 text-[16px] font-semibold leading-tight">{hover.ad.title}</div>
            <div className="mt-2.5 flex items-center justify-between font-mono text-[11.5px]">
              <span className="text-[#FF5A1F]">{usd(hover.ad.totals.funded)} raised</span>
              <span className="text-white/60">{compact(hover.ad.totals.impressions)} views</span>
            </div>
            <div className="mt-2.5 flex items-center gap-1 text-[11.5px] text-white/50">Click to watch <ArrowUpRight size={12} /></div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-5 pb-8 sm:px-8 sm:pb-10">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <motion.h1
              initial="hidden"
              animate="show"
              variants={{ show: { transition: { staggerChildren: 0.08, delayChildren: 0.35 } } }}
              className="text-[clamp(48px,9vw,148px)] font-semibold leading-[0.86] tracking-[-0.055em]"
            >
              {["Ads made", "by the crowd,"].map((line) => (
                <span key={line} className="block overflow-hidden pb-[0.04em]">
                  <motion.span className="block" variants={{ hidden: { y: "105%" }, show: { y: 0, transition: { duration: 1.1, ease } } }}>
                    {line}
                  </motion.span>
                </span>
              ))}
              <span className="block overflow-hidden pb-[0.06em]">
                <motion.span className="block font-serif font-normal italic tracking-[-0.03em] text-[#FF5A1F]" variants={{ hidden: { y: "105%" }, show: { y: 0, transition: { duration: 1.1, ease } } }}>
                  for the crowd.
                </motion.span>
              </span>
            </motion.h1>
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.0, duration: 0.9, ease }} className="pointer-events-auto mt-7 flex flex-wrap items-center gap-3">
              <Link to="/create" className="group inline-flex h-12 items-center gap-2 rounded-full bg-[#FF5A1F] px-6 text-[15px] font-medium text-white shadow-[0_10px_40px_-10px_#FF5A1F] transition hover:brightness-110">
                Make an ad <ArrowRight size={16} className="transition group-hover:translate-x-0.5" />
              </Link>
              <Link to="/explore" className="inline-flex h-12 items-center gap-2 rounded-full border border-white/25 px-6 text-[15px] font-medium text-white backdrop-blur-md transition hover:border-white/60 hover:bg-white/5">
                Watch {totals.live} live ads
              </Link>
            </motion.div>
          </div>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.3, duration: 1 }} className="max-w-[340px] lg:text-right">
            <p className="text-[15px] leading-relaxed text-white/70">
              Anyone can make an ad. Anyone can fund one. Crowdi runs it on TikTok — and the creator earns from every dollar it raises.
            </p>
            <div className="mt-5 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-white/45 lg:justify-end">
              <motion.span animate={hinted ? { opacity: 0.3 } : { x: [0, 8, 0] }} transition={hinted ? {} : { repeat: Infinity, duration: 1.8 }} className="inline-flex">
                <Hand size={14} />
              </motion.span>
              Drag to explore · {usd(totals.funded)} raised
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function Ticker({ totals }: { totals: { funded: number; earned: number; views: number; live: number } }) {
  const items = [
    `${usd(totals.funded)} raised for ads`,
    `${totals.live} ads live`,
    `${usd(totals.earned)} paid to creators`,
    `${compact(totals.views)} views`,
    "90% straight to ad spend",
    "No agency. No guesswork.",
  ];
  const row = [...items, ...items];
  return (
    <div className="overflow-hidden border-y border-white/10 py-5">
      <div className="flex w-max animate-marquee gap-12 whitespace-nowrap font-mono text-[13px] uppercase tracking-[0.16em] text-white/60">
        {row.map((t, i) => (
          <span key={i} className="flex items-center gap-12">
            {t} <span className="size-1.5 rounded-full bg-[#FF5A1F]" />
          </span>
        ))}
      </div>
    </div>
  );
}

function Word({ children, progress, range }: { children: string; progress: MotionValue<number>; range: [number, number] }) {
  const opacity = useTransform(progress, range, [0.14, 1]);
  return <motion.span style={{ opacity }} className="mr-[0.24em] inline-block">{children}</motion.span>;
}

function Manifesto() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.85", "end 0.45"] });
  const text = "Brands spend billions guessing which ad will work. Causes can't afford to guess at all. We think the crowd already knows — so we let it make the ads, fund the ads, and pick the winners.";
  const words = text.split(" ");
  return (
    <section ref={ref} className="mx-auto max-w-[1280px] px-5 py-32 sm:px-8 sm:py-44">
      <div className="mb-10 font-mono text-[11px] uppercase tracking-[0.18em] text-white/45">(01) Why Crowdi</div>
      <p className="text-[clamp(30px,4.6vw,68px)] font-medium leading-[1.04] tracking-[-0.035em]">
        {words.map((w, i) => (
          <Word key={i} progress={scrollYProgress} range={[i / words.length, Math.min(1, (i + 3) / words.length)]}>
            {w}
          </Word>
        ))}
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function HowItWorks({ ads }: { ads: Ad[] }) {
  const sample = ads.find((a) => a.slug === "adopt-dont-shop") ?? ads[0];
  return (
    <section className="mx-auto max-w-[1440px] px-5 pb-32 sm:px-8">
      <div className="mb-12 flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <div>
          <div className="mb-5 font-mono text-[11px] uppercase tracking-[0.18em] text-white/45">(02) How it works</div>
          <h2 className="max-w-[16ch] text-[clamp(38px,5vw,76px)] font-semibold leading-[0.92] tracking-[-0.045em]">
            Three steps. <span className="font-serif font-normal italic text-white/60">Zero gatekeepers.</span>
          </h2>
        </div>
        <p className="max-w-[38ch] text-[15px] leading-relaxed text-white/60">If it's for an organization, they approve it first. If it's for a cause with no link, it runs as soon as people fund it.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <StepCard n="01" title="Make the ad" body="Shoot it on your phone. Upload it, pick who it's for, add a link if you want one. Two minutes, tops.">
          <div className="relative mx-auto h-[300px] w-[168px] overflow-hidden rounded-[26px] border-[5px] border-white/10 bg-black shadow-2xl">
            {sample && <video src={sample.video} poster={sample.poster} autoPlay muted loop playsInline className="size-full object-cover" />}
            <div className="absolute left-1/2 top-1.5 h-4 w-14 -translate-x-1/2 rounded-full bg-black" />
          </div>
        </StepCard>
        <StepCard n="02" title="The crowd funds it" body="Anyone can chip in — no account needed. 90% of every dollar buys reach for that exact ad.">
          <DonationStream />
        </StepCard>
        <StepCard n="03" title="It runs. You earn." body="We buy the TikTok placement, track every view and click in public, and pay the creator 7.5% monthly.">
          <MiniBars />
        </StepCard>
      </div>
    </section>
  );
}

function StepCard({ n, title, body, children }: { n: string; title: string; body: string; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 1, ease, delay: Number(n) * 0.08 }}
      className="group relative overflow-hidden rounded-[28px] border border-white/10 bg-[#121213] p-6 sm:p-7"
    >
      <div className="flex items-start justify-between">
        <span className="font-mono text-[12px] text-white/40">{n}</span>
        <span className="size-2 rounded-full bg-[#FF5A1F] opacity-0 transition group-hover:opacity-100" />
      </div>
      <div className="grid h-[340px] place-items-center">{children}</div>
      <h3 className="text-[26px] font-semibold tracking-[-0.03em]">{title}</h3>
      <p className="mt-2 text-[14.5px] leading-relaxed text-white/55">{body}</p>
    </motion.div>
  );
}

const NAMES = ["Maya", "Dev", "Grandma Jo", "Luis", "Anon", "Priya", "Coach K", "Tess", "Omar", "Bea", "Hank", "Lin"];
function DonationStream() {
  const [items, setItems] = useState<{ id: number; name: string; amt: number }[]>([]);
  useEffect(() => {
    let id = 0;
    const add = () => {
      id++;
      setItems((xs) => [{ id, name: NAMES[id % NAMES.length], amt: [5, 10, 25, 20, 50, 15, 100][id % 7] }, ...xs].slice(0, 5));
    };
    add();
    const t = setInterval(add, 1400);
    return () => clearInterval(t);
  }, []);
  const total = items.reduce((s, x) => s + x.amt, 0);
  return (
    <div className="w-full max-w-[280px]">
      <div className="mb-3 flex items-baseline justify-between">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-white/40">Funding now</span>
        <span className="font-mono text-[20px] font-medium tabular text-[#FF5A1F]">+{usd(total)}</span>
      </div>
      <div className="relative h-[250px] overflow-hidden [mask-image:linear-gradient(to_bottom,black_60%,transparent)]">
        <LayoutGroup>
          <AnimatePresence initial={false}>
            {items.map((x) => (
              <motion.div
                layout
                key={x.id}
                initial={{ opacity: 0, y: -24, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 28 }}
                className="mb-2 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5"
              >
                <span className="grid size-8 place-items-center rounded-full bg-white/10 text-[12px] font-semibold">{x.name[0]}</span>
                <span className="text-[13.5px] text-white/80">{x.name}</span>
                <span className="ml-auto font-mono text-[13.5px] font-medium">${x.amt}</span>
              </motion.div>
            ))}
          </AnimatePresence>
        </LayoutGroup>
      </div>
    </div>
  );
}

function MiniBars() {
  const bars = [18, 26, 22, 34, 41, 38, 52, 49, 63, 71, 66, 84];
  return (
    <div className="w-full max-w-[290px]">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-white/40">Views this week</span>
        <span className="font-mono text-[20px] font-medium">
          <CountUp value={48210} />
        </span>
      </div>
      <div className="mt-5 flex h-[170px] items-end gap-1.5">
        {bars.map((h, i) => (
          <motion.div
            key={i}
            initial={{ height: 0 }}
            whileInView={{ height: `${h}%` }}
            viewport={{ once: true }}
            transition={{ duration: 1, delay: i * 0.05, ease }}
            className={clsx("flex-1 rounded-t-md", i === bars.length - 1 ? "bg-[#FF5A1F]" : "bg-white/15")}
          />
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-[13px]">
        <span className="text-white/60">Your cut this month</span>
        <span className="font-mono font-medium text-[#FF5A1F]">
          <CountUp value={412.5} format={(n) => usd(n, true)} />
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Split({ ads }: { ads: Ad[] }) {
  const [amount, setAmount] = useState(100);
  const live = ads.filter((a) => a.status === "live");
  const cpv = live.reduce((s, a) => s + a.totals.spent, 0) / Math.max(1, live.reduce((s, a) => s + a.totals.impressions, 0));
  const spring = useSpring(amount, { stiffness: 120, damping: 20 });
  useEffect(() => { spring.set(amount); }, [amount, spring]);
  const [shown, setShown] = useState(amount);
  useMotionValueEvent(spring, "change", (v) => setShown(v));
  const parts = [
    { label: "Buys the ad on TikTok", pct: SPLIT.adSpend, color: "#F2F0EA" },
    { label: "Goes to the creator", pct: SPLIT.creator, color: "#FF5A1F" },
    { label: "Keeps Crowdi running", pct: SPLIT.platform, color: "#6b6a66" },
  ];
  return (
    <section className="border-y border-white/10 bg-[#0E0E0F]">
      <div className="mx-auto grid max-w-[1440px] gap-14 px-5 py-28 sm:px-8 lg:grid-cols-2 lg:py-36">
        <div>
          <div className="mb-5 font-mono text-[11px] uppercase tracking-[0.18em] text-white/45">(03) Where every dollar goes</div>
          <h2 className="text-[clamp(38px,5vw,76px)] font-semibold leading-[0.92] tracking-[-0.045em]">
            Ninety cents of every dollar <span className="font-serif font-normal italic text-[#FF5A1F]">is reach.</span>
          </h2>
          <p className="mt-6 max-w-[44ch] text-[15.5px] leading-relaxed text-white/60">
            The money never sits in a nonprofit's bank account or a brand's budget meeting. It goes to the ad you picked, on the platform, today. Every dollar is tracked in public.
          </p>
          <div className="mt-10">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/45">If you give</span>
              <span className="font-mono text-[44px] font-medium leading-none tabular">{usd(shown)}</span>
            </div>
            <input
              type="range"
              min={5}
              max={1000}
              step={5}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="mt-6 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-[#FF5A1F] [&::-webkit-slider-thumb]:size-6 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-4 [&::-webkit-slider-thumb]:border-[#0E0E0F] [&::-webkit-slider-thumb]:bg-[#FF5A1F] [&::-webkit-slider-thumb]:shadow-[0_0_0_2px_#FF5A1F]"
              aria-label="Amount"
            />
          </div>
        </div>
        <div className="flex flex-col justify-end">
          <div className="flex h-24 overflow-hidden rounded-3xl">
            {parts.map((p) => (
              <motion.div key={p.label} style={{ width: `${p.pct * 100}%`, background: p.color }} className="h-full first:rounded-l-3xl last:rounded-r-3xl" initial={{ scaleY: 0 }} whileInView={{ scaleY: 1 }} viewport={{ once: true }} transition={{ duration: 0.9, ease }} />
            ))}
          </div>
          <div className="mt-8 divide-y divide-white/10 border-y border-white/10">
            {parts.map((p) => (
              <div key={p.label} className="flex items-center gap-4 py-5">
                <span className="size-3 rounded-full" style={{ background: p.color }} />
                <span className="text-[16px] text-white/75">{p.label}</span>
                <span className="ml-auto font-mono text-[13px] text-white/40">{(p.pct * 100).toFixed(1)}%</span>
                <span className="w-[120px] text-right font-mono text-[26px] font-medium tabular">{usd(shown * p.pct, true)}</span>
              </div>
            ))}
          </div>
          <p className="mt-6 font-mono text-[12.5px] text-white/50">
            ≈ <span className="text-white">{compact((shown * SPLIT.adSpend) / Math.max(cpv, 0.0001))}</span> more views at today's average cost on Crowdi
          </p>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function TheRace({ ads }: { ads: Ad[] }) {
  const live = useMemo(() => ads.filter((a) => a.status === "live"), [ads]);
  const [bump, setBump] = useState<Record<string, number>>({});
  useEffect(() => {
    const t = setInterval(() => {
      const top = [...live].sort((a, b) => last7(b) - last7(a)).slice(0, 8);
      const pick = top[Math.floor(Math.random() * top.length)];
      if (pick) setBump((b) => ({ ...b, [pick.id]: (b[pick.id] ?? 0) + 40 + Math.round(Math.random() * 180) }));
    }, 1600);
    return () => clearInterval(t);
  }, [live]);
  const score = (a: Ad) => last7(a) + (bump[a.id] ?? 0);
  const ranked = [...live].sort((a, b) => score(b) - score(a)).slice(0, 6);
  const max = Math.max(1, ...ranked.map(score));
  return (
    <section className="mx-auto max-w-[1440px] px-5 py-32 sm:px-8 sm:py-40">
      <div className="grid gap-14 lg:grid-cols-[1fr_1.3fr]">
        <div>
          <div className="mb-5 font-mono text-[11px] uppercase tracking-[0.18em] text-white/45">(04) The infinite race</div>
          <h2 className="text-[clamp(38px,5vw,76px)] font-semibold leading-[0.92] tracking-[-0.045em]">
            The leaderboard <span className="font-serif font-normal italic text-white/60">never</span> ends.
          </h2>
          <p className="mt-6 max-w-[40ch] text-[15.5px] leading-relaxed text-white/60">
            Rankings move every time someone gives. The ads people actually believe in rise, get more reach, and earn their makers more. No judges, no prize rounds — just a race that keeps running.
          </p>
          <Link to="/explore?view=race" className="mt-8 inline-flex items-center gap-2 text-[15px] font-medium text-white underline decoration-white/30 underline-offset-[6px] transition hover:decoration-[#FF5A1F]">
            See the full race <ArrowRight size={16} />
          </Link>
        </div>
        <div className="rounded-[28px] border border-white/10 bg-[#121213] p-3 sm:p-4">
          <div className="flex items-center justify-between px-3 pb-3 pt-1 font-mono text-[11px] uppercase tracking-[0.14em] text-white/40">
            <span className="flex items-center gap-2"><span className="size-1.5 animate-pulse-dot rounded-full bg-[#3BF0B4]" /> Live · funded last 7 days</span>
            <span>Sample</span>
          </div>
          <LayoutGroup>
            {ranked.map((ad, i) => {
              const c = creatorOf(ad);
              return (
                <motion.div layout key={ad.id} transition={{ type: "spring", stiffness: 260, damping: 30 }}>
                  <Link to={`/ads/${ad.slug}`} className="flex items-center gap-3 rounded-2xl px-3 py-3 transition hover:bg-white/[0.04] sm:gap-4">
                    <span className={clsx("w-7 font-mono text-[15px] font-semibold tabular", i === 0 ? "text-[#FF5A1F]" : "text-white/40")}>{String(i + 1).padStart(2, "0")}</span>
                    <img src={ad.thumb} alt="" className="h-14 w-11 rounded-lg object-cover" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-medium">{ad.title}</div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                        <motion.div className={clsx("h-full rounded-full", i === 0 ? "bg-[#FF5A1F]" : "bg-white/60")} animate={{ width: `${(score(ad) / max) * 100}%` }} transition={{ duration: 0.9, ease }} />
                      </div>
                    </div>
                    <div className="hidden items-center gap-1.5 text-[12.5px] text-white/50 sm:flex">
                      <Avatar creator={c} size={18} /> @{c?.handle}
                    </div>
                    <span className="w-[76px] text-right font-mono text-[14px] tabular">{usd(score(ad))}</span>
                  </Link>
                </motion.div>
              );
            })}
          </LayoutGroup>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function ForOrganizations({ ads }: { ads: Ad[] }) {
  const thumbs = ads.slice(0, 12);
  return (
    <section className="relative overflow-hidden border-y border-white/10 bg-[#F2F0EA] text-[#0A0A0A]">
      <div className="mx-auto grid max-w-[1440px] gap-14 px-5 py-28 sm:px-8 lg:grid-cols-2 lg:py-36">
        <div>
          <div className="mb-5 font-mono text-[11px] uppercase tracking-[0.18em] text-black/45">(05) For brands &amp; nonprofits</div>
          <h2 className="text-[clamp(38px,5vw,76px)] font-semibold leading-[0.92] tracking-[-0.045em]">
            Don't make one ad. <span className="font-serif font-normal italic text-[#FF5A1F]">Commission a hundred.</span>
          </h2>
          <p className="mt-6 max-w-[46ch] text-[15.5px] leading-relaxed text-black/60">
            Post a brief and invite the people who already love you to make ads for you. Approve the ones you like, back them with real budget, and keep funding whatever performs. You test a hundred ideas for the price of one shoot — and your fans get paid for it.
          </p>
          <ol className="mt-10 space-y-5">
            {[
              ["Post a brief", "Your goal, your brand feel, your link. It shows up publicly for creators."],
              ["Your crowd makes ads", "Every submission comes to your portal. Approve, request changes, or pass."],
              ["Back the winners", "Fund your favorites — say $1,000 each — and let performance decide the rest."],
            ].map(([t, b], i) => (
              <motion.li key={t} initial={{ opacity: 0, x: -16 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1, duration: 0.8, ease }} className="flex gap-4">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-black font-mono text-[12px] text-white">{i + 1}</span>
                <div>
                  <div className="text-[17px] font-semibold tracking-tight">{t}</div>
                  <div className="text-[14.5px] text-black/55">{b}</div>
                </div>
              </motion.li>
            ))}
          </ol>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link to="/organizations" className="inline-flex h-12 items-center gap-2 rounded-full bg-black px-6 text-[15px] font-medium text-white transition hover:bg-[#FF5A1F]">
              Post a brief <ArrowRight size={16} />
            </Link>
            <Link to="/briefs" className="inline-flex h-12 items-center rounded-full border border-black/20 px-6 text-[15px] font-medium transition hover:border-black/60">
              See open briefs
            </Link>
          </div>
        </div>
        <div className="relative">
          <motion.div initial={{ opacity: 0, y: 40, rotate: -2 }} whileInView={{ opacity: 1, y: 0, rotate: -2 }} viewport={{ once: true }} transition={{ duration: 1, ease }} className="relative z-10 mx-auto max-w-[440px] rounded-[28px] bg-white p-6 shadow-[0_40px_80px_-30px_rgba(0,0,0,0.35)]">
            <div className="flex items-center gap-3">
              <OrgMark org={orgById("o-nocturne")} size={40} />
              <div>
                <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-black/45">Brief · Nocturne Coffee</div>
                <div className="text-[19px] font-semibold tracking-tight">The late shift</div>
              </div>
              <span className="ml-auto rounded-full bg-[#0FB48C]/12 px-2.5 py-1 text-[11.5px] font-medium text-[#0a8f6f]">Open</span>
            </div>
            <p className="mt-4 text-[14px] leading-relaxed text-black/60">Show us what coffee means to people who work while everyone else sleeps.</p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {["Moody", "Warm low light", "No voiceover"].map((t) => (
                <span key={t} className="rounded-full bg-black/5 px-2.5 py-1 text-[12px]">{t}</span>
              ))}
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2 rounded-2xl bg-[#F2F0EA] p-3 text-center">
              <div><div className="font-mono text-[18px] font-semibold">100</div><div className="text-[11px] text-black/50">ads funded</div></div>
              <div><div className="font-mono text-[18px] font-semibold">$1,000</div><div className="text-[11px] text-black/50">each</div></div>
              <div><div className="font-mono text-[18px] font-semibold">$100</div><div className="text-[11px] text-black/50">per creator</div></div>
            </div>
          </motion.div>
          <div className="relative -mt-10 grid grid-cols-4 gap-2 px-2 opacity-90 sm:grid-cols-6">
            {thumbs.map((a, i) => (
              <motion.img
                key={a.id}
                src={a.thumb}
                alt=""
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.3 + i * 0.05, duration: 0.8, ease }}
                className="aspect-[3/4] w-full rounded-xl object-cover"
              />
            ))}
          </div>
          <div className="mt-4 text-center font-mono text-[11.5px] uppercase tracking-[0.14em] text-black/45">142 submissions · 38 approved · 21 funded</div>
        </div>
      </div>
    </section>
  );
}

function Spotlight({ ad }: { ad?: Ad }) {
  if (!ad) return null;
  const org = orgById(ad.orgId);
  return (
    <section className="mx-auto max-w-[1440px] px-5 py-32 sm:px-8 sm:py-40">
      <div className="mb-5 font-mono text-[11px] uppercase tracking-[0.18em] text-white/45">(06) First on Crowdi</div>
      <div className="grid items-center gap-10 lg:grid-cols-[1.4fr_1fr]">
        <motion.div initial={{ opacity: 0, scale: 0.96 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ duration: 1.2, ease }} className="relative aspect-video overflow-hidden rounded-[28px] border border-white/10">
          <video src={ad.video} poster={ad.poster} autoPlay muted loop playsInline className="size-full object-cover" onLoadedMetadata={(e) => (e.currentTarget.currentTime = 6)} />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          <Link to={`/ads/${ad.slug}`} className="absolute bottom-5 left-5 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-[14px] font-medium text-black transition hover:bg-[#FF5A1F] hover:text-white">
            Watch with sound <ArrowUpRight size={15} />
          </Link>
        </motion.div>
        <div>
          <div className="flex items-center gap-3">
            <OrgMark org={org} size={44} />
            <div>
              <div className="text-[17px] font-semibold">{org?.name}</div>
              <div className="text-[13px] text-white/50">The first organization on Crowdi</div>
            </div>
          </div>
          <h3 className="mt-8 text-[clamp(32px,3.6vw,54px)] font-semibold leading-[0.95] tracking-[-0.04em]">“{ad.title}”</h3>
          <p className="mt-5 max-w-[44ch] text-[15.5px] leading-relaxed text-white/60">
            Our first ads come from students who entered the ACU TikTok ad competition for Adoption Is An Option. Their films kick off the platform. Now anyone can fund them and push them further.
          </p>
          <div className="mt-8 grid grid-cols-3 gap-4 border-t border-white/10 pt-6">
            <div><div className="font-mono text-[22px] font-medium">{usd(ad.totals.funded)}</div><div className="text-[12px] text-white/45">funded</div></div>
            <div><div className="font-mono text-[22px] font-medium">{compact(ad.totals.impressions)}</div><div className="text-[12px] text-white/45">views</div></div>
            <div><div className="font-mono text-[22px] font-medium">{usd(ad.totals.creatorEarned)}</div><div className="text-[12px] text-white/45">to @{creatorOf(ad)?.handle}</div></div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="relative overflow-hidden border-t border-white/10">
      <div className="mx-auto max-w-[1440px] px-5 pb-12 pt-32 sm:px-8 sm:pt-44">
        <motion.h2 initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 1.1, ease }} className="text-[clamp(52px,10vw,180px)] font-semibold leading-[0.84] tracking-[-0.06em]">
          Make the ad <br /> <span className="font-serif font-normal italic text-[#FF5A1F]">you wish existed.</span>
        </motion.h2>
        <div className="mt-12 flex flex-wrap gap-3">
          <ButtonLink to="/create" variant="flare" size="lg">Make an ad <ArrowRight size={16} /></ButtonLink>
          <Link to="/explore" className="inline-flex h-13 items-center rounded-full border border-white/25 px-7 text-[15px] font-medium transition hover:border-white/60">Explore ads</Link>
        </div>
        <div className="mt-32 flex flex-col gap-6 border-t border-white/10 pt-8 sm:flex-row sm:items-center">
          <Logo className="text-[22px]" />
          <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/40">A West Ventures studio company · Georgetown, TX</span>
          <div className="flex gap-6 text-[13px] text-white/55 sm:ml-auto">
            <Link to="/explore" className="hover:text-white">Explore</Link>
            <Link to="/briefs" className="hover:text-white">Briefs</Link>
            <Link to="/organizations" className="hover:text-white">Organizations</Link>
            <Link to="/signin" className="hover:text-white">Sign in</Link>
          </div>
        </div>
      </div>
    </section>
  );
}

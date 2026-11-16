import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, BadgeCheck, Building2, Check, CircleDollarSign, FileText, Link2, Lock, Megaphone, ScanSearch, Search, ShieldCheck, Sparkles, UploadCloud, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button, OrgMark } from "../components/ui";
import { ORGS, orgById } from "../data/catalog";
import { CATEGORIES, type Ad, type Category } from "../data/types";
import { usd } from "../lib/format";
import { useStore, type AdDraft } from "../lib/store";

type Target = "cause" | "org" | "brief";
interface Media {
  url: string;
  poster: string;
  name: string;
  duration: number;
  width: number;
  height: number;
  sample?: boolean;
}
interface Draft {
  media?: Media;
  target?: Target;
  category?: Category;
  orgId?: string;
  orgName?: string;
  orgSite?: string;
  briefId?: string;
  hasLink: boolean;
  url: string;
  label: string;
  title: string;
  description: string;
}

const STEPS = ["Upload", "Who it's for", "Link", "Details", "Review", "Account", "Payouts"] as const;
const LABELS = ["Learn more", "Donate", "Sign up", "Shop now", "Get involved", "Watch more"];

const hostOf = (u: string) => {
  try {
    return new URL(/^https?:\/\//.test(u) ? u : "https://" + u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

export default function Create() {
  const { user, knownAccount, briefs, submitAd, signUp, signIn, setPayouts, forgetDevice } = useStore();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const preBrief = briefs.find((b) => b.slug === params.get("brief") && b.status === "open");
  const [gate, setGate] = useState(!!knownAccount && !user);
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [submitted, setSubmitted] = useState<Ad | null>(null);
  const [d, setD] = useState<Draft>(() => ({
    hasLink: !!preBrief,
    url: preBrief?.cta.url ?? "",
    label: preBrief?.cta.label ?? "Learn more",
    title: "",
    description: "",
    target: preBrief ? "brief" : undefined,
    briefId: preBrief?.id,
    orgId: preBrief?.orgId,
  }));
  const up = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));

  const brief = briefs.find((b) => b.id === d.briefId);
  const linkHost = d.hasLink ? hostOf(d.url) : "";
  const linkOrg = ORGS.find((o) => linkHost && (linkHost === o.website || linkHost.endsWith("." + o.website)));
  const approver = d.target === "brief" ? orgById(brief?.orgId)?.name : d.target === "org" ? d.orgName ?? orgById(d.orgId)?.name : linkHost ? linkOrg?.name ?? linkHost : null;
  const needsApproval = !!approver;

  const canNext = [
    !!d.media,
    d.target === "cause" ? !!d.category : d.target === "org" ? !!(d.orgId || d.orgName) : d.target === "brief" ? !!d.briefId : false,
    !d.hasLink || (!!linkHost && linkHost.includes(".")),
    d.title.trim().length >= 3,
    true,
  ][step];

  const go = (n: number) => {
    setDir(n > step ? 1 : -1);
    setStep(n);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const finalize = (creatorId: string) => {
    const draft: AdDraft = {
      title: d.title.trim(),
      description: d.description.trim(),
      category: d.category ?? (brief ? "Community" : "Community"),
      target: d.target ?? "cause",
      orgId: d.target === "brief" ? brief?.orgId : d.orgId ?? linkOrg?.id,
      orgName: d.orgName,
      briefId: d.briefId,
      cta: d.hasLink && linkHost ? { label: d.label, url: /^https?:\/\//.test(d.url) ? d.url : "https://" + d.url } : undefined,
      videoUrl: d.media?.sample ? d.media.url : d.media?.url,
      posterUrl: d.media?.sample ? d.media.poster : d.media?.poster,
      aspect: d.media && d.media.width > d.media.height ? "16:9" : "9:16",
      duration: d.media?.duration ?? 8,
    };
    const ad = submitAd(draft, creatorId);
    setSubmitted(ad);
  };

  if (gate && knownAccount)
    return (
      <Shell>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-md pt-10 text-center">
          <div className="mx-auto grid size-16 place-items-center rounded-full bg-flare text-[24px] font-semibold text-white">{knownAccount.name[0]}</div>
          <h1 className="mt-6 text-[34px] font-semibold tracking-[-0.035em]">Welcome back, {knownAccount.name.split(" ")[0]}</h1>
          <p className="mt-2 text-[15px] text-muted">This device already has a Crowdi account. Sign in first so your new ad and its earnings land in the same place.</p>
          <Button
            size="lg"
            className="mt-8 w-full"
            onClick={() => {
              signIn(knownAccount.email);
              setGate(false);
            }}
          >
            Continue as {knownAccount.email}
          </Button>
          <button onClick={() => { forgetDevice(); setGate(false); }} className="mt-4 text-[13.5px] text-muted underline-offset-4 hover:text-ink hover:underline">
            Not you? Start a new account
          </button>
        </motion.div>
      </Shell>
    );

  if (submitted) return <Done ad={submitted} approver={approver} />;

  const showAccount = step >= 5 && !user;

  return (
    <Shell>
      <div className="mx-auto max-w-[1180px]">
        <Progress step={step} hideAccount={!!user} />
        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-h-[520px]">
            <AnimatePresence mode="wait" custom={dir}>
              <motion.div
                key={step}
                custom={dir}
                initial={{ opacity: 0, x: dir * 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: dir * -40 }}
                transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              >
                {step === 0 && <StepUpload media={d.media} onMedia={(m) => up({ media: m })} />}
                {step === 1 && <StepTarget d={d} up={up} />}
                {step === 2 && <StepLink d={d} up={up} linkHost={linkHost} linkOrg={linkOrg?.name} locked={!!brief?.cta.required} />}
                {step === 3 && <StepDetails d={d} up={up} />}
                {step === 4 && <StepReview d={d} approver={approver} />}
                {step === 5 && showAccount && (
                  <StepAccount
                    onDone={(name, email) => {
                      signUp({ role: "creator", name, email, handle: email.split("@")[0], payouts: "none" });
                      go(6);
                    }}
                    onSignIn={(email) => {
                      const u = signIn(email);
                      finalize(u.creatorId ?? "me");
                    }}
                  />
                )}
                {step === 6 && (
                  <StepPayouts
                    onConnect={() => {
                      setPayouts("connected");
                      finalize("me");
                    }}
                    onSkip={() => {
                      setPayouts("pending");
                      finalize("me");
                    }}
                  />
                )}
              </motion.div>
            </AnimatePresence>

            {step <= 4 && (
              <div className="mt-10 flex items-center justify-between border-t border-line pt-6">
                <Button variant="ghost" onClick={() => (step === 0 ? navigate(-1) : go(step - 1))}>
                  <ArrowLeft size={16} /> Back
                </Button>
                {step < 4 ? (
                  <Button size="lg" disabled={!canNext} onClick={() => go(step + 1)}>
                    Continue <ArrowRight size={16} />
                  </Button>
                ) : (
                  <Button size="lg" variant="flare" onClick={() => (user ? finalize(user.creatorId ?? "me") : go(5))}>
                    {user ? "Submit ad" : "Submit & claim your ad"} <ArrowRight size={16} />
                  </Button>
                )}
              </div>
            )}
          </div>
          <aside className="hidden lg:block">
            <div className="sticky top-24">
              <PhonePreview d={d} />
              <ApprovalNote needsApproval={needsApproval} approver={approver} hasLink={d.hasLink} target={d.target} />
            </div>
          </aside>
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-[1440px] px-5 pb-10 pt-8 sm:px-8 sm:pt-12">{children}</div>;
}

function Progress({ step, hideAccount }: { step: number; hideAccount: boolean }) {
  const steps = hideAccount ? STEPS.slice(0, 5) : STEPS;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <div className="label">Make an ad · step {Math.min(step + 1, steps.length)} of {steps.length}</div>
        <div className="label hidden sm:block">{hideAccount ? "Signed in" : "Account comes last"}</div>
      </div>
      <div className="mt-4 flex gap-1.5">
        {steps.map((s, i) => (
          <div key={s} className="flex-1">
            <div className="h-1 overflow-hidden rounded-full bg-line">
              <motion.div className="h-full rounded-full bg-flare" initial={false} animate={{ width: i < step ? "100%" : i === step ? "45%" : "0%" }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }} />
            </div>
            <div className={clsx("mt-2 hidden text-[12px] font-medium md:block", i <= step ? "text-ink" : "text-muted")}>{s}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function H({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: string }) {
  return (
    <div className="mb-8">
      <div className="label">{eyebrow}</div>
      <h1 className="mt-2 text-[34px] font-semibold leading-[1.02] tracking-[-0.035em] sm:text-[46px]">{title}</h1>
      {sub && <p className="mt-3 max-w-[56ch] text-[15.5px] text-muted">{sub}</p>}
    </div>
  );
}

/* ----------------------------- Step 1 ----------------------------- */

function readVideo(file: File): Promise<Media> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.src = url;
    v.onloadedmetadata = () => {
      v.currentTime = Math.min(1.5, v.duration / 3);
    };
    v.onseeked = () => {
      const c = document.createElement("canvas");
      const s = 480 / Math.max(v.videoWidth, v.videoHeight);
      c.width = Math.round(v.videoWidth * s);
      c.height = Math.round(v.videoHeight * s);
      c.getContext("2d")?.drawImage(v, 0, 0, c.width, c.height);
      resolve({ url, poster: c.toDataURL("image/jpeg", 0.8), name: file.name, duration: v.duration, width: v.videoWidth, height: v.videoHeight });
    };
    v.onerror = () => reject(new Error("We couldn't read that video. Try an MP4 or MOV."));
  });
}

function StepUpload({ media, onMedia }: { media?: Media; onMedia: (m?: Media) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [err, setErr] = useState("");
  const [scan, setScan] = useState(media ? 3 : 0);

  const take = async (f?: File) => {
    setErr("");
    if (!f) return;
    if (!f.type.startsWith("video/")) return setErr("That's not a video file. Try an MP4 or MOV.");
    if (f.size > 500 * 1024 * 1024) return setErr("Keep it under 500 MB for now.");
    try {
      const m = await readVideo(f);
      if (m.duration > 180) return setErr("Ads need to be 3 minutes or shorter. 15–60 seconds works best.");
      onMedia(m);
      setScan(0);
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  useEffect(() => {
    if (!media || scan >= 3) return;
    const t = setTimeout(() => setScan((s) => s + 1), 800);
    return () => clearTimeout(t);
  }, [media, scan]);

  return (
    <div>
      <H eyebrow="Step 1" title="Drop in your ad" sub="Vertical 9:16 works best on TikTok. 15–60 seconds, with captions. You don't need an account yet." />
      {!media ? (
        <>
          <motion.button
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files[0]); }}
            onClick={() => input.current?.click()}
            animate={{ scale: over ? 1.01 : 1 }}
            className={clsx("focus-ring group relative grid h-[360px] w-full place-items-center overflow-hidden rounded-[28px] border-2 border-dashed transition", over ? "border-flare bg-flare/5" : "border-line-2 bg-surface hover:border-ink/30")}
          >
            <div className="text-center">
              <motion.div animate={{ y: over ? -6 : 0 }} className="mx-auto grid size-16 place-items-center rounded-2xl bg-ink text-bg transition group-hover:scale-105">
                <UploadCloud size={26} />
              </motion.div>
              <div className="mt-5 text-[19px] font-semibold tracking-tight">Drag your video here</div>
              <div className="mt-1 text-[14px] text-muted">or click to choose · MP4, MOV, WebM · up to 3 min</div>
            </div>
          </motion.button>
          <input ref={input} type="file" accept="video/*" hidden onChange={(e) => take(e.target.files?.[0])} />
          {err && <p className="mt-3 text-[13.5px] text-flare">{err}</p>}
          <button
            onClick={() => onMedia({ url: "/media/ads/family-is-a-choice.mp4", poster: "/media/ads/family-is-a-choice.jpg", name: "family-is-a-choice.mp4", duration: 8, width: 720, height: 1280, sample: true })}
            className="mt-4 text-[13.5px] text-muted underline-offset-4 hover:text-ink hover:underline"
          >
            No video handy? Try it with a sample clip
          </button>
        </>
      ) : (
        <div className="card flex flex-col gap-6 p-5 sm:flex-row">
          <div className="relative h-[220px] w-[124px] shrink-0 overflow-hidden rounded-2xl bg-black">
            <video src={media.url} poster={media.poster} autoPlay muted loop playsInline className="size-full object-cover" />
          </div>
          <div className="flex-1">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="truncate text-[16px] font-medium">{media.name}</div>
                <div className="mt-0.5 font-mono text-[12.5px] text-muted">
                  {Math.round(media.duration)}s · {media.width}×{media.height} · {media.height >= media.width ? "vertical ✓" : "horizontal — we'll letterbox it"}
                </div>
              </div>
              <button onClick={() => onMedia(undefined)} className="grid size-8 place-items-center rounded-full hover:bg-surface-2" aria-label="Remove video"><X size={16} /></button>
            </div>
            <div className="mt-5 space-y-2.5">
              {[
                { icon: ScanSearch, label: "Checking length, audio and format" },
                { icon: Building2, label: "Looking for logos and brand mentions" },
                { icon: ShieldCheck, label: "Safety review" },
              ].map((c, i) => (
                <div key={c.label} className="flex items-center gap-3 text-[14px]">
                  <span className={clsx("grid size-7 place-items-center rounded-full transition", scan > i ? "bg-mint/15 text-mint" : "bg-surface-2 text-muted")}>
                    {scan > i ? <Check size={14} strokeWidth={3} /> : scan === i ? <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }} className="size-3.5 rounded-full border-2 border-muted border-t-transparent" /> : <c.icon size={14} />}
                  </span>
                  <span className={scan > i ? "text-ink" : "text-muted"}>{c.label}</span>
                </div>
              ))}
            </div>
            {scan >= 3 && (
              <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-5 rounded-xl bg-surface-2 p-3 text-[13.5px] text-ink-2">
                <Sparkles size={14} className="mr-1.5 inline text-flare" />
                {media.sample ? "Looks good. We spotted adoption-related themes — you might want the Adoption Is An Option brief next." : "Looks good. No brand logos detected — you choose who it's for next."}
              </motion.p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ----------------------------- Step 2 ----------------------------- */

function StepTarget({ d, up }: { d: Draft; up: (p: Partial<Draft>) => void }) {
  const { briefs } = useStore();
  const open = briefs.filter((b) => b.status === "open");
  const [q, setQ] = useState(d.orgName ?? "");
  const matches = useMemo(() => (q.trim() ? ORGS.filter((o) => (o.name + " " + o.website).toLowerCase().includes(q.toLowerCase())).slice(0, 5) : ORGS.slice(0, 5)), [q]);
  const options: { id: Target; icon: typeof Megaphone; title: string; body: string; tag: string }[] = [
    { id: "cause", icon: Megaphone, title: "A cause", body: "Awareness for something you care about. No organization behind it.", tag: "Runs once funded" },
    { id: "org", icon: Building2, title: "An organization or brand", body: "A nonprofit, a local shop, a company — anyone with a name and a website.", tag: "They approve it first" },
    { id: "brief", icon: FileText, title: "An open brief", body: `${open.length} organizations are asking for ads right now, with budget behind them.`, tag: "Paid placement" },
  ];
  return (
    <div>
      <H eyebrow="Step 2" title="Who is this ad for?" sub="This decides who has to sign off before it runs. Grassroots ads with no link only go through our safety check." />
      <div className="grid gap-3 md:grid-cols-3">
        {options.map((o) => (
          <button
            key={o.id}
            onClick={() => up({ target: o.id, orgId: o.id === "brief" ? d.orgId : undefined, briefId: o.id === "brief" ? d.briefId : undefined, orgName: undefined })}
            className={clsx("focus-ring group relative rounded-[22px] border p-5 text-left transition", d.target === o.id ? "border-ink bg-surface shadow-[var(--shadow)]" : "border-line bg-surface/50 hover:border-line-2 hover:bg-surface")}
          >
            <span className={clsx("grid size-10 place-items-center rounded-xl transition", d.target === o.id ? "bg-flare text-white" : "bg-surface-2 text-ink")}>
              <o.icon size={18} />
            </span>
            <div className="mt-4 text-[17px] font-semibold tracking-tight">{o.title}</div>
            <div className="mt-1 text-[13.5px] leading-snug text-muted">{o.body}</div>
            <div className="mt-4 text-[12px] font-medium text-ink-2">{o.tag}</div>
            {d.target === o.id && <motion.span layoutId="target-check" className="absolute right-4 top-4 grid size-6 place-items-center rounded-full bg-ink text-bg"><Check size={13} strokeWidth={3} /></motion.span>}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {d.target === "cause" && (
          <motion.div key="cause" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-8">
            <div className="mb-3 text-[14px] font-medium">Pick the closest cause</div>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.filter((c) => c !== "Local business").map((c) => (
                <button key={c} onClick={() => up({ category: c })} className={clsx("rounded-full border px-4 py-2 text-[13.5px] font-medium transition", d.category === c ? "border-ink bg-ink text-bg" : "border-line bg-surface hover:border-line-2")}>
                  {c}
                </button>
              ))}
            </div>
          </motion.div>
        )}
        {d.target === "org" && (
          <motion.div key="org" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-8">
            <div className="mb-3 text-[14px] font-medium">Which organization?</div>
            <div className="relative">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
              <input value={q} onChange={(e) => { setQ(e.target.value); up({ orgId: undefined, orgName: undefined }); }} placeholder="Search by name or website" className="field pl-11" />
            </div>
            <div className="mt-2 overflow-hidden rounded-2xl border border-line bg-surface">
              {matches.map((o) => (
                <button key={o.id} onClick={() => { up({ orgId: o.id, orgName: undefined, category: d.category ?? undefined }); setQ(o.name); }} className={clsx("flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left last:border-0 hover:bg-surface-2", d.orgId === o.id && "bg-surface-2")}>
                  <OrgMark org={o} size={30} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1 text-[14.5px] font-medium">{o.name} {o.verified && <BadgeCheck size={14} className="text-flare" />}</div>
                    <div className="text-[12.5px] text-muted">{o.website} · {o.kind}</div>
                  </div>
                  {d.orgId === o.id && <Check size={16} />}
                </button>
              ))}
              {q.trim().length > 2 && !matches.some((m) => m.name.toLowerCase() === q.toLowerCase()) && (
                <button onClick={() => up({ orgId: undefined, orgName: q.trim() })} className={clsx("flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2", d.orgName && "bg-surface-2")}>
                  <span className="grid size-[30px] place-items-center rounded-[28%] border border-dashed border-line-2 text-muted">+</span>
                  <div className="flex-1">
                    <div className="text-[14.5px] font-medium">“{q.trim()}” isn't on Crowdi yet</div>
                    <div className="text-[12.5px] text-muted">We'll invite them to review your ad. It runs once they approve.</div>
                  </div>
                  {d.orgName && <Check size={16} />}
                </button>
              )}
            </div>
            {(d.orgId || d.orgName) && (
              <div className="mt-6">
                <div className="mb-3 text-[14px] font-medium">Category</div>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map((c) => (
                    <button key={c} onClick={() => up({ category: c })} className={clsx("rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition", d.category === c ? "border-ink bg-ink text-bg" : "border-line bg-surface hover:border-line-2")}>{c}</button>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
        {d.target === "brief" && (
          <motion.div key="brief" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-8 grid gap-3 sm:grid-cols-2">
            {open.map((b) => {
              const org = orgById(b.orgId);
              return (
                <button
                  key={b.id}
                  onClick={() => up({ briefId: b.id, orgId: b.orgId, hasLink: true, url: b.cta.url, label: b.cta.label, category: d.category ?? (b.orgId === "o-aiao" ? "Adoption & foster" : undefined) })}
                  className={clsx("flex gap-3 rounded-2xl border p-3 text-left transition", d.briefId === b.id ? "border-ink bg-surface" : "border-line bg-surface/50 hover:border-line-2")}
                >
                  <img src={b.cover} alt="" className="h-20 w-16 shrink-0 rounded-xl object-cover" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-[12px] text-muted"><OrgMark org={org} size={16} /> {org?.name}</div>
                    <div className="mt-1 text-[15px] font-semibold leading-tight tracking-tight">{b.title}</div>
                    <div className="mt-1.5 font-mono text-[11.5px] text-muted">{usd(b.seedPerAd)} ad budget · {usd(b.creatorFee)} to you if picked</div>
                  </div>
                  {d.briefId === b.id && <Check size={16} className="shrink-0" />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ----------------------------- Step 3 ----------------------------- */

function StepLink({ d, up, linkHost, linkOrg, locked }: { d: Draft; up: (p: Partial<Draft>) => void; linkHost: string; linkOrg?: string; locked: boolean }) {
  return (
    <div>
      <H eyebrow="Step 3" title="Where should people go?" sub="The button under your ad on TikTok. Skip it and the ad is pure awareness." />
      {!locked && (
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { v: false, title: "No link", body: "Just get the message out. Fastest to go live.", icon: Megaphone },
            { v: true, title: "Send people somewhere", body: "A website, a donation page, a sign-up form.", icon: Link2 },
          ].map((o) => (
            <button key={String(o.v)} onClick={() => up({ hasLink: o.v })} className={clsx("focus-ring flex items-start gap-4 rounded-[22px] border p-5 text-left transition", d.hasLink === o.v ? "border-ink bg-surface shadow-[var(--shadow)]" : "border-line bg-surface/50 hover:border-line-2")}>
              <span className={clsx("grid size-10 shrink-0 place-items-center rounded-xl", d.hasLink === o.v ? "bg-flare text-white" : "bg-surface-2")}><o.icon size={18} /></span>
              <div>
                <div className="text-[16.5px] font-semibold tracking-tight">{o.title}</div>
                <div className="mt-0.5 text-[13.5px] text-muted">{o.body}</div>
              </div>
            </button>
          ))}
        </div>
      )}
      <AnimatePresence>
        {d.hasLink && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="grid gap-4 pt-8 sm:grid-cols-[1fr_220px]">
              <label className="block">
                <span className="mb-2 block text-[14px] font-medium">Link</span>
                <div className="relative">
                  <Link2 size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
                  <input value={d.url} disabled={locked} onChange={(e) => up({ url: e.target.value })} placeholder="yourcause.org/donate" className="field pl-11 disabled:opacity-60" />
                  {locked && <Lock size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted" />}
                </div>
              </label>
              <label className="block">
                <span className="mb-2 block text-[14px] font-medium">Button text</span>
                <select value={d.label} disabled={locked} onChange={(e) => up({ label: e.target.value })} className="field cursor-pointer disabled:opacity-60">
                  {LABELS.map((l) => <option key={l}>{l}</option>)}
                </select>
              </label>
            </div>
            {locked && <p className="mt-3 text-[13px] text-muted">This brief requires its own link, so it's filled in for you.</p>}
            {linkHost && !locked && (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-5 flex gap-3 rounded-2xl border border-gold/30 bg-gold/8 p-4 text-[13.5px]">
                <ShieldCheck size={18} className="mt-0.5 shrink-0 text-gold" />
                <div>
                  <span className="font-medium">{linkOrg ? `${linkOrg} will approve this ad` : `We'll ask the owner of ${linkHost} to approve it`}</span>
                  <span className="text-muted"> — any ad that sends traffic to a site needs that site's OK before it runs.</span>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ----------------------------- Step 4 ----------------------------- */

function StepDetails({ d, up }: { d: Draft; up: (p: Partial<Draft>) => void }) {
  const ideas = ["Family Is a Choice", "Somebody's Waiting", "Make Room", "One More Seat"];
  return (
    <div>
      <H eyebrow="Step 4" title="Name it" sub="This is what people see in the gallery. Short and specific beats clever." />
      <label className="block">
        <span className="mb-2 flex items-center justify-between text-[14px] font-medium">
          Title <span className="font-mono text-[12px] text-muted">{d.title.length}/60</span>
        </span>
        <input autoFocus value={d.title} maxLength={60} onChange={(e) => up({ title: e.target.value })} placeholder="e.g. Look Twice" className="field text-[18px] font-medium" />
      </label>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1 text-[12.5px] text-muted"><Sparkles size={13} className="text-flare" /> Suggestions from your video:</span>
        {ideas.map((i) => (
          <button key={i} onClick={() => up({ title: i })} className="rounded-full border border-line bg-surface px-3 py-1 text-[12.5px] hover:border-line-2">{i}</button>
        ))}
      </div>
      <label className="mt-7 block">
        <span className="mb-2 flex items-center justify-between text-[14px] font-medium">
          One line about it <span className="font-normal text-muted">optional</span>
        </span>
        <textarea value={d.description} maxLength={180} onChange={(e) => up({ description: e.target.value })} rows={3} placeholder="Why you made it, who it's for." className="field resize-none" />
      </label>
    </div>
  );
}

/* ----------------------------- Step 5 ----------------------------- */

function StepReview({ d, approver }: { d: Draft; approver?: string | null }) {
  const { briefs } = useStore();
  const brief = briefs.find((b) => b.id === d.briefId);
  const rows = [
    ["Video", d.media ? `${d.media.name} · ${Math.round(d.media.duration)}s` : "—"],
    ["For", d.target === "cause" ? `Grassroots · ${d.category}` : d.target === "brief" ? `Brief: ${brief?.title}` : d.orgName ?? orgById(d.orgId)?.name ?? "—"],
    ["Link", d.hasLink ? `${d.label} → ${hostOf(d.url)}` : "None — awareness only"],
    ["Runs on", "TikTok (Instagram & Facebook coming soon)"],
    ["Approval", approver ? `${approver} reviews it first` : "Automatic after safety check"],
  ];
  return (
    <div>
      <H eyebrow="Step 5" title="Look right?" sub="You can edit the title and description later. Changing the video creates a new version for review." />
      <div className="card divide-y divide-line">
        {rows.map(([k, v]) => (
          <div key={k} className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center">
            <span className="w-32 shrink-0 text-[13px] text-muted">{k}</span>
            <span className="text-[14.5px] font-medium">{v}</span>
          </div>
        ))}
      </div>
      <div className="mt-6 rounded-[22px] bg-ink p-6 text-bg">
        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] opacity-60"><CircleDollarSign size={14} /> How you get paid</div>
        <div className="mt-3 text-[22px] font-semibold leading-tight tracking-tight">
          You earn 7.5% of every dollar this ad raises{brief ? <>, plus {usd(brief.creatorFee)} if {orgById(brief.orgId)?.name} picks it</> : null}.
        </div>
        <div className="mt-5 grid grid-cols-3 gap-3 text-[13px]">
          {[
            ["90%", "buys the ad"],
            ["7.5%", "goes to you"],
            ["2.5%", "to Crowdi"],
          ].map(([a, b]) => (
            <div key={a} className="rounded-xl bg-bg/10 p-3">
              <div className="font-mono text-[20px] font-semibold">{a}</div>
              <div className="opacity-60">{b}</div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[12.5px] opacity-60">Paid monthly once you've earned $25. Every $1,000 your ad raises pays you $75.</p>
      </div>
    </div>
  );
}

/* ----------------------------- Step 6 ----------------------------- */

function StepAccount({ onDone, onSignIn }: { onDone: (name: string, email: string) => void; onSignIn: (email: string) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [mode, setMode] = useState<"new" | "existing">("new");
  const valid = /.+@.+\..+/.test(email) && (mode === "existing" || (name.trim().length > 1 && pw.length >= 8));
  return (
    <div className="max-w-[520px]">
      <H eyebrow="Almost there" title="Claim your ad" sub="Create your account so we can track what it earns and pay you. Takes 20 seconds." />
      <div className="grid grid-cols-2 gap-2.5">
        {["Apple", "Google"].map((p) => (
          <button key={p} onClick={() => onDone(p === "Apple" ? "Apple user" : "Google user", `you@${p.toLowerCase()}.example`)} className="flex h-12 items-center justify-center gap-2 rounded-full border border-line bg-surface text-[14px] font-medium hover:border-line-2">
            Continue with {p}
          </button>
        ))}
      </div>
      <div className="my-6 flex items-center gap-3 text-[12px] text-muted"><span className="h-px flex-1 bg-line" /> or with email <span className="h-px flex-1 bg-line" /></div>
      <div className="space-y-3">
        {mode === "new" && <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="field" autoComplete="name" />}
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" className="field" autoComplete="email" />
        {mode === "new" && <input value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Password (8+ characters)" type="password" className="field" autoComplete="new-password" />}
      </div>
      <Button size="lg" variant="flare" className="mt-5 w-full" disabled={!valid} onClick={() => (mode === "new" ? onDone(name.trim(), email.trim()) : onSignIn(email.trim()))}>
        {mode === "new" ? "Create account" : "Sign in & submit"} <ArrowRight size={16} />
      </Button>
      <button onClick={() => setMode(mode === "new" ? "existing" : "new")} className="mt-4 w-full text-center text-[13.5px] text-muted hover:text-ink">
        {mode === "new" ? "Already have an account? Sign in" : "New here? Create an account"}
      </button>
      <p className="mt-6 text-center text-[11.5px] text-muted">Sign-in will run on Clerk in production. Prototype — nothing leaves this browser.</p>
    </div>
  );
}

/* ----------------------------- Step 7 ----------------------------- */

function StepPayouts({ onConnect, onSkip }: { onConnect: () => void; onSkip: () => void }) {
  const [stage, setStage] = useState<"idle" | "redirect">("idle");
  return (
    <div className="max-w-[560px]">
      <H eyebrow="Last step" title="How should we pay you?" sub="Earnings go out on the 1st of every month once you've earned $25. Connect a bank account once and forget about it." />
      <div className="card overflow-hidden">
        <div className="flex items-center gap-3 border-b border-line p-5">
          <span className="grid size-10 place-items-center rounded-xl bg-[#635BFF] text-[15px] font-bold text-white">S</span>
          <div>
            <div className="text-[15px] font-semibold">Payouts by Stripe</div>
            <div className="text-[12.5px] text-muted">Used by millions of creators and sellers</div>
          </div>
        </div>
        <ul className="space-y-3 p-5 text-[14px]">
          {[
            "You add your bank and verify your identity on Stripe's secure page",
            "Crowdi never sees or stores your bank details",
            "Takes about 3 minutes · 1099 tax forms handled for you",
          ].map((t) => (
            <li key={t} className="flex gap-3"><Check size={16} className="mt-0.5 shrink-0 text-mint" /> {t}</li>
          ))}
        </ul>
      </div>
      <Button
        size="lg"
        className="mt-6 w-full !bg-[#635BFF] !text-white"
        onClick={() => {
          setStage("redirect");
          setTimeout(onConnect, 1600);
        }}
        disabled={stage === "redirect"}
      >
        {stage === "redirect" ? <motion.span animate={{ opacity: [1, 0.4, 1] }} transition={{ repeat: Infinity, duration: 1 }}>Opening Stripe…</motion.span> : <>Connect bank with Stripe <ArrowRight size={16} /></>}
      </Button>
      <button onClick={onSkip} className="mt-4 w-full text-center text-[13.5px] text-muted hover:text-ink">
        Skip for now — earnings wait for you until you connect
      </button>
    </div>
  );
}

/* ----------------------------- Side ----------------------------- */

function PhonePreview({ d }: { d: Draft }) {
  return (
    <div className="mx-auto w-[260px]">
      <div className="relative aspect-[9/19] overflow-hidden rounded-[38px] border-[7px] border-ink bg-black shadow-2xl">
        {d.media ? (
          <video key={d.media.url} src={d.media.url} poster={d.media.poster} autoPlay muted loop playsInline className="absolute inset-0 size-full object-cover" />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-center text-[12px] text-white/40">Your ad<br />plays here</div>
        )}
        <div className="absolute left-1/2 top-2 h-5 w-20 -translate-x-1/2 rounded-full bg-black" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-4 pt-16 text-white">
          <div className="text-[12px] font-semibold">@you</div>
          <div className="mt-0.5 line-clamp-2 text-[11.5px] opacity-80">{d.title || "Your title"} · Sponsored</div>
          <AnimatePresence>
            {d.hasLink && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="mt-3 flex h-8 items-center justify-between rounded-md bg-[#FE2C55] px-3 text-[11.5px] font-semibold">
                {d.label} <ArrowRight size={12} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      <div className="label mt-3 text-center">TikTok preview</div>
    </div>
  );
}

function ApprovalNote({ needsApproval, approver, hasLink, target }: { needsApproval: boolean; approver?: string | null; hasLink: boolean; target?: Target }) {
  if (!target) return null;
  return (
    <motion.div layout className="mt-6 rounded-2xl border border-line bg-surface p-4 text-[13px]">
      <div className="flex items-center gap-2 font-medium">
        {needsApproval ? <ShieldCheck size={15} className="text-gold" /> : <Check size={15} className="text-mint" />}
        {needsApproval ? "Needs approval" : "No approval needed"}
      </div>
      <p className="mt-1 text-muted">
        {needsApproval ? `${approver} will see it in their portal. Most respond within 2 days.` : hasLink ? "" : "Grassroots, no link. It runs as soon as the first dollars come in."}
      </p>
    </motion.div>
  );
}

/* ----------------------------- Done ----------------------------- */

function Done({ ad, approver }: { ad: Ad; approver?: string | null }) {
  const { user } = useStore();
  return (
    <Shell>
      <div className="mx-auto max-w-xl pt-6 text-center">
        <Confetti />
        <motion.div initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 260, damping: 14 }} className="mx-auto grid size-20 place-items-center rounded-full bg-flare text-white">
          <Check size={34} strokeWidth={3} />
        </motion.div>
        <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="mt-8 text-[40px] font-semibold leading-[1] tracking-[-0.04em] sm:text-[52px]">
          {ad.status === "live" ? "Your ad is live." : "Submitted."}
        </motion.h1>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="mx-auto mt-4 max-w-[46ch] text-[16px] text-muted">
          {ad.status === "live"
            ? "It's in the gallery now. Share the link — every dollar someone gives puts it in front of more people, and 7.5% comes back to you."
            : `${approver} has it in their review queue. We'll email you the moment they approve it, ask for changes, or pass.`}
        </motion.p>
        {user?.payouts === "pending" && <p className="mt-4 text-[13.5px] text-gold">Payouts aren't connected yet — you can do it any time from your studio.</p>}
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <Link to="/studio" className="inline-flex h-12 items-center gap-2 rounded-full bg-ink px-6 text-[15px] font-medium text-bg">Go to my studio</Link>
          <Link to="/create" onClick={() => window.location.reload()} className="inline-flex h-12 items-center rounded-full border border-line-2 px-6 text-[15px] font-medium">Make another</Link>
        </div>
      </div>
    </Shell>
  );
}

function Confetti() {
  const pieces = Array.from({ length: 36 });
  const colors = ["var(--flare)", "var(--violet)", "var(--mint)", "var(--gold)", "var(--ink)"];
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {pieces.map((_, i) => (
        <motion.span
          key={i}
          className="absolute left-1/2 top-[30%] block h-3 w-1.5 rounded-sm"
          style={{ background: colors[i % colors.length] }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
          animate={{ x: (Math.random() - 0.5) * 900, y: 200 + Math.random() * 500, opacity: 0, rotate: Math.random() * 720 }}
          transition={{ duration: 1.6 + Math.random(), ease: [0.2, 0.7, 0.4, 1] }}
        />
      ))}
    </div>
  );
}

import clsx from "clsx";
import { motion } from "framer-motion";
import { ArrowRight, BarChart3, CheckCircle2, FileText, Users } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button, Reveal } from "../components/ui";
import { useStore } from "../lib/store";

const domainOf = (s: string) => s.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];

export default function Organizations() {
  const { user, signUp } = useStore();
  const navigate = useNavigate();
  const [f, setF] = useState({ org: "", site: "", kind: "nonprofit" as "nonprofit" | "business", name: "", email: "", pw: "" });
  const up = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const domain = domainOf(f.site);
  const emailDomain = f.email.split("@")[1]?.toLowerCase() ?? "";
  const matches = domain && emailDomain && (emailDomain === domain || emailDomain.endsWith("." + domain));
  const valid = f.org.trim().length > 1 && domain.includes(".") && f.name.trim().length > 1 && /.+@.+\..+/.test(f.email) && f.pw.length >= 8;

  return (
    <div className="mx-auto max-w-[1440px] px-5 sm:px-8">
      <section className="grid gap-14 pb-16 pt-10 sm:pt-16 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <Reveal>
            <div className="label mb-4">For nonprofits and brands</div>
            <h1 className="text-[44px] font-semibold leading-[0.93] tracking-[-0.045em] sm:text-[76px]">
              Let your people make your ads. <span className="font-serif font-normal italic text-flare">Back the ones that work.</span>
            </h1>
            <p className="mt-6 max-w-[54ch] text-[16.5px] leading-relaxed text-muted">
              Instead of one expensive campaign built from scratch, post a brief and let your audience make dozens of ads. Approve the ones that fit, put budget behind your favorites, and keep funding whatever performs. Your supporters get paid for it.
            </p>
          </Reveal>
          <div className="mt-12 grid gap-4 sm:grid-cols-2">
            {[
              { icon: FileText, t: "Post a brief", b: "Goal, brand feel, required link, and how many ads you'll fund." },
              { icon: CheckCircle2, t: "Approve in one click", b: "Every ad that mentions or links to you lands in your queue first." },
              { icon: Users, t: "Engage your crowd", b: "Your fans become your creative team — and earn 7.5% of what their ad raises." },
              { icon: BarChart3, t: "See everything", b: "Spend, views, clicks and CTR per ad, in public and in your portal." },
            ].map((x, i) => (
              <Reveal key={x.t} delay={i * 0.06}>
                <div className="card h-full p-5">
                  <span className="grid size-10 place-items-center rounded-xl bg-surface-2"><x.icon size={18} /></span>
                  <div className="mt-4 text-[16.5px] font-semibold tracking-tight">{x.t}</div>
                  <div className="mt-1 text-[13.5px] text-muted">{x.b}</div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>

        <Reveal delay={0.1}>
          <div className="card sticky top-24 p-6 sm:p-8">
            {user?.role === "org" ? (
              <div className="py-10 text-center">
                <div className="text-[22px] font-semibold">You're signed in as {user.name}</div>
                <Button size="lg" className="mt-6" onClick={() => navigate("/org")}>Open your portal <ArrowRight size={16} /></Button>
              </div>
            ) : (
              <>
                <div className="label">Create an organization account</div>
                <h2 className="mt-2 text-[28px] font-semibold tracking-[-0.03em]">Start getting ads made</h2>
                <div className="mt-6 grid grid-cols-2 gap-2">
                  {(["nonprofit", "business"] as const).map((k) => (
                    <button key={k} onClick={() => up({ kind: k })} className={clsx("rounded-xl border py-2.5 text-[14px] font-medium capitalize transition", f.kind === k ? "border-ink bg-ink text-bg" : "border-line hover:border-line-2")}>
                      {k === "nonprofit" ? "Nonprofit" : "Business or brand"}
                    </button>
                  ))}
                </div>
                <div className="mt-4 space-y-3">
                  <input className="field" placeholder="Organization name" value={f.org} onChange={(e) => up({ org: e.target.value })} />
                  <input className="field" placeholder="Website (e.g. yourorg.org)" value={f.site} onChange={(e) => up({ site: e.target.value })} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input className="field" placeholder="Your name" value={f.name} onChange={(e) => up({ name: e.target.value })} />
                    <input className="field" placeholder="Work email" type="email" value={f.email} onChange={(e) => up({ email: e.target.value })} />
                  </div>
                  <input className="field" placeholder="Password (8+ characters)" type="password" value={f.pw} onChange={(e) => up({ pw: e.target.value })} />
                </div>
                {domain && f.email.includes("@") && (
                  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={clsx("mt-3 text-[13px]", matches ? "text-mint" : "text-gold")}>
                    {matches ? `✓ Your email matches ${domain} — we can verify you instantly.` : `Use an @${domain} email to verify instantly, or we'll verify by hand within a day.`}
                  </motion.p>
                )}
                <Button
                  size="lg"
                  variant="flare"
                  className="mt-6 w-full"
                  disabled={!valid}
                  onClick={() => {
                    signUp({ role: "org", name: f.org.trim(), email: f.email.trim(), orgName: f.org.trim(), orgSite: domain, orgKind: f.kind, payouts: "none" });
                    navigate("/org?welcome=1");
                  }}
                >
                  Create account <ArrowRight size={16} />
                </Button>
                <p className="mt-4 text-center text-[13px] text-muted">
                  Already on Crowdi? <Link to="/signin" className="font-medium text-ink underline-offset-4 hover:underline">Sign in</Link>
                </p>
              </>
            )}
          </div>
        </Reveal>
      </section>
    </div>
  );
}

export function SignIn() {
  const { signIn, knownAccount } = useStore();
  const navigate = useNavigate();
  const [email, setEmail] = useState(knownAccount?.email ?? "");
  const [pw, setPw] = useState("");
  const go = (e: string) => {
    const u = signIn(e);
    navigate(u.role === "org" ? "/org" : "/studio");
  };
  return (
    <div className="mx-auto grid min-h-[70vh] max-w-[1100px] items-center gap-12 px-5 py-12 sm:px-8 lg:grid-cols-2">
      <Reveal>
        <h1 className="text-[48px] font-semibold leading-[0.95] tracking-[-0.045em] sm:text-[64px]">
          Welcome <span className="font-serif font-normal italic text-flare">back.</span>
        </h1>
        <p className="mt-4 max-w-[40ch] text-[16px] text-muted">Creators see their ads and earnings. Organizations review submissions and manage briefs.</p>
        <div className="mt-10 space-y-2">
          <div className="label mb-2">Prototype shortcuts</div>
          <button onClick={() => go("yakira@crowdi.demo")} className="card flex w-full items-center justify-between p-4 text-left transition hover:border-line-2">
            <div><div className="text-[15px] font-medium">Creator demo · Yakira</div><div className="text-[13px] text-muted">Studio with earnings and payouts</div></div>
            <ArrowRight size={16} />
          </button>
          <button onClick={() => go("team@adoptionisanoption.org")} className="card flex w-full items-center justify-between p-4 text-left transition hover:border-line-2">
            <div><div className="text-[15px] font-medium">Organization demo · Adoption Is An Option</div><div className="text-[13px] text-muted">Review queue, briefs and spend</div></div>
            <ArrowRight size={16} />
          </button>
        </div>
      </Reveal>
      <Reveal delay={0.1}>
        <div className="card p-6 sm:p-8">
          <div className="grid grid-cols-2 gap-2.5">
            {["Apple", "Google"].map((p) => (
              <button key={p} className="flex h-12 items-center justify-center rounded-full border border-line text-[14px] font-medium hover:border-line-2" onClick={() => go(knownAccount?.email ?? `you@${p.toLowerCase()}.example`)}>
                Continue with {p}
              </button>
            ))}
          </div>
          <div className="my-6 flex items-center gap-3 text-[12px] text-muted"><span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" /></div>
          <div className="space-y-3">
            <input className="field" placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            <input className="field" placeholder="Password" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
          </div>
          <Button size="lg" className="mt-5 w-full" disabled={!/.+@.+\..+/.test(email)} onClick={() => go(email)}>Sign in</Button>
          <p className="mt-5 text-center text-[13px] text-muted">
            New? <Link to="/create" className="font-medium text-ink hover:underline">Make an ad</Link> or <Link to="/organizations" className="font-medium text-ink hover:underline">sign up your organization</Link>
          </p>
        </div>
      </Reveal>
    </div>
  );
}

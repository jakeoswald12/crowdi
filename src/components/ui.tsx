import clsx from "clsx";
import { motion, useInView, useMotionValue, useSpring, useTransform } from "framer-motion";
import { forwardRef, useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Link, type LinkProps } from "react-router-dom";
import type { Creator, Org } from "../data/types";

/* ---------- Logo ---------- */
export function Logo({ className, mono }: { className?: string; mono?: boolean }) {
  return (
    <span className={clsx("inline-flex items-center gap-2 font-semibold tracking-[-0.04em]", className)}>
      <svg viewBox="0 0 40 24" className="h-[0.9em] w-auto" aria-hidden>
        <circle cx="11" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="4.2" />
        <circle cx="31" cy="12" r="5" fill={mono ? "currentColor" : "var(--flare, #FF5A1F)"} />
      </svg>
      <span>crowdi</span>
    </span>
  );
}

/* ---------- Buttons ---------- */
type Variant = "primary" | "flare" | "ghost" | "outline" | "subtle";
const variants: Record<Variant, string> = {
  primary: "bg-ink text-bg hover:bg-ink/85",
  flare: "bg-flare text-white hover:brightness-110 shadow-[0_8px_24px_-8px_var(--flare)]",
  ghost: "text-ink hover:bg-surface-2",
  outline: "border border-line-2 text-ink hover:border-ink/50 hover:bg-surface",
  subtle: "bg-surface-2 text-ink hover:bg-line",
};
const sizes = { sm: "h-9 px-3.5 text-[13px]", md: "h-11 px-5 text-[14px]", lg: "h-13 px-7 text-[15px]" };

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: keyof typeof sizes }
>(function Button({ variant = "primary", size = "md", className, ...p }, ref) {
  return (
    <button
      ref={ref}
      className={clsx(
        "focus-ring inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-medium transition-all duration-200 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40",
        variants[variant],
        sizes[size],
        className,
      )}
      {...p}
    />
  );
});

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  ...p
}: LinkProps & { variant?: Variant; size?: keyof typeof sizes }) {
  return (
    <Link
      className={clsx(
        "focus-ring inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-medium transition-all duration-200 active:scale-[0.97]",
        variants[variant],
        sizes[size],
        className,
      )}
      {...p}
    />
  );
}

/* ---------- Badges ---------- */
export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "live" | "flare" | "violet" | "mint" | "gold" | "muted"; className?: string }) {
  const tones = {
    neutral: "bg-surface-2 text-ink-2 border-line",
    live: "bg-mint/12 text-mint border-mint/25",
    flare: "bg-flare/12 text-flare border-flare/25",
    violet: "bg-violet/12 text-violet border-violet/25",
    mint: "bg-mint/12 text-mint border-mint/25",
    gold: "bg-gold/15 text-gold border-gold/30",
    muted: "bg-transparent text-muted border-line",
  };
  return (
    <span className={clsx("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11.5px] font-medium", tones[tone], className)}>
      {tone === "live" && <span className="size-1.5 rounded-full bg-mint animate-pulse-dot" />}
      {children}
    </span>
  );
}

/* ---------- Avatars ---------- */
export function Avatar({ creator, size = 28, className }: { creator?: Pick<Creator, "name" | "color">; size?: number; className?: string }) {
  if (!creator) return null;
  const initials = creator.name.split(" ").map((s) => s[0]).slice(0, 2).join("");
  return (
    <span
      className={clsx("inline-grid shrink-0 place-items-center rounded-full font-semibold text-white", className)}
      style={{ width: size, height: size, fontSize: size * 0.38, background: `linear-gradient(135deg, ${creator.color}, color-mix(in oklab, ${creator.color} 55%, black))` }}
    >
      {initials}
    </span>
  );
}

export function OrgMark({ org, size = 28, className }: { org?: Pick<Org, "name" | "color">; size?: number; className?: string }) {
  if (!org) return null;
  const initials = org.name.replace(/[^A-Za-z ]/g, "").split(" ").filter(Boolean).map((s) => s[0]).slice(0, 2).join("");
  return (
    <span
      className={clsx("inline-grid shrink-0 place-items-center rounded-[28%] font-semibold text-white", className)}
      style={{ width: size, height: size, fontSize: size * 0.36, background: org.color }}
    >
      {initials}
    </span>
  );
}

/* ---------- Motion helpers ---------- */
export function Reveal({ children, delay = 0, y = 24, className }: { children: ReactNode; delay?: number; y?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.9, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function CountUp({ value, format = (n: number) => Math.round(n).toLocaleString("en-US"), className }: { value: number; format?: (n: number) => string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { stiffness: 50, damping: 20 });
  const text = useTransform(spring, (v) => format(v));
  useEffect(() => {
    if (inView) mv.set(value);
  }, [inView, value, mv]);
  return <motion.span ref={ref} className={clsx("tabular", className)}>{text}</motion.span>;
}

export function Segmented<T extends string>({ value, options, onChange, size = "md" }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; size?: "sm" | "md" }) {
  return (
    <div className="relative inline-flex rounded-full border border-line bg-surface p-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            "focus-ring relative z-10 rounded-full font-medium transition-colors",
            size === "sm" ? "px-3 py-1 text-[12.5px]" : "px-4 py-1.5 text-[13.5px]",
            value === o.value ? "text-bg" : "text-muted hover:text-ink",
          )}
        >
          {value === o.value && (
            <motion.span layoutId={"seg-" + options.map((x) => x.value).join("")} className="absolute inset-0 -z-10 rounded-full bg-ink" transition={{ type: "spring", stiffness: 500, damping: 40 }} />
          )}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SampleNote({ className }: { className?: string }) {
  return (
    <span className={clsx("label !text-[10px]", className)}>Sample data · prototype</span>
  );
}

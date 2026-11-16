import { motion } from "framer-motion";
import { useMemo } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DailyPoint } from "../data/types";
import { SPLIT } from "../data/types";
import { compact, pct, shortDate, usd } from "../lib/format";

const axis = { stroke: "var(--muted)", fontSize: 11, fontFamily: "var(--font-mono)", tickLine: false, axisLine: false } as const;

function Tip({ active, payload, label, fmt }: { active?: boolean; payload?: { name: string; value: number; color: string; dataKey: string }[]; label?: string; fmt: (k: string, v: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-line bg-surface/95 px-3.5 py-2.5 shadow-xl backdrop-blur-md">
      <div className="label mb-1.5">{label ? shortDate(label) : ""}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-[12.5px]">
          <span className="size-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted">{p.name}</span>
          <span className="ml-auto pl-4 font-mono font-medium tabular">{fmt(p.dataKey, p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export type ChartKind = "money" | "views" | "clicks";

export function PerformanceChart({ series, kind }: { series: DailyPoint[]; kind: ChartKind }) {
  const data = useMemo(() => {
    let fund = 0, spend = 0;
    return series.map((p) => {
      fund += p.crowd + p.org;
      spend += p.spent;
      return { ...p, funded: Math.round(fund), spentCum: Math.round(spend), ctr: p.impressions ? p.clicks / p.impressions : 0 };
    });
  }, [series]);

  if (!data.length) return <div className="grid h-[300px] place-items-center text-[14px] text-muted">No delivery yet — performance appears once the ad goes live.</div>;

  return (
    <motion.div key={kind} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="h-[300px] w-full">
      <ResponsiveContainer>
        {kind === "money" ? (
          <AreaChart data={data} margin={{ top: 10, right: 6, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gFund" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--flare)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--flare)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gSpend" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--violet)" stopOpacity={0.3} />
                <stop offset="100%" stopColor="var(--violet)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 4" />
            <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={40} {...axis} />
            <YAxis tickFormatter={(v) => "$" + compact(v)} width={48} {...axis} />
            <Tooltip cursor={{ stroke: "var(--line-2)" }} content={<Tip fmt={(_, v) => usd(v)} />} />
            <Area type="monotone" dataKey="funded" name="Funded (cumulative)" stroke="var(--flare)" strokeWidth={2.2} fill="url(#gFund)" animationDuration={1200} />
            <Area type="monotone" dataKey="spentCum" name="Spent on ads (cumulative)" stroke="var(--violet)" strokeWidth={2.2} fill="url(#gSpend)" animationDuration={1400} />
          </AreaChart>
        ) : kind === "views" ? (
          <BarChart data={data} margin={{ top: 10, right: 6, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 4" />
            <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={40} {...axis} />
            <YAxis tickFormatter={(v) => compact(v)} width={48} {...axis} />
            <Tooltip cursor={{ fill: "var(--surface-2)" }} content={<Tip fmt={(_, v) => compact(v)} />} />
            <Bar dataKey="impressions" name="Views" fill="var(--ink)" radius={[4, 4, 0, 0]} animationDuration={1000} />
          </BarChart>
        ) : (
          <ComposedChart data={data} margin={{ top: 10, right: 6, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 4" />
            <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={40} {...axis} />
            <YAxis yAxisId="l" tickFormatter={(v) => compact(v)} width={40} {...axis} />
            <YAxis yAxisId="r" orientation="right" tickFormatter={(v) => pct(v, 1)} width={44} {...axis} />
            <Tooltip cursor={{ fill: "var(--surface-2)" }} content={<Tip fmt={(k, v) => (k === "ctr" ? pct(v) : compact(v))} />} />
            <Bar yAxisId="l" dataKey="clicks" name="Link clicks" fill="var(--mint)" radius={[4, 4, 0, 0]} animationDuration={1000} />
            <Line yAxisId="r" type="monotone" dataKey="ctr" name="Click-through" stroke="var(--flare)" strokeWidth={2} dot={false} animationDuration={1400} />
          </ComposedChart>
        )}
      </ResponsiveContainer>
    </motion.div>
  );
}

/** Where every dollar funded to this ad goes */
export function MoneyFlow({ funded, spent }: { funded: number; spent: number }) {
  const ad = funded * SPLIT.adSpend;
  const queued = Math.max(0, ad - spent);
  const parts = [
    { label: "Spent on TikTok", value: spent, color: "var(--violet)" },
    { label: "Queued ad spend", value: queued, color: "color-mix(in oklab, var(--violet) 35%, transparent)" },
    { label: "Creator (7.5%)", value: funded * SPLIT.creator, color: "var(--flare)" },
    { label: "Crowdi (2.5%)", value: funded * SPLIT.platform, color: "var(--ink-2)" },
  ];
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-2">
        {parts.map((p, i) => (
          <motion.div
            key={p.label}
            initial={{ width: 0 }}
            whileInView={{ width: `${funded ? (p.value / funded) * 100 : 0}%` }}
            viewport={{ once: true }}
            transition={{ duration: 1.1, delay: 0.1 * i, ease: [0.16, 1, 0.3, 1] }}
            style={{ background: p.color }}
            className="h-full"
          />
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3">
        {parts.map((p) => (
          <div key={p.label} className="flex items-center gap-2 text-[13px]">
            <span className="size-2.5 rounded-full" style={{ background: p.color }} />
            <span className="text-muted">{p.label}</span>
            <span className="ml-auto font-mono font-medium tabular">{usd(p.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { BackRow, GrPoint, YearRow } from "@/lib/seismo/model";

const tooltipStyle = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-line)",
  borderRadius: 12,
  color: "var(--color-fg)",
  fontSize: 12,
};

export function GutenbergChart({ points }: { points: GrPoint[] }) {
  return (
    <div className="h-56 w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--color-line)" vertical={false} />
          <XAxis dataKey="mag" stroke="var(--color-muted)" tick={{ fill: "var(--color-muted)", fontSize: 12 }} />
          <YAxis
            stroke="var(--color-muted)"
            tick={{ fill: "var(--color-muted)", fontSize: 12 }}
            width={36}
            domain={["auto", "auto"]}
          />
          <Tooltip contentStyle={tooltipStyle} />
          <Line type="monotone" dataKey="logN" name="觀測 log10 N" stroke="var(--color-accent)" dot={false} strokeWidth={2} />
          <Line type="monotone" dataKey="fit" name="Aki 擬合" stroke="var(--color-primary)" dot={false} strokeWidth={2} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function YearChart({ rows }: { rows: YearRow[] }) {
  return (
    <div className="h-52 w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--color-line)" vertical={false} />
          <XAxis dataKey="year" stroke="var(--color-muted)" tick={{ fill: "var(--color-muted)", fontSize: 12 }} interval={4} />
          <YAxis stroke="var(--color-muted)" tick={{ fill: "var(--color-muted)", fontSize: 12 }} width={36} />
          <Tooltip contentStyle={tooltipStyle} />
          <Bar dataKey="aboveMc" name="M ≥ Mc" fill="var(--color-accent)" radius={[2, 2, 0, 0]} />
          <Line type="monotone" dataKey="m6" name="M ≥ 6" stroke="var(--color-primary)" dot={false} strokeWidth={2} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BacktestChart({ rows }: { rows: BackRow[] }) {
  return (
    <div className="h-52 w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--color-line)" vertical={false} />
          <XAxis dataKey="year" stroke="var(--color-muted)" tick={{ fill: "var(--color-muted)", fontSize: 12 }} />
          <YAxis stroke="var(--color-muted)" tick={{ fill: "var(--color-muted)", fontSize: 12 }} width={36} />
          <Tooltip contentStyle={tooltipStyle} />
          <Bar dataKey="observed" name="實際次數" fill="var(--color-accent)" radius={[2, 2, 0, 0]} />
          <Line type="monotone" dataKey="expected" name="事前期望" stroke="var(--color-primary)" dot={false} strokeWidth={2} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

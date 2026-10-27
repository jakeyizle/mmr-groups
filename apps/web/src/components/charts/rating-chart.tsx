import type { RatingPoint } from "@mmr/core";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const day = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});
const full = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export interface Series {
  id: string;
  name: string;
  /** A fixed slot per entity, so filtering never repaints survivors. */
  color: string;
  points: RatingPoint[];
}

/**
 * Displayed rating over time (STATS-001/006): 2 px lines, hairline grid,
 * crosshair tooltip. Text stays in ink tokens; color only marks identity.
 */
export function RatingChart({
  series,
  label,
}: {
  series: Series[];
  label: string;
}) {
  return (
    <figure aria-label={label} className="h-56 w-full text-xs">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(t: number) => day.format(t)}
            stroke="var(--muted-foreground)"
            tickLine={false}
            allowDuplicatedCategory={false}
          />
          <YAxis
            dataKey="rating"
            domain={["auto", "auto"]}
            stroke="var(--muted-foreground)"
            tickLine={false}
            axisLine={false}
            width={48}
          />
          <Tooltip
            labelFormatter={(t) => full.format(Number(t))}
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              color: "var(--popover-foreground)",
            }}
          />
          {series.map((s) => (
            <Line
              key={s.id}
              name={s.name}
              data={s.points.map((p) => ({
                t: Date.parse(p.at),
                rating: p.rating,
              }))}
              dataKey="rating"
              stroke={s.color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, stroke: "var(--background)", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </figure>
  );
}

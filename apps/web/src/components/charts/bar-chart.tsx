import {
  Bar,
  BarChart as RBarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * One series of counts (matches per week, ratings per bucket): thin bars with
 * rounded tops anchored to the baseline, hairline grid, per-bar tooltip.
 */
export function BarChart({
  data,
  label,
  valueName,
}: {
  data: { label: string; value: number }[];
  label: string;
  valueName: string;
}) {
  return (
    <figure aria-label={label} className="h-44 w-full text-xs">
      <ResponsiveContainer width="100%" height="100%">
        <RBarChart
          data={data}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
        >
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="label"
            stroke="var(--muted-foreground)"
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            allowDecimals={false}
            stroke="var(--muted-foreground)"
            tickLine={false}
            axisLine={false}
            width={32}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)" }}
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              color: "var(--popover-foreground)",
            }}
          />
          <Bar
            dataKey="value"
            name={valueName}
            fill="var(--series-1)"
            radius={[4, 4, 0, 0]}
            maxBarSize={24}
            isAnimationActive={false}
          />
        </RBarChart>
      </ResponsiveContainer>
    </figure>
  );
}

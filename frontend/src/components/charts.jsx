import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from "recharts";
import { Card, Empty } from "./ui";

export const C = { ink: "#151A21", saffron: "#E0740F", before: "#C2412D", after: "#0E7C6B", sky: "#3A7CA5", muted: "#A3ACB8", grid: "#ECE8DF", violet: "#7B61C9" };
export const SERIES = [C.saffron, C.ink, C.after, C.sky, C.violet, C.before];

const axis = { tick: { fontSize: 11, fill: "#5B6675" }, tickLine: false, axisLine: { stroke: C.grid } };
const tip = { contentStyle: { borderRadius: 10, border: "1px solid #DDD7CA", fontSize: 12, boxShadow: "0 4px 16px rgba(0,0,0,.06)" }, cursor: { fill: "rgba(224,116,15,.06)" } };

export function ChartCard({ title, subtitle, height = 260, children, action, empty }) {
  return (
    <Card title={title} subtitle={subtitle} action={action} bodyClass="px-2 pb-3 pt-2">
      {empty ? <Empty title="No data yet" icon="chart" /> : (
        <div style={{ height }}><ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer></div>
      )}
    </Card>
  );
}

/* Bars/Lines forward the width/height that ResponsiveContainer injects into its direct child. */
/** Generic bar chart: series = [{key, name, color}] */
export function Bars({ data, x, series, stacked, layout, refY, unit, width, height }) {
  const vertical = layout === "vertical";
  // long category names (dish names) are tilted so they don't overlap
  const tilt = (data?.length || 0) > 6 && Math.max(...(data || []).map((d) => String(d[x] ?? "").length)) > 6;
  return (
    <BarChart width={width} height={height} data={data} layout={vertical ? "vertical" : "horizontal"} margin={{ top: 8, right: 16, left: vertical ? 24 : -8, bottom: 0 }}>
      <CartesianGrid stroke={C.grid} vertical={vertical} horizontal={!vertical} />
      {vertical ? <><XAxis type="number" {...axis} unit={unit} /><YAxis type="category" dataKey={x} {...axis} width={120} /></>
        : <><XAxis dataKey={x} {...axis} interval={tilt ? 0 : "preserveStartEnd"} angle={tilt ? -35 : 0} textAnchor={tilt ? "end" : "middle"} height={tilt ? 80 : 30} /><YAxis {...axis} unit={unit} /></>}
      <Tooltip {...tip} />
      {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />}
      {refY != null && <ReferenceLine y={refY} stroke={C.before} strokeDasharray="4 4" />}
      {series.map((s, i) => (
        <Bar key={s.key} dataKey={s.key} name={s.name || s.key} fill={s.color || SERIES[i]} stackId={stacked ? "a" : undefined}
          radius={stacked ? 0 : vertical ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={36} />
      ))}
    </BarChart>
  );
}

export function Lines({ data, x, series, area, refY, refLabel, unit, xLabel, width, height }) {
  const Chart = area ? AreaChart : LineChart;
  return (
    <Chart width={width} height={height} data={data} margin={{ top: 8, right: 16, left: -8, bottom: xLabel ? 12 : 0 }}>
      <CartesianGrid stroke={C.grid} vertical={false} />
      <XAxis dataKey={x} {...axis} interval="preserveStartEnd" label={xLabel ? { value: xLabel, position: "insideBottom", offset: -6, fontSize: 11, fill: "#5B6675" } : undefined} />
      <YAxis {...axis} unit={unit} />
      <Tooltip {...tip} />
      {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} verticalAlign="top" height={28} />}
      {refY != null && <ReferenceLine y={refY} stroke={C.before} strokeDasharray="4 4" label={refLabel ? { value: refLabel, fontSize: 10, fill: C.before, position: "insideTopRight" } : undefined} />}
      {series.map((s, i) => area
        ? <Area key={s.key} type="monotone" dataKey={s.key} name={s.name || s.key} stroke={s.color || SERIES[i]} fill={s.color || SERIES[i]} fillOpacity={0.12} strokeWidth={2} dot={false} />
        : <Line key={s.key} type="monotone" dataKey={s.key} name={s.name || s.key} stroke={s.color || SERIES[i]} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />)}
    </Chart>
  );
}

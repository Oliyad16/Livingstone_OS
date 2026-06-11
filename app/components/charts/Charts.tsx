'use client'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import { CHART, SERIES_COLORS, axisProps, compact } from './theme'
import { TipBox } from './ChartFrame'

type AnyObj = Record<string, number | string>

/* ----------------------------- Donut ----------------------------- */
export function DonutChart({
  data,
  format = (n: number) => n.toLocaleString(),
  centerLabel,
  centerValue,
}: {
  data: { name: string; value: number }[]
  format?: (n: number) => string
  centerLabel?: string
  centerValue?: string
}) {
  const total = data.reduce((s, d) => s + d.value, 0)
  return (
    <div className="relative h-full">
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius="60%" outerRadius="92%" paddingAngle={data.length > 1 ? 2 : 0} stroke="none" isAnimationActive>
            {data.map((d, i) => <Cell key={`${d.name}-${i}`} fill={SERIES_COLORS[i % SERIES_COLORS.length]} />)}
          </Pie>
          <Tooltip content={({ active, payload }) =>
            active && payload?.length ? (
              <TipBox rows={[{
                name: String(payload[0].name),
                value: `${format(Number(payload[0].value))} · ${Math.round((Number(payload[0].value) / (total || 1)) * 100)}%`,
                color: payload[0].payload?.fill,
              }]} />
            ) : null
          } />
        </PieChart>
      </ResponsiveContainer>
      {(centerLabel || centerValue) && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          {centerValue && <span className="text-2xl font-bold text-white leading-none" style={{ fontFamily: 'var(--font-serif)' }}>{centerValue}</span>}
          {centerLabel && <span className="text-[11px] text-gray-500 mt-1">{centerLabel}</span>}
        </div>
      )}
    </div>
  )
}

export function ChartLegend({
  data,
  format = (n: number) => n.toLocaleString(),
}: {
  data: { name: string; value: number }[]
  format?: (n: number) => string
}) {
  const total = data.reduce((s, d) => s + d.value, 0)
  return (
    <ul className="space-y-2">
      {data.map((d, i) => (
        <li key={`${d.name}-${i}`} className="flex items-center gap-2 text-sm">
          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }} />
          <span className="text-gray-400 capitalize truncate">{d.name}</span>
          <span className="ml-auto font-semibold text-white">{format(d.value)}</span>
          <span className="text-gray-500 w-9 text-right">{Math.round((d.value / (total || 1)) * 100)}%</span>
        </li>
      ))}
    </ul>
  )
}

/* ----------------------------- Bar series ----------------------------- */
export function BarSeries({
  data,
  xKey,
  barKey,
  color = CHART.gold,
  format = (n: number) => n.toLocaleString(),
  horizontal = false,
  colorByIndex = false,
}: {
  data: AnyObj[]
  xKey: string
  barKey: string
  color?: string
  format?: (n: number) => string
  horizontal?: boolean
  colorByIndex?: boolean
}) {
  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
      <BarChart data={data} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ top: 8, right: 12, left: horizontal ? 8 : -8, bottom: 0 }}>
        <CartesianGrid stroke={CHART.grid} vertical={horizontal} horizontal={!horizontal} />
        {horizontal ? (
          <>
            <XAxis type="number" {...axisProps} tickFormatter={format} />
            <YAxis type="category" dataKey={xKey} {...axisProps} width={110} />
          </>
        ) : (
          <>
            <XAxis dataKey={xKey} {...axisProps} />
            <YAxis {...axisProps} tickFormatter={format} width={40} />
          </>
        )}
        <Tooltip cursor={{ fill: 'rgba(154,119,35,0.06)' }} content={({ active, payload, label }) =>
          active && payload?.length ? (
            <TipBox label={String(label)} rows={[{ name: String(payload[0].name), value: format(Number(payload[0].value)), color: payload[0].payload?.fill || color }]} />
          ) : null
        } />
        <Bar dataKey={barKey} radius={horizontal ? [0, 6, 6, 0] : [6, 6, 0, 0]} isAnimationActive maxBarSize={46}>
          {data.map((_, i) => <Cell key={i} fill={colorByIndex ? SERIES_COLORS[i % SERIES_COLORS.length] : color} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/* ----------------------------- Area trend ----------------------------- */
export function AreaTrend({
  data,
  xKey,
  series,
  format = compact,
}: {
  data: AnyObj[]
  xKey: string
  series: { key: string; name: string; color: string }[]
  format?: (n: number) => string
}) {
  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <defs>
          {series.map(s => (
            <linearGradient key={s.key} id={`ag-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={0.32} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid stroke={CHART.grid} vertical={false} />
        <XAxis dataKey={xKey} {...axisProps} />
        <YAxis {...axisProps} tickFormatter={format} width={40} />
        <Tooltip cursor={{ stroke: CHART.goldSoft, strokeWidth: 1 }} content={({ active, payload, label }) =>
          active && payload?.length ? (
            <TipBox label={String(label)} rows={payload.map(p => ({ name: String(p.name), value: format(Number(p.value)), color: p.color }))} />
          ) : null
        } />
        {series.map(s => (
          <Area key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2.5} fill={`url(#ag-${s.key})`} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} isAnimationActive />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  )
}

/* ----------------------------- Peak-time heat bars -----------------------------
   24 vertical bars (one per hour), opacity/height encodes traffic. Pure CSS/SVG
   via Recharts Bar — gold intensity = busier. */
export function HourBars({ data }: { data: { hour: number; users: number }[] }) {
  const rows = Array.from({ length: 24 }, (_, h) => {
    const found = data.find(d => d.hour === h)
    return { hour: h, label: h === 0 ? '12a' : h === 12 ? '12p' : h < 12 ? `${h}a` : `${h - 12}p`, users: found?.users || 0 }
  })
  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
      <BarChart data={rows} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
        <CartesianGrid stroke={CHART.grid} vertical={false} />
        <XAxis dataKey="label" {...axisProps} interval={2} />
        <YAxis {...axisProps} tickFormatter={compact} width={36} />
        <Tooltip cursor={{ fill: 'rgba(154,119,35,0.06)' }} content={({ active, payload, label }) =>
          active && payload?.length ? <TipBox label={`${label}`} rows={[{ name: 'Users', value: compact(Number(payload[0].value)), color: CHART.gold }]} /> : null
        } />
        <Bar dataKey="users" radius={[3, 3, 0, 0]} isAnimationActive maxBarSize={20} fill={CHART.gold} />
      </BarChart>
    </ResponsiveContainer>
  )
}

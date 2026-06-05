'use client'
import type { ReactNode } from 'react'

// A titled card wrapping every chart, with an optional plain-language
// "what this means" explainer line and a graceful empty state.
export function ChartFrame({
  title,
  subtitle,
  explainer,
  trailing,
  empty,
  emptyHint,
  height = 260,
  children,
}: {
  title: string
  subtitle?: string
  explainer?: string
  trailing?: ReactNode
  empty?: boolean
  emptyHint?: string
  height?: number
  children: ReactNode
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 break-inside-avoid">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <h3 className="text-base font-semibold text-white leading-tight">{title}</h3>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        {trailing}
      </div>
      {explainer && (
        <p className="text-[11px] text-gray-500 italic mb-3 leading-snug">{explainer}</p>
      )}
      {empty ? (
        <div
          className="flex flex-col items-center justify-center text-center rounded-xl border border-dashed border-gray-800 bg-gray-950"
          style={{ height }}
        >
          <p className="text-sm text-gray-500">No data yet</p>
          {emptyHint && <p className="text-xs text-gray-600 mt-1 max-w-xs">{emptyHint}</p>}
        </div>
      ) : (
        <div style={{ width: '100%', height }}>{children}</div>
      )}
    </div>
  )
}

// Shared tooltip styled to the warm theme.
export function TipBox({
  label,
  rows,
}: {
  label?: string
  rows: { name: string; value: string; color?: string }[]
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 px-3 py-2 shadow-[0_8px_24px_-10px_rgba(40,33,16,0.3)]">
      {label && <p className="text-[11px] font-semibold text-white mb-1">{label}</p>}
      <div className="space-y-0.5">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2 text-[11px]">
            {r.color && <span className="h-2 w-2 rounded-full" style={{ background: r.color }} />}
            <span className="text-gray-500">{r.name}</span>
            <span className="ml-auto font-semibold text-white">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

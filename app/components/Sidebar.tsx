'use client'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useWorkspace } from './WorkspaceContext'

// Minimal stroke icons (no icon dependency) keyed by nav href.
function Icon({ name }: { name: string }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  switch (name) {
    case '/':
      return <svg {...common}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></svg>
    case '/leads':
      return <svg {...common}><circle cx="9" cy="8" r="3.2" /><path d="M3 20a6 6 0 0 1 12 0" /><path d="M16 4.5a3 3 0 0 1 0 6M18 20a6 6 0 0 0-3-5" /></svg>
    case '/followups':
      return <svg {...common}><path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z" /></svg>
    case '/clients':
      return <svg {...common}><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 9h8M8 13h5" /></svg>
    case '/analytics':
      return <svg {...common}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>
    case '/authority':
      return <svg {...common}><path d="m12 3 2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5z" /></svg>
    case '/financials':
      return <svg {...common}><path d="M12 2v20M17 6.5c0-2-2.2-3-5-3s-5 1-5 3 2.5 2.8 5 3.5 5 1.5 5 3.5-2.2 3-5 3-5-1-5-3" /></svg>
    case '/opportunities':
      return <svg {...common}><path d="m12 2 2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 14.8 7.2 17l.9-5.4L4.2 7.7l5.4-.8z" /></svg>
    case '/opportunities/intake':
      return <svg {...common}><path d="M4 4h16v12H5.2L4 17.2z" /><path d="M8 9h8M8 12h5" /></svg>
    default:
      return <svg {...common}><circle cx="12" cy="12" r="9" /></svg>
  }
}

// Nav differs per workspace. Overview/Clients/Analytics/Financials are shared;
// Private adds Leads/Follow-ups/Authority, Government adds Opportunities.
const PRIVATE_NAV = [
  { href: '/', label: 'Overview' },
  { href: '/leads', label: 'Leads' },
  { href: '/followups', label: 'Follow-ups' },
  { href: '/clients', label: 'Clients' },
  { href: '/analytics', label: 'Analytics' },
  { href: '/authority', label: 'Authority' },
  { href: '/financials', label: 'Financials' },
]

const GOVERNMENT_NAV = [
  { href: '/', label: 'Overview' },
  { href: '/opportunities', label: 'Opportunities' },
  { href: '/opportunities/intake', label: 'Intake' },
  { href: '/clients', label: 'Clients' },
  { href: '/analytics', label: 'Analytics' },
  { href: '/financials', label: 'Financials' },
]

// Client cockpit: a focused workspace for managing clients.
const CLIENT_NAV = [
  { href: '/clients', label: 'All Clients' },
  { href: '/analytics', label: 'Analytics' },
  { href: '/financials', label: 'Client Financials' },
]

export default function Sidebar() {
  const path = usePathname()
  const { workspace } = useWorkspace()
  const nav =
    workspace === 'government' ? GOVERNMENT_NAV : workspace === 'client' ? CLIENT_NAV : PRIVATE_NAV

  return (
    <aside className="w-60 bg-gray-900 border-r border-gray-800 flex flex-col py-7 px-4 shrink-0">
      <Link href="/" className="mb-9 flex items-center gap-3 px-1 group">
        <span className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-[0_4px_16px_-6px_rgba(154,119,35,0.5)] ring-1 ring-gray-800 overflow-hidden shrink-0">
          <Image src="/logo.png" alt="Living Stone Solutions" width={48} height={48} className="object-contain p-0.5" priority />
        </span>
        <div className="leading-tight">
          <p className="text-[10px] text-gold uppercase tracking-[0.18em] font-semibold mb-0.5">Living Stone</p>
          <h1 className="text-[15px] font-bold text-white leading-tight" style={{ fontFamily: 'var(--font-serif)' }}>Command Center</h1>
        </div>
      </Link>

      <nav className="flex flex-col gap-1">
        {nav.map(({ href, label }) => {
          const active = path === href
          return (
            <Link
              key={href}
              href={href}
              className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                active
                  ? 'bg-blue-800 text-white shadow-[0_6px_16px_-8px_rgba(154,119,35,0.6)]'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-gray-300'
              }`}
            >
              <span className={active ? 'text-white' : 'text-gray-500 group-hover:text-gold'}>
                <Icon name={href} />
              </span>
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="mt-auto pt-6">
        <div className="rounded-xl border border-gray-800 bg-gray-950 px-3 py-3">
          <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Status</p>
          <p className="flex items-center gap-2 text-xs text-gray-400">
            <span className="h-2 w-2 rounded-full bg-green-600 shadow-[0_0_0_3px_rgba(5,150,105,0.15)]" />
            All systems connected
          </p>
        </div>
      </div>
    </aside>
  )
}

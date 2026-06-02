'use client'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useWorkspace } from './WorkspaceContext'

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
    <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col py-8 px-4 shrink-0">
      <div className="mb-10 flex items-center gap-3">
        <Image src="/logo.png" alt="Living Stone Solutions" width={44} height={44} className="rounded-full shrink-0" priority />
        <div>
          <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-0.5">Living Stone</p>
          <h1 className="text-base font-bold text-white leading-tight">Command Center</h1>
        </div>
      </div>
      <nav className="flex flex-col gap-1">
        {nav.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              path === href
                ? 'bg-blue-800 text-white'
                : 'text-gray-400 hover:bg-gray-800 hover:text-white'
            }`}
          >
            {label}
          </Link>
        ))}
      </nav>
    </aside>
  )
}

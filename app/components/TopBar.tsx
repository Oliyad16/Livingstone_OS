'use client'
import { useRouter } from 'next/navigation'
import { useWorkspace, type Workspace } from './WorkspaceContext'

const TABS: { key: Workspace; label: string; hint: string }[] = [
  { key: 'private', label: 'Private', hint: 'SMB · GEO · Web' },
  { key: 'government', label: 'Government', hint: 'Capture · RFPs' },
  { key: 'client', label: 'Client', hint: 'All clients · GA4' },
]

export default function TopBar() {
  const { workspace, setWorkspace } = useWorkspace()
  const router = useRouter()

  function switchTo(key: Workspace) {
    setWorkspace(key)
    // Land on the right home for the mode (Client cockpit opens on the list).
    router.push(key === 'client' ? '/clients' : '/')
  }

  async function logout() {
    await fetch('/api/logout', { method: 'POST' }).catch(() => {})
    window.location.href = '/login'
  }

  return (
    <header className="h-16 shrink-0 glass-bar border-b border-gray-800 flex items-center px-6 gap-4 z-10">
      <span className="hidden sm:inline text-[10px] text-gray-500 uppercase tracking-[0.2em] font-semibold">
        Workspace
      </span>

      <div className="flex bg-gray-950 border border-gray-800 rounded-xl p-1 shadow-soft">
        {TABS.map(t => {
          const active = workspace === t.key
          return (
            <button
              key={t.key}
              onClick={() => switchTo(t.key)}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                active
                  ? 'bg-blue-800 text-white'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      <span className="hidden md:inline text-xs text-gray-500">
        {TABS.find(t => t.key === workspace)?.hint}
      </span>

      <button
        onClick={logout}
        className="ml-auto flex items-center gap-2 rounded-lg border border-gray-800 px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-300 hover:border-gray-700 transition-colors"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <path d="m16 17 5-5-5-5M21 12H9" />
        </svg>
        Sign out
      </button>
    </header>
  )
}

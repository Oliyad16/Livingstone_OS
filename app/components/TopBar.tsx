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

  return (
    <header className="h-14 shrink-0 bg-gray-950 border-b border-gray-800 flex items-center px-6 gap-4">
      <span className="text-xs text-gray-600 uppercase tracking-widest">Workspace</span>
      <div className="flex bg-gray-900 border border-gray-800 rounded-lg p-0.5">
        {TABS.map(t => {
          const active = workspace === t.key
          return (
            <button
              key={t.key}
              onClick={() => switchTo(t.key)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                active ? 'bg-blue-800 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              {t.label}
            </button>
          )
        })}
      </div>
      <span className="text-xs text-gray-600">
        {TABS.find(t => t.key === workspace)?.hint}
      </span>
    </header>
  )
}

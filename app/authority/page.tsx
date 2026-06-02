'use client'
import { useEffect, useState } from 'react'
import { useWorkspace } from '../components/WorkspaceContext'

interface Post {
  id: string; topic: string; body: string; status: string; source: string
  scheduledFor: string | null; createdAt: string; postedAt: string | null
}

const FILTERS = ['draft', 'approved', 'posted'] as const

export default function Authority() {
  const [posts, setPosts] = useState<Post[]>([])
  const [topic, setTopic] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [generating, setGenerating] = useState(false)
  const [filter, setFilter] = useState<string>('draft')
  const [editing, setEditing] = useState<Record<string, string>>({})
  const [copiedId, setCopiedId] = useState('')
  const [li, setLi] = useState<{ connected: boolean; name: string | null }>({ connected: false, name: null })
  const [publishing, setPublishing] = useState('')
  const { workspace } = useWorkspace()

  async function load() {
    const res = await fetch(`/api/posts?workspace=${workspace}`)
    setPosts(await res.json())
  }
  useEffect(() => {
    load()
    fetch('/api/posts/suggestions').then(r => r.json()).then(j => setSuggestions(j.topics || []))
    fetch('/api/linkedin/status').then(r => r.json()).then(setLi).catch(() => {})
  }, [workspace])

  async function publish(id: string) {
    setPublishing(id)
    const res = await fetch('/api/posts/publish', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    const j = await res.json()
    setPublishing('')
    if (!res.ok) alert(`Publish failed: ${j.error}`)
    else load()
  }

  async function generate(t?: string) {
    const useTopic = (t ?? topic).trim()
    if (!useTopic) return
    setGenerating(true)
    await fetch('/api/posts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: useTopic, workspace }),
    })
    setTopic(''); setGenerating(false); setFilter('draft'); load()
  }

  async function update(id: string, patch: Partial<Post>) {
    await fetch('/api/posts', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...patch }),
    })
    load()
  }

  async function remove(id: string) {
    await fetch('/api/posts', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    load()
  }

  async function copy(p: Post) {
    await navigator.clipboard.writeText(editing[p.id] ?? p.body)
    setCopiedId(p.id); setTimeout(() => setCopiedId(''), 2000)
  }

  const counts = {
    draft: posts.filter(p => p.status === 'draft').length,
    approved: posts.filter(p => p.status === 'approved').length,
    posted: posts.filter(p => p.status === 'posted').length,
  }
  const shown = posts.filter(p => p.status === filter)

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold">Authority</h2>
          <p className="text-gray-400 text-sm">Build GEO authority on LinkedIn. Draft in your voice, approve, post.</p>
        </div>
        {li.connected ? (
          <span className="text-xs text-green-400 bg-green-950/40 border border-green-900 px-3 py-1.5 rounded-lg">LinkedIn connected{li.name ? ` · ${li.name}` : ''}</span>
        ) : (
          <a href="/api/linkedin/auth" className="text-xs bg-blue-800 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg">Connect LinkedIn</a>
        )}
      </div>

      {/* Generator */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
        <div className="flex gap-2 mb-3">
          <input
            value={topic}
            onChange={e => setTopic(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') generate() }}
            placeholder="Post topic (e.g. why SEO alone no longer gets you found)"
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-700"
          />
          <button onClick={() => generate()} disabled={generating || !topic.trim()} className="bg-blue-800 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap">
            {generating ? 'Writing…' : 'Generate draft'}
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map(s => (
            <button key={s} onClick={() => generate(s)} disabled={generating} className="text-xs px-2.5 py-1 rounded-full bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 disabled:opacity-50">
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-5">
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize ${filter === f ? 'bg-blue-800 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
            {f} ({counts[f]})
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
          <p className="text-gray-400 text-sm">No {filter} posts. Generate one above.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {shown.map(p => {
            const value = editing[p.id] ?? p.body
            return (
              <div key={p.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-gray-500">
                    {p.topic} · <span className="capitalize">{p.source}</span>
                    {p.source === 'template' && <span className="ml-1 text-amber-500">(no API key — template)</span>}
                  </p>
                  <button onClick={() => remove(p.id)} className="text-xs text-gray-600 hover:text-red-400">delete</button>
                </div>
                <textarea
                  value={value}
                  onChange={e => setEditing({ ...editing, [p.id]: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white h-56 resize-y focus:outline-none focus:border-blue-700 leading-relaxed"
                />
                <div className="flex flex-wrap gap-2 mt-3">
                  {editing[p.id] !== undefined && editing[p.id] !== p.body && (
                    <button onClick={() => update(p.id, { body: editing[p.id] })} className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white px-3 py-1.5 rounded-lg text-sm">Save edit</button>
                  )}
                  <button onClick={() => copy(p)} className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white px-3 py-1.5 rounded-lg text-sm">
                    {copiedId === p.id ? 'Copied ✓' : 'Copy'}
                  </button>
                  {p.status === 'draft' && (
                    <button onClick={() => update(p.id, { status: 'approved', body: value })} className="bg-green-700 hover:bg-green-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium">Approve</button>
                  )}
                  {p.status === 'approved' && (
                    <>
                      <button onClick={() => update(p.id, { status: 'draft' })} className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 px-3 py-1.5 rounded-lg text-sm">Back to draft</button>
                      {li.connected ? (
                        <button onClick={() => publish(p.id)} disabled={publishing === p.id} className="bg-blue-800 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-sm font-medium ml-auto">
                          {publishing === p.id ? 'Posting…' : 'Publish to LinkedIn'}
                        </button>
                      ) : (
                        <button onClick={() => update(p.id, { status: 'posted' })} className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 px-3 py-1.5 rounded-lg text-sm ml-auto">Mark posted</button>
                      )}
                    </>
                  )}
                  {p.status === 'posted' && p.postedAt && (
                    <span className="text-xs text-gray-600 self-center ml-auto">Posted {new Date(p.postedAt).toLocaleDateString()}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

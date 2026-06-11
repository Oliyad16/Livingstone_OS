'use client'

import { useState } from 'react'
import Image from 'next/image'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      if (res.ok) {
        // Full reload so the proxy sees the new cookie on the next navigation.
        window.location.href = '/'
        return
      }
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Login failed.')
    } catch {
      setError('Network error. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-[70vh] px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-3xl border border-gray-800 bg-gray-900 p-8 text-center">
        <span className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-white ring-1 ring-gray-800 shadow-[0_8px_24px_-10px_rgba(154,119,35,0.55)] overflow-hidden">
          <Image src="/logo.png" alt="Living Stone Solutions" width={64} height={64} className="object-contain p-1" priority />
        </span>
        <p className="text-[10px] text-gold uppercase tracking-[0.22em] font-semibold mb-1">Living Stone Solutions</p>
        <h1 className="text-2xl font-bold text-white mb-1">Command Center</h1>
        <div className="gold-divider mx-auto my-3" />
        <p className="text-sm text-gray-500 mb-6">Sign in to continue.</p>

        <input
          type="text"
          autoFocus
          autoComplete="username"
          value={username}
          onChange={e => setUsername(e.target.value)}
          placeholder="Username"
          className="w-full rounded-xl bg-gray-950 border border-gray-700 px-4 py-2.5 mb-3 text-center outline-none"
        />
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full rounded-xl bg-gray-950 border border-gray-700 px-4 py-2.5 mb-3 text-center outline-none"
        />
        {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
        <button
          type="submit"
          disabled={busy || !username || !password}
          className="w-full rounded-xl bg-blue-800 hover:bg-blue-700 text-white font-semibold py-2.5 disabled:opacity-50 transition"
        >
          {busy ? 'Checking…' : 'Enter'}
        </button>
      </form>
    </div>
  )
}

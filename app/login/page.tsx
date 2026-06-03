'use client'

import { useState } from 'react'

export default function LoginPage() {
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
        body: JSON.stringify({ password }),
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
    <div className="flex items-center justify-center min-h-[60vh]">
      <form onSubmit={submit} className="w-full max-w-sm rounded-xl border border-gray-800 bg-gray-900 p-8">
        <h1 className="text-xl font-semibold mb-1">Livingstone Command Center</h1>
        <p className="text-sm text-gray-400 mb-6">Enter the access passphrase to continue.</p>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Passphrase"
          className="w-full rounded-lg bg-gray-950 border border-gray-700 px-3 py-2 mb-3 outline-none focus:border-gray-500"
        />
        {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
        <button
          type="submit"
          disabled={busy || !password}
          className="w-full rounded-lg bg-white text-gray-950 font-medium py-2 disabled:opacity-50"
        >
          {busy ? 'Checking…' : 'Enter'}
        </button>
      </form>
    </div>
  )
}

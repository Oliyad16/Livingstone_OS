'use client'
import { createContext, useContext, useEffect, useState } from 'react'

export type Workspace = 'private' | 'government' | 'client' | 'media'

interface Ctx {
  workspace: Workspace
  setWorkspace: (w: Workspace) => void
}

const WorkspaceCtx = createContext<Ctx>({ workspace: 'private', setWorkspace: () => {} })

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [workspace, setWorkspaceState] = useState<Workspace>('private')

  // Restore persisted choice on mount.
  useEffect(() => {
    const saved = localStorage.getItem('workspace')
    if (saved === 'private' || saved === 'government' || saved === 'client' || saved === 'media') setWorkspaceState(saved)
  }, [])

  function setWorkspace(w: Workspace) {
    setWorkspaceState(w)
    localStorage.setItem('workspace', w)
  }

  return <WorkspaceCtx.Provider value={{ workspace, setWorkspace }}>{children}</WorkspaceCtx.Provider>
}

export function useWorkspace() {
  return useContext(WorkspaceCtx)
}

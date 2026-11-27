import { createContext, useContext, useMemo } from 'react'
import type { TabInit } from './WorkspaceContext'

/** Router-like state of an editor living in a workspace tab (React Router cannot be nested). */
export interface TabRoute {
  route: string
  state: TabInit | null
  clear: () => void
}

export const TabRouteContext = createContext<TabRoute | null>(null)

export function useLocation() {
  const t = useContext(TabRouteContext)
  return useMemo(() => ({ pathname: t?.route ?? '', state: (t?.state ?? null) as TabInit | null, key: String(!!t?.state) }), [t?.route, t?.state])
}

export function useNavigate() {
  const t = useContext(TabRouteContext)
  return useMemo(() => (_to: string, opts?: { replace?: boolean; state?: unknown }) => {
    if (opts && opts.state === null) t?.clear()
  }, [t])
}

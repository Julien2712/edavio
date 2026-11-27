import { Suspense, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ToolRegistry } from '@/tools'
import { TabIdContext, useWorkspace, type TabInit } from './WorkspaceContext'
import { TabRouteContext } from './tabRouter'

export const isEditorRoute = (pathname: string) => ToolRegistry.list().some((t) => t.section === 'edit' && t.component && t.route === pathname)

/** Rendered as the outlet content of an editor route: turns navigation into tabs. */
export function EditorEntry({ route }: { route: string }) {
  const ws = useWorkspace()
  const location = useLocation()
  const navigate = useNavigate()
  const handled = useRef<string | null>(null)
  useEffect(() => {
    if (handled.current === location.key) return
    handled.current = location.key
    const st = location.state as TabInit | null
    if (st && (st.file || st.newBlank || st.project)) {
      ws.open(route, st)
      navigate(location.pathname, { replace: true, state: null })
      return
    }
    const tabs = ws.tabsRef.current
    const active = tabs.find((x) => x.id === ws.activeRef.current)
    if (active?.route === route) return
    const existing = [...tabs].reverse().find((x) => x.route === route)
    if (existing) ws.activate(existing.id)
    else ws.open(route, null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key, location.state])
  return null
}

export function TabBar() {
  const { t } = useTranslation()
  const ws = useWorkspace()
  const navigate = useNavigate()
  if (!ws.tabs.length) return null
  return (
    <div role="tablist" aria-label={t('workspace.tabs')} className="flex h-9 shrink-0 items-end gap-0.5 overflow-x-auto border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] px-2">
      {ws.tabs.map((tab) => {
        const tool = ToolRegistry.getByRoute(tab.route)
        const Icon = tool?.icon
        const active = tab.id === ws.activeId
        return (
          <div key={tab.id} role="tab" aria-selected={active} onMouseDown={(e) => { if (e.button === 1) e.preventDefault() }} onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); ws.requestClose(tab.id) } }}
            className={cn('group flex h-8 max-w-[220px] shrink-0 items-center gap-1.5 rounded-t-lg border border-b-0 pl-3 pr-1 text-xs',
              active ? 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)]' : 'border-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-raised)]')}>
            <button type="button" className="flex min-w-0 items-center gap-1.5 py-1" onClick={() => { ws.activate(tab.id); navigate(tab.route) }}>
              {Icon && <Icon className="size-3.5 shrink-0" aria-hidden />}
              <span className="truncate">{tab.title || t('workspace.untitled')}</span>
            </button>
            <button type="button" aria-label={t('workspace.closeTab')} title={t('workspace.closeTab')} onClick={() => ws.requestClose(tab.id)}
              className="flex size-5 shrink-0 items-center justify-center rounded hover:bg-[var(--color-border)]">
              <X className="size-3" />
            </button>
          </div>
        )
      })}
    </div>
  )
}

/** Keeps every open editor mounted (so switching tabs never loses work) and shows the active one. */
export function WorkspaceHost({ visible }: { visible: boolean }) {
  const ws = useWorkspace()
  return (
    <>
      {ws.tabs.map((tab) => {
        const Component = ToolRegistry.getByRoute(tab.route)?.component
        if (!Component) return null
        const shown = visible && tab.id === ws.activeId
        return (
          <div key={tab.id} className={cn('min-h-0 flex-1 flex-col overflow-y-auto', shown ? 'flex' : 'hidden')}>
            <TabIdContext.Provider value={tab.id}>
              <TabRouteContext.Provider value={{ route: tab.route, state: tab.init, clear: () => ws.clearInit(tab.id) }}>
                <Suspense fallback={null}>
                  <Component />
                </Suspense>
              </TabRouteContext.Provider>
            </TabIdContext.Provider>
          </div>
        )
      })}
    </>
  )
}

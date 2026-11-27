import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { KIND_ROUTE, PROJECT_EXT, downloadFile, projectBlob, readProject, type ProjectFile } from './project'

export interface TabInit {
  file?: File
  newBlank?: boolean
  project?: ProjectFile
}

export interface Tab {
  id: string
  route: string
  title: string
  /** An editor with loaded content: closing it asks for confirmation */
  hasContent: boolean
  init: TabInit | null
}

type Saver = () => Promise<ProjectFile> | ProjectFile

interface Workspace {
  tabs: Tab[]
  activeId: string | null
  open: (route: string, init?: TabInit | null) => string
  activate: (id: string) => void
  requestClose: (id: string) => void
  patch: (id: string, p: Partial<Pick<Tab, 'title' | 'hasContent'>>) => void
  registerSaver: (id: string, fn: Saver | null) => void
  clearInit: (id: string) => void
  saveProject: (id: string) => Promise<void>
  openProjectFile: (file: File) => Promise<void>
  tabsRef: React.MutableRefObject<Tab[]>
  activeRef: React.MutableRefObject<string | null>
}

const Ctx = createContext<Workspace | null>(null)
export const TabIdContext = createContext<string | null>(null)

export function useWorkspace(): Workspace {
  const w = useContext(Ctx)
  if (!w) throw new Error('useWorkspace outside provider')
  return w
}

let counter = 0

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [closing, setClosing] = useState<string | null>(null)
  const tabsRef = useRef<Tab[]>([])
  const activeRef = useRef<string | null>(null)
  const savers = useRef(new Map<string, Saver>())

  const setTabsSync = useCallback((next: Tab[]) => {
    tabsRef.current = next
    setTabs(next)
  }, [])
  const setActive = useCallback((id: string | null) => {
    activeRef.current = id
    setActiveId(id)
  }, [])

  const open = useCallback((route: string, init: TabInit | null = null) => {
    const id = `tab-${++counter}`
    setTabsSync([...tabsRef.current, { id, route, title: '', hasContent: false, init }])
    setActive(id)
    return id
  }, [setTabsSync, setActive])

  const activate = useCallback((id: string) => {
    if (tabsRef.current.some((x) => x.id === id)) setActive(id)
  }, [setActive])

  const patch = useCallback((id: string, p: Partial<Pick<Tab, 'title' | 'hasContent'>>) => {
    const cur = tabsRef.current.find((x) => x.id === id)
    if (!cur || Object.entries(p).every(([k, v]) => (cur as unknown as Record<string, unknown>)[k] === v)) return
    setTabsSync(tabsRef.current.map((x) => (x.id === id ? { ...x, ...p } : x)))
  }, [setTabsSync])

  const clearInit = useCallback((id: string) => {
    const cur = tabsRef.current.find((x) => x.id === id)
    if (cur?.init) setTabsSync(tabsRef.current.map((x) => (x.id === id ? { ...x, init: null } : x)))
  }, [setTabsSync])

  const registerSaver = useCallback((id: string, fn: Saver | null) => {
    if (fn) savers.current.set(id, fn)
    else savers.current.delete(id)
  }, [])

  const saveProject = useCallback(async (id: string) => {
    const fn = savers.current.get(id)
    if (!fn) return
    const p = await fn()
    downloadFile(projectBlob(p), `${(p.title || 'edavio').replace(/[\\/:*?"<>|]+/g, '_')}${PROJECT_EXT}`)
  }, [])

  const doClose = useCallback((id: string) => {
    const list = tabsRef.current
    const idx = list.findIndex((x) => x.id === id)
    if (idx < 0) return
    const next = list.filter((x) => x.id !== id)
    savers.current.delete(id)
    setTabsSync(next)
    if (activeRef.current === id) {
      const neighbour = next[Math.min(idx, next.length - 1)]
      setActive(neighbour?.id ?? null)
      navigate(neighbour ? neighbour.route : '/edit')
    }
  }, [navigate, setActive, setTabsSync])

  const requestClose = useCallback((id: string) => {
    const tab = tabsRef.current.find((x) => x.id === id)
    if (!tab) return
    if (tab.hasContent) setClosing(id)
    else doClose(id)
  }, [doClose])

  const openProjectFile = useCallback(async (file: File) => {
    const project = await readProject(file)
    open(KIND_ROUTE[project.kind], { project })
    navigate(KIND_ROUTE[project.kind])
  }, [navigate, open])

  // browser / window close
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (tabsRef.current.some((x) => x.hasContent)) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [])

  const value = useMemo<Workspace>(
    () => ({ tabs, activeId, open, activate, requestClose, patch, registerSaver, clearInit, saveProject, openProjectFile, tabsRef, activeRef }),
    [tabs, activeId, open, activate, requestClose, patch, registerSaver, clearInit, saveProject, openProjectFile],
  )

  const closingTab = tabs.find((x) => x.id === closing)

  return (
    <Ctx.Provider value={value}>
      {children}
      {closingTab && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4" onMouseDown={() => setClosing(null)}>
          <div role="alertdialog" aria-modal="true" aria-labelledby="ws-close-title" onMouseDown={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-2xl">
            <h2 id="ws-close-title" className="text-base font-semibold text-[var(--color-text-primary)]">{t('workspace.closeTitle')}</h2>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              {t('workspace.closeBody', { name: closingTab.title || t('workspace.untitled') })}
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <Button variant="secondary" size="sm" autoFocus onClick={() => setClosing(null)}>{t('workspace.no')}</Button>
              {savers.current.has(closingTab.id) && (
                <Button variant="outline" size="sm" onClick={() => { void saveProject(closingTab.id).then(() => { doClose(closingTab.id); setClosing(null) }) }}>
                  {t('workspace.saveAndClose')}
                </Button>
              )}
              <Button variant="danger" size="sm" onClick={() => { doClose(closingTab.id); setClosing(null) }}>{t('workspace.yes')}</Button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  )
}

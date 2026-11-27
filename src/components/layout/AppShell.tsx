import { Suspense } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Header } from './Header'
import { WorkspaceProvider } from '@/workspace/WorkspaceContext'
import { TabBar, WorkspaceHost, isEditorRoute } from '@/workspace/WorkspaceHost'

function PageLoader() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="size-8 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-accent)]" />
        <p className="text-sm text-[var(--color-text-tertiary)]">Loading…</p>
      </div>
    </div>
  )
}

export function AppShell() {
  const { pathname } = useLocation()
  const editor = isEditorRoute(pathname)
  return (
    <WorkspaceProvider>
      <div className="flex h-dvh flex-col overflow-hidden bg-[var(--color-surface)]">
        <Header />
        <TabBar />
        <main className={editor ? 'hidden' : 'flex min-h-0 flex-1 flex-col overflow-y-auto'}>
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </main>
        <WorkspaceHost visible={editor} />
      </div>
    </WorkspaceProvider>
  )
}

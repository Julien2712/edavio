import { Suspense } from 'react'
import { Outlet } from 'react-router-dom'
import { Header } from './Header'

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
  return (
    <div className="flex min-h-dvh flex-col bg-[var(--color-surface)]">
      <Header />
      <main className="flex flex-1 flex-col">
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  )
}

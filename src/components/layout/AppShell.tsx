import { Suspense } from 'react'
import { Outlet } from 'react-router-dom'
import { Header } from './Header'

export function AppShell() {
  return (
    <div className="flex min-h-dvh flex-col">
      <Header />
      <main className="flex-1">
        <Suspense fallback={<div className="p-8 text-sm text-neutral-500">…</div>}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  )
}

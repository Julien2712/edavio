import { useEffect, useLayoutEffect, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Ban, ChevronDown, Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { listFontFamilies, fontStack, BASE_FONTS } from '@/lib/systemFonts'
import { FONT_SIZES, PALETTE } from './model'

type Icon = ComponentType<{ className?: string; size?: number }>

const keepSel = (e: React.MouseEvent) => {
  const t = e.target as HTMLElement
  if (t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA') e.preventDefault()
}

/** Toolbar button. mousedown is cancelled so the text selection of the slide is kept. */
export function Tb({ icon: I, label, active, disabled, onClick, className, children }: {
  icon?: Icon; label: string; active?: boolean; disabled?: boolean; onClick?: () => void; className?: string; children?: ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={keepSel}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 min-w-8 shrink-0 items-center justify-center gap-1.5 rounded-md px-1.5 text-xs transition-colors disabled:opacity-35',
        active
          ? 'bg-[var(--color-accent)]/15 text-[var(--color-accent)]'
          : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-text-primary)]',
        className,
      )}
    >
      {I && <I size={16} />}
      {children}
    </button>
  )
}

export const Sep = () => <div className="mx-1 h-6 w-px shrink-0 bg-[var(--color-border)]" />

export function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex shrink-0 flex-col items-stretch">
      <div className="flex h-8 items-center gap-0.5">{children}</div>
      <div className="text-center text-[10px] leading-3 text-[var(--color-text-muted)]">{label}</div>
    </div>
  )
}

/** Button that opens a popover (portal, so it is never clipped by scrolling toolbars). */
export function Menu({ trigger, label, active, disabled, width = 220, onOpen, children, className }: {
  trigger: ReactNode; label: string; active?: boolean; disabled?: boolean; width?: number; onOpen?: () => void
  children: (close: () => void) => ReactNode; className?: string
}) {
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })

  useLayoutEffect(() => {
    if (!open || !btn.current) return
    const r = btn.current.getBoundingClientRect()
    const h = pop.current?.offsetHeight ?? 0
    let y = r.bottom + 4
    if (y + h > window.innerHeight - 8) y = Math.max(8, r.top - h - 4)
    setPos({ x: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)), y })
  }, [open, width])

  useEffect(() => {
    if (!open) return
    const down = (e: PointerEvent) => {
      const t = e.target as Node
      if (pop.current?.contains(t) || btn.current?.contains(t)) return
      setOpen(false)
    }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', down, true)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('pointerdown', down, true)
      document.removeEventListener('keydown', key)
    }
  }, [open])

  return (
    <>
      <button
        ref={btn}
        type="button"
        title={label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onMouseDown={keepSel}
        onClick={() => {
          if (!open) onOpen?.()
          setOpen((o) => !o)
        }}
        className={cn(
          'inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-md px-1.5 text-xs transition-colors disabled:opacity-35',
          active || open
            ? 'bg-[var(--color-accent)]/15 text-[var(--color-accent)]'
            : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-text-primary)]',
          className,
        )}
      >
        {trigger}
        <ChevronDown size={12} className="opacity-60" />
      </button>
      {open &&
        createPortal(
          <div
            ref={pop}
            role="menu"
            onMouseDown={keepSel}
            style={{ left: pos.x, top: pos.y, width }}
            className="fixed z-[60] max-h-[70vh] overflow-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-2 shadow-xl"
          >
            {children(() => setOpen(false))}
          </div>,
          document.body,
        )}
    </>
  )
}

export function MenuItem({ icon: I, children, onClick, active, disabled }: { icon?: Icon; children: ReactNode; onClick: () => void; active?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-[var(--color-surface-raised)] disabled:opacity-35',
        active ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-primary)]',
      )}
    >
      {I && <I size={14} className="shrink-0" />}
      <span className="truncate">{children}</span>
    </button>
  )
}

export const MenuTitle = ({ children }: { children: ReactNode }) => (
  <div className="px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{children}</div>
)

export function ColorMenu({ icon: I, label, value, onPick, noneLabel, onOpen }: {
  icon: Icon; label: string; value: string | null | undefined; onPick: (c: string | null) => void; noneLabel?: string; onOpen?: () => void
}) {
  return (
    <Menu
      label={label}
      width={216}
      onOpen={onOpen}
      trigger={
        <span className="flex flex-col items-center">
          <I size={15} />
          <span className="mt-0.5 h-[3px] w-4 rounded-full border border-black/10" style={{ background: value ?? 'transparent' }} />
        </span>
      }
    >
      {(close) => (
        <div>
          {noneLabel && (
            <MenuItem icon={Ban} onClick={() => { onPick(null); close() }}>{noneLabel}</MenuItem>
          )}
          <div className="grid grid-cols-7 gap-1 p-1">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                title={c}
                onClick={() => { onPick(c); close() }}
                className={cn('size-6 rounded border border-black/15 hover:scale-110', value?.toLowerCase() === c && 'ring-2 ring-[var(--color-accent)]')}
                style={{ background: c }}
              />
            ))}
          </div>
          <label className="mt-1 flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-raised)]">
            <span>Personnalisée…</span>
            <input type="color" value={value && value.startsWith('#') && value.length === 7 ? value : '#4f46e5'} onChange={(e) => onPick(e.target.value)} className="h-6 w-8 cursor-pointer border-0 bg-transparent p-0" />
          </label>
        </div>
      )}
    </Menu>
  )
}

export function FontPicker({ value, onPick, searchLabel }: { value: string; onPick: (f: string) => void; searchLabel: string }) {
  const [fonts, setFonts] = useState<string[]>(BASE_FONTS)
  const [q, setQ] = useState('')
  const load = () => {
    void listFontFamilies().then((l) => l.length && setFonts(l))
  }
  const list = fonts.filter((f) => f.toLowerCase().includes(q.toLowerCase()))
  return (
    <Menu
      label={searchLabel}
      width={260}
      onOpen={load}
      className="w-40 justify-between"
      trigger={<span className="truncate" style={{ fontFamily: fontStack(value) }}>{value}</span>}
    >
      {(close) => (
        <div>
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={searchLabel}
            className="mb-1 h-8 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-sunken)] px-2 text-xs outline-none focus:border-[var(--color-accent)]"
          />
          <div className="max-h-64 overflow-auto">
            {list.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => { onPick(f); close() }}
                className={cn('block w-full truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-[var(--color-surface-raised)]', f === value && 'text-[var(--color-accent)]')}
                style={{ fontFamily: fontStack(f) }}
              >
                {f}
              </button>
            ))}
            {!list.length && <div className="px-2 py-3 text-center text-xs text-[var(--color-text-muted)]">—</div>}
          </div>
        </div>
      )}
    </Menu>
  )
}

export function SizeField({ value, onPick, label }: { value: number; onPick: (n: number) => void; label: string }) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    const n = Number(draft)
    if (draft !== null && n > 0 && n < 1000) onPick(Math.round(n * 10) / 10)
    setDraft(null)
  }
  const step = (d: number) => {
    const next = d > 0 ? FONT_SIZES.find((s) => s > value) ?? value + 4 : [...FONT_SIZES].reverse().find((s) => s < value) ?? Math.max(1, value - 1)
    onPick(next)
  }
  return (
    <div className="flex items-center">
      <Tb icon={Minus} label={`${label} −`} onClick={() => step(-1)} className="min-w-6 px-1" />
      <Menu label={label} width={84} trigger={
        <input
          value={draft ?? String(value)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget.blur(), e.preventDefault())}
          onClick={(e) => e.stopPropagation()}
          aria-label={label}
          className="w-9 bg-transparent text-center text-xs text-[var(--color-text-primary)] outline-none"
        />
      }>
        {(close) => (
          <div className="max-h-60 overflow-auto">
            {FONT_SIZES.map((s) => (
              <MenuItem key={s} active={s === value} onClick={() => { onPick(s); close() }}>{s}</MenuItem>
            ))}
          </div>
        )}
      </Menu>
      <Tb icon={Plus} label={`${label} +`} onClick={() => step(1)} className="min-w-6 px-1" />
    </div>
  )
}

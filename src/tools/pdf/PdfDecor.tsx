import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import type { Decor } from './decor'

export const DEFAULT_DECOR: Decor = {}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()} className="max-h-[90vh] w-full max-w-md overflow-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-2xl">
        <h2 className="mb-4 text-sm font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  )
}

const inp = 'h-9 w-full rounded-md border border-[var(--color-border)] bg-transparent px-2 text-sm outline-none focus:border-[var(--color-accent)]'
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="mb-3 block text-xs text-[var(--color-text-secondary)]"><span className="mb-1 block">{label}</span>{children}</label>
)

export type DecorKind = 'watermark' | 'pageNumbers' | 'headerFooter'

export function DecorDialog({ kind, decor, onApply, onClose }: { kind: DecorKind; decor: Decor; onApply: (d: Decor) => void; onClose: () => void }) {
  const { t } = useTranslation()
  const d = (k: string, o?: Record<string, unknown>) => (t as unknown as (k: string, o?: unknown) => string)(`tools.pdfEditor.decor.${k}`, o)
  const w = decor.watermark
  const [wm, setWm] = useState({ text: w?.text ?? 'CONFIDENTIEL', size: w?.size ?? 72, opacity: w?.opacity ?? 0.18, angle: w?.angle ?? 45, color: w?.color ?? '#dc2626' })
  const pn = decor.pageNumbers
  const [pnv, setPn] = useState({ pos: pn?.pos ?? 'bottom-center', format: pn?.format ?? '{n} / {total}', start: pn?.start ?? 1, size: pn?.size ?? 10, color: pn?.color ?? '#374151', skipFirst: pn?.skipFirst ?? false })
  const [hf, setHf] = useState({ header: decor.header ?? '', footer: decor.footer ?? '', size: decor.hfSize ?? 10, color: decor.hfColor ?? '#374151' })

  const apply = (clear: boolean) => {
    if (kind === 'watermark') onApply({ ...decor, watermark: clear || !wm.text.trim() ? undefined : wm })
    else if (kind === 'pageNumbers') onApply({ ...decor, pageNumbers: clear ? undefined : { ...pnv, start: Number(pnv.start) || 1 } })
    else onApply({ ...decor, header: clear ? undefined : hf.header || undefined, footer: clear ? undefined : hf.footer || undefined, hfSize: hf.size, hfColor: hf.color })
    onClose()
  }

  return (
    <Modal title={d(kind)} onClose={onClose}>
      {kind === 'watermark' && (
        <>
          <Field label={d('text')}><input autoFocus value={wm.text} onChange={(e) => setWm({ ...wm, text: e.target.value })} className={inp} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={d('size')}><input type="number" min={10} max={300} value={wm.size} onChange={(e) => setWm({ ...wm, size: Number(e.target.value) || 72 })} className={inp} /></Field>
            <Field label={d('angle')}><input type="number" min={-90} max={90} value={wm.angle} onChange={(e) => setWm({ ...wm, angle: Number(e.target.value) })} className={inp} /></Field>
            <Field label={d('opacity')}><input type="range" min={0.05} max={1} step={0.05} value={wm.opacity} onChange={(e) => setWm({ ...wm, opacity: Number(e.target.value) })} className="w-full" /></Field>
            <Field label={d('color')}><input type="color" value={wm.color} onChange={(e) => setWm({ ...wm, color: e.target.value })} className="h-9 w-full rounded-md border border-[var(--color-border)] bg-transparent" /></Field>
          </div>
        </>
      )}
      {kind === 'pageNumbers' && (
        <>
          <Field label={d('position')}>
            <select value={pnv.pos} onChange={(e) => setPn({ ...pnv, pos: e.target.value as typeof pnv.pos })} className={inp}>
              {['bottom-center', 'bottom-right', 'bottom-left', 'top-center', 'top-right', 'top-left'].map((p) => <option key={p} value={p}>{d(`pos_${p}`)}</option>)}
            </select>
          </Field>
          <Field label={d('format')}>
            <select value={pnv.format} onChange={(e) => setPn({ ...pnv, format: e.target.value })} className={inp}>
              {['{n}', '{n} / {total}', 'Page {n}', 'Page {n} / {total}', '- {n} -'].map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label={d('start')}><input type="number" value={pnv.start} onChange={(e) => setPn({ ...pnv, start: Number(e.target.value) })} className={inp} /></Field>
            <Field label={d('size')}><input type="number" min={6} max={40} value={pnv.size} onChange={(e) => setPn({ ...pnv, size: Number(e.target.value) || 10 })} className={inp} /></Field>
            <Field label={d('color')}><input type="color" value={pnv.color} onChange={(e) => setPn({ ...pnv, color: e.target.value })} className="h-9 w-full rounded-md border border-[var(--color-border)] bg-transparent" /></Field>
          </div>
          <label className="mb-3 flex items-center gap-2 text-xs text-[var(--color-text-secondary)]"><input type="checkbox" checked={pnv.skipFirst} onChange={(e) => setPn({ ...pnv, skipFirst: e.target.checked })} />{d('skipFirst')}</label>
        </>
      )}
      {kind === 'headerFooter' && (
        <>
          <Field label={d('header')}><input autoFocus value={hf.header} onChange={(e) => setHf({ ...hf, header: e.target.value })} className={inp} /></Field>
          <Field label={d('footer')}><input value={hf.footer} onChange={(e) => setHf({ ...hf, footer: e.target.value })} className={inp} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={d('size')}><input type="number" min={6} max={40} value={hf.size} onChange={(e) => setHf({ ...hf, size: Number(e.target.value) || 10 })} className={inp} /></Field>
            <Field label={d('color')}><input type="color" value={hf.color} onChange={(e) => setHf({ ...hf, color: e.target.value })} className="h-9 w-full rounded-md border border-[var(--color-border)] bg-transparent" /></Field>
          </div>
        </>
      )}
      <p className="mb-4 text-xs text-[var(--color-text-tertiary)]">{d('hint')}</p>
      <div className="flex justify-between">
        <Button size="sm" variant="secondary" onClick={() => apply(true)}>{d('remove')}</Button>
        <div className="flex gap-2"><Button size="sm" variant="secondary" onClick={onClose}>{d('cancel')}</Button><Button size="sm" onClick={() => apply(false)}>{d('apply')}</Button></div>
      </div>
    </Modal>
  )
}

export function TableDialog({ onCreate, onClose }: { onCreate: (o: { rows: number; cols: number; rowH: number; color: string; width: number }) => void; onClose: () => void }) {
  const { t } = useTranslation()
  const d = (k: string) => (t as unknown as (k: string) => string)(`tools.pdfEditor.decor.${k}`)
  const [v, setV] = useState({ rows: 4, cols: 3, rowH: 28, width: 420, color: '#374151' })
  return (
    <Modal title={d('table')} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label={d('rows')}><input type="number" min={1} max={40} value={v.rows} onChange={(e) => setV({ ...v, rows: Number(e.target.value) || 1 })} className={inp} /></Field>
        <Field label={d('cols')}><input type="number" min={1} max={12} value={v.cols} onChange={(e) => setV({ ...v, cols: Number(e.target.value) || 1 })} className={inp} /></Field>
        <Field label={d('rowHeight')}><input type="number" min={12} max={200} value={v.rowH} onChange={(e) => setV({ ...v, rowH: Number(e.target.value) || 28 })} className={inp} /></Field>
        <Field label={d('tableWidth')}><input type="number" min={60} max={1200} value={v.width} onChange={(e) => setV({ ...v, width: Number(e.target.value) || 420 })} className={inp} /></Field>
      </div>
      <Field label={d('color')}><input type="color" value={v.color} onChange={(e) => setV({ ...v, color: e.target.value })} className="h-9 w-full rounded-md border border-[var(--color-border)] bg-transparent" /></Field>
      <p className="mb-4 text-xs text-[var(--color-text-tertiary)]">{d('tableHint')}</p>
      <div className="flex justify-end gap-2"><Button size="sm" variant="secondary" onClick={onClose}>{d('cancel')}</Button><Button size="sm" onClick={() => { onCreate(v); onClose() }}>{d('apply')}</Button></div>
    </Modal>
  )
}

/** Live preview of watermark / page number / header / footer over the displayed page. */
export function DecorPreview({ decor, pageNo, total, width, height, scale }: { decor: Decor; pageNo: number; total: number; width: number; height: number; scale: number }) {
  const n = pageNo + ((decor.pageNumbers?.start ?? 1) - 1)
  const pn = decor.pageNumbers
  const label = pn && !(pn.skipFirst && pageNo === 1) ? pn.format.replace('{n}', String(n)).replace('{total}', String(total)) : null
  const pos = (p: string): React.CSSProperties => ({
    position: 'absolute',
    [p.startsWith('top') ? 'top' : 'bottom']: 24 * scale,
    ...(p.endsWith('center') ? { left: 0, right: 0, textAlign: 'center' as const } : p.endsWith('right') ? { right: 36 * scale } : { left: 36 * scale }),
  })
  return (
    <div className="pointer-events-none absolute left-0 top-0 z-[5] overflow-hidden" style={{ width, height }} aria-hidden>
      {decor.watermark && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span style={{ transform: `rotate(${-decor.watermark.angle}deg)`, fontSize: decor.watermark.size * scale, color: decor.watermark.color, opacity: decor.watermark.opacity, fontWeight: 700, whiteSpace: 'nowrap', fontFamily: 'Helvetica, Arial, sans-serif' }}>{decor.watermark.text}</span>
        </div>
      )}
      {decor.header && <div style={{ ...pos('top-center'), top: 20 * scale, fontSize: (decor.hfSize ?? 10) * scale, color: decor.hfColor ?? '#374151' }}>{decor.header}</div>}
      {decor.footer && <div style={{ ...pos('bottom-center'), bottom: 20 * scale, fontSize: (decor.hfSize ?? 10) * scale, color: decor.hfColor ?? '#374151' }}>{decor.footer}</div>}
      {label && pn && <div style={{ ...pos(pn.pos), fontSize: pn.size * scale, color: pn.color }}>{label}</div>}
    </div>
  )
}

export const STAMPS: { id: string; text: string; color: string }[] = [
  { id: 'approved', text: 'APPROUVÉ', color: '#16a34a' },
  { id: 'rejected', text: 'REFUSÉ', color: '#dc2626' },
  { id: 'draft', text: 'BROUILLON', color: '#2563eb' },
  { id: 'confidential', text: 'CONFIDENTIEL', color: '#dc2626' },
  { id: 'final', text: 'FINAL', color: '#16a34a' },
  { id: 'copy', text: 'COPIE', color: '#7c3aed' },
  { id: 'urgent', text: 'URGENT', color: '#ea580c' },
  { id: 'paid', text: 'PAYÉ', color: '#16a34a' },
  { id: 'done', text: '✔ FAIT', color: '#16a34a' },
]

/** Draws a stamp on a canvas; returns a PNG data URL and its aspect ratio. */
export function makeStamp(text: string, color: string): { dataUrl: string; ratio: number } {
  const c = document.createElement('canvas')
  const g = c.getContext('2d')!
  const font = 'bold 64px Helvetica, Arial, sans-serif'
  g.font = font
  const tw = Math.ceil(g.measureText(text).width)
  const pad = 22
  c.width = tw + pad * 2 + 16
  c.height = 64 + pad * 2 + 8
  const g2 = c.getContext('2d')!
  g2.font = font
  g2.strokeStyle = color
  g2.fillStyle = color
  g2.lineWidth = 8
  g2.beginPath()
  g2.roundRect(6, 6, c.width - 12, c.height - 12, 14)
  g2.stroke()
  g2.lineWidth = 3
  g2.beginPath()
  g2.roundRect(16, 16, c.width - 32, c.height - 32, 8)
  g2.stroke()
  g2.textBaseline = 'middle'
  g2.textAlign = 'center'
  g2.fillText(text, c.width / 2, c.height / 2 + 4)
  return { dataUrl: c.toDataURL('image/png'), ratio: c.width / c.height }
}

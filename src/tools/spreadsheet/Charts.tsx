import { useRef } from 'react'
import { X } from 'lucide-react'
import type { ChartDef } from './model'
import type { V } from './formula'

const COLORS = ['#2563eb', '#f97316', '#16a34a', '#a855f7', '#ef4444', '#0891b2', '#ca8a04', '#64748b']

export interface ChartData { labels: string[]; series: { name: string; values: number[] }[] }

export function buildChartData(def: ChartDef, valueAt: (r: number, c: number) => V): ChartData {
  const { r1, c1, r2, c2 } = def.range
  const firstRowText = [...Array(c2 - c1)].some((_, i) => typeof valueAt(r1, c1 + 1 + i) === 'string' && valueAt(r1, c1 + 1 + i) !== '')
  const start = firstRowText ? r1 + 1 : r1
  const labels: string[] = []
  for (let r = start; r <= r2; r++) labels.push(String(valueAt(r, c1) ?? ''))
  const series = []
  for (let c = c1 + 1; c <= c2; c++) {
    const values: number[] = []
    let any = firstRowText && valueAt(r1, c) !== null && valueAt(r1, c) !== ''
    for (let r = start; r <= r2; r++) { const v = valueAt(r, c); if (v !== null && v !== '') any = true; values.push(typeof v === 'number' ? v : 0) }
    if (!any) continue
    series.push({ name: firstRowText ? String(valueAt(r1, c) ?? '') : `S${c - c1}`, values })
  }
  return { labels, series }
}

export function ChartView({ def, data, zoom, selected, onSelect, onChange, onDelete }: {
  def: ChartDef; data: ChartData; zoom: number; selected: boolean
  onSelect: () => void; onChange: (p: Partial<ChartDef>) => void; onDelete: () => void
}) {
  const drag = useRef<{ mode: 'move' | 'size'; sx: number; sy: number; o: ChartDef } | null>(null)
  const down = (mode: 'move' | 'size') => (e: React.PointerEvent) => {
    e.stopPropagation(); e.preventDefault(); onSelect()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = { mode, sx: e.clientX, sy: e.clientY, o: def }
  }
  const move = (e: React.PointerEvent) => {
    const d = drag.current; if (!d) return
    const dx = (e.clientX - d.sx) / zoom, dy = (e.clientY - d.sy) / zoom
    if (d.mode === 'move') onChange({ x: Math.max(0, d.o.x + dx), y: Math.max(0, d.o.y + dy) })
    else onChange({ w: Math.max(180, d.o.w + dx), h: Math.max(120, d.o.h + dy) })
  }
  const up = () => { drag.current = null }
  const W = def.w, H = def.h, padL = 44, padR = 12, padT = 34, padB = 34
  const pw = W - padL - padR, ph = H - padT - padB
  const all = data.series.flatMap((s) => s.values)
  const max = Math.max(0, ...all), min = Math.min(0, ...all)
  const span = max - min || 1
  const y = (v: number) => padT + ph - ((v - min) / span) * ph
  const n = data.labels.length
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => min + span * t)
  const fmt = (v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 100) / 10}k` : String(Math.round(v * 100) / 100))

  let body: React.ReactNode = null
  if (def.kind === 'pie') {
    const vals = (data.series[0]?.values ?? []).map((v) => Math.max(0, v))
    const tot = vals.reduce((a, b) => a + b, 0) || 1
    const cx = W / 2 - 40, cy = padT + ph / 2, R = Math.min(pw, ph) / 2
    let a0 = -Math.PI / 2
    body = <>
      {vals.map((v, i) => {
        const a1 = a0 + (v / tot) * Math.PI * 2
        const large = a1 - a0 > Math.PI ? 1 : 0
        const d = vals.length === 1 ? `M ${cx} ${cy - R} A ${R} ${R} 0 1 1 ${cx - 0.01} ${cy - R} Z` : `M ${cx} ${cy} L ${cx + R * Math.cos(a0)} ${cy + R * Math.sin(a0)} A ${R} ${R} 0 ${large} 1 ${cx + R * Math.cos(a1)} ${cy + R * Math.sin(a1)} Z`
        a0 = a1
        return <path key={i} d={d} fill={COLORS[i % COLORS.length]} stroke="#fff" strokeWidth={1} />
      })}
      {data.labels.slice(0, 10).map((l, i) => (
        <g key={i} transform={`translate(${W - 92} ${padT + i * 15})`}><rect width={9} height={9} fill={COLORS[i % COLORS.length]} /><text x={13} y={9} fontSize={10} fill="#334155">{l.slice(0, 12)}</text></g>
      ))}
    </>
  } else if (def.kind === 'bar') {
    // horizontal bars
    const bandH = ph / Math.max(1, n), k = data.series.length || 1
    const x = (v: number) => padL + ((v - min) / span) * pw
    body = <>
      {ticks.map((t, i) => <g key={i}><line x1={x(t)} x2={x(t)} y1={padT} y2={padT + ph} stroke="#e2e8f0" /><text x={x(t)} y={H - padB + 14} fontSize={10} textAnchor="middle" fill="#64748b">{fmt(t)}</text></g>)}
      {data.labels.map((l, i) => <text key={i} x={padL - 4} y={padT + bandH * i + bandH / 2 + 3} fontSize={10} textAnchor="end" fill="#334155">{l.slice(0, 8)}</text>)}
      {data.series.map((s, si) => s.values.map((v, i) => <rect key={`${si}-${i}`} x={Math.min(x(0), x(v))} y={padT + bandH * i + (bandH * 0.15) + (si * bandH * 0.7) / k} width={Math.abs(x(v) - x(0))} height={(bandH * 0.7) / k} fill={COLORS[si % COLORS.length]} />))}
    </>
  } else {
    const bandW = pw / Math.max(1, n)
    const xc = (i: number) => padL + bandW * i + bandW / 2
    body = <>
      {ticks.map((t, i) => <g key={i}><line x1={padL} x2={padL + pw} y1={y(t)} y2={y(t)} stroke="#e2e8f0" /><text x={padL - 4} y={y(t) + 3} fontSize={10} textAnchor="end" fill="#64748b">{fmt(t)}</text></g>)}
      {data.labels.map((l, i) => <text key={i} x={xc(i)} y={H - padB + 14} fontSize={10} textAnchor="middle" fill="#334155">{l.slice(0, Math.max(3, Math.floor(bandW / 6)))}</text>)}
      {def.kind === 'column'
        ? data.series.map((s, si) => s.values.map((v, i) => { const k = data.series.length; const bw = (bandW * 0.7) / k; return <rect key={`${si}-${i}`} x={padL + bandW * i + bandW * 0.15 + si * bw} y={Math.min(y(v), y(0))} width={bw} height={Math.abs(y(v) - y(0))} fill={COLORS[si % COLORS.length]} /> }))
        : data.series.map((s, si) => <g key={si}><polyline fill="none" stroke={COLORS[si % COLORS.length]} strokeWidth={2} points={s.values.map((v, i) => `${xc(i)},${y(v)}`).join(' ')} />{s.values.map((v, i) => <circle key={i} cx={xc(i)} cy={y(v)} r={3} fill={COLORS[si % COLORS.length]} />)}</g>)}
    </>
  }
  const legend = def.kind !== 'pie' && data.series.length > 1

  return (
    <div data-chart onPointerDown={(e) => { e.stopPropagation(); onSelect() }} onDoubleClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.stopPropagation()}
      className="absolute z-[12] select-none rounded-md border bg-white shadow-lg" style={{ left: def.x * zoom, top: def.y * zoom, width: W * zoom, height: H * zoom, borderColor: selected ? '#059669' : '#cbd5e1' }}>
      <div style={{ width: W, height: H, transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
        <div onPointerDown={down('move')} onPointerMove={move} onPointerUp={up} className="absolute left-0 top-0 flex h-7 w-full cursor-move items-center justify-center text-xs font-semibold text-slate-700">{def.title}</div>
        <svg width={W} height={H} className="pointer-events-none absolute left-0 top-0">
          {def.kind !== 'pie' && <line x1={padL} x2={padL} y1={padT} y2={padT + ph} stroke="#94a3b8" />}
          {body}
          {legend && data.series.map((s, i) => <g key={i} transform={`translate(${padL + i * 80} ${H - 10})`}><rect y={-8} width={9} height={9} fill={COLORS[i % COLORS.length]} /><text x={13} fontSize={10} fill="#334155">{s.name.slice(0, 10)}</text></g>)}
        </svg>
        {selected && <button type="button" aria-label="Delete chart" onPointerDown={(e) => e.stopPropagation()} onClick={onDelete} className="absolute right-1 top-1 rounded p-0.5 text-slate-500 hover:bg-slate-100"><X size={13} /></button>}
        <div onPointerDown={down('size')} onPointerMove={move} onPointerUp={up} className="absolute bottom-0 right-0 size-3 cursor-nwse-resize rounded-tl bg-emerald-600" />
      </div>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, FlipHorizontal, FlipVertical, Info, Maximize, Minus, Play, Pause, Plus, RotateCcw, RotateCw, ScanLine } from 'lucide-react'
import { fmtSize, saveBlob } from '../shared/util'
import { Bar, CloseBtn, ReaderFrame, Sep, TB, useR } from './ui'

interface Img { file: File; url: string; w: number; h: number }

async function load(files: File[]): Promise<Img[]> {
  return Promise.all(files.map(async (file) => {
    const url = URL.createObjectURL(file)
    const im = new Image(); im.src = url; await im.decode()
    return { file, url, w: im.naturalWidth, h: im.naturalHeight }
  }))
}

export default function ImageViewerPage() {
  const r = useR()
  return (
    <ReaderFrame toolId="image-viewer" formats={['PNG', 'JPG', 'WEBP', 'GIF', 'BMP', 'SVG', 'AVIF']} re={/\.(jpe?g|png|webp|gif|bmp|svg|avif|ico)$/i} hint={r('imgHint')} multiple load={load}>
      {(imgs, close) => <Viewer imgs={imgs} close={() => { imgs.forEach((i) => URL.revokeObjectURL(i.url)); close() }} />}
    </ReaderFrame>
  )
}

function Viewer({ imgs, close }: { imgs: Img[]; close: () => void }) {
  const r = useR()
  const [i, setI] = useState(0)
  const [zoom, setZoom] = useState<number | 'fit'>('fit')
  const [rot, setRot] = useState(0)
  const [fx, setFx] = useState(false)
  const [fy, setFy] = useState(false)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [info, setInfo] = useState(false)
  const [play, setPlay] = useState(false)
  const stage = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null)
  const img = imgs[i]!
  const reset = () => { setZoom('fit'); setRot(0); setFx(false); setFy(false); setPan({ x: 0, y: 0 }) }
  const go = (d: number) => { setI((x) => (x + d + imgs.length) % imgs.length); reset() }
  useEffect(() => { if (!play) return; const t = setInterval(() => setI((x) => (x + 1) % imgs.length), 3000); return () => clearInterval(t) }, [play, imgs.length])
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'ArrowRight') go(1); else if (e.key === 'ArrowLeft') go(-1); else if (e.key === '+') setZoom((z) => (z === 'fit' ? 1 : z) * 1.25); else if (e.key === '-') setZoom((z) => (z === 'fit' ? 1 : z) / 1.25); else if (e.key === '0') reset() }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  })
  const z = (d: number) => setZoom((cur) => Math.min(16, Math.max(0.05, (cur === 'fit' ? 1 : cur) * d)))
  const scale = zoom === 'fit' ? undefined : zoom
  return (
    <>
      <Bar>
        <CloseBtn onClick={close} /><Sep />
        {imgs.length > 1 && <><TB title="prev" onClick={() => go(-1)}><ChevronLeft className="size-4" /></TB><span className="text-xs tabular-nums">{i + 1} / {imgs.length}</span><TB title="next" onClick={() => go(1)}><ChevronRight className="size-4" /></TB><TB title={r('slideshow')} active={play} onClick={() => setPlay((p) => !p)}>{play ? <Pause className="size-4" /> : <Play className="size-4" />}</TB><Sep /></>}
        <TB title={r('zoomOut')} onClick={() => z(1 / 1.25)}><Minus className="size-4" /></TB>
        <span className="w-12 text-center text-xs tabular-nums">{zoom === 'fit' ? r('fitShort') : `${Math.round(zoom * 100)} %`}</span>
        <TB title={r('zoomIn')} onClick={() => z(1.25)}><Plus className="size-4" /></TB>
        <TB title={r('fit')} active={zoom === 'fit'} onClick={() => { setZoom('fit'); setPan({ x: 0, y: 0 }) }}><ScanLine className="size-4" /></TB>
        <TB title="100 %" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }}>1:1</TB><Sep />
        <TB title={r('rotL')} onClick={() => setRot((x) => x - 90)}><RotateCcw className="size-4" /></TB>
        <TB title={r('rotR')} onClick={() => setRot((x) => x + 90)}><RotateCw className="size-4" /></TB>
        <TB title={r('flipH')} active={fx} onClick={() => setFx((x) => !x)}><FlipHorizontal className="size-4" /></TB>
        <TB title={r('flipV')} active={fy} onClick={() => setFy((x) => !x)}><FlipVertical className="size-4" /></TB><Sep />
        <TB title={r('info')} active={info} onClick={() => setInfo((x) => !x)}><Info className="size-4" /></TB>
        <TB title={r('download')} onClick={() => saveBlob(img.file, img.file.name)}><Download className="size-4" /></TB>
        <TB title={r('fullscreen')} onClick={() => void (document.fullscreenElement ? document.exitFullscreen() : stage.current?.requestFullscreen())}><Maximize className="size-4" /></TB>
      </Bar>
      <div className="flex flex-1 overflow-hidden">
        <div ref={stage} data-testid="stage" className="relative flex flex-1 cursor-grab items-center justify-center overflow-hidden bg-[repeating-conic-gradient(var(--color-surface-sunken)_0%_25%,var(--color-surface)_0%_50%)] [background-size:20px_20px] active:cursor-grabbing"
          onWheel={(e) => z(e.deltaY < 0 ? 1.1 : 1 / 1.1)}
          onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }; e.currentTarget.setPointerCapture(e.pointerId) }}
          onPointerMove={(e) => drag.current && setPan({ x: drag.current.px + e.clientX - drag.current.x, y: drag.current.py + e.clientY - drag.current.y })}
          onPointerUp={() => (drag.current = null)} onDoubleClick={() => { setZoom((x) => (x === 'fit' ? 1 : 'fit')); setPan({ x: 0, y: 0 }) }}>
          <img src={img.url} alt={img.file.name} draggable={false} className={zoom === 'fit' ? 'max-h-full max-w-full' : 'max-w-none'}
            style={{ width: scale ? img.w * scale : undefined, transform: `translate(${pan.x}px, ${pan.y}px) rotate(${rot}deg) scale(${fx ? -1 : 1}, ${fy ? -1 : 1})`, transition: drag.current ? 'none' : 'transform .15s' }} />
        </div>
        {info && (
          <aside className="w-60 shrink-0 space-y-3 overflow-auto border-l border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4 text-xs">
            {([['name', img.file.name], ['dimensions', `${img.w} × ${img.h} px`], ['size', fmtSize(img.file.size)], ['type', img.file.type || img.file.name.split('.').pop()!.toUpperCase()], ['modified', new Date(img.file.lastModified).toLocaleString()]] as const).map(([k, v]) => <div key={k}><p className="text-[var(--color-text-tertiary)]">{r(k)}</p><p className="break-all text-[var(--color-text-primary)]">{v}</p></div>)}
          </aside>
        )}
      </div>
      {imgs.length > 1 && <div className="flex gap-1.5 overflow-x-auto border-t border-[var(--color-border)] bg-[var(--color-surface-raised)] p-1.5">{imgs.map((m, k) => <button key={m.url} type="button" onClick={() => { setI(k); reset() }} className={`size-12 shrink-0 overflow-hidden rounded border-2 ${k === i ? 'border-[var(--color-accent)]' : 'border-transparent'}`}><img src={m.url} alt="" className="size-full object-cover" /></button>)}</div>}
    </>
  )
}

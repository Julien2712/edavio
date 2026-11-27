import { memo, useLayoutEffect, useRef } from 'react'
import { PX_PER_PT, geomPath, type ImageEl, type ShapeEl, type Slide, type SlideEl, type TableEl } from './model'
import { domToParas, parasToHtml } from './richText'

export const SLIDE_CSS = `
.sl-t{outline:none;word-break:break-word;overflow-wrap:anywhere;white-space:pre-wrap}
.sl-t>div{min-height:1em}
.sl-t>div[data-b]{padding-left:1.3em;text-indent:-1.3em}
.sl-t>div[data-b="bullet"]::before{content:'\\2022';display:inline-block;width:1.3em;text-indent:0;text-align:left}
.sl-t>div[data-b="number"]{counter-increment:sln}
.sl-t>div[data-b="number"]::before{content:counter(sln) '.';display:inline-block;width:1.3em;text-indent:0}
.sl-t{counter-reset:sln}
`

interface TextProps {
  el: ShapeEl
  editing: boolean
  onRoot?: (root: HTMLDivElement | null) => void
  onInput?: () => void
}

function TextBody({ el, editing, onRoot, onInput }: TextProps) {
  const ref = useRef<HTMLDivElement>(null)
  const html = parasToHtml(el.paras, el.base)
  useLayoutEffect(() => {
    if (ref.current && !editing) ref.current.innerHTML = html
  }, [html, editing])
  useLayoutEffect(() => {
    onRoot?.(editing ? ref.current : null)
    if (editing && ref.current) {
      ref.current.focus()
      const sel = window.getSelection()
      const r = document.createRange()
      r.selectNodeContents(ref.current)
      r.collapse(false)
      sel?.removeAllRanges()
      sel?.addRange(r)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing])
  const justify = el.valign === 'middle' ? 'center' : el.valign === 'bottom' ? 'flex-end' : 'flex-start'
  return (
    <div className="absolute inset-0 flex flex-col" style={{ justifyContent: justify, padding: el.pad, pointerEvents: 'none' }}>
      <div
        ref={ref}
        className="sl-t"
        contentEditable={editing}
        suppressContentEditableWarning
        spellCheck={editing}
        onInput={onInput}
        style={{ pointerEvents: editing ? 'auto' : 'none', cursor: editing ? 'text' : undefined, lineHeight: 1.2, userSelect: editing ? 'text' : 'none' }}
      />
    </div>
  )
}

function Geometry({ el }: { el: ShapeEl }) {
  const { w, h, geom } = el
  const sw = Math.max(0, el.lineW * PX_PER_PT)
  const stroke = el.line && sw > 0 ? el.line : undefined
  const fill = el.fill ?? 'none'
  const common = {
    fill: geom === 'line' ? 'none' : fill,
    fillOpacity: el.fillAlpha ?? 1,
    stroke,
    strokeWidth: stroke ? sw : 0,
    strokeDasharray: el.dash === 'dash' ? `${sw * 4} ${sw * 3}` : el.dash === 'dot' ? `${sw} ${sw * 2}` : undefined,
    strokeLinejoin: 'round' as const,
  }
  const mid = `m${el.id}`
  let shape
  if (geom === 'rect') shape = <rect x={0} y={0} width={w} height={h} {...common} />
  else if (geom === 'roundRect') shape = <rect x={0} y={0} width={w} height={h} rx={Math.min(w, h) * 0.167} {...common} />
  else if (geom === 'ellipse') shape = <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} {...common} />
  else if (geom === 'line') {
    shape = (
      <>
        <line x1={0} y1={0} x2={w} y2={h} {...common} stroke={stroke ?? '#000'} strokeWidth={sw || 1} markerStart={el.arrowStart ? `url(#${mid}s)` : undefined} markerEnd={el.arrowEnd ? `url(#${mid}e)` : undefined} />
        <line x1={0} y1={0} x2={w} y2={h} stroke="transparent" strokeWidth={14} />
      </>
    )
  } else {
    const d = geomPath(geom, w, h)
    shape = d ? <path d={d} {...common} /> : <rect x={0} y={0} width={w} height={h} {...common} />
  }
  const c = stroke ?? '#000'
  return (
    <svg width={w} height={h} className="absolute left-0 top-0 overflow-visible" style={{ transform: `scale(${el.flipH ? -1 : 1},${el.flipV ? -1 : 1})`, filter: el.shadow ? 'drop-shadow(3px 4px 5px rgba(0,0,0,.35))' : undefined }}>
      {geom === 'line' && (
        <defs>
          <marker id={`${mid}e`} markerWidth="4" markerHeight="4" refX="3" refY="2" orient="auto"><path d="M0,0 L4,2 L0,4 Z" fill={c} /></marker>
          <marker id={`${mid}s`} markerWidth="4" markerHeight="4" refX="1" refY="2" orient="auto-start-reverse"><path d="M0,0 L4,2 L0,4 Z" fill={c} /></marker>
        </defs>
      )}
      {shape}
    </svg>
  )
}

interface TableProps {
  el: TableEl
  editing: boolean
  onCell?: (r: number, c: number, text: string) => void
}

function TableBody({ el, editing, onCell }: TableProps) {
  return (
    <table style={{ width: el.w, borderCollapse: 'collapse', tableLayout: 'fixed', fontFamily: `'${el.font}', sans-serif`, fontSize: el.fontSize * PX_PER_PT }}>
      <colgroup>{el.colW.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
      <tbody>
        {el.rows.map((row, ri) => (
          <tr key={ri} style={{ height: el.rowH }}>
            {row.map((c, ci) => (
              <td
                key={ci}
                contentEditable={editing}
                suppressContentEditableWarning
                onBlur={(e) => onCell?.(ri, ci, e.currentTarget.innerText.replace(/\n$/, ''))}
                style={{
                  border: `1px solid ${el.border}`, padding: '4px 8px', verticalAlign: 'middle', background: c.fill, color: c.color ?? '#1f2937',
                  fontWeight: c.bold ?? (el.header && ri === 0) ? 700 : 400, textAlign: c.align ?? 'left', outline: 'none', whiteSpace: 'pre-wrap',
                  pointerEvents: editing ? 'auto' : 'none',
                }}
              >
                {c.text}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export interface ElementHooks {
  editingId?: string | null
  onTextRoot?: (root: HTMLDivElement | null) => void
  onTextInput?: () => void
  onCell?: (id: string, r: number, c: number, text: string) => void
}

export function ElementView({ el, hooks, interactive }: { el: SlideEl; hooks?: ElementHooks; interactive?: boolean }) {
  const editing = hooks?.editingId === el.id
  return (
    <div
      data-el={el.id}
      style={{
        position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.kind === 'table' ? undefined : el.h,
        transform: el.rot ? `rotate(${el.rot}deg)` : undefined, transformOrigin: 'center',
        pointerEvents: interactive && !el.locked ? 'auto' : 'none',
        opacity: el.kind === 'image' ? (el as ImageEl).alpha ?? 1 : undefined,
      }}
    >
      {el.kind === 'shape' && (
        <>
          <Geometry el={el} />
          {el.geom !== 'line' && <TextBody el={el} editing={editing} onRoot={hooks?.onTextRoot} onInput={hooks?.onTextInput} />}
        </>
      )}
      {el.kind === 'image' && (
        <img src={el.src} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'fill', transform: `scale(${el.flipH ? -1 : 1},${el.flipV ? -1 : 1})`, userSelect: 'none' }} />
      )}
      {el.kind === 'table' && <TableBody el={el} editing={editing} onCell={(r, c, t) => hooks?.onCell?.(el.id, r, c, t)} />}
    </div>
  )
}

/** A whole slide at native size. Wrap it in a scaled container to fit. */
export const SlideView = memo(function SlideView({ slide, w, h, hooks, interactive }: { slide: Slide; w: number; h: number; hooks?: ElementHooks; interactive?: boolean }) {
  return (
    <div
      style={{
        position: 'relative', width: w, height: h, overflow: interactive ? 'visible' : 'hidden', background: slide.bg,
        backgroundImage: slide.bgImage ? `url(${slide.bgImage})` : undefined, backgroundSize: '100% 100%',
      }}
    >
      {slide.elements.map((el) => (
        <ElementView key={el.id} el={el} hooks={hooks} interactive={interactive} />
      ))}
    </div>
  )
})

export { domToParas }

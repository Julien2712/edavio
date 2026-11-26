import { polygonPoints, type PolygonKind } from './shapeGeometry'

/** Small outline icon for any shape of the menu. */
export function ShapeIcon({ shape, className }: { shape: string; className?: string }) {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinejoin: 'round' as const,
    strokeLinecap: 'round' as const,
    className,
    'aria-hidden': true,
  }
  if (shape === 'rect') return <svg {...common}><rect x="3.5" y="5.5" width="17" height="13" rx="1.5" /></svg>
  if (shape === 'ellipse') return <svg {...common}><ellipse cx="12" cy="12" rx="8.5" ry="7" /></svg>
  if (shape === 'line') return <svg {...common}><path d="M5 19 19 5" /></svg>
  if (shape === 'arrow')
    return <svg {...common}><path d="M5 19 19 5M10 5h9v9" /></svg>
  const kind = shape as PolygonKind
  const pts = polygonPoints(kind, 3.5, 3.5, 17, 17)
  return <svg {...common}><polygon points={pts.map((p) => p.join(',')).join(' ')} /></svg>
}

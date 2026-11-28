/** Content added on every page at export time (and previewed live). */
export interface Decor {
  watermark?: { text: string; size: number; opacity: number; angle: number; color: string }
  pageNumbers?: {
    pos: 'bottom-center' | 'bottom-right' | 'bottom-left' | 'top-center' | 'top-right' | 'top-left'
    format: string
    start: number
    size: number
    color: string
    skipFirst: boolean
  }
  header?: string
  footer?: string
  hfSize?: number
  hfColor?: string
}

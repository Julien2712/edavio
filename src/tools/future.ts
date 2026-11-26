import { lazy } from 'react'
import { BookOpen, FileOutput, FileSpreadsheet, FileType2, Images, Minimize2, Presentation } from 'lucide-react'
import type { ToolModule } from '@/core/tools/types'

/** Placeholders so the shell already shows the platform roadmap. */
export const documentEditor: ToolModule = {
  id: 'document-editor',
  section: 'edit',
  category: 'documents',
  nameKey: 'tools.documentEditor.name',
  descriptionKey: 'tools.documentEditor.description',
  icon: FileType2,
  route: '/documents/edit',
  features: [],
  acceptedMimeTypes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  status: 'coming-soon',
}

export const spreadsheetEditor: ToolModule = {
  id: 'spreadsheet-editor',
  section: 'edit',
  category: 'spreadsheets',
  nameKey: 'tools.spreadsheetEditor.name',
  descriptionKey: 'tools.spreadsheetEditor.description',
  icon: FileSpreadsheet,
  route: '/spreadsheets/edit',
  features: [],
  acceptedMimeTypes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  status: 'coming-soon',
}

export const presentationEditor: ToolModule = {
  id: 'presentation-editor',
  section: 'edit',
  category: 'presentations',
  nameKey: 'tools.presentationEditor.name',
  descriptionKey: 'tools.presentationEditor.description',
  icon: Presentation,
  route: '/presentations/edit',
  features: [],
  acceptedMimeTypes: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  status: 'coming-soon',
}

// ── Sections whose interface exists but whose features come later ─────────────

export const documentReader: ToolModule = {
  id: 'document-reader',
  section: 'read',
  category: 'reader',
  nameKey: 'tools.documentReader.name',
  descriptionKey: 'tools.documentReader.description',
  icon: BookOpen,
  route: '/read',
  features: [],
  acceptedMimeTypes: ['application/pdf'],
  status: 'coming-soon',
  component: lazy(() => import('./planned/ReaderPage')),
}

export const pdfCompressor: ToolModule = {
  id: 'pdf-compressor',
  section: 'compress',
  category: 'compression',
  nameKey: 'tools.pdfCompressor.name',
  descriptionKey: 'tools.pdfCompressor.description',
  icon: Minimize2,
  route: '/compress',
  features: [],
  acceptedMimeTypes: ['application/pdf'],
  status: 'coming-soon',
  component: lazy(() => import('./planned/CompressPage')),
}

export const imageConverter: ToolModule = {
  id: 'image-converter',
  section: 'convert',
  category: 'conversion',
  nameKey: 'tools.imageConverter.name',
  descriptionKey: 'tools.imageConverter.description',
  icon: Images,
  route: '/convert/images',
  features: [],
  acceptedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
  status: 'coming-soon',
  component: lazy(() => import('./planned/ImageConvertPage')),
}

export const documentConverter: ToolModule = {
  id: 'document-converter',
  section: 'convert',
  category: 'conversion',
  nameKey: 'tools.documentConverter.name',
  descriptionKey: 'tools.documentConverter.description',
  icon: FileOutput,
  route: '/convert/documents',
  features: [],
  acceptedMimeTypes: ['application/pdf'],
  status: 'coming-soon',
  component: lazy(() => import('./planned/DocumentConvertPage')),
}

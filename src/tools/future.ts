import { lazy } from 'react'
import { BookOpen, BookText, FileArchive, FileCode, FileImage, FileOutput, Files, Film, Image, Images, Minimize2, Music, ScanText, Table2 } from 'lucide-react'
import type { ToolModule } from '@/core/tools/types'

/** Placeholders so the shell already shows the platform roadmap. */

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
  status: 'available',
  component: lazy(() => import('./compress/CompressorPage')),
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
  status: 'available',
  component: lazy(() => import('./convert/ConvertPages').then((m) => ({ default: m.ImageConverterPage }))),
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
  status: 'available',
  component: lazy(() => import('./convert/ConvertPages').then((m) => ({ default: m.DocumentConverterPage }))),
}

export const fileCompressor: ToolModule = {
  id: 'file-compressor',
  section: 'compress',
  category: 'compression',
  nameKey: 'tools.fileCompressor.name',
  descriptionKey: 'tools.fileCompressor.description',
  icon: Minimize2,
  route: '/compress',
  features: [],
  acceptedMimeTypes: [],
  status: 'available',
  component: lazy(() => import('./compress/CompressorPage').then((m) => ({ default: m.makeCompressorPage('file-compressor') }))),
}

export const imageCompressor: ToolModule = {
  id: 'image-compressor',
  section: 'compress',
  category: 'compression',
  nameKey: 'tools.imageCompressor.name',
  descriptionKey: 'tools.imageCompressor.description',
  icon: FileImage,
  route: '/compress/images',
  features: [],
  acceptedMimeTypes: [],
  status: 'available',
  component: lazy(() => import('./compress/CompressorPage').then((m) => ({ default: m.makeCompressorPage('image-compressor') }))),
}

export const officeCompressor: ToolModule = {
  id: 'office-compressor',
  section: 'compress',
  category: 'compression',
  nameKey: 'tools.officeCompressor.name',
  descriptionKey: 'tools.officeCompressor.description',
  icon: Files,
  route: '/compress/office',
  features: [],
  acceptedMimeTypes: [],
  status: 'available',
  component: lazy(() => import('./compress/CompressorPage').then((m) => ({ default: m.makeCompressorPage('office-compressor') }))),
}

export const archiveTool: ToolModule = {
  id: 'archive-tool',
  section: 'compress',
  category: 'compression',
  nameKey: 'tools.archiveTool.name',
  descriptionKey: 'tools.archiveTool.description',
  icon: FileArchive,
  route: '/compress/archives',
  features: [],
  acceptedMimeTypes: [],
  status: 'available',
  component: lazy(() => import('./compress/ArchivePage')),
}

export const mediaCompressor: ToolModule = {
  id: 'media-compressor',
  section: 'compress',
  category: 'compression',
  nameKey: 'tools.mediaCompressor.name',
  descriptionKey: 'tools.mediaCompressor.description',
  icon: Film,
  route: '/compress/media',
  features: [],
  acceptedMimeTypes: [],
  status: 'available',
  component: lazy(() => import('./compress/CompressorPage').then((m) => ({ default: m.makeCompressorPage('media-compressor') }))),
}

export const imageViewer: ToolModule = {
  id: 'image-viewer',
  section: 'read',
  category: 'reader',
  nameKey: 'tools.imageViewer.name',
  descriptionKey: 'tools.imageViewer.description',
  icon: Image,
  route: '/read/images',
  features: [],
  acceptedMimeTypes: [],
  status: 'coming-soon',
  component: lazy(() => import('./planned/GenericPlannedPage').then((m) => ({ default: m.makePage('image-viewer') }))),
}

export const textReader: ToolModule = {
  id: 'text-reader',
  section: 'read',
  category: 'reader',
  nameKey: 'tools.textReader.name',
  descriptionKey: 'tools.textReader.description',
  icon: FileCode,
  route: '/read/text',
  features: [],
  acceptedMimeTypes: [],
  status: 'coming-soon',
  component: lazy(() => import('./planned/GenericPlannedPage').then((m) => ({ default: m.makePage('text-reader') }))),
}

export const ebookReader: ToolModule = {
  id: 'ebook-reader',
  section: 'read',
  category: 'reader',
  nameKey: 'tools.ebookReader.name',
  descriptionKey: 'tools.ebookReader.description',
  icon: BookText,
  route: '/read/ebooks',
  features: [],
  acceptedMimeTypes: [],
  status: 'coming-soon',
  component: lazy(() => import('./planned/GenericPlannedPage').then((m) => ({ default: m.makePage('ebook-reader') }))),
}

export const pdfImages: ToolModule = {
  id: 'pdf-images',
  section: 'convert',
  category: 'conversion',
  nameKey: 'tools.pdfImages.name',
  descriptionKey: 'tools.pdfImages.description',
  icon: ScanText,
  route: '/convert/pdf-images',
  features: [],
  acceptedMimeTypes: [],
  status: 'available',
  component: lazy(() => import('./convert/ConvertPages').then((m) => ({ default: m.PdfImagesPage }))),
}

export const spreadsheetConverter: ToolModule = {
  id: 'spreadsheet-converter',
  section: 'convert',
  category: 'conversion',
  nameKey: 'tools.spreadsheetConverter.name',
  descriptionKey: 'tools.spreadsheetConverter.description',
  icon: Table2,
  route: '/convert/spreadsheets',
  features: [],
  acceptedMimeTypes: [],
  status: 'available',
  component: lazy(() => import('./convert/ConvertPages').then((m) => ({ default: m.SpreadsheetConverterPage }))),
}

export const mediaConverter: ToolModule = {
  id: 'media-converter',
  section: 'convert',
  category: 'conversion',
  nameKey: 'tools.mediaConverter.name',
  descriptionKey: 'tools.mediaConverter.description',
  icon: Music,
  route: '/convert/media',
  features: [],
  acceptedMimeTypes: [],
  status: 'available',
  component: lazy(() => import('./convert/ConvertPages').then((m) => ({ default: m.MediaConverterPage }))),
}

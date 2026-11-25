import { FileSpreadsheet, FileType2, Presentation } from 'lucide-react'
import type { ToolModule } from '@/core/tools/types'

/** Placeholders so the shell already shows the platform roadmap. */
export const documentEditor: ToolModule = {
  id: 'document-editor',
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
  category: 'presentations',
  nameKey: 'tools.presentationEditor.name',
  descriptionKey: 'tools.presentationEditor.description',
  icon: Presentation,
  route: '/presentations/edit',
  features: [],
  acceptedMimeTypes: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  status: 'coming-soon',
}

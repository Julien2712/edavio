import { lazy } from 'react'
import { FileText } from 'lucide-react'
import type { ToolModule } from '@/core/tools/types'

export const pdfEditor: ToolModule = {
  id: 'pdf-editor',
  category: 'pdf',
  nameKey: 'tools.pdfEditor.name',
  descriptionKey: 'tools.pdfEditor.description',
  icon: FileText,
  route: '/pdf/edit',
  features: ['text', 'images', 'shapes', 'draw', 'sign', 'pages', 'redact', 'ocr', 'forms'],
  acceptedMimeTypes: ['application/pdf'],
  status: 'available',
  component: lazy(() => import('./PdfEditorPage')),
}

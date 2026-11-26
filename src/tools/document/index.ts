import { lazy } from 'react'
import { FileType2 } from 'lucide-react'
import type { ToolModule } from '@/core/tools/types'

export const documentEditor: ToolModule = {
  id: 'document-editor',
  category: 'documents',
  section: 'edit',
  nameKey: 'tools.documentEditor.name',
  descriptionKey: 'tools.documentEditor.description',
  icon: FileType2,
  route: '/documents/edit',
  features: ['docx', 'txt', 'md', 'html', 'rtf', 'rich-text', 'export'],
  acceptedMimeTypes: [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown',
    'text/html',
    'application/rtf',
  ],
  status: 'available',
  component: lazy(() => import('./DocumentEditorPage')),
}

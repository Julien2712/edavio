import { lazy } from 'react'
import { FileSpreadsheet } from 'lucide-react'
import type { ToolModule } from '@/core/tools/types'

export const spreadsheetEditor: ToolModule = {
  id: 'spreadsheet-editor',
  category: 'spreadsheets',
  section: 'edit',
  nameKey: 'tools.spreadsheetEditor.name',
  descriptionKey: 'tools.spreadsheetEditor.description',
  icon: FileSpreadsheet,
  route: '/spreadsheets/edit',
  features: ['xlsx', 'csv', 'formulas', 'multi-sheet'],
  acceptedMimeTypes: [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv',
  ],
  status: 'available',
  component: lazy(() => import('./SpreadsheetEditorPage')),
}

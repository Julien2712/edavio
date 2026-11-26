import { lazy } from 'react'
import { Presentation } from 'lucide-react'
import type { ToolModule } from '@/core/tools/types'

export const presentationEditor: ToolModule = {
  id: 'presentation-editor',
  category: 'presentations',
  section: 'edit',
  nameKey: 'tools.presentationEditor.name',
  descriptionKey: 'tools.presentationEditor.description',
  icon: Presentation,
  route: '/presentations/edit',
  features: ['pptx', 'slides', 'shapes', 'images', 'slideshow'],
  acceptedMimeTypes: [
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ],
  status: 'available',
  component: lazy(() => import('./PresentationEditorPage')),
}

import type { ComponentType, LazyExoticComponent } from 'react'
import type { LucideIcon } from 'lucide-react'

export type ToolCategory =
  | 'pdf'
  | 'documents'
  | 'spreadsheets'
  | 'presentations'
  | 'reader'
  | 'compression'
  | 'conversion'

/** Top-level sections shown in the navigation */
export type ToolSection = 'create' | 'edit' | 'read' | 'compress' | 'convert'

export const TOOL_SECTIONS: readonly ToolSection[] = ['create', 'edit', 'read', 'compress', 'convert']

export type ToolStatus = 'available' | 'coming-soon'

/**
 * Contract every Edavio tool must implement.
 * Text fields are i18n keys, never hard-coded strings.
 */
export interface ToolModule {
  /** Stable unique identifier, e.g. "pdf-editor". */
  id: string
  category: ToolCategory
  /** Navigation section this tool belongs to. */
  section: ToolSection
  /** i18n key for the display name. */
  nameKey: string
  /** i18n key for the short description. */
  descriptionKey: string
  icon: LucideIcon
  /** URL path, e.g. "/pdf/edit". */
  route: string
  /** Feature identifiers the tool exposes (used by the shell for capabilities). */
  features: readonly string[]
  /** MIME types the tool can open. */
  acceptedMimeTypes: readonly string[]
  status: ToolStatus
  /** Lazy-loaded UI so each tool is code-split. */
  component?: LazyExoticComponent<ComponentType>
}

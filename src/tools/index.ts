import { ToolRegistry } from '@/core/tools/registry'
import { documentEditor } from './document'
import { pdfEditor } from './pdf'
import { presentationEditor } from './presentation'
import { spreadsheetEditor } from './spreadsheet'
import {
  documentConverter,
  documentReader,
  imageConverter,
  pdfCompressor,
} from './future'

// Adding a new tool = create its module + register it here. Nothing else changes.
ToolRegistry.register(pdfEditor)
  .register(documentEditor)
  .register(spreadsheetEditor)
  .register(presentationEditor)
  .register(documentReader)
  .register(pdfCompressor)
  .register(imageConverter)
  .register(documentConverter)

export { ToolRegistry }

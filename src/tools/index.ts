import { ToolRegistry } from '@/core/tools/registry'
import { documentEditor } from './document'
import { pdfEditor } from './pdf'
import { presentationEditor } from './presentation'
import { spreadsheetEditor } from './spreadsheet'
import {
  fileCompressor,
  imageCompressor,
  officeCompressor,
  archiveTool,
  mediaCompressor,
  imageViewer,
  textReader,
  ebookReader,
  pdfImages,
  spreadsheetConverter,
  mediaConverter,
  documentConverter,
  documentReader,
  imageConverter,
  pdfCompressor,
  videoDownloader,
} from './future'

// Adding a new tool = create its module + register it here. Nothing else changes.
ToolRegistry.register(pdfEditor)
  .register(documentEditor)
  .register(spreadsheetEditor)
  .register(presentationEditor)
  .register(documentReader)
  .register(imageViewer)
  .register(textReader)
  .register(ebookReader)
  .register(pdfCompressor)
  .register(fileCompressor)
  .register(imageCompressor)
  .register(officeCompressor)
  .register(archiveTool)
  .register(mediaCompressor)
  .register(imageConverter)
  .register(documentConverter)
  .register(pdfImages)
  .register(spreadsheetConverter)
  .register(mediaConverter)
  .register(videoDownloader)

export { ToolRegistry }

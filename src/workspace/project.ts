/** Edavio project file (.edavio): the editable state of a document, like a .ai / .psd — not the final export. */

export type ProjectKind = 'pdf' | 'document' | 'spreadsheet' | 'presentation'

export interface ProjectFile {
  app: 'edavio'
  version: 1
  kind: ProjectKind
  title: string
  savedAt: string
  data: unknown
}

export const PROJECT_EXT = '.edavio'

export const KIND_ROUTE: Record<ProjectKind, string> = {
  pdf: '/pdf/edit',
  document: '/documents/edit',
  spreadsheet: '/spreadsheets/edit',
  presentation: '/presentations/edit',
}

export const isProjectFile = (f: File) => f.name.toLowerCase().endsWith(PROJECT_EXT)

export async function readProject(file: File): Promise<ProjectFile> {
  const parsed = JSON.parse(await file.text()) as ProjectFile
  if (parsed?.app !== 'edavio' || !parsed.kind || !(parsed.kind in KIND_ROUTE)) throw new Error('Invalid Edavio project')
  return parsed
}

export function projectBlob(p: ProjectFile): Blob {
  return new Blob([JSON.stringify(p)], { type: 'application/json' })
}

export function bytesToBase64(bytes: Uint8Array): string {
  let s = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk))
  return btoa(s)
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function downloadFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

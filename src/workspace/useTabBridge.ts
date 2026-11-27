import { useContext, useEffect, useRef } from 'react'
import { TabIdContext, useWorkspace } from './WorkspaceContext'
import type { ProjectFile } from './project'

/**
 * Connects an editor to its workspace tab: title, "has content" flag (drives the close confirmation)
 * and the project serializer used for .edavio files.
 */
export function useTabBridge(opts: { hasContent: boolean; title?: string; getProject?: () => Promise<ProjectFile> | ProjectFile }) {
  const id = useContext(TabIdContext)
  const ws = useWorkspace()
  const getRef = useRef(opts.getProject)
  getRef.current = opts.getProject

  useEffect(() => {
    if (id) ws.patch(id, { hasContent: opts.hasContent, ...(opts.title ? { title: opts.title } : {}) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, opts.hasContent, opts.title])

  useEffect(() => {
    if (!id) return
    ws.registerSaver(id, () => {
      if (!getRef.current) throw new Error('no project')
      return getRef.current()
    })
    return () => ws.registerSaver(id, null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  return {
    saveProject: () => (id ? ws.saveProject(id) : Promise.resolve()),
    openProjectFile: ws.openProjectFile,
  }
}

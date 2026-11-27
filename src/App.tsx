import { createHashRouter, RouterProvider } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import CreatePage from '@/pages/CreatePage'
import EditPage from '@/pages/EditPage'
import HomePage from '@/pages/HomePage'
import NotFoundPage from '@/pages/NotFoundPage'
import { ToolRegistry } from '@/tools'
import { EditorEntry } from '@/workspace/WorkspaceHost'

// Routes for tools are generated from the registry.
const toolRoutes = ToolRegistry.list()
  .filter((tool) => tool.component)
  .map((tool) => {
    if (tool.section === 'edit') return { path: tool.route, element: <EditorEntry route={tool.route} /> }
    const Component = tool.component!
    return { path: tool.route, element: <Component /> }
  })

const router = createHashRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: '/create', element: <CreatePage /> },
      { path: '/edit', element: <EditPage /> },
      ...toolRoutes,
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}

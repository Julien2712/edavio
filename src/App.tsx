import { createHashRouter, RouterProvider } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import HomePage from '@/pages/HomePage'
import NotFoundPage from '@/pages/NotFoundPage'
import { ToolRegistry } from '@/tools'

// Routes for tools are generated from the registry.
const toolRoutes = ToolRegistry.list()
  .filter((tool) => tool.component)
  .map((tool) => {
    const Component = tool.component!
    return { path: tool.route, element: <Component /> }
  })

const router = createHashRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      ...toolRoutes,
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}

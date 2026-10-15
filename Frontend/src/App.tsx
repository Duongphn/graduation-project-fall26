import { RouterProvider } from 'react-router-dom'

import { router } from './routes/app-routes'

// Providers (theme, antd App, React Query) are in main.tsx and contexts/theme-provider.tsx.
function App() {
  return <RouterProvider router={router} />
}

export default App

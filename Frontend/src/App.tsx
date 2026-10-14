import { RouterProvider } from 'react-router-dom'

import { AppProviders } from './app/AppProviders'
import { router } from './routes/app-routes'

function App() {
  return (
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  )
}

export default App

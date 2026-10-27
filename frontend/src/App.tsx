import { App as AntdApp } from 'antd'
import { RouterProvider } from 'react-router-dom'
import { router } from './routes/app-routes'

// AntdApp: message / modal / notification qua App.useApp() (trang quản trị và quyên góp).
function App() {
  return (
    <AntdApp>
      <RouterProvider router={router} />
    </AntdApp>
  )
}

export default App

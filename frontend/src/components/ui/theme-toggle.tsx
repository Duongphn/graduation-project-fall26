import { MoonOutlined, SunOutlined } from '@ant-design/icons'
import { Button } from 'antd'
import { useTheme } from '../../contexts/theme-context'

export function ThemeToggle() {
  const { isDark, toggleTheme } = useTheme()

  return (
    <Button
      type="text"
      shape="circle"
      onClick={toggleTheme}
      icon={isDark ? <SunOutlined /> : <MoonOutlined />}
      aria-label={isDark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
    />
  )
}

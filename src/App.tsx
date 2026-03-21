/**
 * AutoGantt应用根组件。
 *
 * @description
 * - 负责挂载全局路由结构
 * - 默认首页为“时间轴”
 *
 * @returns {JSX.Element} 应用根视图
 */
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './layout/AppLayout'
import { LoginPage } from './pages/LoginPage'
import { ParadigmPage } from './pages/ParadigmPage'
import { ProfilePage } from './pages/ProfilePage'
import { RequirementsPage } from './pages/RequirementsPage'
import { SettingsPage } from './pages/SettingsPage'
import { TimelinePage } from './pages/TimelinePage'

export function App(): JSX.Element {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<AppLayout />}>
        <Route index element={<TimelinePage />} />
        <Route path="paradigm" element={<ParadigmPage />} />
        <Route path="requirements" element={<RequirementsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

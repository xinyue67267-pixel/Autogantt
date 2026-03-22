/**
 * 应用主布局。
 *
 * @description
 * - 固定顶部Header
 * - 全局Header导航（时间轴/开发范式/需求/设置）
 * - 承载四个业务页面与登录状态入口
 * - 监听 state.theme 并同步写入 html[data-theme]，驱动 CSS 变量切换
 */
import { useEffect } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAppStateContext } from '../context/AppStateContext'

/**
 * 根据同步状态返回展示文案。
 *
 * @param {'synced' | 'syncing' | 'offline_pending' | 'conflict'} status 同步状态
 * @returns {string} 同步文案
 */
function getSyncLabel(status: 'synced' | 'syncing' | 'offline_pending' | 'conflict'): string {
  /**
   * 条件目的：用统一词汇展示同步状态，保持文案一致性。
   */
  if (status === 'synced') {
    return '已同步'
  }
  if (status === 'syncing') {
    return '同步中'
  }
  if (status === 'offline_pending') {
    return '离线待同步'
  }
  return '冲突待处理'
}

/**
 * 应用主布局组件。
 *
 * @returns {JSX.Element} 页面结构
 */
export function AppLayout(): JSX.Element {
  const { state, setUserSession } = useAppStateContext()
  const navigate = useNavigate()

  /**
   * 监听主题变化，将 data-theme 写入 html 元素，驱动 CSS 变量即时切换。
   * 默认主题不写入属性（CSS 无 data-theme 时自动使用 :root 默认值）。
   */
  useEffect(() => {
    const root = document.documentElement
    if (state.theme === 'minimal') {
      root.dataset.theme = 'minimal'
    } else {
      delete root.dataset.theme
    }
  }, [state.theme])

  /**
   * 执行退出登录。
   *
   * @returns {void}
   */
  const handleLogout = (): void => {
    setUserSession({
      email: '',
      loggedIn: false,
      syncStatus: 'synced',
    })
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <nav className="main-nav" aria-label="主导航">
          <NavLink end to="/" className={({ isActive }) => (isActive ? 'active' : undefined)}>
            时间轴
          </NavLink>
          <NavLink to="/paradigm" className={({ isActive }) => (isActive ? 'active' : undefined)}>
            开发范式
          </NavLink>
          <NavLink
            to="/requirements"
            className={({ isActive }) => (isActive ? 'active' : undefined)}
          >
            需求
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => (isActive ? 'active' : undefined)}>
            设置
          </NavLink>
        </nav>
        <div className="header-right">
          <div className="logo">AutoGantt</div>
          <span className="sync-tag">{getSyncLabel(state.userSession.syncStatus)}</span>
          {state.userSession.loggedIn ? (
            <div className="session-box">
              <button className="ghost-btn" type="button" onClick={() => navigate('/profile')}>
                {state.userSession.email || '我的账号'}
              </button>
              <button className="ghost-btn" type="button" onClick={handleLogout}>
                退出
              </button>
            </div>
          ) : (
            <button className="primary-btn" type="button" onClick={() => navigate('/login')}>
              登录
            </button>
          )}
        </div>
      </header>
      <div className="app-body">
        <main className="page-container">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

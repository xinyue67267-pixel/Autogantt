/**
 * 用户资料页面。
 *
 * @description
 * - 展示当前登录态与存储模式信息
 */
import { useAppStateContext } from '../context/AppStateContext'

/**
 * 资料页组件。
 *
 * @returns {JSX.Element} 资料页视图
 */
export function ProfilePage(): JSX.Element {
  const { state } = useAppStateContext()

  return (
    <section className="card">
      <h2>用户资料</h2>
      <p>账号：{state.userSession.email || '未登录'}</p>
      <p>同步状态：{state.userSession.syncStatus}</p>
      <p>存储模式：{state.storageMode}</p>
    </section>
  )
}

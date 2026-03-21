/**
 * 登录页面。
 *
 * @description
 * - 支持邮箱模拟登录
 * - 支持继续本地模式
 */
import { FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStateContext } from '../context/AppStateContext'

/**
 * 登录页组件。
 *
 * @returns {JSX.Element} 登录页视图
 */
export function LoginPage(): JSX.Element {
  const [email, setEmail] = useState('')
  const navigate = useNavigate()
  const { setUserSession } = useAppStateContext()

  /**
   * 提交登录动作。
   *
   * @param {FormEvent<HTMLFormElement>} event 表单事件
   * @returns {void}
   */
  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()

    /**
     * 条件目的：邮箱为空时阻止提交，避免无效登录态。
     */
    if (!email.trim()) {
      return
    }

    setUserSession({
      email: email.trim(),
      loggedIn: true,
      syncStatus: 'synced',
    })
    navigate('/settings')
  }

  return (
    <div className="center-page">
      <form className="card login-card" onSubmit={handleSubmit}>
        <h1>登录以开启多端同步</h1>
        <label className="field">
          <span>邮箱</span>
          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <div className="row-gap">
          <button className="primary-btn" type="submit">
            发送验证码并登录
          </button>
          <button className="ghost-btn" type="button" onClick={() => navigate('/')}>
            继续本地模式
          </button>
        </div>
      </form>
    </div>
  )
}

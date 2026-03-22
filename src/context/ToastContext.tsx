/**
 * 全局 Toast 通知系统。
 *
 * @description
 * - 提供 useToast() hook，暴露 success / warning / error 方法
 * - ToastProvider 负责渲染固定在视口右下角的 Toast 列表
 * - 自动按类型计时消失：success=2s, warning=3s, error=5s
 */
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { createId } from '../utils/id'

/** Toast 消息类型 */
export type ToastType = 'success' | 'warning' | 'error'

/** 单条 Toast 数据结构 */
export interface ToastItem {
  /** 唯一标识 */
  id: string
  /** 显示内容 */
  message: string
  /** 类型（决定颜色与持续时间） */
  type: ToastType
}

/** Toast 上下文暴露的方法集 */
interface ToastContextValue {
  /**
   * 显示成功 Toast（2秒自动消失）。
   *
   * @param {string} message 消息内容
   * @returns {void}
   */
  success: (message: string) => void
  /**
   * 显示警告 Toast（3秒自动消失）。
   *
   * @param {string} message 消息内容
   * @returns {void}
   */
  warning: (message: string) => void
  /**
   * 显示错误 Toast（5秒自动消失，可手动关闭）。
   *
   * @param {string} message 消息内容
   * @returns {void}
   */
  error: (message: string) => void
}

/** 各 Toast 类型对应的自动消失时长（ms） */
const TOAST_DURATION: Record<ToastType, number> = {
  success: 2000,
  warning: 3000,
  error: 5000,
}

const ToastContext = createContext<ToastContextValue | null>(null)

/**
 * 获取全局 Toast 方法。
 *
 * @returns {ToastContextValue} toast 方法集
 */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  /**
   * 条件目的：确保 Hook 在 ToastProvider 内部使用，避免空指针。
   */
  if (!ctx) {
    throw new Error('useToast must be used inside ToastProvider')
  }
  return ctx
}

/**
 * 全局 Toast Provider 组件。
 *
 * @param {{ children: ReactNode }} props 子节点
 * @returns {JSX.Element}
 */
export function ToastProvider({ children }: { children: ReactNode }): JSX.Element {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  /** 存储各 toast 的自动消失定时器，key 为 toast id */
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  /**
   * 移除指定 id 的 Toast。
   *
   * @param {string} id Toast ID
   * @returns {void}
   */
  const dismiss = useCallback((id: string): void => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer !== undefined) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  /**
   * 添加一条 Toast 并设置自动消失定时器。
   *
   * @param {string} message 显示内容
   * @param {ToastType} type 类型
   * @returns {void}
   */
  const addToast = useCallback(
    (message: string, type: ToastType): void => {
      const id = createId('toast')
      setToasts((prev) => [...prev, { id, message, type }])
      /** 条件目的：到期后自动移除，避免 Toast 堆积。 */
      const timer = setTimeout(() => dismiss(id), TOAST_DURATION[type])
      timers.current.set(id, timer)
    },
    [dismiss],
  )

  const value: ToastContextValue = {
    success: (message) => addToast(message, 'success'),
    warning: (message) => addToast(message, 'warning'),
    error: (message) => addToast(message, 'error'),
  }

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Toast 列表：固定在视口右下角 */}
      <div className="toast-list" role="region" aria-label="通知">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast--${toast.type}`} role="alert">
            <span className="toast__icon">{TOAST_ICON[toast.type]}</span>
            <span className="toast__message">{toast.message}</span>
            <button
              className="toast__close"
              type="button"
              aria-label="关闭"
              onClick={() => dismiss(toast.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

/** Toast 类型对应的图标字符 */
const TOAST_ICON: Record<ToastType, string> = {
  success: '✓',
  warning: '⚠',
  error: '✕',
}

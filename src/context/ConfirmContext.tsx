/* eslint-disable react-refresh/only-export-components */
/**
 * 全局二次确认弹窗系统。
 *
 * @description
 * - 提供 useConfirm() hook，暴露 confirm(options) 方法
 * - ConfirmProvider 负责渲染全屏遮罩弹窗
 * - 危险操作（删除等）通过此 hook 弹窗让用户二次确认
 */
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

/** 确认弹窗配置 */
interface ConfirmOptions {
  /** 弹窗标题 */
  title: string
  /** 弹窗说明文字 */
  description?: string
  /** 确认按钮文案（默认"确认删除"） */
  confirmLabel?: string
  /** 是否为危险操作（确认按钮显示红色，默认 true） */
  danger?: boolean
}

/** confirm 方法签名 */
type ConfirmFn = (options: ConfirmOptions, onConfirm: () => void) => void

interface ConfirmContextValue {
  confirm: ConfirmFn
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null)

/**
 * 获取全局确认弹窗方法。
 *
 * @returns {ConfirmContextValue} confirm 方法
 */
export function useConfirm(): ConfirmContextValue {
  const ctx = useContext(ConfirmContext)
  /**
   * 条件目的：确保 Hook 在 ConfirmProvider 内部使用，避免空指针。
   */
  if (!ctx) {
    throw new Error('useConfirm must be used inside ConfirmProvider')
  }
  return ctx
}

/** 弹窗内部状态 */
interface ConfirmState {
  open: boolean
  options: ConfirmOptions
  onConfirm: (() => void) | null
}

const INITIAL_STATE: ConfirmState = {
  open: false,
  options: { title: '' },
  onConfirm: null,
}

/**
 * 全局确认弹窗 Provider 组件。
 *
 * @param {{ children: ReactNode }} props 子节点
 * @returns {JSX.Element}
 */
export function ConfirmProvider({ children }: { children: ReactNode }): JSX.Element {
  const [state, setState] = useState<ConfirmState>(INITIAL_STATE)

  /**
   * 弹出确认弹窗。
   *
   * @param {ConfirmOptions} options 弹窗配置
   * @param {() => void} onConfirm 用户点击"确认"后的回调
   * @returns {void}
   */
  const confirm: ConfirmFn = useCallback((options, onConfirm) => {
    setState({ open: true, options, onConfirm })
  }, [])

  /**
   * 关闭弹窗（取消或确认后均调用）。
   *
   * @returns {void}
   */
  const handleClose = (): void => {
    setState(INITIAL_STATE)
  }

  /**
   * 执行确认操作并关闭弹窗。
   *
   * @returns {void}
   */
  const handleConfirm = (): void => {
    state.onConfirm?.()
    handleClose()
  }

  const { open, options } = state
  const isDanger = options.danger !== false

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {/* 条件目的：弹窗仅在触发后渲染，避免不必要的 DOM 节点。 */}
      {open && (
        <div
          className="modal-mask"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          onClick={(e) => {
            /** 条件目的：点击遮罩层背景关闭弹窗，点击弹窗内部不关闭。 */
            if (e.target === e.currentTarget) handleClose()
          }}
        >
          <div className="modal-box confirm-box">
            <h3 className="modal-title" id="confirm-title">
              {options.title}
            </h3>
            {options.description && <p className="confirm-description">{options.description}</p>}
            <div className="modal-actions">
              <button className="ghost-btn" type="button" onClick={handleClose}>
                取消
              </button>
              <button
                className={isDanger ? 'danger-btn confirm-btn--danger' : 'primary-btn'}
                type="button"
                onClick={handleConfirm}
                autoFocus
              >
                {options.confirmLabel ?? (isDanger ? '确认删除' : '确认')}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}

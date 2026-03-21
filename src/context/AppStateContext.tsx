/**
 * 全局状态上下文。
 *
 * @description
 * - 为多页面共享应用状态与操作入口
 */
import { createContext, useContext } from 'react'
import { useAppState } from '../hooks/useAppState'

type AppStateStore = ReturnType<typeof useAppState>

const AppStateContext = createContext<AppStateStore | null>(null)

/**
 * 全局状态Provider。
 *
 * @param {{ children: React.ReactNode }} props 子节点
 * @returns {JSX.Element} Provider组件
 */
export function AppStateProvider(props: { children: React.ReactNode }): JSX.Element {
  const store = useAppState()
  return <AppStateContext.Provider value={store}>{props.children}</AppStateContext.Provider>
}

/**
 * 获取全局状态上下文。
 *
 * @returns {AppStateStore} 状态存储对象
 */
export function useAppStateContext(): AppStateStore {
  const ctx = useContext(AppStateContext)

  /**
   * 条件目的：确保Hook仅在Provider内部调用，避免空上下文错误。
   */
  if (!ctx) {
    throw new Error('useAppStateContext must be used inside AppStateProvider')
  }

  return ctx
}

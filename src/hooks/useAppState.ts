/**
 * AutoGantt全局状态Hook。
 *
 * @description
 * - 提供本地存储读写
 * - 暴露页面所需的统一变更动作
 */
import { useMemo, useState } from 'react'
import { DEFAULT_APP_STATE } from '../data/defaults'
import type {
  AppState,
  HolidayRange,
  ParadigmTemplate,
  Requirement,
  StorageMode,
  UserSession,
} from '../types'

const STORAGE_KEY = 'autogantt-app-state-v1'

/**
 * 从本地存储加载应用状态。
 *
 * @returns {AppState} 应用状态
 */
function loadState(): AppState {
  const raw = localStorage.getItem(STORAGE_KEY)

  /**
   * 条件目的：首次打开无缓存时返回默认状态。
   */
  if (!raw) {
    return DEFAULT_APP_STATE
  }

  try {
    const parsed = JSON.parse(raw) as AppState
    return { ...DEFAULT_APP_STATE, ...parsed }
  } catch {
    return DEFAULT_APP_STATE
  }
}

/**
 * 将状态写入本地存储。
 *
 * @param {AppState} nextState 待持久化状态
 * @returns {void}
 */
function persistState(nextState: AppState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState))
}

/**
 * 创建并返回应用状态与操作集。
 *
 * @returns {{
 *  state: AppState
 *  setStorageMode: (mode: StorageMode) => void
 *  setUserSession: (session: UserSession) => void
 *  addCategory: (value: string) => void
 *  removeCategory: (value: string) => void
 *  addLevel: (value: string) => void
 *  removeLevel: (value: string) => void
 *  upsertHoliday: (value: HolidayRange) => void
 *  removeHoliday: (id: string) => void
 *  upsertParadigm: (value: ParadigmTemplate) => void
 *  removeParadigm: (id: string) => void
 *  upsertRequirement: (value: Requirement) => void
 *  removeRequirement: (id: string) => void
 *  importRequirements: (values: Requirement[]) => void
 * }} 状态对象与操作函数
 */
export function useAppState() {
  const [state, setState] = useState<AppState>(() => loadState())

  /**
   * 统一更新器：更新状态并持久化。
   *
   * @param {(prev: AppState) => AppState} updater 状态更新函数
   * @returns {void}
   */
  const commit = (updater: (prev: AppState) => AppState): void => {
    setState((prev) => {
      const next = updater(prev)
      persistState(next)
      return next
    })
  }

  const actions = useMemo(
    () => ({
      setStorageMode: (mode: StorageMode): void => {
        commit((prev) => ({ ...prev, storageMode: mode }))
      },
      setUserSession: (session: UserSession): void => {
        commit((prev) => ({ ...prev, userSession: session }))
      },
      addCategory: (value: string): void => {
        commit((prev) => {
          /**
           * 条件目的：防止插入重复分类值，保持下拉项唯一。
           */
          if (!value || prev.categories.includes(value)) {
            return prev
          }
          return { ...prev, categories: [...prev.categories, value] }
        })
      },
      removeCategory: (value: string): void => {
        commit((prev) => ({
          ...prev,
          categories: prev.categories.filter((item) => item !== value),
        }))
      },
      addLevel: (value: string): void => {
        commit((prev) => {
          /**
           * 条件目的：防止插入重复级别值，保持下拉项唯一。
           */
          if (!value || prev.levels.includes(value)) {
            return prev
          }
          return { ...prev, levels: [...prev.levels, value] }
        })
      },
      removeLevel: (value: string): void => {
        commit((prev) => ({ ...prev, levels: prev.levels.filter((item) => item !== value) }))
      },
      upsertHoliday: (value: HolidayRange): void => {
        commit((prev) => {
          const list = [...prev.holidays]
          const index = list.findIndex((item) => item.id === value.id)

          /**
           * 条件目的：命中现有记录时走更新分支，未命中时走新增分支。
           */
          if (index >= 0) {
            list[index] = value
          } else {
            list.push(value)
          }
          return { ...prev, holidays: list }
        })
      },
      removeHoliday: (id: string): void => {
        commit((prev) => ({ ...prev, holidays: prev.holidays.filter((item) => item.id !== id) }))
      },
      upsertParadigm: (value: ParadigmTemplate): void => {
        commit((prev) => {
          const list = [...prev.paradigms]
          const index = list.findIndex((item) => item.id === value.id)

          /**
           * 条件目的：命中现有记录时走更新分支，未命中时走新增分支。
           */
          if (index >= 0) {
            list[index] = value
          } else {
            list.push(value)
          }
          return { ...prev, paradigms: list }
        })
      },
      removeParadigm: (id: string): void => {
        commit((prev) => ({ ...prev, paradigms: prev.paradigms.filter((item) => item.id !== id) }))
      },
      upsertRequirement: (value: Requirement): void => {
        commit((prev) => {
          const list = [...prev.requirements]
          const index = list.findIndex((item) => item.id === value.id)

          /**
           * 条件目的：命中现有记录时走更新分支，未命中时走新增分支。
           */
          if (index >= 0) {
            list[index] = value
          } else {
            list.push(value)
          }
          return { ...prev, requirements: list }
        })
      },
      removeRequirement: (id: string): void => {
        commit((prev) => ({
          ...prev,
          requirements: prev.requirements.map((item) =>
            item.id === id ? { ...item, deleted: true } : item,
          ),
        }))
      },
      importRequirements: (values: Requirement[]): void => {
        commit((prev) => ({ ...prev, requirements: [...prev.requirements, ...values] }))
      },
    }),
    [],
  )

  return {
    state,
    ...actions,
  }
}

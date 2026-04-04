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
  Pipeline,
  Requirement,
  RequirementSchedule,
  StageLibraryItem,
  StorageMode,
  ThemeId,
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
    return {
      ...DEFAULT_APP_STATE,
      ...parsed,
      pipelines: DEFAULT_APP_STATE.pipelines,
      holidays: DEFAULT_APP_STATE.holidays,
      stageLibrary: DEFAULT_APP_STATE.stageLibrary,
      paradigms: parsed.paradigms?.length ? parsed.paradigms : DEFAULT_APP_STATE.paradigms,
    }
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
 *  upsertPipeline: (value: Pipeline) => void
 *  removePipeline: (id: string) => void
 *  upsertRequirement: (value: Requirement) => void
 *  removeRequirement: (id: string) => void
 *  importRequirements: (values: Requirement[]) => void
 *  importParadigms: (values: ParadigmTemplate[]) => void
 *  upsertStageLibraryItem: (value: StageLibraryItem) => void
 *  removeStageLibraryItem: (id: string) => void
 *  importStageLibraryItems: (values: StageLibraryItem[]) => void
 *  batchUpdateStageLibraryItems: (ids: string[], updater: (item: StageLibraryItem) => StageLibraryItem | null, paradigms: ParadigmTemplate[]) => void
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
      /**
       * 新增或更新管线（按 id 匹配：命中则更新，未命中则追加）。
       *
       * @param {Pipeline} value 管线数据
       * @returns {void}
       */
      upsertPipeline: (value: Pipeline): void => {
        commit((prev) => {
          const list = [...prev.pipelines]
          const index = list.findIndex((item) => item.id === value.id)
          /**
           * 条件目的：命中现有管线时走更新分支，未命中时走新增分支。
           */
          if (index >= 0) {
            list[index] = value
          } else {
            list.push(value)
          }
          return { ...prev, pipelines: list }
        })
      },
      /**
       * 删除指定管线。
       *
       * @param {string} id 管线 ID
       * @returns {void}
       */
      removePipeline: (id: string): void => {
        commit((prev) => ({ ...prev, pipelines: prev.pipelines.filter((item) => item.id !== id) }))
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
      /**
       * 批量导入范式模板（追加，不覆盖已有记录）。
       *
       * @param {ParadigmTemplate[]} values 要导入的范式列表
       * @returns {void}
       */
      importParadigms: (values: ParadigmTemplate[]): void => {
        commit((prev) => ({ ...prev, paradigms: [...prev.paradigms, ...values] }))
      },
      /**
       * 新增或更新环节库条目（按 id 匹配：命中则更新，未命中则追加）。
       *
       * @param {StageLibraryItem} value 环节库条目
       * @returns {void}
       */
      upsertStageLibraryItem: (value: StageLibraryItem): void => {
        commit((prev) => {
          const list = [...prev.stageLibrary]
          const index = list.findIndex((item) => item.id === value.id)
          /**
           * 条件目的：命中现有条目时走更新分支，未命中时走新增分支。
           */
          if (index >= 0) {
            list[index] = value
          } else {
            list.push(value)
          }
          return { ...prev, stageLibrary: list }
        })
      },
      /**
       * 删除指定环节库条目。
       *
       * @param {string} id 条目 ID
       * @returns {void}
       */
      removeStageLibraryItem: (id: string): void => {
        commit((prev) => ({
          ...prev,
          stageLibrary: prev.stageLibrary.filter((item) => item.id !== id),
        }))
      },
      /**
       * 批量追加环节库条目（跳过名称已存在的条目）。
       *
       * @param {StageLibraryItem[]} values 要追加的条目列表
       * @returns {void}
       */
      importStageLibraryItems: (values: StageLibraryItem[]): void => {
        commit((prev) => {
          const existingNames = new Set(prev.stageLibrary.map((item) => item.stageName))
          /**
           * 循环目的：过滤掉已存在同名条目，避免重复。
           */
          const toAdd = values.filter((item) => !existingNames.has(item.stageName))
          if (toAdd.length === 0) return prev
          return { ...prev, stageLibrary: [...prev.stageLibrary, ...toAdd] }
        })
      },
      /**
       * 批量更新环节库条目（按 id 匹配，仅更新传入的 ids 对应条目）。
       * 用于批量改管线、批量改颜色、批量删除（删除=过滤移除或标记停用）。
       *
       * @param {string[]} ids 目标条目 ID 列表
       * @param {(item: StageLibraryItem) => StageLibraryItem | null} updater 返回 null 表示删除该条目
       * @param {ParadigmTemplate[]} paradigms 用于判断是否被引用（批量删除时使用）
       * @returns {void}
       */
      batchUpdateStageLibraryItems: (
        ids: string[],
        updater: (item: StageLibraryItem) => StageLibraryItem | null,
        paradigms: ParadigmTemplate[],
      ): void => {
        commit((prev) => {
          const idSet = new Set(ids)
          /**
           * 循环目的：对每条条目判断是否在目标集合内；在集合内则经过 updater 变换，
           * updater 返回 null 时进一步判断引用情况（已被引用→标记停用，否则移除）。
           */
          const referenced = new Set(
            paradigms.flatMap((p) => p.stageTemplates.map((s) => s.stageName)),
          )
          const next: StageLibraryItem[] = []
          for (const item of prev.stageLibrary) {
            if (!idSet.has(item.id)) {
              next.push(item)
              continue
            }
            const result = updater(item)
            if (result === null) {
              if (referenced.has(item.stageName)) {
                next.push({ ...item, deprecated: true })
              }
              // else: drop (hard delete)
            } else {
              next.push(result)
            }
          }
          return { ...prev, stageLibrary: next }
        })
      },
      /**
       * 新增或更新单条手动排期覆盖（按 requirementId 匹配）。
       *
       * @param {RequirementSchedule} value 排期数据
       * @returns {void}
       */
      upsertScheduleOverride: (value: RequirementSchedule): void => {
        commit((prev) => {
          const list = [...(prev.scheduleOverrides ?? [])]
          const index = list.findIndex((item) => item.requirementId === value.requirementId)
          if (index >= 0) {
            list[index] = value
          } else {
            list.push(value)
          }
          return { ...prev, scheduleOverrides: list }
        })
      },
      /**
       * 批量导入手动排期覆盖（按 requirementId 合并，已存在则覆盖）。
       *
       * @param {RequirementSchedule[]} values 排期列表
       * @returns {void}
       */
      importScheduleOverrides: (values: RequirementSchedule[]): void => {
        commit((prev) => {
          const map = new Map((prev.scheduleOverrides ?? []).map((s) => [s.requirementId, s]))
          for (const v of values) {
            map.set(v.requirementId, v)
          }
          return { ...prev, scheduleOverrides: Array.from(map.values()) }
        })
      },
      /**
       * 切换主题，并同步重置所有管线颜色与环节库颜色为新主题色板。
       *
       * @param {ThemeId} themeId 目标主题标识
       * @param {string[]} pipelineColors 新主题的管线色板（6色）
       * @param {string[]} slibColors 新主题的环节库色板（16色）
       * @returns {void}
       */
      setTheme: (themeId: ThemeId, pipelineColors: string[], slibColors: string[]): void => {
        commit((prev) => {
          /**
           * 循环目的：按 index % 色板长度 为每条管线分配对应主题颜色。
           */
          const pipelines = prev.pipelines.map((p, idx) => ({
            ...p,
            color: pipelineColors[idx % pipelineColors.length],
          }))
          /**
           * 循环目的：按 index % 色板长度 为每条环节库条目分配对应主题颜色。
           */
          const stageLibrary = prev.stageLibrary.map((s, idx) => ({
            ...s,
            color: slibColors[idx % slibColors.length],
          }))
          return { ...prev, theme: themeId, pipelines, stageLibrary }
        })
      },
    }),
    [],
  )

  return {
    state,
    ...actions,
  }
}

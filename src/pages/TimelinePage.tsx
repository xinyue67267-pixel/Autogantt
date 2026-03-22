/**
 * 时间轴页面（首页）。
 *
 * @description
 * - 展示项目需求甘特时间轴
 * - 支持视图切换、筛选、拖拽平移与边缘缩放
 * - 支持周视图导出Excel
 * - 日视图周末格标灰，Header与Body网格线严格对齐
 * - 依赖连线渲染（SVG虚线+箭头）
 * - 拖拽结束后进行依赖校验，确认后保存
 */
import {
  MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import * as XLSX from 'xlsx'
import { useAppStateContext } from '../context/AppStateContext'
import type {
  RequirementSchedule,
  ScheduleBarDragPayload,
  StageInstance,
  TimelineViewMode,
} from '../types'
import { formatMonthDay, formatYear, formatYearMonth, isWorkingDay, toISODate } from '../utils/date'
import { applyScheduleDrag, generateSchedules } from '../utils/schedule'

/** 每行高度（px），与 CSS .timeline-row min-height 保持一致 */
const ROW_HEIGHT = 42

/** 时间轴 Header 高度（px） */
const HEADER_HEIGHT = 40

type DisplayRow =
  | {
      kind: 'pipeline'
      pipelineId: string
      pipelineName: string
      pipelineColor: string
      collapsed: boolean
    }
  | {
      kind: 'requirement'
      requirementId: string
      requirementName: string
      levelId: string
      pipelineId: string
      collapsed: boolean
    }
  | {
      kind: 'stage'
      requirementId: string
      requirementName: string
      levelId: string
      pipelineId: string
      stage: StageInstance
    }

interface DragState {
  requirementId: string
  stageId: string
  action: ScheduleBarDragPayload['action']
  startX: number
  /** 拖拽前的排期快照，用于取消时恢复 */
  snapshot: RequirementSchedule[]
}

/** 待确认保存的拖拽结果 */
interface PendingDrag {
  schedules: RequirementSchedule[]
  /** 依赖冲突描述列表（空表示无冲突） */
  conflicts: string[]
}

/**
 * 获取单位像素宽度。
 *
 * @param {TimelineViewMode} mode 视图模式
 * @returns {number} 单位宽度（px）
 */
function getUnitWidth(mode: TimelineViewMode): number {
  if (mode === 'day') return 40
  if (mode === 'week') return 72
  if (mode === 'month') return 120
  return 160
}

/**
 * 获取单位代表天数。
 *
 * @param {TimelineViewMode} mode 视图模式
 * @returns {number} 单位天数
 */
function getDaysPerUnit(mode: TimelineViewMode): number {
  if (mode === 'day') return 1
  if (mode === 'week') return 7
  if (mode === 'month') return 30
  return 365
}

/**
 * 检查一组排期是否满足范式依赖关系。
 *
 * @param {RequirementSchedule[]} schedules 排期列表
 * @param {ReturnType<typeof useAppStateContext>['state']} state 全局状态
 * @returns {string[]} 冲突描述列表，空表示无冲突
 */
function checkDependencyConflicts(
  schedules: RequirementSchedule[],
  state: ReturnType<typeof useAppStateContext>['state'],
): string[] {
  const conflicts: string[] = []

  /**
   * 循环目的：遍历所有排期，对照范式依赖规则检查时序合规性。
   */
  for (const schedule of schedules) {
    const requirement = state.requirements.find((r) => r.id === schedule.requirementId)
    if (!requirement) continue

    const template = state.paradigms.find((p) => p.id === requirement.templateId)
    if (!template) continue

    const stageInstanceMap = new Map(schedule.stages.map((s) => [s.stageId, s]))

    for (const stageTpl of template.stageTemplates) {
      const current = stageInstanceMap.get(stageTpl.id)
      if (!current || stageTpl.dependencies.length === 0) continue

      for (const dep of stageTpl.dependencies) {
        const pre = stageInstanceMap.get(dep.preStageId)
        if (!pre) continue

        const preEnd = new Date(pre.endDate)
        const curStart = new Date(current.startDate)

        /**
         * 条件目的：FS关系要求当前环节开始时间不早于前置环节结束时间。
         */
        if (dep.relation === 'FS' && dep.trigger === 'finish_100') {
          if (curStart <= preEnd) {
            conflicts.push(
              `"${requirement.requirementName}" 中「${current.stageName}」应在「${pre.stageName}」完成后开始`,
            )
          }
        }
      }
    }
  }

  return conflicts
}

/**
 * 时间轴页面组件。
 *
 * @returns {JSX.Element} 时间轴页面
 */
export function TimelinePage(): JSX.Element {
  const { state } = useAppStateContext()
  const [viewMode, setViewMode] = useState<TimelineViewMode>('week')
  const [year, setYear] = useState(new Date().getFullYear())
  const [selectedStageName, setSelectedStageName] = useState('全部环节')
  const [selectedLevel, setSelectedLevel] = useState('全部级别')
  const [selectedPipeline, setSelectedPipeline] = useState('全部管线')
  const [collapsedPipelines, setCollapsedPipelines] = useState<Set<string>>(() => new Set())
  const [collapsedRequirements, setCollapsedRequirements] = useState<Set<string>>(() => new Set())
  const [leftWidth, setLeftWidth] = useState(300)
  const [resizing, setResizing] = useState(false)
  /** 当前已应用的排期覆盖（拖拽中实时更新） */
  const [overrides, setOverrides] = useState<RequirementSchedule[]>([])
  const [dragState, setDragState] = useState<DragState | null>(null)
  /** 等待用户确认的拖拽结果 */
  const [pendingDrag, setPendingDrag] = useState<PendingDrag | null>(null)
  /** 环节条 Hover Tooltip 状态：记录当前悬浮的行信息与鼠标位置 */
  const [tooltip, setTooltip] = useState<{
    stageName: string
    startDate: string
    endDate: string
    x: number
    y: number
  } | null>(null)
  const boardRef = useRef<HTMLDivElement | null>(null)
  const canvasScrollRef = useRef<HTMLDivElement | null>(null)

  const generatedSchedules = useMemo(
    () => generateSchedules(state.requirements, state.paradigms, state.holidays),
    [state.holidays, state.paradigms, state.requirements],
  )

  const scheduleMap = useMemo(() => {
    const map = new Map<string, RequirementSchedule>()
    /**
     * 循环目的：优先写入自动排期，再用拖拽覆盖结果替换。
     */
    for (const schedule of generatedSchedules) {
      map.set(schedule.requirementId, schedule)
    }
    for (const override of overrides) {
      map.set(override.requirementId, override)
    }
    return map
  }, [generatedSchedules, overrides])

  const stageNames = useMemo(() => {
    const names = new Set<string>()
    const requirementMap = new Map(state.requirements.map((item) => [item.id, item]))
    for (const schedule of scheduleMap.values()) {
      const requirement = requirementMap.get(schedule.requirementId)
      if (!requirement || requirement.deleted) continue
      if (selectedLevel !== '全部级别' && requirement.levelId !== selectedLevel) continue
      if (selectedPipeline !== '全部管线' && requirement.pipelineId !== selectedPipeline) continue
      for (const stage of schedule.stages) {
        names.add(stage.stageName)
      }
    }
    return Array.from(names)
  }, [scheduleMap, selectedLevel, selectedPipeline, state.requirements])

  const rows = useMemo(() => {
    const requirementMap = new Map(state.requirements.map((item) => [item.id, item]))
    const pipelineMap = new Map(state.pipelines.map((item) => [item.id, item]))
    const grouped = new Map<string, string[]>()

    /**
     * 循环目的：将需求按管线分组并保持插入顺序，用于左侧树状图渲染。
     */
    for (const requirement of state.requirements) {
      if (requirement.deleted) continue
      if (selectedLevel !== '全部级别' && requirement.levelId !== selectedLevel) continue
      if (selectedPipeline !== '全部管线' && requirement.pipelineId !== selectedPipeline) continue
      const list = grouped.get(requirement.pipelineId) ?? []
      list.push(requirement.id)
      grouped.set(requirement.pipelineId, list)
    }

    const list: DisplayRow[] = []

    /**
     * 循环目的：按"管线→需求→环节"构造树状结构，与甘特画布行逐行对齐。
     */
    for (const [pipelineId, requirementIds] of grouped.entries()) {
      const pipeline = pipelineMap.get(pipelineId)
      const pipelineName = pipeline?.name ?? pipelineId
      const pipelineColor = pipeline?.color ?? 'var(--color-primary)'
      const pipelineCollapsed = collapsedPipelines.has(pipelineId)

      list.push({
        kind: 'pipeline',
        pipelineId,
        pipelineName,
        pipelineColor,
        collapsed: pipelineCollapsed,
      })

      if (pipelineCollapsed) continue

      for (const requirementId of requirementIds) {
        const requirement = requirementMap.get(requirementId)
        const schedule = scheduleMap.get(requirementId)
        if (!requirement || !schedule) continue

        const requirementCollapsed = collapsedRequirements.has(requirementId)
        const stageRows = schedule.stages.filter((stage) => {
          if (selectedStageName !== '全部环节' && stage.stageName !== selectedStageName)
            return false
          return true
        })

        if (stageRows.length === 0) continue

        list.push({
          kind: 'requirement',
          requirementId,
          requirementName: requirement.requirementName,
          levelId: requirement.levelId,
          pipelineId: requirement.pipelineId,
          collapsed: requirementCollapsed,
        })

        if (requirementCollapsed) continue

        for (const stage of stageRows) {
          list.push({
            kind: 'stage',
            requirementId,
            requirementName: requirement.requirementName,
            levelId: requirement.levelId,
            pipelineId: requirement.pipelineId,
            stage,
          })
        }
      }
    }

    return list
  }, [
    collapsedPipelines,
    collapsedRequirements,
    scheduleMap,
    selectedLevel,
    selectedPipeline,
    selectedStageName,
    state.pipelines,
    state.requirements,
  ])

  const viewConfig = useMemo(() => {
    const start = new Date(`${year}-01-01`)
    const end = new Date(`${year}-12-31`)
    const unitWidth = getUnitWidth(viewMode)
    const daysPerUnit = getDaysPerUnit(viewMode)
    const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
    const totalUnits = Math.ceil(totalDays / daysPerUnit)
    return { start, end, unitWidth, daysPerUnit, totalUnits, width: totalUnits * unitWidth }
  }, [viewMode, year])

  /**
   * 生成 Header 各列元数据（日期 + 是否周末）。
   *
   * @returns {{ date: Date; isWeekend: boolean }[]} 列元数据数组
   */
  const headerColumns = useMemo(() => {
    return Array.from({ length: viewConfig.totalUnits }, (_, index) => {
      const date = new Date(viewConfig.start)
      date.setDate(date.getDate() + index * viewConfig.daysPerUnit)
      /**
       * 条件目的：日视图逐日渲染，需标记周末列以便标灰。
       */
      const isWeekend = viewMode === 'day' && !isWorkingDay(date, state.holidays)
      return { date, isWeekend }
    })
  }, [viewConfig, viewMode, state.holidays])

  /**
   * 格式化时间轴 Header 刻度文案。
   *
   * @param {Date} value 当前刻度日期
   * @returns {string} 格式化文案
   */
  const formatHeaderLabel = (value: Date): string => {
    if (viewMode === 'year') return formatYear(value)
    if (viewMode === 'month') return formatYearMonth(value)
    return formatMonthDay(value)
  }

  /**
   * 将日期映射为相对横向像素偏移。
   *
   * @param {string} date 日期字符串
   * @returns {number} x 坐标（px）
   */
  const mapDateToX = useCallback(
    (date: string): number => {
      const startTime = viewConfig.start.getTime()
      const targetTime = new Date(date).getTime()
      const dayDiff = Math.floor((targetTime - startTime) / (1000 * 60 * 60 * 24))
      return (dayDiff / viewConfig.daysPerUnit) * viewConfig.unitWidth
    },
    [viewConfig],
  )

  /**
   * 计算每个 stage 行在画布中的 Y 中心坐标（用于连线）。
   *
   * @returns {Map<string, number>} key=`${requirementId}-${stageId}`, value=Y中心（px）
   */
  const stageYMap = useMemo(() => {
    const map = new Map<string, number>()
    rows.forEach((row, index) => {
      if (row.kind === 'stage') {
        map.set(`${row.requirementId}-${row.stage.stageId}`, index * ROW_HEIGHT + ROW_HEIGHT / 2)
      }
    })
    return map
  }, [rows])

  /**
   * 计算需要绘制的依赖连线列表。
   *
   * @returns {{ x1: number; y1: number; x2: number; y2: number; key: string }[]} 连线参数
   */
  const dependencyLines = useMemo(() => {
    const lines: { x1: number; y1: number; x2: number; y2: number; key: string }[] = []

    /**
     * 循环目的：遍历范式依赖关系，将其映射到排期实例的像素坐标。
     */
    for (const paradigm of state.paradigms) {
      for (const stageTpl of paradigm.stageTemplates) {
        for (const dep of stageTpl.dependencies) {
          /**
           * 遍历每条需求排期，找到对应的前置/当前环节实例坐标。
           */
          for (const [reqId, schedule] of scheduleMap.entries()) {
            const preInstance = schedule.stages.find((s) => s.stageId === dep.preStageId)
            const curInstance = schedule.stages.find((s) => s.stageId === stageTpl.id)
            if (!preInstance || !curInstance) continue

            const y1Key = `${reqId}-${dep.preStageId}`
            const y2Key = `${reqId}-${stageTpl.id}`
            const y1 = stageYMap.get(y1Key)
            const y2 = stageYMap.get(y2Key)
            if (y1 === undefined || y2 === undefined) continue

            const x1 =
              mapDateToX(preInstance.endDate) + viewConfig.unitWidth / viewConfig.daysPerUnit
            const x2 = mapDateToX(curInstance.startDate)
            lines.push({ x1, y1, x2, y2, key: `${reqId}-${dep.preStageId}-${stageTpl.id}` })
          }
        }
      }
    }

    return lines
  }, [state.paradigms, scheduleMap, stageYMap, mapDateToX, viewConfig])

  /**
   * 导出周视图 Excel。
   *
   * @returns {void}
   */
  const handleExport = (): void => {
    const header = ['项目/需求', '环节', '开始', '结束']
    const content = rows
      .filter((row): row is Extract<DisplayRow, { kind: 'stage' }> => row.kind === 'stage')
      .map((row) => [
        row.requirementName,
        row.stage.stageName,
        row.stage.startDate,
        row.stage.endDate,
      ])
    const sheet = XLSX.utils.aoa_to_sheet([header, ...content])
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, sheet, '时间轴周视图')
    XLSX.writeFile(book, `AutoGantt-${year}-week-view.xlsx`)
  }

  /**
   * 开始调整左侧树状栏宽度。
   *
   * @param {ReactMouseEvent<HTMLDivElement>} event 鼠标事件
   */
  const handleResizeStart = (event: ReactMouseEvent<HTMLDivElement>): void => {
    event.preventDefault()
    setResizing(true)
  }

  /**
   * 开始拖拽甘特条。
   *
   * @param {ReactMouseEvent<HTMLDivElement>} event 鼠标事件
   * @param {Extract<DisplayRow, { kind: 'stage' }>} row 当前行数据
   * @param {ScheduleBarDragPayload['action']} action 拖拽动作
   */
  const handleDragStart = (
    event: ReactMouseEvent<HTMLDivElement>,
    row: Extract<DisplayRow, { kind: 'stage' }>,
    action: ScheduleBarDragPayload['action'],
  ): void => {
    event.preventDefault()
    event.stopPropagation()
    // 开始拖拽时隐藏 Tooltip
    setTooltip(null)
    /** 记录拖拽前快照，供取消时恢复 */
    const snapshot = Array.from(scheduleMap.values())
    setDragState({
      requirementId: row.requirementId,
      stageId: row.stage.stageId,
      action,
      startX: event.clientX,
      snapshot,
    })
  }

  /**
   * 处理鼠标移动（拖拽中）。
   *
   * @param {MouseEvent} event 原生鼠标事件
   */
  const handleMouseMove = useCallback(
    (event: MouseEvent): void => {
      /**
       * 条件目的：拖拽调节左侧宽度优先处理，避免与甘特条拖拽互相干扰。
       */
      if (resizing) {
        const container = boardRef.current
        if (!container) return
        const rect = container.getBoundingClientRect()
        const nextWidth = Math.max(60, Math.min(520, Math.round(event.clientX - rect.left)))
        setLeftWidth(nextWidth)
        return
      }

      if (!dragState) return

      const pixelDelta = event.clientX - dragState.startX
      const days = Math.round((pixelDelta / viewConfig.unitWidth) * viewConfig.daysPerUnit)

      /**
       * 条件目的：位移不到1天时不触发排期更新，减少抖动。
       */
      if (days === 0) return

      setOverrides((prev) => {
        const base = prev.length > 0 ? prev : Array.from(scheduleMap.values())
        return applyScheduleDrag(
          base,
          {
            requirementId: dragState.requirementId,
            stageId: dragState.stageId,
            action: dragState.action,
            deltaDays: days,
          },
          state.holidays,
        )
      })
      setDragState((prev) => (prev ? { ...prev, startX: event.clientX } : prev))
    },
    [
      dragState,
      resizing,
      scheduleMap,
      state.holidays,
      viewConfig.daysPerUnit,
      viewConfig.unitWidth,
    ],
  )

  /**
   * 松手时触发依赖校验，要求用户确认后才持久化排期。
   */
  const handleMouseUp = useCallback((): void => {
    setResizing(false)

    if (!dragState) return

    /**
     * 条件目的：若拖拽中无覆盖产生（实际未移动），直接清除状态。
     */
    if (overrides.length === 0) {
      setDragState(null)
      return
    }

    const conflicts = checkDependencyConflicts(overrides, state)
    setPendingDrag({ schedules: overrides, conflicts })
    setDragState(null)
  }, [dragState, overrides, state])

  /**
   * 用户确认保存拖拽结果。
   *
   * @returns {void}
   */
  const handleConfirmDrag = (): void => {
    /** overrides 已经是最新排期，直接保留 */
    setPendingDrag(null)
  }

  /**
   * 用户取消拖拽，恢复到拖拽前快照。
   *
   * @returns {void}
   */
  const handleCancelDrag = (): void => {
    if (pendingDrag) {
      /** 恢复到 snapshot（dragState 已清除，用 overrides 恢复） */
      setOverrides([])
    }
    setPendingDrag(null)
  }

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [handleMouseMove, handleMouseUp])

  /** 今日 x 坐标（用于高亮竖线） */
  const todayX = useMemo(() => {
    const todayStr = toISODate(new Date())
    const startStr = toISODate(viewConfig.start)
    const endStr = toISODate(viewConfig.end)
    if (todayStr < startStr || todayStr > endStr) return null
    return mapDateToX(todayStr)
  }, [viewConfig, mapDateToX])

  /** 画布总高度（行数 × 行高） */
  const canvasHeight = rows.length * ROW_HEIGHT

  return (
    <section className="timeline-page">
      {/* 工具栏 */}
      <div className="card toolbar">
        <div className="row-gap">
          <select
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value as TimelineViewMode)}
          >
            <option value="day">日视图</option>
            <option value="week">周视图</option>
            <option value="month">月视图</option>
            <option value="year">年视图</option>
          </select>
          <button className="ghost-btn" type="button" onClick={() => setYear((v) => v - 1)}>
            上一年
          </button>
          <span className="year-tag">{year}</span>
          <button className="ghost-btn" type="button" onClick={() => setYear((v) => v + 1)}>
            下一年
          </button>
          {/* 折叠/展开全部 */}
          <button
            className="ghost-btn"
            type="button"
            onClick={() => {
              const allPipelineIds = new Set(state.pipelines.map((p) => p.id))
              setCollapsedPipelines(allPipelineIds)
              setCollapsedRequirements(new Set())
            }}
          >
            折叠全部
          </button>
          <button
            className="ghost-btn"
            type="button"
            onClick={() => {
              setCollapsedPipelines(new Set())
              setCollapsedRequirements(new Set())
            }}
          >
            展开全部
          </button>
        </div>
        <div className="row-gap">
          <select value={selectedStageName} onChange={(e) => setSelectedStageName(e.target.value)}>
            <option value="全部环节">全部环节</option>
            {stageNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <select value={selectedLevel} onChange={(e) => setSelectedLevel(e.target.value)}>
            <option value="全部级别">全部级别</option>
            {state.levels.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
          <select value={selectedPipeline} onChange={(e) => setSelectedPipeline(e.target.value)}>
            <option value="全部管线">全部管线</option>
            {state.pipelines.map((pipeline) => (
              <option key={pipeline.id} value={pipeline.id}>
                {pipeline.name}
              </option>
            ))}
          </select>
          <button className="primary-btn" type="button" onClick={handleExport}>
            导出Excel
          </button>
        </div>
      </div>

      {/* 主体看板 */}
      <div className="timeline-board card" ref={boardRef}>
        {/* 左侧树状列 */}
        <div className="timeline-left" style={{ width: leftWidth }}>
          <div className="timeline-left-header" style={{ height: HEADER_HEIGHT }}>
            项目/需求
          </div>
          {rows.map((row) => {
            if (row.kind === 'pipeline') {
              return (
                <div
                  key={`pipe-${row.pipelineId}`}
                  className="timeline-left-row pipeline-row"
                  style={{ height: ROW_HEIGHT }}
                >
                  <button
                    className="tree-toggle"
                    type="button"
                    onClick={() =>
                      setCollapsedPipelines((prev) => {
                        const next = new Set(prev)
                        if (next.has(row.pipelineId)) next.delete(row.pipelineId)
                        else next.add(row.pipelineId)
                        return next
                      })
                    }
                    aria-label={row.collapsed ? '展开' : '收起'}
                  >
                    {row.collapsed ? '▸' : '▾'}
                  </button>
                  <span className="tree-dot" style={{ background: row.pipelineColor }} />
                  <strong>{row.pipelineName}</strong>
                </div>
              )
            }

            if (row.kind === 'requirement') {
              return (
                <div
                  key={`req-${row.requirementId}`}
                  className="timeline-left-row requirement-row"
                  style={{ height: ROW_HEIGHT }}
                >
                  <button
                    className="tree-toggle"
                    type="button"
                    onClick={() =>
                      setCollapsedRequirements((prev) => {
                        const next = new Set(prev)
                        if (next.has(row.requirementId)) next.delete(row.requirementId)
                        else next.add(row.requirementId)
                        return next
                      })
                    }
                    aria-label={row.collapsed ? '展开' : '收起'}
                  >
                    {row.collapsed ? '▸' : '▾'}
                  </button>
                  <span className="tree-indent" />
                  <strong>{row.requirementName}</strong>
                  <span className="tree-badge">{row.levelId}</span>
                </div>
              )
            }

            return (
              <div
                key={`${row.requirementId}-${row.stage.stageId}`}
                className="timeline-left-row stage-row"
                style={{ height: ROW_HEIGHT }}
              >
                <span className="tree-indent" />
                <span className="tree-indent" />
                <span className="stage-label">{row.stage.stageName}</span>
              </div>
            )
          })}
        </div>

        {/* 拖拽分隔条 */}
        <div className="timeline-resizer" onMouseDown={handleResizeStart} role="separator" />

        {/* 右侧画布（单一滚动容器，Header sticky 在顶部） */}
        <div className="timeline-right" ref={canvasScrollRef}>
          {/* Header + Body 共用一个宽度容器，保证对齐 */}
          <div style={{ width: viewConfig.width, position: 'relative', minWidth: '100%' }}>
            {/* Sticky Header */}
            <div
              className="timeline-canvas-header"
              style={{ height: HEADER_HEIGHT, position: 'sticky', top: 0, zIndex: 2 }}
            >
              {headerColumns.map(({ date, isWeekend }, index) => (
                <div
                  key={`${index}-${viewMode}`}
                  className={`timeline-header-cell${isWeekend ? ' weekend-cell' : ''}`}
                  style={{ width: viewConfig.unitWidth, minWidth: viewConfig.unitWidth }}
                >
                  {formatHeaderLabel(date)}
                </div>
              ))}
            </div>

            {/* 画布 Body（相对定位容器，内含网格背景、行、SVG连线、今日线） */}
            <div
              className="timeline-canvas-body"
              style={
                {
                  width: viewConfig.width,
                  height: canvasHeight,
                  position: 'relative',
                  '--grid-unit': `${viewConfig.unitWidth}px`,
                } as React.CSSProperties
              }
            >
              {/* 周末列背景（日视图） */}
              {viewMode === 'day' &&
                headerColumns.map(({ isWeekend }, index) =>
                  isWeekend ? (
                    <div
                      key={`weekend-col-${index}`}
                      className="weekend-col-bg"
                      style={{
                        position: 'absolute',
                        left: index * viewConfig.unitWidth,
                        top: 0,
                        width: viewConfig.unitWidth,
                        height: '100%',
                      }}
                    />
                  ) : null,
                )}

              {/* 各行 */}
              {rows.map((row, rowIndex) => {
                if (row.kind === 'pipeline') {
                  return (
                    <div
                      key={`pipe-row-${row.pipelineId}`}
                      className="timeline-row pipeline-sep"
                      style={{
                        position: 'absolute',
                        top: rowIndex * ROW_HEIGHT,
                        left: 0,
                        right: 0,
                        height: ROW_HEIGHT,
                      }}
                    />
                  )
                }

                if (row.kind === 'requirement') {
                  return (
                    <div
                      key={`req-row-${row.requirementId}`}
                      className="timeline-row requirement-sep"
                      style={{
                        position: 'absolute',
                        top: rowIndex * ROW_HEIGHT,
                        left: 0,
                        right: 0,
                        height: ROW_HEIGHT,
                      }}
                    />
                  )
                }

                const startX = mapDateToX(row.stage.startDate)
                const endX = mapDateToX(row.stage.endDate)
                const barWidth = Math.max(
                  8,
                  endX - startX + viewConfig.unitWidth / viewConfig.daysPerUnit,
                )
                /**
                 * 颜色优先级：环节库自定义色 → 管线颜色 → 主题色兜底。
                 */
                const slibColor = state.stageLibrary.find(
                  (item) => !item.deprecated && item.stageName === row.stage.stageName,
                )?.color
                const pipelineColor =
                  state.pipelines.find((item) => item.id === row.pipelineId)?.color ??
                  'var(--color-primary)'
                const barColor = slibColor ?? pipelineColor

                return (
                  <div
                    key={`${row.requirementId}-${row.stage.stageId}`}
                    className="timeline-row"
                    style={{
                      position: 'absolute',
                      top: rowIndex * ROW_HEIGHT,
                      left: 0,
                      right: 0,
                      height: ROW_HEIGHT,
                    }}
                  >
                    <div
                      className="timeline-bar"
                      style={{ left: startX, width: barWidth, background: barColor }}
                      onMouseDown={(e) => handleDragStart(e, row, 'move')}
                      onMouseMove={(e) => {
                        // 拖拽中不显示 Tooltip
                        if (dragState) return
                        setTooltip({
                          stageName: row.stage.stageName,
                          startDate: row.stage.startDate,
                          endDate: row.stage.endDate,
                          x: e.clientX + 14,
                          y: e.clientY + 14,
                        })
                      }}
                      onMouseLeave={() => setTooltip(null)}
                    >
                      <span>{row.stage.stageName}</span>
                      <div
                        className="resize-handle left"
                        onMouseDown={(e) => {
                          e.stopPropagation()
                          handleDragStart(e, row, 'resize_start')
                        }}
                      />
                      <div
                        className="resize-handle right"
                        onMouseDown={(e) => {
                          e.stopPropagation()
                          handleDragStart(e, row, 'resize_end')
                        }}
                      />
                    </div>
                  </div>
                )
              })}

              {/* SVG 依赖连线层 */}
              {dependencyLines.length > 0 && (
                <svg
                  className="dependency-svg"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: viewConfig.width,
                    height: canvasHeight,
                    pointerEvents: 'none',
                    overflow: 'visible',
                  }}
                >
                  <defs>
                    <marker
                      id="arrow"
                      markerWidth="8"
                      markerHeight="8"
                      refX="6"
                      refY="3"
                      orient="auto"
                    >
                      <path d="M0,0 L0,6 L8,3 z" fill="#94a3b8" />
                    </marker>
                  </defs>
                  {dependencyLines.map(({ x1, y1, x2, y2, key }) => {
                    /**
                     * 绘制折线路径：从前置结束点向右延伸，再垂直到目标行，再水平到目标起始点。
                     */
                    const midX = x1 + Math.max(12, (x2 - x1) / 2)
                    const path = `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`
                    return (
                      <path
                        key={key}
                        d={path}
                        stroke="#94a3b8"
                        strokeWidth="1.5"
                        strokeDasharray="5 3"
                        fill="none"
                        markerEnd="url(#arrow)"
                      />
                    )
                  })}
                </svg>
              )}

              {/* 今日高亮竖线 */}
              {todayX !== null && (
                <div
                  className="today-line"
                  style={{
                    position: 'absolute',
                    left: todayX,
                    top: 0,
                    width: 2,
                    height: '100%',
                  }}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 拖拽保存确认弹窗 */}
      {pendingDrag && (
        <div className="modal-mask">
          <div className="modal-box">
            <h3 className="modal-title">确认保存排期调整</h3>
            {pendingDrag.conflicts.length > 0 ? (
              <div className="modal-conflicts">
                <p className="modal-conflicts-label">检测到依赖冲突，保存后以下约束将被违反：</p>
                <ul>
                  {pendingDrag.conflicts.map((c, i) => (
                    <li key={i} className="conflict-item">
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="modal-ok-msg">依赖关系校验通过，可以安全保存。</p>
            )}
            <div className="modal-actions">
              <button className="ghost-btn" type="button" onClick={handleCancelDrag}>
                取消（恢复原排期）
              </button>
              <button
                className={pendingDrag.conflicts.length > 0 ? 'danger-btn' : 'primary-btn'}
                type="button"
                onClick={handleConfirmDrag}
              >
                {pendingDrag.conflicts.length > 0 ? '忽略冲突并保存' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 环节条 Hover Tooltip ── */}
      {tooltip && !dragState && (
        <div className="bar-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
          <div className="bar-tooltip-name">{tooltip.stageName}</div>
          <div className="bar-tooltip-date">
            {tooltip.startDate} ~ {tooltip.endDate}
          </div>
        </div>
      )}
    </section>
  )
}

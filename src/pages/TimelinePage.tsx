/**
 * 时间轴页面（首页）。
 *
 * @description
 * - 展示项目需求甘特时间轴
 * - 支持视图切换、筛选、拖拽平移与边缘缩放
 * - 支持周视图导出Excel
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
import { formatMonthDay, formatYearMonth } from '../utils/date'
import { applyScheduleDrag, generateSchedules } from '../utils/schedule'

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
}

/**
 * 获取单位像素宽度。
 *
 * @param {TimelineViewMode} mode 视图模式
 * @returns {number} 单位宽度
 */
function getUnitWidth(mode: TimelineViewMode): number {
  /**
   * 条件目的：按视图粒度返回不同刻度宽度，确保可读性。
   */
  if (mode === 'day') {
    return 24
  }
  if (mode === 'week') {
    return 72
  }
  if (mode === 'month') {
    return 120
  }
  return 160
}

/**
 * 获取单位代表天数。
 *
 * @param {TimelineViewMode} mode 视图模式
 * @returns {number} 单位天数
 */
function getDaysPerUnit(mode: TimelineViewMode): number {
  /**
   * 条件目的：统一“像素->天数”换算，供拖拽重排复用。
   */
  if (mode === 'day') {
    return 1
  }
  if (mode === 'week') {
    return 7
  }
  if (mode === 'month') {
    return 30
  }
  return 365
}

/**
 * 时间轴页面组件。
 *
 * @returns {JSX.Element} 时间轴页面
 */
export function TimelinePage(): JSX.Element {
  const { state } = useAppStateContext()
  const [viewMode, setViewMode] = useState<TimelineViewMode>('week')
  const [year, setYear] = useState(2026)
  const [selectedStageName, setSelectedStageName] = useState('全部环节')
  const [selectedLevel, setSelectedLevel] = useState('全部级别')
  const [selectedPipeline, setSelectedPipeline] = useState('全部管线')
  const [collapsedPipelines, setCollapsedPipelines] = useState<Set<string>>(() => new Set())
  const [collapsedRequirements, setCollapsedRequirements] = useState<Set<string>>(() => new Set())
  const [leftWidth, setLeftWidth] = useState(300)
  const [resizing, setResizing] = useState(false)
  const [overrides, setOverrides] = useState<RequirementSchedule[]>([])
  const [dragState, setDragState] = useState<DragState | null>(null)
  const boardRef = useRef<HTMLDivElement | null>(null)

  const generatedSchedules = useMemo(
    () => generateSchedules(state.requirements, state.paradigms, state.holidays),
    [state.holidays, state.paradigms, state.requirements],
  )

  const scheduleMap = useMemo(() => {
    const map = new Map<string, RequirementSchedule>()

    /**
     * 循环目的：优先写入自动排期，再用拖拽覆盖结果进行替换。
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

    /**
     * 循环目的：从可见需求集合中提取全部环节名，用于筛选下拉选项。
     */
    for (const schedule of scheduleMap.values()) {
      const requirement = requirementMap.get(schedule.requirementId)
      if (!requirement || requirement.deleted) {
        continue
      }

      /**
       * 条件目的：级别与管线筛选影响下拉选项集合，避免出现“选了但无数据”的项。
       */
      if (selectedLevel !== '全部级别' && requirement.levelId !== selectedLevel) {
        continue
      }
      if (selectedPipeline !== '全部管线' && requirement.pipelineId !== selectedPipeline) {
        continue
      }

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
     * 循环目的：将需求按管线分组，并保持插入顺序，便于左侧树状图渲染。
     */
    for (const requirement of state.requirements) {
      if (requirement.deleted) {
        continue
      }
      if (selectedLevel !== '全部级别' && requirement.levelId !== selectedLevel) {
        continue
      }
      if (selectedPipeline !== '全部管线' && requirement.pipelineId !== selectedPipeline) {
        continue
      }
      const list = grouped.get(requirement.pipelineId) ?? []
      list.push(requirement.id)
      grouped.set(requirement.pipelineId, list)
    }

    const list: DisplayRow[] = []

    /**
     * 循环目的：按“管线→需求→环节”构造树状结构，且与画布行逐行对齐。
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

      /**
       * 条件目的：管线折叠时不渲染其下需求与环节行。
       */
      if (pipelineCollapsed) {
        continue
      }

      for (const requirementId of requirementIds) {
        const requirement = requirementMap.get(requirementId)
        const schedule = scheduleMap.get(requirementId)
        if (!requirement || !schedule) {
          continue
        }

        const requirementCollapsed = collapsedRequirements.has(requirementId)
        const stageRows = schedule.stages.filter((stage) => {
          /**
           * 条件目的：按环节名筛选时仅保留目标环节。
           */
          if (selectedStageName !== '全部环节' && stage.stageName !== selectedStageName) {
            return false
          }
          return true
        })

        /**
         * 条件目的：当筛选后无任何环节可展示时隐藏该需求节点。
         */
        if (stageRows.length === 0) {
          continue
        }

        list.push({
          kind: 'requirement',
          requirementId,
          requirementName: requirement.requirementName,
          levelId: requirement.levelId,
          pipelineId: requirement.pipelineId,
          collapsed: requirementCollapsed,
        })

        /**
         * 条件目的：需求折叠时仅展示需求行，隐藏其下环节条。
         */
        if (requirementCollapsed) {
          continue
        }

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

    return {
      start,
      end,
      unitWidth,
      daysPerUnit,
      totalUnits,
      width: totalUnits * unitWidth,
    }
  }, [viewMode, year])

  /**
   * 格式化时间轴Header刻度文案。
   *
   * @param {Date} value 当前刻度日期
   * @returns {string} 文案
   */
  const formatHeaderLabel = (value: Date): string => {
    /**
     * 条件目的：遵循UI设计文档的格式规范，避免Header信息过密。
     */
    if (viewMode === 'month') {
      return formatYearMonth(value)
    }
    return formatMonthDay(value)
  }

  /**
   * 将日期映射为相对横向像素。
   *
   * @param {string} date 日期字符串
   * @returns {number} x坐标
   */
  const mapDateToX = (date: string): number => {
    const startTime = viewConfig.start.getTime()
    const targetTime = new Date(date).getTime()
    const dayDiff = Math.floor((targetTime - startTime) / (1000 * 60 * 60 * 24))
    const unitIndex = dayDiff / viewConfig.daysPerUnit
    return unitIndex * viewConfig.unitWidth
  }

  /**
   * 导出周视图Excel。
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
   * @returns {void}
   */
  const handleResizeStart = (event: ReactMouseEvent<HTMLDivElement>): void => {
    event.preventDefault()
    setResizing(true)
  }

  /**
   * 开始拖拽。
   *
   * @param {ReactMouseEvent<HTMLDivElement>} event 鼠标事件
   * @param {FlatStageRow} row 当前行数据
   * @param {ScheduleBarDragPayload['action']} action 拖拽动作
   * @returns {void}
   */
  const handleDragStart = (
    event: ReactMouseEvent<HTMLDivElement>,
    row: Extract<DisplayRow, { kind: 'stage' }>,
    action: ScheduleBarDragPayload['action'],
  ): void => {
    event.preventDefault()
    setDragState({
      requirementId: row.requirementId,
      stageId: row.stage.stageId,
      action,
      startX: event.clientX,
    })
  }

  /**
   * 处理拖拽移动。
   *
   * @param {MouseEvent} event 原生鼠标移动事件
   * @returns {void}
   */
  const handleMouseMove = useCallback(
    (event: MouseEvent): void => {
      /**
       * 条件目的：拖拽调节左侧宽度优先处理，避免与甘特条拖拽互相干扰。
       */
      if (resizing) {
        const container = boardRef.current
        if (!container) {
          return
        }
        const rect = container.getBoundingClientRect()
        const nextWidth = Math.max(60, Math.min(520, Math.round(event.clientX - rect.left)))
        setLeftWidth(nextWidth)
        return
      }

      /**
       * 条件目的：无拖拽状态时不做任何计算，避免频繁重渲染。
       */
      if (!dragState) {
        return
      }
      const pixelDelta = event.clientX - dragState.startX
      const days = Math.round((pixelDelta / viewConfig.unitWidth) * viewConfig.daysPerUnit)

      /**
       * 条件目的：位移不到1个单位时不触发排期更新，减少抖动。
       */
      if (days === 0) {
        return
      }

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
   * 结束拖拽。
   *
   * @returns {void}
   */
  const handleMouseUp = useCallback((): void => {
    setResizing(false)
    setDragState(null)
  }, [])

  useEffect(() => {
    /**
     * 条件目的：在浏览器环境绑定全局事件，确保拖拽跨容器可用。
     */
    if (typeof window === 'undefined') {
      return undefined
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [handleMouseMove, handleMouseUp])

  return (
    <section className="timeline-page">
      <div className="card toolbar">
        <div className="row-gap">
          <select
            value={viewMode}
            onChange={(event) => setViewMode(event.target.value as TimelineViewMode)}
          >
            <option value="day">日视图</option>
            <option value="week">周视图</option>
            <option value="month">月视图</option>
            <option value="year">年视图</option>
          </select>
          <button className="ghost-btn" type="button" onClick={() => setYear((value) => value - 1)}>
            上一年
          </button>
          <span className="year-tag">{year}</span>
          <button className="ghost-btn" type="button" onClick={() => setYear((value) => value + 1)}>
            下一年
          </button>
        </div>
        <div className="row-gap">
          <select
            value={selectedStageName}
            onChange={(event) => setSelectedStageName(event.target.value)}
          >
            <option value="全部环节">全部环节</option>
            {stageNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <select value={selectedLevel} onChange={(event) => setSelectedLevel(event.target.value)}>
            <option value="全部级别">全部级别</option>
            {state.levels.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
          <select
            value={selectedPipeline}
            onChange={(event) => setSelectedPipeline(event.target.value)}
          >
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

      <div className="timeline-board card" ref={boardRef}>
        <div className="timeline-left" style={{ width: leftWidth }}>
          <div className="timeline-left-header">项目/需求</div>
          {rows.map((row) => {
            if (row.kind === 'pipeline') {
              return (
                <div key={`pipe-${row.pipelineId}`} className="timeline-left-row pipeline-row">
                  <button
                    className="tree-toggle"
                    type="button"
                    onClick={() =>
                      setCollapsedPipelines((prev) => {
                        const next = new Set(prev)
                        if (next.has(row.pipelineId)) {
                          next.delete(row.pipelineId)
                        } else {
                          next.add(row.pipelineId)
                        }
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
                <div key={`req-${row.requirementId}`} className="timeline-left-row requirement-row">
                  <button
                    className="tree-toggle"
                    type="button"
                    onClick={() =>
                      setCollapsedRequirements((prev) => {
                        const next = new Set(prev)
                        if (next.has(row.requirementId)) {
                          next.delete(row.requirementId)
                        } else {
                          next.add(row.requirementId)
                        }
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
              >
                <span className="tree-indent" />
                <span className="tree-indent" />
                <span className="stage-label">{row.stage.stageName}</span>
              </div>
            )
          })}
        </div>
        <div className="timeline-resizer" onMouseDown={handleResizeStart} role="separator" />
        <div className="timeline-right">
          <div
            className="timeline-canvas-header"
            style={{
              width: viewConfig.width,
              ['--grid-unit' as never]: `${viewConfig.unitWidth}px`,
            }}
          >
            {Array.from({ length: viewConfig.totalUnits }).map((_, index) => {
              const labelDate = new Date(viewConfig.start)
              labelDate.setDate(labelDate.getDate() + index * viewConfig.daysPerUnit)
              return (
                <div
                  key={`${index}-${viewMode}`}
                  className="timeline-header-cell"
                  style={{ width: viewConfig.unitWidth }}
                >
                  {formatHeaderLabel(labelDate)}
                </div>
              )
            })}
          </div>
          <div
            className="timeline-canvas-body"
            style={{
              width: viewConfig.width,
              ['--grid-unit' as never]: `${viewConfig.unitWidth}px`,
            }}
          >
            {rows.map((row) => {
              if (row.kind === 'pipeline') {
                return (
                  <div key={`pipe-row-${row.pipelineId}`} className="timeline-row pipeline-sep" />
                )
              }

              if (row.kind === 'requirement') {
                return (
                  <div
                    key={`req-row-${row.requirementId}`}
                    className="timeline-row requirement-sep"
                  />
                )
              }

              const startX = mapDateToX(row.stage.startDate)
              const endX = mapDateToX(row.stage.endDate)
              const width = Math.max(
                8,
                endX - startX + viewConfig.unitWidth / viewConfig.daysPerUnit,
              )
              const pipelineColor =
                state.pipelines.find((item) => item.id === row.pipelineId)?.color ??
                'var(--color-primary)'

              return (
                <div key={`${row.requirementId}-${row.stage.stageId}`} className="timeline-row">
                  <div
                    className="timeline-bar"
                    style={{
                      left: startX,
                      width,
                      background: pipelineColor,
                    }}
                    onMouseDown={(event) => handleDragStart(event, row, 'move')}
                  >
                    <span>{row.stage.stageName}</span>
                    <div
                      className="resize-handle left"
                      onMouseDown={(event) => handleDragStart(event, row, 'resize_start')}
                    />
                    <div
                      className="resize-handle right"
                      onMouseDown={(event) => handleDragStart(event, row, 'resize_end')}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}

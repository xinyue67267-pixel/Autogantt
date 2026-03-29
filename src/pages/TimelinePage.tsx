/**
 * 时间轴页面（首页）。
 *
 * @description
 * - 展示项目需求甘特时间轴
 * - 支持视图切换、筛选、拖拽平移与边缘缩放
 * - 支持甘特矩阵格式导出Excel（带颜色填充，受筛选影响）
 * - 支持从Excel导入甘特排期（固定列格式 / 矩阵格式）
 * - 日视图周末格标灰，Header与Body网格线严格对齐
 * - 依赖连线渲染（SVG虚线+箭头）
 * - 拖拽结束后进行依赖校验，确认后保存
 */
import {
  ChangeEvent,
  MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import * as XLSX from 'xlsx'
import { useAppStateContext } from '../context/AppStateContext'
import { useToast } from '../context/ToastContext'
import type {
  MilestoneLevel,
  RequirementSchedule,
  ScheduleBarDragPayload,
  StageInstance,
  TimelineViewMode,
} from '../types'
import { formatMonthDay, formatYear, formatYearMonth, isWorkingDay, toISODate } from '../utils/date'
import {
  applyScheduleDrag,
  cascadeReschedule,
  cascadeShift,
  generateSchedules,
} from '../utils/schedule'
import { buildGanttXlsxBlob, buildXlsxBlob } from '../utils/xlsxBuilder'
import type { GanttCell } from '../utils/xlsxBuilder'
import { createId } from '../utils/id'

/** 每行高度（px），与 CSS .timeline-row min-height 保持一致 */
const ROW_HEIGHT = 42

/**
 * 环节库预设颜色板——与设置页保持一致，供自动追加环节库条目时循环取色。
 * 共 16 色，覆盖主题色系。
 */
const SLIB_PRESET_COLORS: string[] = [
  '#C4B5FD',
  '#A78BFA',
  '#7C3AED',
  '#F9A8D4',
  '#F472B6',
  '#6EE7B7',
  '#34D399',
  '#FCD34D',
  '#FBBF24',
  '#FDA4AF',
  '#F87171',
  '#93C5FD',
  '#94A3B8',
  '#64748B',
  '#6B7280',
  '#9CA3AF',
]

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
  /** 被拖拽的需求 ID */
  requirementId: string
  /** 被拖拽的环节 ID */
  stageId: string
  /** 被拖拽的环节名称 */
  stageName: string
  /** 拖拽后新开始日期 */
  newStart: string
  /** 拖拽后新结束日期 */
  newEnd: string
  /** 拖拽前原始开始日期（用于计算 delta） */
  originalStart: string
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
  const {
    state,
    upsertPipeline,
    importRequirements,
    importStageLibraryItems,
    importScheduleOverrides,
  } = useAppStateContext()
  const toast = useToast()
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
    /** true 时为拖拽实时 Tooltip（单行文本放在 stageName），false 时为 hover Tooltip（双行） */
    isDrag: boolean
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
     * 循环目的：优先写入自动排期，再用持久化的手动覆盖替换，最后用本次会话拖拽覆盖结果替换。
     */
    for (const schedule of generatedSchedules) {
      map.set(schedule.requirementId, schedule)
    }
    for (const override of state.scheduleOverrides ?? []) {
      map.set(override.requirementId, override)
    }
    for (const override of overrides) {
      map.set(override.requirementId, override)
    }
    return map
  }, [generatedSchedules, state.scheduleOverrides, overrides])

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
   * 下载固定列格式导入模板（8列：管线/需求/环节/开始日期/结束日期/级别/里程碑/日期区间）。
   *
   * @returns {void}
   */
  const handleDownloadTemplate = (): void => {
    const headers = [
      '管线名称',
      '需求名称',
      '环节名称',
      '开始日期',
      '结束日期',
      '需求级别',
      '里程碑',
      '日期区间',
    ]
    const exampleRow = [
      '主线',
      '首页改版',
      '开发实现',
      '2026-05-01',
      '2026-05-15',
      'P1',
      '',
      '（或填写：2026-05-01 - 2026-05-15）',
    ]
    const blob = buildXlsxBlob([headers, exampleRow], [])
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'AutoGantt-导入模板.xlsx'
    a.click()
    URL.revokeObjectURL(url)
  }

  /**
   * 导出甘特矩阵 Excel（当前视图，受筛选影响）。
   *
   * 第一行为时间刻度列头，第一列为管线/需求/环节层级，
   * 环节块以单元格背景色填充。
   *
   * @returns {void}
   */
  const handleExport = (): void => {
    /**
     * 循环目的：构建甘特矩阵表格，第一列为层级名称，后续列对应时间刻度。
     * 环节所在列以对应背景色填充。
     */
    const totalCols = headerColumns.length
    // 表头行：第一列"项目/需求"，后续为时间刻度，样式 header
    const headerRow: GanttCell[] = [
      { text: '项目/需求', bgColor: null, styleKey: 'header' },
      ...headerColumns.map((col) => ({
        text: formatHeaderLabel(col.date),
        bgColor: null,
        styleKey: 'header' as const,
      })),
    ]
    const dataRows: GanttCell[][] = []

    for (const row of rows) {
      if (row.kind === 'pipeline') {
        const cells: GanttCell[] = [
          { text: row.pipelineName, bgColor: null, styleKey: 'pipeline' },
          ...Array.from({ length: totalCols }, () => ({
            text: '',
            bgColor: null,
            styleKey: 'pipeline' as const,
          })),
        ]
        dataRows.push(cells)
      } else if (row.kind === 'requirement') {
        const cells: GanttCell[] = [
          { text: `  ${row.requirementName}`, bgColor: null, styleKey: 'requirement' },
          ...Array.from({ length: totalCols }, () => ({
            text: '',
            bgColor: null,
            styleKey: 'requirement' as const,
          })),
        ]
        dataRows.push(cells)
      } else {
        // stage 行：计算环节覆盖的列范围并填色
        const slibColor = state.stageLibrary.find(
          (item) => !item.deprecated && item.stageName === row.stage.stageName,
        )?.color
        const pipelineColor =
          state.pipelines.find((p) => p.id === row.pipelineId)?.color ?? '#C4B5FD'
        const barColor = slibColor ?? pipelineColor

        const stageStart = new Date(row.stage.startDate).getTime()
        const stageEnd = new Date(row.stage.endDate).getTime()

        const cells: GanttCell[] = [
          { text: `    ${row.stage.stageName}`, bgColor: null, styleKey: 'stage' },
        ]
        for (let i = 0; i < totalCols; i++) {
          const colDate = headerColumns[i].date
          const colStart = colDate.getTime()
          // 该列时间段的结束时间（含当列最后一天）
          const colEnd = new Date(colDate)
          colEnd.setDate(colEnd.getDate() + viewConfig.daysPerUnit - 1)
          const colEndTime = colEnd.getTime()
          // 环节与该列时间段有重叠则填色
          const overlap = stageStart <= colEndTime && stageEnd >= colStart
          cells.push({ text: '', bgColor: overlap ? barColor : null, styleKey: 'stage' })
        }
        dataRows.push(cells)
      }
    }

    const allRows = [headerRow, ...dataRows]
    const blob = buildGanttXlsxBlob(allRows, `${year}年时间轴`)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `AutoGantt-${year}-${viewMode}-view.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  }

  /** 导入结果面板状态 */
  const [importResult, setImportResult] = useState<{
    successCount: number
    errorRows: { rowIndex: number; reason: string }[]
    newPipelineCount: number
    newStageLibCount: number
  } | null>(null)

  /**
   * 判断字符串是否为合法 YYYY-MM-DD 日期。
   *
   * @param {string} s 待检验字符串
   * @returns {boolean} 是否合法
   */
  const isValidDate = (s: string): boolean => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
    return !isNaN(new Date(s).getTime())
  }

  /**
   * 处理 Excel 导入（固定列格式 + 矩阵格式自动识别）。
   *
   * @param {ChangeEvent<HTMLInputElement>} e 文件选择事件
   * @returns {void}
   */
  const handleImport = (e: ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    // 重置 input，允许同一文件再次上传
    e.target.value = ''
    if (!file) return

    const reader = new FileReader()
    reader.onload = (ev) => {
      const data = new Uint8Array(ev.target?.result as ArrayBuffer)
      const workbook = XLSX.read(data, { type: 'array', cellStyles: true })
      const sheetName = workbook.SheetNames[0]
      const sheet = workbook.Sheets[sheetName]

      // 将 sheet 转为 aoa（array of arrays），含 header
      const aoa: string[][] = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: '',
      }) as string[][]
      if (aoa.length < 2) {
        setImportResult({
          successCount: 0,
          errorRows: [{ rowIndex: 1, reason: '文件内容为空' }],
          newPipelineCount: 0,
          newStageLibCount: 0,
        })
        return
      }

      const firstRow = aoa[0]

      /**
       * 格式检测：第一行第二列开始是否均为时间刻度格式（MM-DD / YYYY-MM / YYYY）。
       * 若匹配则走矩阵格式解析，否则走固定列格式解析。
       */
      const TIME_PATTERNS = [
        /^\d{2}-\d{2}$/, // MM-DD（日/周视图）
        /^\d{4}-\d{2}$/, // YYYY-MM（月视图）
        /^\d{4}$/, // YYYY（年视图）
      ]
      const isMatrix =
        String(firstRow[0]).trim() === '项目/需求' &&
        firstRow.slice(1).some((h) => TIME_PATTERNS.some((p) => p.test(String(h).trim())))

      if (isMatrix) {
        parseMatrixFormat(aoa, sheet, workbook)
      } else {
        parseFixedColumnFormat(aoa)
      }
    }
    reader.readAsArrayBuffer(file)
  }

  /**
   * 固定列格式解析（A=管线/B=需求/C=环节/D=开始/E=结束/F=级别/G=里程碑/H=日期区间）。
   *
   * 日期优先级：D/E 列均有值时使用 D/E；两者均为空时解析 H 列（格式 YYYY-MM-DD - YYYY-MM-DD）。
   *
   * @param {string[][]} aoa sheet 数据（包含表头行）
   * @returns {void}
   */
  const parseFixedColumnFormat = (aoa: string[][]): void => {
    const dataRows = aoa.slice(1)
    const existingPipelineNames = new Set(state.pipelines.map((p) => p.name))
    const existingStageNames = new Set(state.stageLibrary.map((s) => s.stageName))

    // 收集需要新建的管线和环节库条目
    const newPipelines: Map<string, string> = new Map() // name -> id
    const newStageLibNames: Set<string> = new Set()

    // 按需求名称分组
    const reqGroups: Map<
      string,
      {
        pipelineName: string
        levelId: string
        stages: {
          stageName: string
          startDate: string
          endDate: string
          isMilestone: MilestoneLevel | ''
        }[]
        rowIndex: number
      }
    > = new Map()

    const errorRows: { rowIndex: number; reason: string }[] = []

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i]
      const rowIndex = i + 2 // 1-based + 表头行
      const pipelineName = String(row[0] ?? '').trim()
      const reqName = String(row[1] ?? '').trim()
      const stageName = String(row[2] ?? '').trim()
      const rawStart = String(row[3] ?? '').trim()
      const rawEnd = String(row[4] ?? '').trim()
      const levelId = String(row[5] ?? '').trim() || 'P2'
      const milestoneRaw = String(row[6] ?? '').trim()
      const rawDateRange = String(row[7] ?? '').trim()
      const isMilestone = (
        ['L0', 'L0.5', 'L1', 'L2'].includes(milestoneRaw) ? milestoneRaw : ''
      ) as MilestoneLevel | ''

      if (!pipelineName) {
        errorRows.push({ rowIndex, reason: 'A列管线名称为空，已跳过' })
        continue
      }
      if (!reqName) {
        errorRows.push({ rowIndex, reason: 'B列需求名称为空，已跳过' })
        continue
      }
      if (!stageName) {
        errorRows.push({ rowIndex, reason: `C列环节名称为空` })
        reqGroups.delete(reqName)
        continue
      }

      /** 解析起止日期：D/E 优先，均空时解析 H 列日期区间 */
      let startDate: string
      let endDate: string

      if (rawStart || rawEnd) {
        // D/E 列至少有一个有值，走 D/E 校验
        if (!isValidDate(rawStart)) {
          errorRows.push({ rowIndex, reason: `D列开始日期格式非法，应为 YYYY-MM-DD` })
          reqGroups.delete(reqName)
          continue
        }
        if (!isValidDate(rawEnd)) {
          errorRows.push({ rowIndex, reason: `E列结束日期格式非法，应为 YYYY-MM-DD` })
          reqGroups.delete(reqName)
          continue
        }
        startDate = rawStart
        endDate = rawEnd
      } else if (rawDateRange) {
        // D/E 均为空，解析 H 列日期区间（格式：YYYY-MM-DD - YYYY-MM-DD）
        const rangeMatch = rawDateRange.match(/^(\d{4}-\d{2}-\d{2})\s*-\s*(\d{4}-\d{2}-\d{2})$/)
        if (!rangeMatch) {
          errorRows.push({
            rowIndex,
            reason: `H列日期区间格式非法，应为 YYYY-MM-DD - YYYY-MM-DD`,
          })
          reqGroups.delete(reqName)
          continue
        }
        const [, rangeStart, rangeEnd] = rangeMatch
        if (!isValidDate(rangeStart) || !isValidDate(rangeEnd)) {
          errorRows.push({
            rowIndex,
            reason: `H列日期区间包含非法日期，应为 YYYY-MM-DD - YYYY-MM-DD`,
          })
          reqGroups.delete(reqName)
          continue
        }
        startDate = rangeStart
        endDate = rangeEnd
      } else {
        // D/E/H 均为空
        errorRows.push({
          rowIndex,
          reason: `开始/结束日期（D/E列）或日期区间（H列）至少填写一项`,
        })
        reqGroups.delete(reqName)
        continue
      }

      if (new Date(startDate) > new Date(endDate)) {
        errorRows.push({ rowIndex, reason: `开始日期晚于结束日期` })
        reqGroups.delete(reqName)
        continue
      }

      // 收集新管线
      if (!existingPipelineNames.has(pipelineName) && !newPipelines.has(pipelineName)) {
        newPipelines.set(pipelineName, createId('pipe'))
      }
      // 收集新环节库条目
      if (!existingStageNames.has(stageName)) {
        newStageLibNames.add(stageName)
      }

      if (!reqGroups.has(reqName)) {
        reqGroups.set(reqName, { pipelineName, levelId, stages: [], rowIndex })
      }
      reqGroups.get(reqName)!.stages.push({ stageName, startDate, endDate, isMilestone })
    }

    // 创建新管线
    for (const [name, id] of newPipelines.entries()) {
      const COLORS = ['#C4B5FD', '#F9A8D4', '#6EE7B7', '#FCD34D', '#FDA4AF', '#94A3B8']
      const color = COLORS[(state.pipelines.length + newPipelines.size) % COLORS.length]
      upsertPipeline({ id, name, color })
    }
    // 创建新环节库条目
    if (newStageLibNames.size > 0) {
      importStageLibraryItems(
        Array.from(newStageLibNames).map((stageName, idx) => ({
          id: createId('slib'),
          stageName,
          stageCategory: '',
          /**
           * 自动预设颜色：按当前环节库总数加本批次序号循环取色，
           * 确保批量追加后各环节颜色各异。
           */
          color: SLIB_PRESET_COLORS[(state.stageLibrary.length + idx) % SLIB_PRESET_COLORS.length],
          deprecated: false,
        })),
      )
    }

    // 获取完整管线列表（含新建的）
    const allPipelines = [
      ...state.pipelines,
      ...Array.from(newPipelines.entries()).map(([name, id]) => ({ id, name, color: '' })),
    ]
    const getPipelineId = (name: string) =>
      allPipelines.find((p) => p.name === name)?.id ?? createId('pipe')

    // 创建需求和排期覆盖
    const newRequirements = []
    const newScheduleOverrides: RequirementSchedule[] = []

    for (const [reqName, group] of reqGroups.entries()) {
      const reqId = createId('req')
      const pipelineId = getPipelineId(group.pipelineName)
      newRequirements.push({
        id: reqId,
        requirementName: reqName,
        levelId: group.levelId,
        quantity: 1,
        expectedLaunchDate: group.stages[group.stages.length - 1]?.endDate ?? '',
        pipelineId,
        templateId: '',
        scheduleMode: 'forward_from_start' as const,
        projectStartDate: group.stages[0]?.startDate ?? '',
        deleted: false,
      })
      newScheduleOverrides.push({
        requirementId: reqId,
        stages: group.stages.map((s) => ({
          stageId: createId('stage'),
          stageName: s.stageName,
          stageCategory: '',
          isMilestone: s.isMilestone,
          startDate: s.startDate,
          endDate: s.endDate,
        })),
      })
    }

    if (newRequirements.length > 0) {
      importRequirements(newRequirements)
      importScheduleOverrides(newScheduleOverrides)
    }

    setImportResult({
      successCount: reqGroups.size,
      errorRows,
      newPipelineCount: newPipelines.size,
      newStageLibCount: newStageLibNames.size,
    })
  }

  /**
   * 甘特矩阵格式解析（本网站导出文件，第一行为时间刻度列头）。
   *
   * @param {string[][]} aoa sheet 数据
   * @param {XLSX.WorkSheet} sheet 工作表对象（用于读取单元格背景色）
   * @param {XLSX.WorkBook} workbook 工作簿对象
   * @returns {void}
   */
  const parseMatrixFormat = (
    aoa: string[][],
    sheet: XLSX.WorkSheet,
    workbook: XLSX.WorkBook,
  ): void => {
    void workbook // 暂不使用，保留接口一致性
    const headerRow = aoa[0]
    const dataRows = aoa.slice(1)

    /**
     * 解析列头为各列时间段的起止日期。
     * 自动补全当前年份（对 MM-DD 和 YYYY-MM 列头）。
     */
    const colRanges: { start: Date; end: Date }[] = headerRow.slice(1).map((h) => {
      const label = String(h).trim()
      // YYYY（年视图）
      if (/^\d{4}$/.test(label)) {
        const y = parseInt(label)
        return { start: new Date(`${y}-01-01`), end: new Date(`${y}-12-31`) }
      }
      // YYYY-MM（月视图）
      if (/^\d{4}-\d{2}$/.test(label)) {
        const [y, m] = label.split('-').map(Number)
        const start = new Date(y, m - 1, 1)
        const end = new Date(y, m, 0) // 该月最后一天
        return { start, end }
      }
      // MM-DD（日或周视图）：补全当前年份
      if (/^\d{2}-\d{2}$/.test(label)) {
        const colYear = year
        const start = new Date(`${colYear}-${label}`)
        // 根据视图粒度判断是日（+0天）还是周（+6天）
        // 尝试检测：若两列间隔 >= 6天 视为周视图，否则日视图
        const end = new Date(start)
        end.setDate(end.getDate() + (viewConfig.daysPerUnit > 1 ? viewConfig.daysPerUnit - 1 : 0))
        return { start, end }
      }
      return { start: new Date(NaN), end: new Date(NaN) }
    })

    const existingPipelineNames = new Set(state.pipelines.map((p) => p.name))
    const existingStageNames = new Set(state.stageLibrary.map((s) => s.stageName))
    const newPipelines: Map<string, string> = new Map()
    const newStageLibNames: Set<string> = new Set()

    // 当前上下文（管线/需求）
    let currentPipelineName = ''
    let currentReqName = ''
    const currentLevelId = 'P2'

    interface ReqGroup {
      pipelineName: string
      levelId: string
      stages: {
        stageName: string
        startDate: string
        endDate: string
        isMilestone: MilestoneLevel | ''
      }[]
    }
    const reqGroups: Map<string, ReqGroup> = new Map()
    const errorRows: { rowIndex: number; reason: string }[] = []

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i]
      const rowIndex = i + 2
      const firstCell = String(row[0] ?? '').trimEnd()
      const trimmed = firstCell.trim()
      if (!trimmed) continue

      // 判断层级：无缩进=管线，一级缩进=需求，二级缩进=环节
      const indentMatch = firstCell.match(/^(\s+)/)
      const indentLen = indentMatch ? indentMatch[1].length : 0

      // 检查该行是否有任何颜色填充（用于辅助判断是否为环节行）
      const colLetterFn = (idx: number): string => {
        let result = ''
        let n = idx + 1
        while (n > 0) {
          result = String.fromCharCode(64 + (n % 26 || 26)) + result
          n = Math.floor((n - 1) / 26)
        }
        return result
      }
      const hasColor = row.slice(1).some((_, ci) => {
        const cellAddr = `${colLetterFn(ci + 1)}${rowIndex}`
        const cell = sheet[cellAddr]
        return cell?.s?.fgColor?.rgb || cell?.s?.bgColor?.rgb || cell?.s?.patternType === 'solid'
      })

      if (indentLen === 0 && !hasColor) {
        // 管线行
        currentPipelineName = trimmed
        currentReqName = ''
        if (!existingPipelineNames.has(trimmed) && !newPipelines.has(trimmed)) {
          newPipelines.set(trimmed, createId('pipe'))
        }
      } else if (indentLen > 0 && indentLen <= 3 && !hasColor) {
        // 需求行
        currentReqName = trimmed
        if (!reqGroups.has(trimmed)) {
          reqGroups.set(trimmed, {
            pipelineName: currentPipelineName,
            levelId: currentLevelId,
            stages: [],
          })
        }
      } else {
        // 环节行：找有颜色的列范围
        const stageName = trimmed
        if (!stageName) {
          errorRows.push({ rowIndex, reason: '环节名称为空，已跳过' })
          continue
        }
        if (!currentReqName) {
          errorRows.push({ rowIndex, reason: `环节"${stageName}"缺少所属需求行，已跳过` })
          continue
        }

        if (!existingStageNames.has(stageName)) newStageLibNames.add(stageName)

        // 找首个和最后一个有颜色的列
        let firstColoredCol = -1
        let lastColoredCol = -1
        for (let ci = 0; ci < colRanges.length; ci++) {
          const cellAddr = `${colLetterFn(ci + 1)}${rowIndex}`
          const cell = sheet[cellAddr]
          const hasColorHere =
            cell?.s?.fgColor?.rgb || cell?.s?.bgColor?.rgb || cell?.s?.patternType === 'solid'
          if (hasColorHere) {
            if (firstColoredCol === -1) firstColoredCol = ci
            lastColoredCol = ci
          }
        }

        if (firstColoredCol === -1) {
          errorRows.push({ rowIndex, reason: `环节"${stageName}"无颜色填充，已跳过` })
          continue
        }

        const startDate = toISODate(colRanges[firstColoredCol].start)
        const endDate = toISODate(colRanges[lastColoredCol].end)

        if (!isValidDate(startDate) || !isValidDate(endDate)) {
          errorRows.push({ rowIndex, reason: `环节"${stageName}"列头日期无法解析` })
          continue
        }

        reqGroups.get(currentReqName)!.stages.push({
          stageName,
          startDate,
          endDate,
          isMilestone: '',
        })
      }
    }

    // 创建新管线
    for (const [name, id] of newPipelines.entries()) {
      const COLORS = ['#C4B5FD', '#F9A8D4', '#6EE7B7', '#FCD34D', '#FDA4AF', '#94A3B8']
      const color = COLORS[state.pipelines.length % COLORS.length]
      upsertPipeline({ id, name, color })
    }
    if (newStageLibNames.size > 0) {
      importStageLibraryItems(
        Array.from(newStageLibNames).map((stageName, idx) => ({
          id: createId('slib'),
          stageName,
          stageCategory: '',
          /**
           * 自动预设颜色：按当前环节库总数加本批次序号循环取色，
           * 确保批量追加后各环节颜色各异。
           */
          color: SLIB_PRESET_COLORS[(state.stageLibrary.length + idx) % SLIB_PRESET_COLORS.length],
          deprecated: false,
        })),
      )
    }

    const allPipelines = [
      ...state.pipelines,
      ...Array.from(newPipelines.entries()).map(([name, id]) => ({ id, name, color: '' })),
    ]
    const getPipelineId = (name: string) =>
      allPipelines.find((p) => p.name === name)?.id ?? createId('pipe')

    const newRequirements = []
    const newScheduleOverrides: RequirementSchedule[] = []

    for (const [reqName, group] of reqGroups.entries()) {
      if (group.stages.length === 0) continue
      const reqId = createId('req')
      const pipelineId = getPipelineId(group.pipelineName)
      newRequirements.push({
        id: reqId,
        requirementName: reqName,
        levelId: group.levelId,
        quantity: 1,
        expectedLaunchDate: group.stages[group.stages.length - 1].endDate,
        pipelineId,
        templateId: '',
        scheduleMode: 'forward_from_start' as const,
        projectStartDate: group.stages[0].startDate,
        deleted: false,
      })
      newScheduleOverrides.push({
        requirementId: reqId,
        stages: group.stages.map((s) => ({
          stageId: createId('stage'),
          stageName: s.stageName,
          stageCategory: '',
          isMilestone: s.isMilestone,
          startDate: s.startDate,
          endDate: s.endDate,
        })),
      })
    }

    if (newRequirements.length > 0) {
      importRequirements(newRequirements)
      importScheduleOverrides(newScheduleOverrides)
    }

    setImportResult({
      successCount: newRequirements.length,
      errorRows,
      newPipelineCount: newPipelines.size,
      newStageLibCount: newStageLibNames.size,
    })
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

      const base = overrides.length > 0 ? overrides : Array.from(scheduleMap.values())
      const newOverrides = applyScheduleDrag(
        base,
        {
          requirementId: dragState.requirementId,
          stageId: dragState.stageId,
          action: dragState.action,
          deltaDays: days,
        },
        state.holidays,
      )
      setOverrides(newOverrides)
      setDragState((prev) => (prev ? { ...prev, startX: event.clientX } : prev))

      // 同步更新拖拽实时 Tooltip：从新排期中找到被拖拽环节的最新日期
      const draggedSchedule = newOverrides.find((s) => s.requirementId === dragState.requirementId)
      const draggedStage = draggedSchedule?.stages.find((s) => s.stageId === dragState.stageId)
      if (draggedStage) {
        let tooltipText = ''
        if (dragState.action === 'move') {
          tooltipText = `${draggedStage.startDate} ~ ${draggedStage.endDate}`
        } else if (dragState.action === 'resize_start') {
          tooltipText = `开始：${draggedStage.startDate}`
        } else if (dragState.action === 'resize_end') {
          tooltipText = `结束：${draggedStage.endDate}`
        }
        setTooltip({
          stageName: tooltipText,
          startDate: '',
          endDate: '',
          isDrag: true,
          x: event.clientX + 14,
          y: event.clientY + 14,
        })
      }
    },
    [
      dragState,
      overrides,
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
    // 松手时清除拖拽实时 Tooltip
    setTooltip(null)

    if (!dragState) return

    /**
     * 条件目的：若拖拽中无覆盖产生（实际未移动），直接清除状态。
     */
    if (overrides.length === 0) {
      setDragState(null)
      return
    }

    const conflicts = checkDependencyConflicts(overrides, state)

    const draggedSchedule = overrides.find((s) => s.requirementId === dragState.requirementId)
    const draggedStage = draggedSchedule?.stages.find((s) => s.stageId === dragState.stageId)

    const originalSchedule = scheduleMap.get(dragState.requirementId)
    const originalStage = originalSchedule?.stages.find((s) => s.stageId === dragState.stageId)

    setPendingDrag({
      schedules: overrides,
      conflicts,
      requirementId: dragState.requirementId,
      stageId: dragState.stageId,
      stageName: draggedStage?.stageName ?? '',
      newStart: draggedStage?.startDate ?? '',
      newEnd: draggedStage?.endDate ?? '',
      originalStart: originalStage?.startDate ?? draggedStage?.startDate ?? '',
    })
    setDragState(null)
  }, [dragState, overrides, scheduleMap, state])

  /**
   * 用户确认保存拖拽结果。
   *
   * @returns {void}
   */
  const handleConfirmDrag = (): void => {
    if (!pendingDrag) return
    /** 持久化当前 overrides 中被拖拽需求的排期，再清空临时 overrides */
    const target = pendingDrag.schedules.find((s) => s.requirementId === pendingDrag.requirementId)
    if (target) {
      importScheduleOverrides([target])
    }
    setOverrides([])
    setPendingDrag(null)
  }

  /**
   * 用户选择"保存并联动调整"——按模板依赖关系重算同需求内所有关联环节。
   *
   * @returns {void}
   */
  const handleCascadeSave = (): void => {
    if (!pendingDrag) return

    const req = state.requirements.find((r) => r.id === pendingDrag.requirementId)
    const template = state.paradigms.find((p) => p.id === req?.templateId)

    /**
     * 条件目的：范式或需求缺失时降级为仅保存当前环节，不中断用户流程。
     */
    if (!req || !template) {
      setPendingDrag(null)
      return
    }

    const currentSchedule = pendingDrag.schedules.find(
      (s) => s.requirementId === pendingDrag.requirementId,
    )
    if (!currentSchedule) {
      setPendingDrag(null)
      return
    }

    const cascadedStages = cascadeReschedule(
      currentSchedule.stages,
      pendingDrag.stageId,
      pendingDrag.newStart,
      pendingDrag.newEnd,
      template,
      state.holidays,
    )

    /**
     * 条件目的：检测重算后是否存在超出 DDL 的环节，若有则提示风险。
     */
    if (req.projectDDL) {
      const overDDL = cascadedStages.some((s) => s.endDate > req.projectDDL!)
      if (overDDL) {
        toast.warning('联动调整后部分环节超出需求 DDL，请注意风险')
      }
    }

    const nextOverrides = pendingDrag.schedules.map((s) =>
      s.requirementId === pendingDrag.requirementId ? { ...s, stages: cascadedStages } : s,
    )
    importScheduleOverrides(nextOverrides)
    setOverrides([])
    setPendingDrag(null)
  }

  /**
   * 用户选择「联动调整（整体平移）」——将有依赖关系的后置环节整体平移相同工作日 delta。
   *
   * @returns {void}
   */
  const handleShiftSave = (): void => {
    if (!pendingDrag) return

    const req = state.requirements.find((r) => r.id === pendingDrag.requirementId)
    const template = state.paradigms.find((p) => p.id === req?.templateId)

    if (!req || !template) {
      setPendingDrag(null)
      return
    }

    const currentSchedule = pendingDrag.schedules.find(
      (s) => s.requirementId === pendingDrag.requirementId,
    )
    if (!currentSchedule) {
      setPendingDrag(null)
      return
    }

    const shiftedStages = cascadeShift(
      currentSchedule.stages,
      pendingDrag.stageId,
      pendingDrag.originalStart,
      pendingDrag.newStart,
      pendingDrag.newEnd,
      template,
      state.holidays,
    )

    if (req.projectDDL) {
      const overDDL = shiftedStages.some((s) => s.endDate > req.projectDDL!)
      if (overDDL) {
        toast.warning('联动调整后部分环节超出需求 DDL，请注意风险')
      }
    }

    const nextOverrides = pendingDrag.schedules.map((s) =>
      s.requirementId === pendingDrag.requirementId ? { ...s, stages: shiftedStages } : s,
    )
    importScheduleOverrides(nextOverrides)
    setOverrides([])
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
          <button className="ghost-btn" type="button" onClick={handleExport}>
            ↓ 导出Excel
          </button>
          <label className="ghost-btn" style={{ cursor: 'pointer' }}>
            ↑ 导入Excel
            <input
              type="file"
              accept=".xlsx,.xls"
              style={{ display: 'none' }}
              onChange={handleImport}
            />
          </label>
          <button className="ghost-btn" type="button" onClick={handleDownloadTemplate}>
            ↓ 下载导入模板
          </button>
        </div>
      </div>

      {/* 导入结果面板 */}
      {importResult && (
        <div className="card" style={{ margin: '8px 0', padding: '12px 16px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 8,
            }}
          >
            <strong>导入结果</strong>
            <button
              type="button"
              className="ghost-btn"
              style={{ padding: '2px 8px', fontSize: 12 }}
              onClick={() => setImportResult(null)}
            >
              关闭
            </button>
          </div>
          <p style={{ margin: '4px 0', color: '#374151' }}>
            成功导入 <strong>{importResult.successCount}</strong> 条需求
            {importResult.newPipelineCount > 0 &&
              `，自动创建 ${importResult.newPipelineCount} 条管线`}
            {importResult.newStageLibCount > 0 &&
              `，自动追加 ${importResult.newStageLibCount} 条环节库条目`}
          </p>
          {importResult.errorRows.length > 0 && (
            <ul style={{ margin: '8px 0 0', paddingLeft: 16, color: '#ef4444', fontSize: 12 }}>
              {importResult.errorRows.map((err, idx) => (
                <li key={idx}>
                  行{err.rowIndex}：{err.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

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
                        // 拖拽中不显示 hover Tooltip
                        if (dragState) return
                        setTooltip({
                          stageName: row.stage.stageName,
                          startDate: row.stage.startDate,
                          endDate: row.stage.endDate,
                          isDrag: false,
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
          <div className="modal-box drag-confirm-modal">
            <h3 className="modal-title">确认排期变更</h3>
            <p className="drag-confirm-desc">
              <strong>{pendingDrag.stageName}</strong>
              {pendingDrag.newStart && pendingDrag.newEnd
                ? `：${pendingDrag.newStart} ~ ${pendingDrag.newEnd}`
                : ''}
            </p>
            {pendingDrag.conflicts.length > 0 && (
              <div className="modal-conflicts">
                <p className="modal-conflicts-label">注意：存在依赖关系变化：</p>
                <ul>
                  {pendingDrag.conflicts.map((c, i) => (
                    <li key={i} className="conflict-item">
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="modal-actions drag-confirm-actions">
              <button className="ghost-btn" type="button" onClick={handleCancelDrag}>
                取消
              </button>
              <button className="ghost-btn" type="button" onClick={handleConfirmDrag}>
                仅保存当前环节
              </button>
              <button className="ghost-btn" type="button" onClick={handleCascadeSave}>
                联动调整（按依赖重算）
              </button>
              <button className="primary-btn" type="button" autoFocus onClick={handleShiftSave}>
                联动调整（整体平移）
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 环节条 Tooltip（hover 静态 + 拖拽实时） ── */}
      {tooltip && (
        <div className="bar-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
          {tooltip.isDrag ? (
            // 拖拽实时 Tooltip：单行显示变更后日期
            <div className="bar-tooltip-name">{tooltip.stageName}</div>
          ) : (
            // Hover Tooltip：环节名称 + 日期区间双行
            <>
              <div className="bar-tooltip-name">{tooltip.stageName}</div>
              <div className="bar-tooltip-date">
                {tooltip.startDate} ~ {tooltip.endDate}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  )
}

/**
 * 设置页面。
 *
 * @description
 * - 管理工作日历、需求级别、模板分类
 * - 管理环节库（环节名称集合，供范式编辑下拉选择）
 * - 管理管线（含颜色选择）
 * - 管理登录状态与存储模式
 */
import { ChangeEvent, useMemo, useState, type JSX } from 'react'
import * as XLSX from 'xlsx'
import { useAppStateContext } from '../context/AppStateContext'
import { useToast } from '../context/ToastContext'
import type { HolidayRange, Pipeline, StageLibraryItem, StorageMode, ThemeId } from '../types'
import { createId } from '../utils/id'
import { buildXlsxBlob } from '../utils/xlsxBuilder'

/**
 * 预设颜色板——供用户快速选择，覆盖主题色系全部 16 色。
 * 每个值为 CSS hex 颜色字符串。
 */
const PRESET_COLORS: string[] = [
  '#C4B5FD', // 主色 lavender-300
  '#A78BFA', // violet-400
  '#7C3AED', // violet-600
  '#F9A8D4', // pink-300
  '#F472B6', // pink-400
  '#6EE7B7', // emerald-300
  '#34D399', // emerald-400
  '#FCD34D', // amber-300
  '#FBBF24', // amber-400
  '#FDA4AF', // rose-300
  '#F87171', // red-400
  '#93C5FD', // blue-300
  '#94A3B8', // slate-400
  '#64748B', // slate-500
  '#6B7280', // gray-500
  '#9CA3AF', // gray-400
]

/** 默认主题（薰衣草紫）管线色板（6色） */
const PIPELINE_COLORS_DEFAULT: string[] = [
  '#C4B5FD',
  '#F9A8D4',
  '#6EE7B7',
  '#FCD34D',
  '#93C5FD',
  '#FDA4AF',
]

/** 简约主题（Corporate Minimal）管线色板（6色） */
const PIPELINE_COLORS_MINIMAL: string[] = [
  '#2C5F7A',
  '#5387A3',
  '#DFA874',
  '#6C86A3',
  '#C4D3E0',
  '#1F2F3E',
]

/** 默认主题环节库色板（16色） */
const SLIB_COLORS_DEFAULT: string[] = [
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

/** 简约主题环节库色板（16色） */
const SLIB_COLORS_MINIMAL: string[] = [
  '#2C5F7A',
  '#5387A3',
  '#7BAECB',
  '#EFF5FA',
  '#C4D3E0',
  '#DFA874',
  '#C8916A',
  '#6C86A3',
  '#4A6580',
  '#1F2F3E',
  '#3A5068',
  '#8FAABB',
  '#B5C8D8',
  '#D8E6F0',
  '#F0F6FA',
  '#E8EFF5',
]

/**
 * 格式化日期区间为简短显示（MM/DD 或 MM/DD–MM/DD）。
 */
function formatRange(startDate: string, endDate: string): string {
  const fmt = (d: string): string => d.slice(5).replace('-', '/')
  return startDate === endDate ? fmt(startDate) : `${fmt(startDate)}–${fmt(endDate)}`
}

/**
 * 工作日历分组视图：按年折叠，Pill 标签展示。
 */
function CalendarGroups({
  holidays,
  onRemove,
  form,
  setForm,
  onAdd,
}: {
  holidays: import('../types').HolidayRange[]
  onRemove: (id: string) => void
  form: Omit<import('../types').HolidayRange, 'id'>
  setForm: React.Dispatch<React.SetStateAction<Omit<import('../types').HolidayRange, 'id'>>>
  onAdd: () => void
}): JSX.Element {
  const currentYear = new Date().getFullYear()

  // 按年分组
  const grouped = useMemo(() => {
    const map = new Map<number, import('../types').HolidayRange[]>()
    for (const h of holidays) {
      const yr = parseInt(h.startDate.slice(0, 4), 10)
      if (!map.has(yr)) map.set(yr, [])
      map.get(yr)!.push(h)
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0])
  }, [holidays])

  const [collapsed, setCollapsed] = useState<Set<number>>(
    () => new Set(grouped.filter(([yr]) => yr !== currentYear).map(([yr]) => yr)),
  )

  const toggleYear = (yr: number): void => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(yr)) next.delete(yr)
      else next.add(yr)
      return next
    })
  }

  return (
    <div className="cal-root">
      {/* 新增表单（固定顶部） */}
      <div className="cal-add-form">
        <input
          className="cal-add-name"
          placeholder="区间名称"
          value={form.name}
          onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onAdd()
          }}
        />
        <select
          className="cal-add-type"
          value={form.type}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, type: e.target.value as 'holiday' | 'workday' }))
          }
        >
          <option value="holiday">节假日</option>
          <option value="workday">调休上班</option>
        </select>
        <input
          type="date"
          className="cal-add-date"
          value={form.startDate}
          onChange={(e) => setForm((prev) => ({ ...prev, startDate: e.target.value }))}
        />
        <span className="cal-add-sep">–</span>
        <input
          type="date"
          className="cal-add-date"
          value={form.endDate}
          onChange={(e) => setForm((prev) => ({ ...prev, endDate: e.target.value }))}
        />
        <button className="primary-btn" type="button" onClick={onAdd}>
          + 新增
        </button>
      </div>

      {/* 可滚动分组列表 */}
      <div className="cal-list-scroll">
        {grouped.map(([yr, items]) => {
          const isCollapsed = collapsed.has(yr)
          return (
            <div key={yr} className="cal-year-group">
              <button
                type="button"
                className="cal-year-header"
                onClick={() => toggleYear(yr)}
                aria-expanded={!isCollapsed}
              >
                <span className="cal-year-label">{yr}</span>
                <span className="cal-year-count">{items.length} 条</span>
                <span className={`cal-chevron${isCollapsed ? '' : ' cal-chevron--open'}`}>›</span>
              </button>
              {!isCollapsed && (
                <div className="cal-pill-wrap">
                  {items.map((h) => (
                    <span
                      key={h.id}
                      className={`cal-pill cal-pill--${h.type}`}
                      title={`${h.name}  ${h.startDate} ~ ${h.endDate}`}
                    >
                      <span className="cal-pill-dot" />
                      <span className="cal-pill-name">{h.name}</span>
                      <span className="cal-pill-date">{formatRange(h.startDate, h.endDate)}</span>
                      <button
                        type="button"
                        className="cal-pill-remove"
                        aria-label={`删除 ${h.name}`}
                        onClick={() => onRemove(h.id)}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )
        })}
        {holidays.length === 0 && <p className="cal-empty">暂无日历区间，请在上方新增。</p>}
      </div>
    </div>
  )
}

/**
 * 设置页组件。
 *
 * @returns {JSX.Element} 设置页视图
 */
export function SettingsPage(): JSX.Element {
  const {
    state,
    setStorageMode,
    addLevel,
    removeLevel,
    addCategory,
    removeCategory,
    upsertHoliday,
    removeHoliday,
    upsertPipeline,
    removePipeline,
    upsertStageLibraryItem,
    removeStageLibraryItem,
    importStageLibraryItems,
    batchUpdateStageLibraryItems,
    setTheme,
  } = useAppStateContext()
  const toast = useToast()

  const [newLevel, setNewLevel] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [activeTab, setActiveTab] = useState<
    'calendar' | 'levels' | 'categories' | 'stagelibrary' | 'pipelines' | 'theme' | 'account'
  >('calendar')
  const [holidayForm, setHolidayForm] = useState<Omit<HolidayRange, 'id'>>({
    name: '',
    startDate: '2026-10-01',
    endDate: '2026-10-07',
    type: 'holiday',
  })

  /** 新增管线表单：名称 + 颜色 */
  const [newPipelineName, setNewPipelineName] = useState('')
  const [newPipelineColor, setNewPipelineColor] = useState(PRESET_COLORS[0])

  /**
   * 正在编辑的管线 ID（null 表示无行内编辑激活）。
   * 编辑时只改名称与颜色，保留 id 不变。
   */
  const [editingPipelineId, setEditingPipelineId] = useState<string | null>(null)
  const [editPipelineName, setEditPipelineName] = useState('')
  const [editPipelineColor, setEditPipelineColor] = useState(PRESET_COLORS[0])

  /**
   * 新增节假日/调休日历区间。
   *
   * @returns {void}
   */
  const handleAddHoliday = (): void => {
    /**
     * 条件目的：名称缺失时不新增，避免出现不可读条目。
     */
    if (!holidayForm.name.trim()) {
      return
    }
    upsertHoliday({
      ...holidayForm,
      id: createId('holiday'),
    })
    setHolidayForm((prev) => ({ ...prev, name: '' }))
  }

  /**
   * 切换存储模式。
   *
   * @param {StorageMode} mode 存储模式
   * @returns {void}
   */
  const handleStorageModeChange = (mode: StorageMode): void => {
    setStorageMode(mode)
  }

  /**
   * 新增管线。
   *
   * @returns {void}
   */
  const handleAddPipeline = (): void => {
    /**
     * 条件目的：名称为空时不新增，避免无名管线。
     */
    if (!newPipelineName.trim()) return

    upsertPipeline({
      id: createId('pipe'),
      name: newPipelineName.trim(),
      color: newPipelineColor,
    })
    setNewPipelineName('')
    setNewPipelineColor(PRESET_COLORS[0])
  }

  /**
   * 进入管线编辑模式。
   *
   * @param {Pipeline} pipeline 被编辑的管线
   * @returns {void}
   */
  const handleStartEditPipeline = (pipeline: Pipeline): void => {
    setEditingPipelineId(pipeline.id)
    setEditPipelineName(pipeline.name)
    setEditPipelineColor(pipeline.color)
  }

  /**
   * 保存管线编辑。
   *
   * @param {string} id 管线 ID
   * @returns {void}
   */
  const handleSavePipeline = (id: string): void => {
    /**
     * 条件目的：名称为空时不保存，保持数据合法性。
     */
    if (!editPipelineName.trim()) return

    upsertPipeline({ id, name: editPipelineName.trim(), color: editPipelineColor })
    setEditingPipelineId(null)
  }

  /**
   * 取消管线编辑。
   *
   * @returns {void}
   */
  const handleCancelEditPipeline = (): void => {
    setEditingPipelineId(null)
  }

  // ── 环节库状态 ──
  /** 新增环节库条目：名称 */
  const [newStageName, setNewStageName] = useState('')
  /** 新增环节库条目：类别 */
  const [newStageCategory, setNewStageCategory] = useState('')
  /** 新增环节库条目：所属管线 ID（空字符串表示通用） */
  const [newStagePipelineId, setNewStagePipelineId] = useState('')
  /** 正在编辑的环节库条目 ID */
  const [editingSlibId, setEditingSlibId] = useState<string | null>(null)
  const [editSlibName, setEditSlibName] = useState('')
  const [editSlibCategory, setEditSlibCategory] = useState('')
  const [editSlibColor, setEditSlibColor] = useState<string | undefined>(undefined)
  /** 正在编辑条目的所属管线 ID（空字符串表示通用） */
  const [editSlibPipelineId, setEditSlibPipelineId] = useState('')
  /** 色板 popover 打开的条目 ID（null 表示关闭） */
  const [colorPopoverId, setColorPopoverId] = useState<string | null>(null)

  /** 环节库管线筛选（空字符串=全部） */
  const [slibFilterPipeline, setSlibFilterPipeline] = useState('')
  /** 环节库已选条目 ID 集合（批量操作） */
  const [selectedSlibIds, setSelectedSlibIds] = useState<Set<string>>(new Set())
  /** 批量改管线 popover 是否展开 */
  const [batchPipelinePopover, setBatchPipelinePopover] = useState(false)
  /** 批量改颜色 popover 是否展开 */
  const [batchColorPopover, setBatchColorPopover] = useState(false)
  /** 批量删除确认弹窗 */
  const [batchDeleteConfirm, setBatchDeleteConfirm] = useState(false)

  /** 当前筛选后的环节库列表 */
  const filteredSlib = useMemo(
    () =>
      slibFilterPipeline
        ? state.stageLibrary.filter((item) => item.pipelineId === slibFilterPipeline)
        : state.stageLibrary,
    [state.stageLibrary, slibFilterPipeline],
  )

  /**
   * 新增环节库条目。
   *
   * @returns {void}
   */
  const handleAddStageLibraryItem = (): void => {
    const name = newStageName.trim()
    /** 条件目的：名称为空时不新增，避免无效条目。 */
    if (!name) return
    /** 条件目的：名称已存在时不新增，保持环节名唯一。 */
    if (state.stageLibrary.some((item) => item.stageName === name)) {
      toast.warning(`环节「${name}」已存在`)
      return
    }
    /**
     * 预设颜色：按当前环节库总数取色板中对应颜色，确保新环节与已有环节颜色不同。
     * 使用 index % PRESET_COLORS.length 循环取色。
     */
    const presetColor = PRESET_COLORS[state.stageLibrary.length % PRESET_COLORS.length]
    upsertStageLibraryItem({
      id: createId('slib'),
      stageName: name,
      stageCategory: newStageCategory.trim(),
      pipelineId: newStagePipelineId || undefined,
      color: presetColor,
      deprecated: false,
    })
    setNewStageName('')
    setNewStageCategory('')
    setNewStagePipelineId('')
  }

  /**
   * 进入环节库条目编辑模式。
   *
   * @param {StageLibraryItem} item 被编辑的条目
   * @returns {void}
   */
  const handleStartEditSlib = (item: StageLibraryItem): void => {
    setEditingSlibId(item.id)
    setEditSlibName(item.stageName)
    setEditSlibCategory(item.stageCategory)
    setEditSlibColor(item.color)
    setEditSlibPipelineId(item.pipelineId ?? '')
  }

  /**
   * 保存环节库条目编辑。
   *
   * @param {StageLibraryItem} item 原条目
   * @returns {void}
   */
  const handleSaveSlib = (item: StageLibraryItem): void => {
    const name = editSlibName.trim()
    /** 条件目的：名称为空时不保存。 */
    if (!name) return
    upsertStageLibraryItem({
      ...item,
      stageName: name,
      stageCategory: editSlibCategory.trim(),
      pipelineId: editSlibPipelineId || undefined,
      color: editSlibColor,
    })
    setEditingSlibId(null)
  }

  /**
   * 直接为某条目设置颜色（色板 popover 选色时调用）。
   *
   * @param {StageLibraryItem} item 目标条目
   * @param {string | undefined} color 新颜色，undefined 表示清除
   * @returns {void}
   */
  const handleSetSlibColor = (item: StageLibraryItem, color: string | undefined): void => {
    upsertStageLibraryItem({ ...item, color })
    setColorPopoverId(null)
  }

  /** 全选/全取消当前筛选结果 */
  const handleSelectAll = (checked: boolean): void => {
    if (checked) {
      setSelectedSlibIds(new Set(filteredSlib.map((item) => item.id)))
    } else {
      setSelectedSlibIds(new Set())
    }
  }

  /** 切换单条选中状态 */
  const handleToggleSelect = (id: string): void => {
    setSelectedSlibIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  /** 批量删除确认 */
  const handleBatchDelete = (): void => {
    batchUpdateStageLibraryItems(Array.from(selectedSlibIds), () => null, state.paradigms)
    setSelectedSlibIds(new Set())
    setBatchDeleteConfirm(false)
    toast.success('批量删除完成')
  }

  /** 批量修改所属管线 */
  const handleBatchSetPipeline = (pipelineId: string): void => {
    batchUpdateStageLibraryItems(
      Array.from(selectedSlibIds),
      (item) => ({ ...item, pipelineId: pipelineId || undefined }),
      state.paradigms,
    )
    setSelectedSlibIds(new Set())
    setBatchPipelinePopover(false)
    toast.success('批量修改管线完成')
  }

  /** 批量修改颜色 */
  const handleBatchSetColor = (color: string | undefined): void => {
    batchUpdateStageLibraryItems(
      Array.from(selectedSlibIds),
      (item) => ({ ...item, color }),
      state.paradigms,
    )
    setSelectedSlibIds(new Set())
    setBatchColorPopover(false)
    toast.success('批量修改颜色完成')
  }

  /**
   * 下载环节库导入模板（三列：环节名称、所属类别、颜色）。
   *
   * @returns {void}
   */
  const handleDownloadSlibTemplate = (): void => {
    const pipelineNames = state.pipelines.map((p) => p.name)
    const rows = [
      ['环节名称', '所属类别', '所属管线（可选）', '颜色（可选，如 #C4B5FD）'],
      ['需求设计', '设计', pipelineNames[0] ?? '', '#C4B5FD'],
      ['开发实现', '开发', '', '#A78BFA'],
    ]
    const dropdowns = [
      ...(pipelineNames.length > 0 ? [{ sqref: 'C2:C10000', options: pipelineNames }] : []),
    ]
    const blob = buildXlsxBlob(rows, dropdowns)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = '环节库导入模板.xlsx'
    a.click()
    URL.revokeObjectURL(url)
  }

  /**
   * 批量导入环节库 Excel。
   * A列=环节名称，B列=所属类别，C列=所属管线，D列=颜色；名称为空跳过，名称已存在跳过。
   *
   * @param {ChangeEvent<HTMLInputElement>} event 文件选择事件
   * @returns {void}
   */
  const handleImportSlibExcel = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0]
    /** 条件目的：未选择文件时直接退出。 */
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => {
      const arrayBuffer = e.target?.result
      if (!arrayBuffer) return
      const workbook = XLSX.read(arrayBuffer, { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<Record<string, string | number>>(sheet, {
        header: 'A',
        defval: '',
      })
      const dataRows = rows.slice(1)
      const existingNames = new Set(state.stageLibrary.map((item) => item.stageName))
      const toAdd: StageLibraryItem[] = []
      let skipped = 0

      /**
       * 循环目的：逐行解析环节名称、类别、管线与颜色，过滤无效行。
       * 颜色优先级：用户填写 > 自动预设（按全局顺序 index % 16 循环取色）。
       */
      for (const row of dataRows) {
        const name = `${row['A'] ?? ''}`.trim()
        if (!name) continue
        if (existingNames.has(name)) {
          skipped++
          continue
        }
        existingNames.add(name)
        const pipelineNameRaw = `${row['C'] ?? ''}`.trim()
        const matchedPipeline = pipelineNameRaw
          ? state.pipelines.find((p) => p.name === pipelineNameRaw)
          : undefined
        const rawColor = `${row['D'] ?? ''}`.trim()
        /**
         * 自动预设颜色：若用户未填写颜色列，则按当前已有条目总数（含本批次已处理条目）
         * 从色板中循环取色，确保批量导入后各环节颜色各异。
         */
        const autoColor =
          PRESET_COLORS[(state.stageLibrary.length + toAdd.length) % PRESET_COLORS.length]
        toAdd.push({
          id: createId('slib'),
          stageName: name,
          stageCategory: `${row['B'] ?? ''}`.trim(),
          pipelineId: matchedPipeline?.id,
          color: rawColor || autoColor,
          deprecated: false,
        })
      }

      if (toAdd.length > 0) {
        importStageLibraryItems(toAdd)
        toast.success(
          `成功导入 ${toAdd.length} 条环节${skipped > 0 ? `，跳过重复 ${skipped} 条` : ''}`,
        )
      } else {
        toast.warning(skipped > 0 ? `所有条目均已存在，跳过 ${skipped} 条` : '未读取到有效环节数据')
      }
    }
    reader.readAsArrayBuffer(file)
    event.target.value = ''
  }

  const TABS: { key: typeof activeTab; label: string }[] = [
    { key: 'calendar', label: '工作日历' },
    { key: 'levels', label: '需求级别' },
    { key: 'categories', label: '模板分类' },
    { key: 'stagelibrary', label: '环节库' },
    { key: 'pipelines', label: '管线管理' },
    { key: 'theme', label: '主题' },
    { key: 'account', label: '账号与同步' },
  ]

  return (
    <section className="settings-page">
      {/* ── 左侧 Tab 导航 ── */}
      <nav className="settings-nav card">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`settings-tab-item${activeTab === tab.key ? ' active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* ── 右侧内容区 ── */}
      <div className="settings-content">
        {/* 工作日历 */}
        {activeTab === 'calendar' && (
          <div className="card card--calendar">
            <h2>工作日历</h2>
            <CalendarGroups
              holidays={state.holidays}
              onRemove={removeHoliday}
              form={holidayForm}
              setForm={setHolidayForm}
              onAdd={handleAddHoliday}
            />
          </div>
        )}

        {/* 需求级别 */}
        {activeTab === 'levels' && (
          <div className="card">
            <h2>需求级别维护</h2>
            <div className="inline-form">
              <input
                value={newLevel}
                placeholder="新增级别"
                onChange={(event) => setNewLevel(event.target.value)}
              />
              <button
                className="primary-btn"
                type="button"
                onClick={() => {
                  addLevel(newLevel.trim())
                  setNewLevel('')
                }}
              >
                添加
              </button>
            </div>
            <div className="chip-wrap">
              {state.levels.map((level) => (
                <button
                  key={level}
                  className="chip"
                  type="button"
                  onClick={() => removeLevel(level)}
                >
                  {level} ×
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 模板分类 */}
        {activeTab === 'categories' && (
          <div className="card">
            <h2>模板分类维护</h2>
            <div className="inline-form">
              <input
                value={newCategory}
                placeholder="新增分类"
                onChange={(event) => setNewCategory(event.target.value)}
              />
              <button
                className="primary-btn"
                type="button"
                onClick={() => {
                  addCategory(newCategory.trim())
                  setNewCategory('')
                }}
              >
                添加
              </button>
            </div>
            <div className="chip-wrap">
              {state.categories.map((item) => (
                <button
                  key={item}
                  className="chip"
                  type="button"
                  onClick={() => removeCategory(item)}
                >
                  {item} ×
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 环节库 */}
        {activeTab === 'stagelibrary' && (
          <div className="card">
            <h2>环节库</h2>
            {/* 顶部操作栏第一行 */}
            <div className="slib-toolbar">
              <div className="inline-form" style={{ flex: 1 }}>
                <input
                  value={newStageName}
                  placeholder="环节名称"
                  onChange={(e) => setNewStageName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddStageLibraryItem()
                  }}
                />
                <input
                  value={newStageCategory}
                  placeholder="所属类别（可选）"
                  onChange={(e) => setNewStageCategory(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddStageLibraryItem()
                  }}
                />
                <select
                  value={newStagePipelineId}
                  onChange={(e) => setNewStagePipelineId(e.target.value)}
                  title="所属管线"
                >
                  <option value="">通用</option>
                  {state.pipelines.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <button className="primary-btn" type="button" onClick={handleAddStageLibraryItem}>
                  + 新增环节
                </button>
              </div>
              <button className="ghost-btn" type="button" onClick={handleDownloadSlibTemplate}>
                ↓ 下载导入模板
              </button>
              <label className="file-btn">
                ↑ 批量导入Excel
                <input type="file" accept=".xlsx,.xls" onChange={handleImportSlibExcel} />
              </label>
            </div>

            {/* 筛选行 + 批量操作栏 */}
            <div className="slib-filter-row">
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 13, color: 'var(--color-muted)' }}>所属管线</span>
                <select
                  value={slibFilterPipeline}
                  onChange={(e) => {
                    setSlibFilterPipeline(e.target.value)
                    setSelectedSlibIds(new Set())
                  }}
                  style={{ width: 160 }}
                >
                  <option value="">全部</option>
                  {state.pipelines.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>

              {selectedSlibIds.size > 0 && (
                <div className="slib-batch-bar">
                  <span style={{ fontSize: 13, color: 'var(--color-muted)' }}>
                    已选 {selectedSlibIds.size} 条
                  </span>
                  <button
                    type="button"
                    className="danger-btn"
                    onClick={() => setBatchDeleteConfirm(true)}
                  >
                    批量删除
                  </button>
                  <div style={{ position: 'relative' }}>
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() => {
                        setBatchPipelinePopover((v) => !v)
                        setBatchColorPopover(false)
                      }}
                    >
                      修改管线
                    </button>
                    {batchPipelinePopover && (
                      <div className="slib-color-popover" style={{ minWidth: 140 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <button
                            type="button"
                            className="ghost-btn"
                            style={{ textAlign: 'left', fontSize: 12 }}
                            onClick={() => handleBatchSetPipeline('')}
                          >
                            通用/不限
                          </button>
                          {state.pipelines.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              className="ghost-btn"
                              style={{ textAlign: 'left', fontSize: 12 }}
                              onClick={() => handleBatchSetPipeline(p.id)}
                            >
                              {p.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <div style={{ position: 'relative' }}>
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() => {
                        setBatchColorPopover((v) => !v)
                        setBatchPipelinePopover(false)
                      }}
                    >
                      修改颜色
                    </button>
                    {batchColorPopover && (
                      <div className="slib-color-popover">
                        <div className="color-picker-wrap">
                          {PRESET_COLORS.map((color) => (
                            <button
                              key={color}
                              type="button"
                              className="color-swatch"
                              style={{ background: color }}
                              aria-label={`批量设置颜色 ${color}`}
                              onClick={() => handleBatchSetColor(color)}
                            />
                          ))}
                        </div>
                        <button
                          type="button"
                          className="ghost-btn"
                          style={{ marginTop: 4, width: '100%', fontSize: 12 }}
                          onClick={() => handleBatchSetColor(undefined)}
                        >
                          清除
                        </button>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => setSelectedSlibIds(new Set())}
                  >
                    取消选择
                  </button>
                </div>
              )}
            </div>

            {/* 批量删除确认弹窗 */}
            {batchDeleteConfirm && (
              <div className="confirm-overlay">
                <div className="confirm-dialog">
                  <p>
                    确认删除选中的 {selectedSlibIds.size}{' '}
                    条环节？被范式引用的条目将标记为停用，其余直接删除。
                  </p>
                  <div className="row-gap" style={{ justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() => setBatchDeleteConfirm(false)}
                    >
                      取消
                    </button>
                    <button type="button" className="danger-btn" onClick={handleBatchDelete}>
                      确认删除
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 环节库表格 */}
            <table className="data-table" style={{ marginTop: 12 }}>
              <thead>
                <tr>
                  <th style={{ width: 32 }}>
                    <input
                      type="checkbox"
                      checked={
                        filteredSlib.length > 0 &&
                        filteredSlib.every((item) => selectedSlibIds.has(item.id))
                      }
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      aria-label="全选"
                    />
                  </th>
                  <th>环节名称</th>
                  <th>所属类别</th>
                  <th>所属管线</th>
                  <th>颜色</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredSlib.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', color: 'var(--color-muted)' }}>
                      暂无环节，请点击上方新增或批量导入。
                    </td>
                  </tr>
                )}
                {filteredSlib.map((item) => {
                  if (editingSlibId === item.id) {
                    return (
                      <tr key={item.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedSlibIds.has(item.id)}
                            onChange={() => handleToggleSelect(item.id)}
                          />
                        </td>
                        <td>
                          <input
                            value={editSlibName}
                            onChange={(e) => setEditSlibName(e.target.value)}
                            autoFocus
                            style={{ width: '100%' }}
                          />
                        </td>
                        <td>
                          <input
                            value={editSlibCategory}
                            onChange={(e) => setEditSlibCategory(e.target.value)}
                            style={{ width: '100%' }}
                          />
                        </td>
                        <td>
                          <select
                            value={editSlibPipelineId}
                            onChange={(e) => setEditSlibPipelineId(e.target.value)}
                            style={{ width: '100%' }}
                          >
                            <option value="">通用</option>
                            {state.pipelines.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          {/* 编辑模式下内联色板 */}
                          <div className="color-picker-wrap">
                            {PRESET_COLORS.map((color) => (
                              <button
                                key={color}
                                type="button"
                                className={`color-swatch ${editSlibColor === color ? 'color-swatch--active' : ''}`}
                                style={{ background: color }}
                                aria-label={`选择颜色 ${color}`}
                                onClick={() => setEditSlibColor(color)}
                              />
                            ))}
                            <button
                              type="button"
                              className={`color-swatch color-swatch--custom ${!editSlibColor ? 'color-swatch--active' : ''}`}
                              style={{ background: '#e5e7eb' }}
                              aria-label="清除颜色"
                              onClick={() => setEditSlibColor(undefined)}
                            >
                              ×
                            </button>
                          </div>
                        </td>
                        <td>
                          <div className="row-gap">
                            <button
                              className="primary-btn"
                              type="button"
                              onClick={() => handleSaveSlib(item)}
                            >
                              保存
                            </button>
                            <button
                              className="ghost-btn"
                              type="button"
                              onClick={() => setEditingSlibId(null)}
                            >
                              取消
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  }
                  return (
                    <tr key={item.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedSlibIds.has(item.id)}
                          onChange={() => handleToggleSelect(item.id)}
                        />
                      </td>
                      <td>
                        {item.stageName}
                        {item.deprecated && (
                          <span
                            style={{
                              marginLeft: 6,
                              fontSize: 11,
                              color: 'var(--color-muted)',
                              background: 'var(--color-bg-secondary, #f3f4f6)',
                              borderRadius: 4,
                              padding: '1px 5px',
                            }}
                          >
                            停用
                          </span>
                        )}
                      </td>
                      <td>
                        {item.stageCategory || (
                          <span style={{ color: 'var(--color-muted)' }}>—</span>
                        )}
                      </td>
                      <td>
                        <select
                          value={item.pipelineId ?? ''}
                          onChange={(e) =>
                            upsertStageLibraryItem({
                              ...item,
                              pipelineId: e.target.value || undefined,
                            })
                          }
                        >
                          <option value="">通用</option>
                          {state.pipelines.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={{ position: 'relative' }}>
                        {/* 色块 + popover */}
                        <button
                          type="button"
                          className="slib-color-swatch"
                          style={{ background: item.color ?? 'transparent' }}
                          aria-label={item.color ? `当前颜色 ${item.color}` : '未设置颜色'}
                          onClick={() =>
                            setColorPopoverId((prev) => (prev === item.id ? null : item.id))
                          }
                        >
                          {!item.color && <span style={{ color: 'var(--color-muted)' }}>无</span>}
                        </button>
                        {colorPopoverId === item.id && (
                          <div className="slib-color-popover">
                            <div className="color-picker-wrap">
                              {PRESET_COLORS.map((color) => (
                                <button
                                  key={color}
                                  type="button"
                                  className={`color-swatch ${item.color === color ? 'color-swatch--active' : ''}`}
                                  style={{ background: color }}
                                  aria-label={`选择颜色 ${color}`}
                                  onClick={() => handleSetSlibColor(item, color)}
                                />
                              ))}
                            </div>
                            <button
                              type="button"
                              className="ghost-btn"
                              style={{ marginTop: 4, width: '100%', fontSize: 12 }}
                              onClick={() => handleSetSlibColor(item, undefined)}
                            >
                              清除
                            </button>
                          </div>
                        )}
                      </td>
                      <td>
                        <div className="row-gap">
                          <button
                            className="ghost-btn"
                            type="button"
                            onClick={() => handleStartEditSlib(item)}
                          >
                            编辑
                          </button>
                          <button
                            className="danger-btn"
                            type="button"
                            onClick={() => removeStageLibraryItem(item.id)}
                          >
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 管线管理 */}
        {activeTab === 'pipelines' && (
          <div className="card">
            <h2>管线管理</h2>

            {/* 新增管线表单 */}
            <div className="pipeline-add-form">
              <label className="field">
                <span>管线名称</span>
                <input
                  value={newPipelineName}
                  placeholder="如：主线、增长线"
                  onChange={(e) => setNewPipelineName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddPipeline()
                  }}
                />
              </label>

              <div className="field">
                <span className="field-label">颜色</span>
                <div className="color-picker-wrap">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={`color-swatch ${newPipelineColor === color ? 'color-swatch--active' : ''}`}
                      style={{ background: color }}
                      aria-label={`选择颜色 ${color}`}
                      onClick={() => setNewPipelineColor(color)}
                    />
                  ))}
                  <label className="color-custom" title="自定义颜色">
                    <input
                      type="color"
                      value={newPipelineColor}
                      onChange={(e) => setNewPipelineColor(e.target.value)}
                    />
                    <span
                      className={`color-swatch color-swatch--custom ${!PRESET_COLORS.includes(newPipelineColor) ? 'color-swatch--active' : ''}`}
                      style={{ background: newPipelineColor }}
                    >
                      +
                    </span>
                  </label>
                </div>
              </div>

              <button
                className="primary-btn pipeline-add-btn"
                type="button"
                onClick={handleAddPipeline}
              >
                新增管线
              </button>
            </div>

            {/* 管线列表 */}
            <div className="pipeline-list">
              {state.pipelines.length === 0 && <p className="muted">暂无管线，请点击上方新增。</p>}
              {state.pipelines.map((pipeline) => {
                if (editingPipelineId === pipeline.id) {
                  return (
                    <div key={pipeline.id} className="pipeline-item pipeline-item--editing">
                      <input
                        className="pipeline-edit-input"
                        value={editPipelineName}
                        onChange={(e) => setEditPipelineName(e.target.value)}
                        autoFocus
                      />
                      <div className="color-picker-wrap">
                        {PRESET_COLORS.map((color) => (
                          <button
                            key={color}
                            type="button"
                            className={`color-swatch ${editPipelineColor === color ? 'color-swatch--active' : ''}`}
                            style={{ background: color }}
                            aria-label={`选择颜色 ${color}`}
                            onClick={() => setEditPipelineColor(color)}
                          />
                        ))}
                        <label className="color-custom" title="自定义颜色">
                          <input
                            type="color"
                            value={editPipelineColor}
                            onChange={(e) => setEditPipelineColor(e.target.value)}
                          />
                          <span
                            className={`color-swatch color-swatch--custom ${!PRESET_COLORS.includes(editPipelineColor) ? 'color-swatch--active' : ''}`}
                            style={{ background: editPipelineColor }}
                          >
                            +
                          </span>
                        </label>
                      </div>
                      <div className="row-gap">
                        <button
                          className="primary-btn"
                          type="button"
                          onClick={() => handleSavePipeline(pipeline.id)}
                        >
                          保存
                        </button>
                        <button
                          className="ghost-btn"
                          type="button"
                          onClick={handleCancelEditPipeline}
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  )
                }

                return (
                  <div key={pipeline.id} className="pipeline-item">
                    <span
                      className="pipeline-dot"
                      style={{ background: pipeline.color }}
                      aria-label={`管线颜色 ${pipeline.color}`}
                    />
                    <span className="pipeline-name">{pipeline.name}</span>
                    <span className="pipeline-color-tag">{pipeline.color}</span>
                    <div className="row-gap pipeline-actions">
                      <button
                        className="ghost-btn"
                        type="button"
                        onClick={() => handleStartEditPipeline(pipeline)}
                      >
                        编辑
                      </button>
                      <button
                        className="danger-btn"
                        type="button"
                        onClick={() => removePipeline(pipeline.id)}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* 主题 */}
        {activeTab === 'theme' && (
          <div className="card">
            <h2>主题</h2>
            <div className="theme-card-list">
              {(
                [
                  {
                    id: 'default' as ThemeId,
                    label: '默认主题',
                    desc: '薰衣草紫，柔和彩色风格',
                    swatches: PIPELINE_COLORS_DEFAULT,
                    pipelineColors: PIPELINE_COLORS_DEFAULT,
                    slibColors: SLIB_COLORS_DEFAULT,
                  },
                  {
                    id: 'minimal' as ThemeId,
                    label: '简约主题',
                    desc: 'Corporate Minimal，商务蓝灰风格',
                    swatches: PIPELINE_COLORS_MINIMAL,
                    pipelineColors: PIPELINE_COLORS_MINIMAL,
                    slibColors: SLIB_COLORS_MINIMAL,
                  },
                ] as const
              ).map((theme) => (
                <div
                  key={theme.id}
                  className={`theme-card${state.theme === theme.id ? ' theme-card--active' : ''}`}
                >
                  <div className="theme-card__header">
                    <strong>{theme.label}</strong>
                    <span className="theme-card__desc">{theme.desc}</span>
                  </div>
                  <div className="theme-swatches">
                    {theme.swatches.map((color) => (
                      <span
                        key={color}
                        className="theme-swatch"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                  <div className="theme-card__preview">
                    <span
                      className="theme-preview-btn theme-preview-btn--primary"
                      style={{
                        backgroundColor: theme.pipelineColors[0],
                        borderRadius: theme.id === 'minimal' ? '4px' : '8px',
                      }}
                    >
                      主按钮
                    </span>
                    <span
                      className="theme-preview-btn theme-preview-btn--ghost"
                      style={{
                        borderColor: theme.pipelineColors[0],
                        color: theme.pipelineColors[0],
                        borderRadius: theme.id === 'minimal' ? '4px' : '8px',
                      }}
                    >
                      次按钮
                    </span>
                  </div>
                  <button
                    type="button"
                    className={state.theme === theme.id ? 'ghost-btn' : 'primary-btn'}
                    disabled={state.theme === theme.id}
                    onClick={() => setTheme(theme.id, theme.pipelineColors, theme.slibColors)}
                  >
                    {state.theme === theme.id ? '当前主题' : '应用主题'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 账号与同步 */}
        {activeTab === 'account' && (
          <div className="card">
            <h2>账号与同步</h2>
            <div className="row-gap">
              <label className="radio-line">
                <input
                  type="radio"
                  checked={state.storageMode === 'local'}
                  onChange={() => handleStorageModeChange('local')}
                />
                本地模式
              </label>
              <label className="radio-line">
                <input
                  type="radio"
                  checked={state.storageMode === 'cloud'}
                  onChange={() => handleStorageModeChange('cloud')}
                />
                云端模式
              </label>
              <label className="radio-line">
                <input
                  type="radio"
                  checked={state.storageMode === 'hybrid'}
                  onChange={() => handleStorageModeChange('hybrid')}
                />
                本地+云端同步
              </label>
            </div>
            <p className="muted">
              当前同步状态：{state.userSession.syncStatus}；登录状态：
              {state.userSession.loggedIn ? '已登录' : '未登录'}
            </p>
          </div>
        )}
      </div>
    </section>
  )
}

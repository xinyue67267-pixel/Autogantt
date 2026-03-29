/**
 * 设置页面。
 *
 * @description
 * - 管理工作日历、需求级别、模板分类
 * - 管理环节库（环节名称集合，供范式编辑下拉选择）
 * - 管理管线（含颜色选择）
 * - 管理登录状态与存储模式
 */
import { ChangeEvent, useState, type JSX } from 'react'
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

  /**
   * 下载环节库导入模板（三列：环节名称、所属类别、颜色）。
   *
   * @returns {void}
   */
  const handleDownloadSlibTemplate = (): void => {
    const rows = [
      ['环节名称', '所属类别', '颜色（可选，如 #C4B5FD）'],
      ['需求设计', '设计', '#C4B5FD'],
      ['开发实现', '开发', '#A78BFA'],
    ]
    const blob = buildXlsxBlob(rows, [])
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = '环节库导入模板.xlsx'
    a.click()
    URL.revokeObjectURL(url)
  }

  /**
   * 批量导入环节库 Excel。
   * A列=环节名称，B列=所属类别，C列=颜色；名称为空跳过，名称已存在跳过。
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
       * 循环目的：逐行解析环节名称、类别与颜色，过滤无效行。
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
        const rawColor = `${row['C'] ?? ''}`.trim()
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
          <div className="card">
            <h2>工作日历</h2>
            <div className="field-grid">
              <label className="field">
                <span>名称</span>
                <input
                  value={holidayForm.name}
                  onChange={(event) =>
                    setHolidayForm((prev) => ({ ...prev, name: event.target.value }))
                  }
                />
              </label>
              <label className="field">
                <span>类型</span>
                <select
                  value={holidayForm.type}
                  onChange={(event) =>
                    setHolidayForm((prev) => ({
                      ...prev,
                      type: event.target.value as 'holiday' | 'workday',
                    }))
                  }
                >
                  <option value="holiday">节假日（非工作日）</option>
                  <option value="workday">调休（工作日）</option>
                </select>
              </label>
              <label className="field">
                <span>开始日期</span>
                <input
                  type="date"
                  value={holidayForm.startDate}
                  onChange={(event) =>
                    setHolidayForm((prev) => ({ ...prev, startDate: event.target.value }))
                  }
                />
              </label>
              <label className="field">
                <span>结束日期</span>
                <input
                  type="date"
                  value={holidayForm.endDate}
                  onChange={(event) =>
                    setHolidayForm((prev) => ({ ...prev, endDate: event.target.value }))
                  }
                />
              </label>
            </div>
            <button className="primary-btn" type="button" onClick={handleAddHoliday}>
              新增日历区间
            </button>

            <table className="data-table">
              <thead>
                <tr>
                  <th>名称</th>
                  <th>类型</th>
                  <th>开始</th>
                  <th>结束</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {state.holidays.map((item) => (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td>{item.type === 'holiday' ? '节假日' : '调休工作日'}</td>
                    <td>{item.startDate}</td>
                    <td>{item.endDate}</td>
                    <td>
                      <button
                        className="danger-btn"
                        type="button"
                        onClick={() => removeHoliday(item.id)}
                      >
                        删除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
            {/* 顶部操作栏 */}
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

            {/* 环节库表格 */}
            <table className="data-table" style={{ marginTop: 12 }}>
              <thead>
                <tr>
                  <th>环节名称</th>
                  <th>所属类别</th>
                  <th>所属管线</th>
                  <th>颜色</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {state.stageLibrary.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', color: 'var(--color-muted)' }}>
                      暂无环节，请点击上方新增或批量导入。
                    </td>
                  </tr>
                )}
                {state.stageLibrary.map((item) => {
                  if (editingSlibId === item.id) {
                    return (
                      <tr key={item.id}>
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
                      <td>{item.stageName}</td>
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

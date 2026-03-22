/**
 * 设置页面。
 *
 * @description
 * - 管理工作日历、需求级别、模板分类
 * - 管理管线（含颜色选择）
 * - 管理登录状态与存储模式
 */
import { useState, type JSX } from 'react'
import { useAppStateContext } from '../context/AppStateContext'
import type { HolidayRange, Pipeline, StorageMode } from '../types'
import { createId } from '../utils/id'

/**
 * 预设颜色板——供用户快速选择，覆盖常见业务线配色。
 * 每个值为 CSS hex 颜色字符串。
 */
const PRESET_COLORS: string[] = [
  '#C4B5FD', // 主色 lavender
  '#F9A8D4', // 粉色
  '#6EE7B7', // 翠绿
  '#FCD34D', // 琥珀
  '#FDA4AF', // 玫瑰
  '#93C5FD', // 蓝色
  '#FCA5A5', // 红橙
  '#86EFAC', // 嫩绿
  '#FB923C', // 橙色
  '#A5B4FC', // 靛蓝
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
  } = useAppStateContext()

  const [newLevel, setNewLevel] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [activeTab, setActiveTab] = useState<
    'calendar' | 'levels' | 'categories' | 'pipelines' | 'account'
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

  const TABS: { key: typeof activeTab; label: string }[] = [
    { key: 'calendar', label: '工作日历' },
    { key: 'levels', label: '需求级别' },
    { key: 'categories', label: '模板分类' },
    { key: 'pipelines', label: '管线管理' },
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

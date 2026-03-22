/**
 * 需求管理页面。
 *
 * @description
 * - 支持手动新增、行内编辑、软删除与恢复
 * - 支持Excel批量导入，含必填/日期格式/下拉合法性校验，错误行高亮定位，成功行部分导入
 */
import { ChangeEvent, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { useAppStateContext } from '../context/AppStateContext'
import { useConfirm } from '../context/ConfirmContext'
import { useToast } from '../context/ToastContext'
import type { Requirement } from '../types'
import { createId } from '../utils/id'

/** Excel 导入时每行的校验错误信息 */
interface ImportRowError {
  /** 行号（从1开始，对应 Excel 数据行） */
  rowIndex: number
  /** Excel 原始行数据 */
  raw: Record<string, string | number>
  /** 错误字段描述列表 */
  errors: string[]
}

/** 导入结果汇总 */
interface ImportResult {
  /** 成功导入的需求数量 */
  successCount: number
  /** 校验失败的行信息 */
  errorRows: ImportRowError[]
}

/**
 * 校验日期字符串是否为合法的 YYYY-MM-DD 格式。
 *
 * @param {string} value 待校验字符串
 * @returns {boolean} 是否合法
 */
function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const d = new Date(value)
  return !isNaN(d.getTime())
}

/**
 * 空表单初始值工厂函数。
 *
 * @param {string} levelId 默认级别
 * @param {string} pipelineId 默认管线
 * @param {string} templateId 默认范式
 * @returns {Omit<Requirement, 'id' | 'deleted'>} 初始表单值
 */
function makeEmptyForm(
  levelId: string,
  pipelineId: string,
  templateId: string,
): Omit<Requirement, 'id' | 'deleted'> {
  return {
    requirementName: '',
    levelId,
    quantity: 1,
    expectedLaunchDate: '2026-05-20',
    pipelineId,
    templateId,
    scheduleMode: 'backward_from_ddl',
    projectDDL: '2026-05-20',
    projectStartDate: '',
  }
}

/**
 * 需求页面组件。
 *
 * @returns {JSX.Element} 需求管理视图
 */
export function RequirementsPage(): JSX.Element {
  const { state, upsertRequirement, removeRequirement, importRequirements } = useAppStateContext()
  const toast = useToast()
  const { confirm } = useConfirm()

  /** 新增表单状态 */
  const [form, setForm] = useState<Omit<Requirement, 'id' | 'deleted'>>(() =>
    makeEmptyForm(
      state.levels[0] ?? 'P2',
      state.pipelines[0]?.id ?? '',
      state.paradigms[0]?.id ?? '',
    ),
  )

  /** 当前正在编辑的需求 ID（null 表示无行内编辑激活） */
  const [editingId, setEditingId] = useState<string | null>(null)

  /** 行内编辑表单状态 */
  const [editForm, setEditForm] = useState<Omit<Requirement, 'id' | 'deleted'> | null>(null)

  /** 已删除需求是否展开显示 */
  const [showDeleted, setShowDeleted] = useState(false)

  /** 新增需求表单是否展开 */
  const [showAddForm, setShowAddForm] = useState(false)

  /** Excel 导入结果（null 表示尚未导入或已清除） */
  const [importResult, setImportResult] = useState<ImportResult | null>(null)

  /** 级别筛选（空字符串表示不筛选） */
  const [levelFilter, setLevelFilter] = useState('')

  /** 管线筛选（空字符串表示不筛选） */
  const [pipelineFilter, setPipelineFilter] = useState('')

  /** 有效需求（未删除） */
  const rows = useMemo(
    () => state.requirements.filter((item) => !item.deleted),
    [state.requirements],
  )

  /** 已删除需求（软删除可恢复） */
  const deletedRows = useMemo(
    () => state.requirements.filter((item) => item.deleted),
    [state.requirements],
  )

  /**
   * 经筛选后展示的需求列表。
   *
   * @description 在 rows 基础上叠加级别与管线筛选条件。
   */
  const filteredRows = useMemo(
    () =>
      rows.filter((item) => {
        if (levelFilter && item.levelId !== levelFilter) return false
        if (pipelineFilter && item.pipelineId !== pipelineFilter) return false
        return true
      }),
    [rows, levelFilter, pipelineFilter],
  )

  /**
   * 获取管线名称（用于表格展示）。
   *
   * @param {string} pipelineId 管线 ID
   * @returns {string} 管线名称，未命中返回 ID 原文
   */
  const getPipelineName = (pipelineId: string): string =>
    state.pipelines.find((p) => p.id === pipelineId)?.name ?? pipelineId

  /**
   * 获取范式名称（用于表格展示）。
   *
   * @param {string} templateId 范式 ID
   * @returns {string} 范式名称，未命中返回 ID 原文
   */
  const getTemplateName = (templateId: string): string =>
    state.paradigms.find((p) => p.id === templateId)?.templateName ?? templateId

  /**
   * 更新新增表单字段。
   *
   * @param {keyof Omit<Requirement, 'id' | 'deleted'>} field 字段名
   * @param {string | number} value 字段值
   * @returns {void}
   */
  const updateField = (
    field: keyof Omit<Requirement, 'id' | 'deleted'>,
    value: string | number,
  ): void => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  /**
   * 更新行内编辑表单字段。
   *
   * @param {keyof Omit<Requirement, 'id' | 'deleted'>} field 字段名
   * @param {string | number} value 字段值
   * @returns {void}
   */
  const updateEditField = (
    field: keyof Omit<Requirement, 'id' | 'deleted'>,
    value: string | number,
  ): void => {
    setEditForm((prev) => (prev ? { ...prev, [field]: value } : prev))
  }

  /**
   * 提交新增需求。
   *
   * @returns {void}
   */
  const handleAdd = (): void => {
    /**
     * 条件目的：需求名称为空时阻止提交，避免生成不可识别记录。
     */
    if (!form.requirementName.trim()) {
      toast.warning('请填写需求名称')
      return
    }

    upsertRequirement({ ...form, id: createId('req'), deleted: false })
    setForm((prev) => makeEmptyForm(prev.levelId, prev.pipelineId, prev.templateId))
    toast.success('需求已新增')
  }

  /**
   * 进入行内编辑模式。
   *
   * @param {Requirement} item 被编辑的需求
   * @returns {void}
   */
  const handleStartEdit = (item: Requirement): void => {
    setEditingId(item.id)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _id, deleted: _deleted, ...rest } = item
    setEditForm(rest)
  }

  /**
   * 保存行内编辑结果。
   *
   * @param {string} id 需求 ID
   * @returns {void}
   */
  const handleSaveEdit = (id: string): void => {
    /**
     * 条件目的：editForm 为 null（未初始化）时不保存，防止覆盖空数据。
     */
    if (!editForm) return
    upsertRequirement({ ...editForm, id, deleted: false })
    setEditingId(null)
    setEditForm(null)
    toast.success('需求已保存')
  }

  /**
   * 取消行内编辑。
   *
   * @returns {void}
   */
  const handleCancelEdit = (): void => {
    setEditingId(null)
    setEditForm(null)
  }

  /**
   * 恢复已软删除的需求。
   *
   * @param {Requirement} item 被删除的需求
   * @returns {void}
   */
  const handleRestore = (item: Requirement): void => {
    upsertRequirement({ ...item, deleted: false })
    toast.success(`需求「${item.requirementName}」已恢复`)
  }

  /**
   * 触发删除确认弹窗，用户确认后执行软删除。
   *
   * @param {Requirement} item 待删除的需求
   * @returns {void}
   */
  const handleDeleteClick = (item: Requirement): void => {
    confirm(
      {
        title: '删除需求',
        description: `确定要删除「${item.requirementName}」吗？删除后可在已删除列表中恢复。`,
        confirmLabel: '确认删除',
        danger: true,
      },
      () => {
        removeRequirement(item.id)
        toast.success(`需求「${item.requirementName}」已删除`)
      },
    )
  }

  /**
   * 导入Excel需求数据，含完整校验逻辑。
   *
   * 校验规则：
   * 1. requirementName（需求名称）必填
   * 2. expectedLaunchDate（预期交付时间）必须为合法日期（YYYY-MM-DD）
   * 3. levelId（需求级别）须在系统级别列表中
   * 4. pipelineId / 管线 须能匹配到已有管线（按名称或ID）
   *
   * @param {ChangeEvent<HTMLInputElement>} event 文件选择事件
   * @returns {Promise<void>}
   */
  const handleImportExcel = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0]
    /**
     * 条件目的：未选择文件时直接退出，避免空读。
     */
    if (!file) return

    const arrayBuffer = await file.arrayBuffer()
    const workbook = XLSX.read(arrayBuffer, { type: 'array' })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const json = XLSX.utils.sheet_to_json<Record<string, string | number>>(sheet)

    const validLevelSet = new Set(state.levels)
    /** 管线支持按名称或 ID 匹配 */
    const pipelineByName = new Map(state.pipelines.map((p) => [p.name, p.id]))
    const pipelineById = new Set(state.pipelines.map((p) => p.id))

    const imported: Requirement[] = []
    const errorRows: ImportRowError[] = []

    /**
     * 循环目的：逐行解析 Excel 数据，校验各字段合法性，
     * 有错的行收集到 errorRows，无错的行推入 imported。
     */
    for (let i = 0; i < json.length; i++) {
      const row = json[i]
      const errors: string[] = []

      /* ── 必填：需求名称 ── */
      const requirementName = `${row.requirementName ?? row['需求名称'] ?? ''}`.trim()
      if (!requirementName) {
        errors.push('需求名称（requirementName）必填')
      }

      /* ── 日期格式：预期交付时间 ── */
      const rawDate = `${row.expectedLaunchDate ?? row['预期交付时间'] ?? ''}`.trim()
      const expectedLaunchDate = rawDate || '2026-05-20'
      if (rawDate && !isValidDate(rawDate)) {
        errors.push(`预期交付时间格式非法（应为 YYYY-MM-DD，当前：${rawDate}）`)
      }

      /* ── 日期格式：项目DDL（可选，但若填写须合法） ── */
      const rawDDL = `${row.projectDDL ?? row['项目DDL'] ?? rawDate ?? ''}`.trim()
      const projectDDL = rawDDL || expectedLaunchDate
      if (rawDDL && !isValidDate(rawDDL)) {
        errors.push(`项目DDL格式非法（应为 YYYY-MM-DD，当前：${rawDDL}）`)
      }

      /* ── 下拉合法性：需求级别 ── */
      const rawLevel = `${row.levelId ?? row['需求级别'] ?? ''}`.trim()
      const levelId = rawLevel || (state.levels[0] ?? 'P2')
      if (rawLevel && !validLevelSet.has(rawLevel)) {
        errors.push(`需求级别"${rawLevel}"不在系统中（可选值：${state.levels.join('、')}）`)
      }

      /* ── 下拉合法性：管线（支持名称或ID） ── */
      const rawPipeline = `${row.pipelineId ?? row['管线'] ?? ''}`.trim()
      let pipelineId = state.pipelines[0]?.id ?? ''
      if (rawPipeline) {
        if (pipelineById.has(rawPipeline)) {
          pipelineId = rawPipeline
        } else if (pipelineByName.has(rawPipeline)) {
          pipelineId = pipelineByName.get(rawPipeline)!
        } else {
          errors.push(
            `管线"${rawPipeline}"不存在（可选值：${state.pipelines.map((p) => p.name).join('、')}）`,
          )
        }
      }

      /* ── 范式模板（宽松处理，未命中使用默认值） ── */
      const rawTemplate = `${row.templateId ?? row['范式模板'] ?? ''}`.trim()
      const templateId =
        state.paradigms.find((p) => p.id === rawTemplate || p.templateName === rawTemplate)?.id ??
        state.paradigms[0]?.id ??
        ''

      if (errors.length > 0) {
        /** 校验失败：记录错误行，不入库 */
        errorRows.push({ rowIndex: i + 1, raw: row, errors })
      } else {
        /** 校验通过：推入待导入列表 */
        imported.push({
          id: createId('req'),
          requirementName,
          levelId,
          quantity: Number(row.quantity ?? row['数量'] ?? 1),
          expectedLaunchDate,
          pipelineId,
          templateId,
          scheduleMode: 'backward_from_ddl',
          projectDDL,
          projectStartDate: '',
          deleted: false,
        })
      }
    }

    /**
     * 条件目的：有合法行时执行批量导入，允许部分成功（错误行跳过）。
     */
    if (imported.length > 0) {
      importRequirements(imported)
    }

    setImportResult({ successCount: imported.length, errorRows })
    event.target.value = ''

    if (imported.length > 0 && errorRows.length === 0) {
      toast.success(`成功导入 ${imported.length} 条需求`)
    } else if (imported.length > 0) {
      toast.warning(`导入完成：${imported.length} 条成功，${errorRows.length} 行有误`)
    } else {
      toast.error(`导入失败：所有 ${errorRows.length} 行均校验不通过`)
    }
  }

  /**
   * 渲染单行需求的行内编辑表单。
   *
   * @param {Requirement} item 原始需求数据
   * @returns {JSX.Element} 编辑行 JSX
   */
  const renderEditRow = (item: Requirement): JSX.Element => {
    if (!editForm) return <tr key={item.id} />
    return (
      <tr key={item.id} className="req-edit-row">
        <td colSpan={6}>
          <div className="req-inline-form">
            {/* 需求名称 */}
            <label className="field">
              <span>需求名称</span>
              <input
                value={editForm.requirementName}
                onChange={(e) => updateEditField('requirementName', e.target.value)}
              />
            </label>
            {/* 需求级别 */}
            <label className="field">
              <span>需求级别</span>
              <select
                value={editForm.levelId}
                onChange={(e) => updateEditField('levelId', e.target.value)}
              >
                {state.levels.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            {/* 数量 */}
            <label className="field">
              <span>数量</span>
              <input
                type="number"
                min={1}
                value={editForm.quantity}
                onChange={(e) => updateEditField('quantity', Number(e.target.value))}
              />
            </label>
            {/* 预期交付时间 */}
            <label className="field">
              <span>预期交付时间</span>
              <input
                type="date"
                value={editForm.expectedLaunchDate}
                onChange={(e) => updateEditField('expectedLaunchDate', e.target.value)}
              />
            </label>
            {/* 管线 */}
            <label className="field">
              <span>管线</span>
              <select
                value={editForm.pipelineId}
                onChange={(e) => updateEditField('pipelineId', e.target.value)}
              >
                {state.pipelines.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            {/* 范式模板 */}
            <label className="field">
              <span>范式模板</span>
              <select
                value={editForm.templateId}
                onChange={(e) => updateEditField('templateId', e.target.value)}
              >
                {state.paradigms.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.templateName}
                  </option>
                ))}
              </select>
            </label>
            {/* 排期方式 */}
            <label className="field">
              <span>排期方式</span>
              <select
                value={editForm.scheduleMode}
                onChange={(e) =>
                  updateEditField(
                    'scheduleMode',
                    e.target.value as 'backward_from_ddl' | 'forward_from_start',
                  )
                }
              >
                <option value="backward_from_ddl">输入项目DDL倒推</option>
                <option value="forward_from_start">输入开始时间正推</option>
              </select>
            </label>
            {/* 条件字段：DDL 或开始时间 */}
            {editForm.scheduleMode === 'backward_from_ddl' ? (
              <label className="field">
                <span>项目DDL</span>
                <input
                  type="date"
                  value={editForm.projectDDL ?? ''}
                  onChange={(e) => updateEditField('projectDDL', e.target.value)}
                />
              </label>
            ) : (
              <label className="field">
                <span>项目开始时间</span>
                <input
                  type="date"
                  value={editForm.projectStartDate ?? ''}
                  onChange={(e) => updateEditField('projectStartDate', e.target.value)}
                />
              </label>
            )}
            {/* 操作按钮 */}
            <div className="req-inline-actions">
              <button className="primary-btn" type="button" onClick={() => handleSaveEdit(item.id)}>
                保存
              </button>
              <button className="ghost-btn" type="button" onClick={handleCancelEdit}>
                取消
              </button>
            </div>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <section className="req-page">
      {/* ── 左侧 Toolbar ── */}
      <aside className="req-sidebar card">
        <div className="req-sidebar-inner">
          {/* 操作入口 */}
          <div className="req-sidebar-section">
            <button className="primary-btn" type="button" onClick={() => setShowAddForm((v) => !v)}>
              {showAddForm ? '收起表单' : '+ 新增需求'}
            </button>
            <label className="file-btn">
              ↑ 批量导入Excel
              <input type="file" accept=".xlsx,.xls" onChange={handleImportExcel} />
            </label>
          </div>

          {/* 筛选区 */}
          <div className="req-sidebar-section">
            <div className="req-sidebar-divider">筛选</div>
            <div className="field">
              <span className="field-label">需求级别</span>
              <select
                className="req-filter-select"
                value={levelFilter}
                onChange={(e) => setLevelFilter(e.target.value)}
              >
                <option value="">全部级别</option>
                {state.levels.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <span className="field-label">管线</span>
              <select
                className="req-filter-select"
                value={pipelineFilter}
                onChange={(e) => setPipelineFilter(e.target.value)}
              >
                <option value="">全部管线</option>
                {state.pipelines.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </aside>

      {/* ── 右侧内容区 ── */}
      <div className="req-content">
        {/* 新增需求表单（可折叠） */}
        {showAddForm && (
          <div className="card">
            <h2>新增需求</h2>
            <div className="field-grid">
              <label className="field">
                <span>需求名称</span>
                <input
                  value={form.requirementName}
                  onChange={(event) => updateField('requirementName', event.target.value)}
                />
              </label>
              <label className="field">
                <span>需求级别</span>
                <select
                  value={form.levelId}
                  onChange={(event) => updateField('levelId', event.target.value)}
                >
                  {state.levels.map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>数量</span>
                <input
                  type="number"
                  min={1}
                  value={form.quantity}
                  onChange={(event) => updateField('quantity', Number(event.target.value))}
                />
              </label>
              <label className="field">
                <span>预期交付时间</span>
                <input
                  type="date"
                  value={form.expectedLaunchDate}
                  onChange={(event) => updateField('expectedLaunchDate', event.target.value)}
                />
              </label>
              <label className="field">
                <span>管线</span>
                <select
                  value={form.pipelineId}
                  onChange={(event) => updateField('pipelineId', event.target.value)}
                >
                  {state.pipelines.map((pipeline) => (
                    <option key={pipeline.id} value={pipeline.id}>
                      {pipeline.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>范式模板</span>
                <select
                  value={form.templateId}
                  onChange={(event) => updateField('templateId', event.target.value)}
                >
                  {state.paradigms.map((paradigm) => (
                    <option key={paradigm.id} value={paradigm.id}>
                      {paradigm.templateName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>排期方式</span>
                <select
                  value={form.scheduleMode}
                  onChange={(event) => updateField('scheduleMode', event.target.value)}
                >
                  <option value="backward_from_ddl">输入项目DDL倒推</option>
                  <option value="forward_from_start">输入开始时间正推</option>
                </select>
              </label>
              {form.scheduleMode === 'backward_from_ddl' ? (
                <label className="field">
                  <span>项目DDL</span>
                  <input
                    type="date"
                    value={form.projectDDL}
                    onChange={(event) => updateField('projectDDL', event.target.value)}
                  />
                </label>
              ) : (
                <label className="field">
                  <span>项目开始时间</span>
                  <input
                    type="date"
                    value={form.projectStartDate}
                    onChange={(event) => updateField('projectStartDate', event.target.value)}
                  />
                </label>
              )}
            </div>
            <div className="row-gap">
              <button className="primary-btn" type="button" onClick={handleAdd}>
                新增需求
              </button>
              <button className="ghost-btn" type="button" onClick={() => setShowAddForm(false)}>
                取消
              </button>
            </div>
          </div>
        )}

        {/* Excel 导入结果面板 */}
        {importResult && (
          <div className="card import-result">
            <div className="import-result__header row-between">
              <h3>
                导入结果：成功 {importResult.successCount} 条
                {importResult.errorRows.length > 0 && (
                  <span className="import-result__error-count">
                    ，{importResult.errorRows.length} 行校验失败
                  </span>
                )}
              </h3>
              <button className="ghost-btn" type="button" onClick={() => setImportResult(null)}>
                关闭
              </button>
            </div>
            {importResult.errorRows.length > 0 && (
              <table className="data-table import-error-table">
                <thead>
                  <tr>
                    <th>行号</th>
                    <th>原始需求名称</th>
                    <th>错误原因</th>
                  </tr>
                </thead>
                <tbody>
                  {importResult.errorRows.map((errRow) => (
                    <tr key={errRow.rowIndex} className="import-error-row">
                      <td>第 {errRow.rowIndex} 行</td>
                      <td>{`${errRow.raw.requirementName ?? errRow.raw['需求名称'] ?? '（空）'}`}</td>
                      <td>
                        <ul className="import-error-list">
                          {errRow.errors.map((msg, idx) => (
                            <li key={idx}>{msg}</li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* 需求列表 */}
        <div className="card">
          <div className="row-between" style={{ marginBottom: 12 }}>
            <h2 style={{ margin: 0 }}>需求列表</h2>
            {(levelFilter || pipelineFilter) && (
              <button
                className="ghost-btn"
                type="button"
                style={{ fontSize: 12 }}
                onClick={() => {
                  setLevelFilter('')
                  setPipelineFilter('')
                }}
              >
                清除筛选
              </button>
            )}
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th className="req-col-name">需求名称</th>
                <th className="req-col-level">级别</th>
                <th className="req-col-qty">数量</th>
                <th className="req-col-date">预期交付时间</th>
                <th className="req-col-pipeline">管线</th>
                <th className="req-col-actions">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((item) => {
                /** 条件目的：当前行处于编辑状态时，渲染行内编辑表单而非只读行。 */
                if (editingId === item.id) {
                  return renderEditRow(item)
                }
                return (
                  <tr key={item.id}>
                    <td className="req-col-name">{item.requirementName}</td>
                    <td className="req-col-level">{item.levelId}</td>
                    <td className="req-col-qty">{item.quantity}</td>
                    <td className="req-col-date">{item.expectedLaunchDate}</td>
                    <td className="req-col-pipeline">{getPipelineName(item.pipelineId)}</td>
                    <td className="req-col-actions">
                      <div className="row-gap">
                        <button
                          className="ghost-btn"
                          type="button"
                          onClick={() => handleStartEdit(item)}
                        >
                          编辑
                        </button>
                        <button
                          className="danger-btn"
                          type="button"
                          onClick={() => handleDeleteClick(item)}
                        >
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>
                    {rows.length === 0 ? '暂无需求，请新增或导入' : '无符合筛选条件的需求'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {/* 底部汇总 */}
          <div className="req-table-footer">
            共 {rows.length} 条
            {(levelFilter || pipelineFilter) && `，当前筛选显示 ${filteredRows.length} 条`}
          </div>
        </div>

        {/* 已删除需求（可恢复） */}
        {deletedRows.length > 0 && (
          <div className="card">
            <button
              className="deleted-toggle"
              type="button"
              onClick={() => setShowDeleted((v) => !v)}
            >
              {showDeleted ? '▲' : '▼'} 已删除需求（{deletedRows.length} 条，可恢复）
            </button>
            {showDeleted && (
              <table className="data-table" style={{ marginTop: 10 }}>
                <thead>
                  <tr>
                    <th className="req-col-name">需求名称</th>
                    <th className="req-col-level">级别</th>
                    <th className="req-col-qty">数量</th>
                    <th className="req-col-date">预期交付时间</th>
                    <th className="req-col-pipeline">管线 / 模板</th>
                    <th className="req-col-actions">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {deletedRows.map((item) => (
                    <tr key={item.id} className="req-deleted-row">
                      <td>{item.requirementName}</td>
                      <td>{item.levelId}</td>
                      <td>{item.quantity}</td>
                      <td>{item.expectedLaunchDate}</td>
                      <td>
                        {getPipelineName(item.pipelineId)} / {getTemplateName(item.templateId)}
                      </td>
                      <td>
                        <button
                          className="primary-btn"
                          type="button"
                          onClick={() => handleRestore(item)}
                        >
                          恢复
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

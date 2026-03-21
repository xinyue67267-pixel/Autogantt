/**
 * 需求管理页面。
 *
 * @description
 * - 支持手动新增、逻辑删除
 * - 支持Excel批量导入
 */
import { ChangeEvent, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { useAppStateContext } from '../context/AppStateContext'
import type { Requirement } from '../types'
import { createId } from '../utils/id'

/**
 * 需求页面组件。
 *
 * @returns {JSX.Element} 需求管理视图
 */
export function RequirementsPage(): JSX.Element {
  const { state, upsertRequirement, removeRequirement, importRequirements } = useAppStateContext()
  const [form, setForm] = useState<Omit<Requirement, 'id' | 'deleted'>>({
    requirementName: '',
    levelId: state.levels[0] ?? 'P2',
    quantity: 1,
    expectedLaunchDate: '2026-05-20',
    pipelineId: state.pipelines[0]?.id ?? '',
    templateId: state.paradigms[0]?.id ?? '',
    scheduleMode: 'backward_from_ddl',
    projectDDL: '2026-05-20',
    projectStartDate: '',
  })

  const rows = useMemo(
    () => state.requirements.filter((item) => !item.deleted),
    [state.requirements],
  )

  /**
   * 更新表单字段。
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
   * 提交新增需求。
   *
   * @returns {void}
   */
  const handleAdd = (): void => {
    /**
     * 条件目的：需求名称为空时阻止提交，避免生成不可识别记录。
     */
    if (!form.requirementName.trim()) {
      return
    }
    upsertRequirement({
      ...form,
      id: createId('req'),
      deleted: false,
    })
    setForm((prev) => ({ ...prev, requirementName: '' }))
  }

  /**
   * 导入Excel需求数据。
   *
   * @param {ChangeEvent<HTMLInputElement>} event 文件选择事件
   * @returns {void}
   */
  const handleImportExcel = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0]

    /**
     * 条件目的：未选择文件时直接退出，避免空读。
     */
    if (!file) {
      return
    }

    const arrayBuffer = await file.arrayBuffer()
    const workbook = XLSX.read(arrayBuffer, { type: 'array' })
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]
    const json = XLSX.utils.sheet_to_json<Record<string, string | number>>(sheet)
    const imported: Requirement[] = []

    /**
     * 循环目的：将Excel行映射为Requirement对象并做最小字段校验。
     */
    for (const row of json) {
      const requirementName = `${row.requirementName ?? row['需求名称'] ?? ''}`.trim()
      /**
       * 条件目的：缺少需求名称时跳过该行，避免脏数据入库。
       */
      if (!requirementName) {
        continue
      }
      imported.push({
        id: createId('req'),
        requirementName,
        levelId: `${row.levelId ?? row['需求级别'] ?? state.levels[0] ?? 'P2'}`,
        quantity: Number(row.quantity ?? row['数量'] ?? 1),
        expectedLaunchDate: `${row.expectedLaunchDate ?? row['预期交付时间'] ?? '2026-05-20'}`,
        pipelineId: `${row.pipelineId ?? row['管线'] ?? state.pipelines[0]?.id ?? ''}`,
        templateId: `${row.templateId ?? row['范式模板'] ?? state.paradigms[0]?.id ?? ''}`,
        scheduleMode: 'backward_from_ddl',
        projectDDL: `${row.projectDDL ?? row['项目DDL'] ?? row.expectedLaunchDate ?? '2026-05-20'}`,
        projectStartDate: '',
        deleted: false,
      })
    }

    importRequirements(imported)
    event.target.value = ''
  }

  return (
    <section className="grid-two">
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
          <label className="file-btn">
            批量导入Excel
            <input type="file" accept=".xlsx,.xls" onChange={handleImportExcel} />
          </label>
        </div>
      </div>

      <div className="card">
        <h2>需求列表</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>需求名称</th>
              <th>级别</th>
              <th>数量</th>
              <th>预期交付时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.id}>
                <td>{item.requirementName}</td>
                <td>{item.levelId}</td>
                <td>{item.quantity}</td>
                <td>{item.expectedLaunchDate}</td>
                <td>
                  <button
                    className="danger-btn"
                    type="button"
                    onClick={() => removeRequirement(item.id)}
                  >
                    删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

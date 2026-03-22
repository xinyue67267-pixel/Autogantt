/**
 * 开发范式页面。
 *
 * @description
 * - 支持模板分类新增/删除
 * - 支持环节增删、isMilestone 勾选
 * - 支持多前置依赖配置（preStageId 选择、relation、trigger、value 数值输入）
 * - 支持下载 Excel 模板并批量导入范式
 */
import { ChangeEvent, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { useAppStateContext } from '../context/AppStateContext'
import { useConfirm } from '../context/ConfirmContext'
import { useToast } from '../context/ToastContext'
import type {
  DependencyRelation,
  DependencyTrigger,
  ParadigmTemplate,
  StageDependencyRule,
  StageTemplate,
} from '../types'
import { createId } from '../utils/id'

/**
 * 创建默认环节对象。
 *
 * @returns {StageTemplate} 默认环节
 */
function createDefaultStage(): StageTemplate {
  return {
    id: createId('stage'),
    stageName: '新环节',
    stageCategory: '开发',
    referencePersonDays: 1,
    isMilestone: false,
    dependencies: [],
  }
}

/**
 * 创建默认依赖规则。
 *
 * @param {string} preStageId 前置环节 ID
 * @returns {StageDependencyRule} 默认依赖规则
 */
function createDefaultDependency(preStageId: string): StageDependencyRule {
  return {
    preStageId,
    relation: 'FS',
    trigger: 'finish_100',
  }
}

/**
 * 判断 trigger 类型是否需要填写 value 数值。
 *
 * @param {DependencyTrigger} trigger 触发类型
 * @returns {boolean} 是否需要 value 输入
 */
function triggerNeedsValue(trigger: DependencyTrigger): boolean {
  return (
    trigger === 'finish_percent' ||
    trigger === 'finish_offset_days' ||
    trigger === 'start_offset_days'
  )
}

/**
 * 获取 trigger 对应的默认 value 值。
 *
 * @param {DependencyTrigger} trigger 触发类型
 * @returns {number} 默认值
 */
function defaultValueForTrigger(trigger: DependencyTrigger): number {
  /** finish_percent 默认50%，offset 类默认1天 */
  return trigger === 'finish_percent' ? 50 : 1
}

/** Excel 导入时每个范式的校验错误信息 */
interface ParadigmImportError {
  /** 范式名称 */
  paradigmName: string
  /** 首个错误的原始行号（从2开始，含表头行） */
  firstRowIndex: number
  /** 错误原因 */
  reason: string
}

/** 范式批量导入结果 */
interface ParadigmImportResult {
  /** 成功创建的范式数量 */
  successCount: number
  /** 校验失败的范式信息 */
  errors: ParadigmImportError[]
}

/**
 * 下载范式 Excel 模板（A-I 列，含表头和示例行）。
 *
 * @returns {void}
 */
function downloadParadigmTemplate(): void {
  const headers = [
    '范式名称',
    '环节名称',
    '参考人天',
    '前置依赖环节',
    '依赖偏移天数',
    '依赖关系类型',
    '触发方式',
    '里程碑',
    '模板分类',
  ]
  const example = ['通用生产项目范式', '需求设计', 3, '', '', 'FS', 'finish_100', '否', '通用']
  const example2 = [
    '通用生产项目范式',
    '开发实现',
    5,
    '需求设计',
    '',
    'FS',
    'finish_100',
    '否',
    '通用',
  ]
  const ws = XLSX.utils.aoa_to_sheet([headers, example, example2])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '范式模板')
  XLSX.writeFile(wb, '范式模板导入模板.xlsx')
}

/**
 * 开发范式页组件。
 *
 * @returns {JSX.Element} 开发范式页
 */
export function ParadigmPage(): JSX.Element {
  const { state, addCategory, removeCategory, upsertParadigm, removeParadigm, importParadigms } =
    useAppStateContext()
  const toast = useToast()
  const { confirm } = useConfirm()
  const [newCategory, setNewCategory] = useState('')
  const [activeTemplateId, setActiveTemplateId] = useState(state.paradigms[0]?.id ?? '')
  /** Excel 批量导入结果（null 表示尚未导入） */
  const [importResult, setImportResult] = useState<ParadigmImportResult | null>(null)

  const activeTemplate = useMemo(
    () => state.paradigms.find((item) => item.id === activeTemplateId) ?? null,
    [activeTemplateId, state.paradigms],
  )

  /**
   * 新建模板。
   *
   * @returns {void}
   */
  const handleAddTemplate = (): void => {
    const template: ParadigmTemplate = {
      id: createId('tpl'),
      templateName: '新范式模板',
      categoryId: state.categories[0] ?? '通用',
      stageTemplates: [createDefaultStage()],
    }
    upsertParadigm(template)
    setActiveTemplateId(template.id)
  }

  /**
   * 更新当前模板并保存。
   *
   * @param {(value: ParadigmTemplate) => ParadigmTemplate} updater 更新函数
   * @returns {void}
   */
  const updateActiveTemplate = (updater: (value: ParadigmTemplate) => ParadigmTemplate): void => {
    /** 条件目的：无选中模板时不执行更新，避免空引用异常。 */
    if (!activeTemplate) {
      return
    }
    upsertParadigm(updater(activeTemplate))
  }

  /**
   * 更新指定环节的某个字段。
   *
   * @param {string} stageId 环节 ID
   * @param {Partial<StageTemplate>} patch 要更新的字段
   * @returns {void}
   */
  const updateStageField = (stageId: string, patch: Partial<StageTemplate>): void => {
    updateActiveTemplate((template) => ({
      ...template,
      stageTemplates: template.stageTemplates.map((item) =>
        item.id === stageId ? { ...item, ...patch } : item,
      ),
    }))
  }

  /**
   * 添加一条新的前置依赖到指定环节。
   *
   * @param {string} stageId 目标环节 ID
   * @param {string[]} availablePreIds 当前可选前置环节 ID 列表
   * @returns {void}
   */
  const handleAddDependency = (stageId: string, availablePreIds: string[]): void => {
    /** 条件目的：如果没有可选前置环节则不添加，避免无效依赖。 */
    if (availablePreIds.length === 0) return
    updateActiveTemplate((template) => ({
      ...template,
      stageTemplates: template.stageTemplates.map((item) => {
        if (item.id !== stageId) return item
        const firstUnused = availablePreIds.find(
          (pid) => !item.dependencies.some((d) => d.preStageId === pid),
        )
        /** 条件目的：所有可选前置均已被配置为依赖，避免重复添加。 */
        if (!firstUnused) return item
        return {
          ...item,
          dependencies: [...item.dependencies, createDefaultDependency(firstUnused)],
        }
      }),
    }))
  }

  /**
   * 删除指定环节的某条依赖。
   *
   * @param {string} stageId 环节 ID
   * @param {number} depIndex 依赖规则索引
   * @returns {void}
   */
  const handleRemoveDependency = (stageId: string, depIndex: number): void => {
    updateActiveTemplate((template) => ({
      ...template,
      stageTemplates: template.stageTemplates.map((item) =>
        item.id === stageId
          ? {
              ...item,
              dependencies: item.dependencies.filter((_, idx) => idx !== depIndex),
            }
          : item,
      ),
    }))
  }

  /**
   * 更新指定环节某条依赖规则的字段。
   *
   * @param {string} stageId 环节 ID
   * @param {number} depIndex 依赖规则索引
   * @param {Partial<StageDependencyRule>} patch 要更新的字段
   * @returns {void}
   */
  const updateDependencyField = (
    stageId: string,
    depIndex: number,
    patch: Partial<StageDependencyRule>,
  ): void => {
    updateActiveTemplate((template) => ({
      ...template,
      stageTemplates: template.stageTemplates.map((item) => {
        if (item.id !== stageId) return item
        const newDeps = item.dependencies.map((dep, idx) =>
          idx === depIndex ? { ...dep, ...patch } : dep,
        )
        return { ...item, dependencies: newDeps }
      }),
    }))
  }

  /**
   * 添加分类。
   *
   * @returns {void}
   */
  const handleAddCategory = (): void => {
    addCategory(newCategory.trim())
    setNewCategory('')
  }

  /**
   * 解析并批量导入范式 Excel 文件。
   *
   * 列结构：A=范式名称 B=环节名称 C=参考人天 D=前置依赖环节 E=依赖偏移天数
   *         F=依赖关系类型 G=触发方式 H=里程碑 I=模板分类
   *
   * @param {ChangeEvent<HTMLInputElement>} event 文件选择事件
   * @returns {void}
   */
  const handleImportParadigmExcel = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0]
    /** 条件目的：未选择文件时直接退出，避免空读。 */
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      const arrayBuffer = e.target?.result
      if (!arrayBuffer) return
      const workbook = XLSX.read(arrayBuffer, { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      /** 按列字母读取，header:"A" 模式确保列名固定 */
      const rows = XLSX.utils.sheet_to_json<Record<string, string | number>>(sheet, {
        header: 'A',
        defval: '',
      })
      /** 跳过第一行表头 */
      const dataRows = rows.slice(1)

      /**
       * 按 A 列（范式名称）分组，同名的连续行合并为一个范式。
       * key = 范式名称，value = 原始行列表（含行号，从2开始）
       */
      const groups = new Map<
        string,
        Array<{ row: Record<string, string | number>; lineNo: number }>
      >()
      dataRows.forEach((row, idx) => {
        const name = `${row['A'] ?? ''}`.trim()
        if (!name) return
        if (!groups.has(name)) groups.set(name, [])
        groups.get(name)!.push({ row, lineNo: idx + 2 })
      })

      const imported: ParadigmTemplate[] = []
      const errors: ParadigmImportError[] = []

      /**
       * 循环目的：逐范式校验并构建模板对象，失败的范式整体跳过。
       */
      for (const [paradigmName, groupRows] of groups) {
        const firstLineNo = groupRows[0].lineNo
        const stageNames = new Set<string>()
        const stageList: StageTemplate[] = []
        let failed = false
        let failReason = ''

        for (const { row, lineNo } of groupRows) {
          /* ── B列：环节名称必填 ── */
          const stageName = `${row['B'] ?? ''}`.trim()
          if (!stageName) {
            failed = true
            failReason = `第${lineNo}行：环节名称（B列）为空`
            break
          }

          /* ── B列：同一范式内环节名称不可重复 ── */
          if (stageNames.has(stageName)) {
            failed = true
            failReason = `第${lineNo}行：环节名称「${stageName}」在同一范式内重复`
            break
          }
          stageNames.add(stageName)

          /* ── C列：参考人天必须为正整数 ── */
          const personDaysRaw = Number(row['C'])
          if (!Number.isInteger(personDaysRaw) || personDaysRaw < 1) {
            failed = true
            failReason = `第${lineNo}行：参考人天（C列）「${row['C']}」不是正整数`
            break
          }

          /* ── H列：里程碑 ── */
          const isMilestone = `${row['H'] ?? ''}`.trim() === '是'

          /* ── I列：模板分类 ── */
          const categoryRaw = `${row['I'] ?? ''}`.trim() || '通用'

          stageList.push({
            id: createId('stage'),
            stageName,
            stageCategory: categoryRaw,
            referencePersonDays: personDaysRaw,
            isMilestone,
            dependencies: [],
          })
        }

        if (failed) {
          errors.push({ paradigmName, firstRowIndex: firstLineNo, reason: failReason })
          continue
        }

        /**
         * 第二遍：解析 D 列依赖（名称 → ID）。
         * 此时 stageList 已完整，可以按名称查找。
         */
        const stageByName = new Map(stageList.map((s) => [s.stageName, s.id]))
        let depFailed = false
        let depFailReason = ''

        for (let i = 0; i < stageList.length; i++) {
          const { row, lineNo } = groupRows[i]
          const depNamesRaw = `${row['D'] ?? ''}`.trim()
          if (!depNamesRaw) continue

          const depNames = depNamesRaw
            .split(',')
            .map((n) => n.trim())
            .filter(Boolean)
          const deps: StageDependencyRule[] = []

          for (const depName of depNames) {
            const preId = stageByName.get(depName)
            if (!preId) {
              depFailed = true
              depFailReason = `第${lineNo}行：依赖环节「${depName}」在同一范式内找不到`
              break
            }
            /* ── E列：偏移天数 ── */
            const offsetRaw = `${row['E'] ?? ''}`.trim()
            const offsetDays = offsetRaw ? Number(offsetRaw) : 0

            /* ── F列：关系类型（默认 FS） ── */
            const relationRaw = `${row['F'] ?? ''}`.trim().toUpperCase()
            const relation: DependencyRelation = relationRaw === 'SS' ? 'SS' : 'FS'

            /* ── G列：触发方式（默认 finish_100） ── */
            const triggerRaw = `${row['G'] ?? ''}`.trim()
            const validTriggers: DependencyTrigger[] = [
              'finish_100',
              'finish_percent',
              'finish_offset_days',
              'start_offset_days',
            ]
            const trigger: DependencyTrigger = validTriggers.includes(
              triggerRaw as DependencyTrigger,
            )
              ? (triggerRaw as DependencyTrigger)
              : 'finish_100'

            const dep: StageDependencyRule = { preStageId: preId, relation, trigger }
            if (triggerNeedsValue(trigger)) {
              dep.value = offsetDays || (trigger === 'finish_percent' ? 50 : 1)
            }
            deps.push(dep)
          }

          if (depFailed) break
          stageList[i] = { ...stageList[i], dependencies: deps }
        }

        if (depFailed) {
          errors.push({ paradigmName, firstRowIndex: firstLineNo, reason: depFailReason })
          continue
        }

        /* ── I列：模板分类（用第一行的值作为范式分类） ── */
        const firstRow = groupRows[0].row
        const categoryId = (`${firstRow['I'] ?? ''}`.trim() || state.categories[0]) ?? '通用'

        imported.push({
          id: createId('tpl'),
          templateName: paradigmName,
          categoryId,
          stageTemplates: stageList,
        })
      }

      /** 条件目的：有合法范式时执行批量导入。 */
      if (imported.length > 0) {
        importParadigms(imported)
        /** 选中第一个新导入的范式 */
        setActiveTemplateId(imported[0].id)
      }

      setImportResult({ successCount: imported.length, errors })

      if (imported.length > 0 && errors.length === 0) {
        toast.success(`成功导入 ${imported.length} 个范式`)
      } else if (imported.length > 0) {
        toast.warning(`导入完成：${imported.length} 个成功，${errors.length} 个失败`)
      } else {
        toast.error(`导入失败：所有范式均校验不通过`)
      }
    }
    reader.readAsArrayBuffer(file)
    event.target.value = ''
  }

  return (
    <section className="grid-two">
      {/* 左侧：分类管理 + 模板列表 */}
      <div className="card">
        <h2>模板分类</h2>
        <div className="inline-form">
          <input
            value={newCategory}
            placeholder="新增分类"
            onChange={(event) => setNewCategory(event.target.value)}
          />
          <button className="primary-btn" type="button" onClick={handleAddCategory}>
            添加
          </button>
        </div>
        <div className="chip-wrap">
          {state.categories.map((item) => (
            <button key={item} className="chip" type="button" onClick={() => removeCategory(item)}>
              {item} ×
            </button>
          ))}
        </div>
        <hr />
        <div className="row-between">
          <h2>范式模板</h2>
          <button className="primary-btn" type="button" onClick={handleAddTemplate}>
            新建模板
          </button>
        </div>
        <ul className="menu-list">
          {state.paradigms.map((item) => (
            <li key={item.id}>
              <button
                className={`menu-item ${item.id === activeTemplateId ? 'active' : ''}`}
                type="button"
                onClick={() => setActiveTemplateId(item.id)}
              >
                {item.templateName}
              </button>
            </li>
          ))}
        </ul>
        {/* 下载模板 + 批量导入 */}
        <div className="row-gap" style={{ marginTop: 12 }}>
          <button className="ghost-btn" type="button" onClick={downloadParadigmTemplate}>
            ↓ 下载Excel模板
          </button>
          <label className="file-btn">
            ↑ 批量导入Excel
            <input type="file" accept=".xlsx,.xls" onChange={handleImportParadigmExcel} />
          </label>
        </div>

        {/* 导入结果面板 */}
        {importResult && (
          <div className="card import-result" style={{ marginTop: 12 }}>
            <div className="import-result__header row-between">
              <h3>
                导入结果：成功 {importResult.successCount} 个范式
                {importResult.errors.length > 0 && (
                  <span className="import-result__error-count">
                    ，{importResult.errors.length} 个失败
                  </span>
                )}
              </h3>
              <button className="ghost-btn" type="button" onClick={() => setImportResult(null)}>
                关闭
              </button>
            </div>
            {importResult.errors.length > 0 && (
              <ul className="import-error-list" style={{ marginTop: 8 }}>
                {importResult.errors.map((err) => (
                  <li key={err.paradigmName}>
                    行{err.firstRowIndex} · 范式「{err.paradigmName}」· 原因：{err.reason}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* 右侧：模板编辑器 */}
      <div className="card">
        {!activeTemplate ? (
          <p>请先新建或选择一个范式模板。</p>
        ) : (
          <>
            <h2>范式编辑</h2>
            <div className="field-grid">
              <label className="field">
                <span>模板名称</span>
                <input
                  value={activeTemplate.templateName}
                  onChange={(event) =>
                    updateActiveTemplate((template) => ({
                      ...template,
                      templateName: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="field">
                <span>模板分类</span>
                <select
                  value={activeTemplate.categoryId}
                  onChange={(event) =>
                    updateActiveTemplate((template) => ({
                      ...template,
                      categoryId: event.target.value,
                    }))
                  }
                >
                  {state.categories.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="row-between">
              <h3>环节列表</h3>
              <div className="row-gap">
                <button
                  className="primary-btn"
                  type="button"
                  onClick={() =>
                    updateActiveTemplate((template) => ({
                      ...template,
                      stageTemplates: [...template.stageTemplates, createDefaultStage()],
                    }))
                  }
                >
                  添加环节
                </button>
                <button
                  className="danger-btn"
                  type="button"
                  onClick={() =>
                    confirm(
                      {
                        title: '删除范式模板',
                        description: `确定要删除「${activeTemplate.templateName}」吗？此操作不可恢复。`,
                        confirmLabel: '确认删除',
                        danger: true,
                      },
                      () => {
                        removeParadigm(activeTemplate.id)
                        setActiveTemplateId(
                          state.paradigms.find((p) => p.id !== activeTemplate.id)?.id ?? '',
                        )
                        toast.success(`范式「${activeTemplate.templateName}」已删除`)
                      },
                    )
                  }
                >
                  删除模板
                </button>
              </div>
            </div>

            <div className="stage-list">
              {activeTemplate.stageTemplates.map((stage, stageIndex) => {
                /**
                 * 计算当前环节可选的前置环节列表：
                 * 排除自身及自身之后的环节，避免循环依赖。
                 */
                const availablePreStages = activeTemplate.stageTemplates.slice(0, stageIndex)

                return (
                  <article key={stage.id} className="stage-card">
                    {/* 环节标题行 */}
                    <div className="row-between">
                      <strong>环节 {stageIndex + 1}</strong>
                      <button
                        className="danger-btn"
                        type="button"
                        onClick={() =>
                          updateActiveTemplate((template) => ({
                            ...template,
                            stageTemplates: template.stageTemplates.filter(
                              (item) => item.id !== stage.id,
                            ),
                          }))
                        }
                      >
                        删除
                      </button>
                    </div>

                    {/* 基本字段：名称、分类、人天、里程碑 */}
                    <div className="field-grid">
                      <label className="field">
                        <span>环节名称</span>
                        <input
                          value={stage.stageName}
                          onChange={(event) =>
                            updateStageField(stage.id, { stageName: event.target.value })
                          }
                        />
                      </label>
                      <label className="field">
                        <span>环节分类</span>
                        <input
                          value={stage.stageCategory}
                          onChange={(event) =>
                            updateStageField(stage.id, { stageCategory: event.target.value })
                          }
                        />
                      </label>
                      <label className="field">
                        <span>参考人天</span>
                        <input
                          type="number"
                          min={1}
                          value={stage.referencePersonDays}
                          onChange={(event) =>
                            updateStageField(stage.id, {
                              referencePersonDays: Number(event.target.value),
                            })
                          }
                        />
                      </label>
                      {/* isMilestone 里程碑勾选框 */}
                      <label className="field field--checkbox">
                        <input
                          type="checkbox"
                          checked={stage.isMilestone}
                          onChange={(event) =>
                            updateStageField(stage.id, { isMilestone: event.target.checked })
                          }
                        />
                        <span>里程碑节点（DDL）</span>
                      </label>
                    </div>

                    {/* 前置依赖配置区 */}
                    <div className="dep-section">
                      <div className="row-between dep-section__header">
                        <span className="dep-section__title">前置依赖</span>
                        {/* 条件：只有当前环节前面有其他环节时才能添加依赖 */}
                        {availablePreStages.length > 0 && (
                          <button
                            className="ghost-btn"
                            type="button"
                            onClick={() =>
                              handleAddDependency(
                                stage.id,
                                availablePreStages.map((s) => s.id),
                              )
                            }
                          >
                            + 添加依赖
                          </button>
                        )}
                      </div>

                      {/* 无依赖时的提示 */}
                      {stage.dependencies.length === 0 && (
                        <p className="dep-empty">
                          {stageIndex === 0 ? '第一个环节无前置依赖' : '暂无依赖，点击右侧添加'}
                        </p>
                      )}

                      {/* 依赖规则列表 */}
                      {stage.dependencies.map((dep, depIndex) => (
                        <div key={depIndex} className="dep-row">
                          {/* 前置环节选择 */}
                          <label className="dep-field">
                            <span>前置环节</span>
                            <select
                              value={dep.preStageId}
                              onChange={(event) =>
                                updateDependencyField(stage.id, depIndex, {
                                  preStageId: event.target.value,
                                })
                              }
                            >
                              {availablePreStages.map((pre) => (
                                <option key={pre.id} value={pre.id}>
                                  {pre.stageName}
                                </option>
                              ))}
                            </select>
                          </label>

                          {/* 关系类型选择（FS / SS） */}
                          <label className="dep-field">
                            <span>关系</span>
                            <select
                              value={dep.relation}
                              onChange={(event) =>
                                updateDependencyField(stage.id, depIndex, {
                                  relation: event.target.value as DependencyRelation,
                                })
                              }
                            >
                              <option value="FS">FS（前置结束后开始）</option>
                              <option value="SS">SS（前置开始后开始）</option>
                            </select>
                          </label>

                          {/* 触发方式选择 */}
                          <label className="dep-field">
                            <span>触发方式</span>
                            <select
                              value={dep.trigger}
                              onChange={(event) => {
                                const newTrigger = event.target.value as DependencyTrigger
                                const patch: Partial<StageDependencyRule> = { trigger: newTrigger }
                                /**
                                 * 条件目的：切换触发类型时，若新类型需要 value 则
                                 * 重置为默认值，否则清除 value 避免残留无效数据。
                                 */
                                if (triggerNeedsValue(newTrigger)) {
                                  patch.value = defaultValueForTrigger(newTrigger)
                                } else {
                                  patch.value = undefined
                                }
                                updateDependencyField(stage.id, depIndex, patch)
                              }}
                            >
                              <option value="finish_100">串行（前置100%完成）</option>
                              <option value="finish_percent">百分比重叠（前置完成X%后开始）</option>
                              <option value="finish_offset_days">
                                完成后偏移（前置完成后X工作日）
                              </option>
                              <option value="start_offset_days">
                                开始后偏移（前置开始后X工作日）
                              </option>
                            </select>
                          </label>

                          {/* value 数值输入：仅在需要时显示 */}
                          {triggerNeedsValue(dep.trigger) && (
                            <label className="dep-field dep-field--value">
                              <span>
                                {dep.trigger === 'finish_percent' ? '完成比例（%）' : '偏移天数'}
                              </span>
                              <input
                                type="number"
                                min={dep.trigger === 'finish_percent' ? 1 : 0}
                                max={dep.trigger === 'finish_percent' ? 99 : undefined}
                                value={dep.value ?? defaultValueForTrigger(dep.trigger)}
                                onChange={(event) =>
                                  updateDependencyField(stage.id, depIndex, {
                                    value: Number(event.target.value),
                                  })
                                }
                              />
                            </label>
                          )}

                          {/* 删除本条依赖 */}
                          <button
                            className="danger-btn dep-remove"
                            type="button"
                            aria-label="删除此依赖"
                            onClick={() => handleRemoveDependency(stage.id, depIndex)}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </article>
                )
              })}
            </div>
          </>
        )}
      </div>
    </section>
  )
}

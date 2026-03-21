/**
 * 开发范式页面。
 *
 * @description
 * - 支持模板分类新增/删除
 * - 支持环节增删与依赖配置
 */
import { useMemo, useState } from 'react'
import { useAppStateContext } from '../context/AppStateContext'
import type { DependencyTrigger, ParadigmTemplate, StageTemplate } from '../types'
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
 * 开发范式页组件。
 *
 * @returns {JSX.Element} 开发范式页
 */
export function ParadigmPage(): JSX.Element {
  const { state, addCategory, removeCategory, upsertParadigm, removeParadigm } =
    useAppStateContext()
  const [newCategory, setNewCategory] = useState('')
  const [activeTemplateId, setActiveTemplateId] = useState(state.paradigms[0]?.id ?? '')

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
    /**
     * 条件目的：无选中模板时不执行更新，避免空引用异常。
     */
    if (!activeTemplate) {
      return
    }
    upsertParadigm(updater(activeTemplate))
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

  return (
    <section className="grid-two">
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
      </div>

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
                  onClick={() => removeParadigm(activeTemplate.id)}
                >
                  删除模板
                </button>
              </div>
            </div>

            <div className="stage-list">
              {activeTemplate.stageTemplates.map((stage, stageIndex) => (
                <article key={stage.id} className="stage-card">
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
                  <div className="field-grid">
                    <label className="field">
                      <span>环节名称</span>
                      <input
                        value={stage.stageName}
                        onChange={(event) =>
                          updateActiveTemplate((template) => ({
                            ...template,
                            stageTemplates: template.stageTemplates.map((item) =>
                              item.id === stage.id
                                ? { ...item, stageName: event.target.value }
                                : item,
                            ),
                          }))
                        }
                      />
                    </label>
                    <label className="field">
                      <span>环节分类</span>
                      <input
                        value={stage.stageCategory}
                        onChange={(event) =>
                          updateActiveTemplate((template) => ({
                            ...template,
                            stageTemplates: template.stageTemplates.map((item) =>
                              item.id === stage.id
                                ? { ...item, stageCategory: event.target.value }
                                : item,
                            ),
                          }))
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
                          updateActiveTemplate((template) => ({
                            ...template,
                            stageTemplates: template.stageTemplates.map((item) =>
                              item.id === stage.id
                                ? { ...item, referencePersonDays: Number(event.target.value) }
                                : item,
                            ),
                          }))
                        }
                      />
                    </label>
                    <label className="field">
                      <span>依赖触发</span>
                      <select
                        value={stage.dependencies[0]?.trigger ?? 'finish_100'}
                        onChange={(event) =>
                          updateActiveTemplate((template) => ({
                            ...template,
                            stageTemplates: template.stageTemplates.map((item) =>
                              item.id === stage.id
                                ? {
                                    ...item,
                                    dependencies:
                                      stageIndex === 0
                                        ? []
                                        : [
                                            {
                                              preStageId:
                                                template.stageTemplates[stageIndex - 1].id,
                                              relation: 'FS',
                                              trigger: event.target.value as DependencyTrigger,
                                              value:
                                                event.target.value === 'finish_percent' ? 50 : 1,
                                            },
                                          ],
                                  }
                                : item,
                            ),
                          }))
                        }
                      >
                        <option value="finish_100">串行（前置100%完成）</option>
                        <option value="finish_percent">百分比重叠</option>
                        <option value="finish_offset_days">完成后偏移天数</option>
                        <option value="start_offset_days">开始后偏移天数</option>
                      </select>
                    </label>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  )
}

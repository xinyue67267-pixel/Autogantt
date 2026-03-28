/**
 * 甘特图排期核心算法。
 *
 * @description
 * - 根据需求+范式模板+工作日历生成环节实例
 * - 支持倒推/正推与依赖规则触发
 */
import type {
  HolidayRange,
  ParadigmTemplate,
  Requirement,
  RequirementSchedule,
  ScheduleBarDragPayload,
  StageInstance,
  StageTemplate,
} from '../types'
import { addWorkingDays, diffDays, snapToWorkingDay, toISODate } from './date'

/**
 * 将环节持续时长从“人天”映射为“工作日”。
 *
 * @param {StageTemplate} stage 环节模板
 * @param {number} quantity 需求数量
 * @returns {number} 工作日时长，最小1天
 */
function getStageDuration(stage: StageTemplate, quantity: number): number {
  return Math.max(1, Math.ceil(stage.referencePersonDays * Math.max(1, quantity)))
}

/**
 * 根据依赖规则计算候选开始日期。
 *
 * @param {StageTemplate} stage 当前环节模板
 * @param {Map<string, StageInstance>} stageMap 已计算环节映射
 * @param {HolidayRange[]} holidays 工作日历
 * @returns {Date | null} 候选日期
 */
function getDependencyStartCandidate(
  stage: StageTemplate,
  stageMap: Map<string, StageInstance>,
  holidays: HolidayRange[],
): Date | null {
  let latestStart: Date | null = null

  /**
   * 循环目的：聚合多个依赖条件，取最晚开始时间满足AND语义。
   */
  for (const dependency of stage.dependencies) {
    const preStage = stageMap.get(dependency.preStageId)

    /**
     * 条件目的：当依赖前置环节尚未生成时跳过，防止引用空对象。
     */
    if (!preStage) {
      continue
    }

    const preStart = new Date(preStage.startDate)
    const preEnd = new Date(preStage.endDate)
    let candidate = preStart

    /**
     * 条件目的：根据触发类型计算候选开始日期，保证规则语义一致。
     */
    if (dependency.trigger === 'finish_100') {
      candidate = addWorkingDays(preEnd, 1, holidays)
    } else if (dependency.trigger === 'finish_percent') {
      const percent = Math.max(0, Math.min(100, dependency.value ?? 100))
      const preDuration = Math.max(1, diffDays(preStart, preEnd) + 1)
      const requiredDays = Math.max(0, Math.ceil((preDuration * percent) / 100) - 1)
      candidate = addWorkingDays(preStart, requiredDays, holidays)
    } else if (dependency.trigger === 'finish_offset_days') {
      candidate = addWorkingDays(preEnd, dependency.value ?? 0, holidays)
    } else if (dependency.trigger === 'start_offset_days') {
      candidate = addWorkingDays(preStart, dependency.value ?? 0, holidays)
    }

    /**
     * 条件目的：多依赖场景取最晚日期，保证所有前置条件均满足。
     */
    if (!latestStart || candidate > latestStart) {
      latestStart = candidate
    }
  }

  return latestStart
}

/**
 * 为单条需求生成排期。
 *
 * @param {Requirement} requirement 需求数据
 * @param {ParadigmTemplate} template 范式模板
 * @param {HolidayRange[]} holidays 工作日历
 * @returns {RequirementSchedule} 需求排期
 */
export function generateScheduleForRequirement(
  requirement: Requirement,
  template: ParadigmTemplate,
  holidays: HolidayRange[],
): RequirementSchedule {
  const stages = template.stageTemplates
  const generated: StageInstance[] = []

  /**
   * 条件目的：倒推模式优先以DDL作为锚点，满足PRD默认流程。
   */
  if (requirement.scheduleMode === 'backward_from_ddl' && requirement.projectDDL) {
    let cursor = snapToWorkingDay(new Date(requirement.projectDDL), holidays, 'backward')

    /**
     * 循环目的：按“从后往前”顺序生成基础时间段，再统一做依赖修正。
     */
    for (let index = stages.length - 1; index >= 0; index -= 1) {
      const stage = stages[index]
      const duration = getStageDuration(stage, requirement.quantity)
      const endDate = cursor
      const startDate = addWorkingDays(endDate, -(duration - 1), holidays)
      generated.unshift({
        stageId: stage.id,
        stageName: stage.stageName,
        stageCategory: stage.stageCategory,
        isMilestone: stage.isMilestone,
        startDate: toISODate(startDate),
        endDate: toISODate(endDate),
      })
      cursor = addWorkingDays(startDate, -1, holidays)
    }
  } else {
    const startInput = requirement.projectStartDate ?? requirement.expectedLaunchDate
    let cursor = snapToWorkingDay(new Date(startInput), holidays, 'forward')

    /**
     * 循环目的：正推模式从起始日期开始顺序铺排每个环节。
     */
    for (const stage of stages) {
      const duration = getStageDuration(stage, requirement.quantity)
      const startDate = cursor
      const endDate = addWorkingDays(startDate, duration - 1, holidays)
      generated.push({
        stageId: stage.id,
        stageName: stage.stageName,
        stageCategory: stage.stageCategory,
        isMilestone: stage.isMilestone,
        startDate: toISODate(startDate),
        endDate: toISODate(endDate),
      })
      cursor = addWorkingDays(endDate, 1, holidays)
    }
  }

  const stageMap = new Map<string, StageInstance>(generated.map((item) => [item.stageId, item]))

  /**
   * 循环目的：按环节顺序应用依赖触发规则，必要时整体顺延当前环节。
   */
  for (const stageTemplate of stages) {
    const current = stageMap.get(stageTemplate.id)
    if (!current) {
      continue
    }

    const candidate = getDependencyStartCandidate(stageTemplate, stageMap, holidays)

    /**
     * 条件目的：仅当依赖触发时间晚于当前开始时间时才做顺延，避免不必要改动。
     */
    if (candidate && candidate > new Date(current.startDate)) {
      const currentStart = new Date(current.startDate)
      const currentEnd = new Date(current.endDate)
      const shift = diffDays(currentStart, candidate)
      current.startDate = toISODate(addWorkingDays(currentStart, shift, holidays))
      current.endDate = toISODate(addWorkingDays(currentEnd, shift, holidays))
      stageMap.set(stageTemplate.id, current)
    }
  }

  return {
    requirementId: requirement.id,
    stages: stages.map((stage) => stageMap.get(stage.id)).filter(Boolean) as StageInstance[],
  }
}

/**
 * 批量生成需求排期。
 *
 * @param {Requirement[]} requirements 需求列表
 * @param {ParadigmTemplate[]} templates 范式模板列表
 * @param {HolidayRange[]} holidays 工作日历
 * @returns {RequirementSchedule[]} 需求排期列表
 */
export function generateSchedules(
  requirements: Requirement[],
  templates: ParadigmTemplate[],
  holidays: HolidayRange[],
): RequirementSchedule[] {
  const templateMap = new Map<string, ParadigmTemplate>(templates.map((item) => [item.id, item]))
  return requirements
    .filter((item) => !item.deleted)
    .map((requirement) => {
      const template = templateMap.get(requirement.templateId)

      /**
       * 条件目的：模板不存在时返回空排期，避免页面渲染中断。
       */
      if (!template) {
        return { requirementId: requirement.id, stages: [] }
      }

      return generateScheduleForRequirement(requirement, template, holidays)
    })
}

/**
 * 拖拽联动重算：以变更环节为锚点，按模板 FS 依赖链向后推算同需求内所有关联环节。
 *
 * @param {StageInstance[]} currentStages 当前排期（含所有环节）
 * @param {string} changedStageId 被拖拽环节 ID
 * @param {string} newStart 新开始日期（YYYY-MM-DD）
 * @param {string} newEnd 新结束日期（YYYY-MM-DD）
 * @param {ParadigmTemplate} template 范式模板（提供依赖关系）
 * @param {HolidayRange[]} holidays 工作日历
 * @returns {StageInstance[]} 重算后的完整环节列表
 */
export function cascadeReschedule(
  currentStages: StageInstance[],
  changedStageId: string,
  newStart: string,
  newEnd: string,
  template: ParadigmTemplate,
  holidays: HolidayRange[],
): StageInstance[] {
  /**
   * 以当前排期为基础构建可变映射，先把变更环节的新日期写入。
   */
  const stageMap = new Map<string, StageInstance>(currentStages.map((s) => [s.stageId, { ...s }]))

  const changed = stageMap.get(changedStageId)
  /**
   * 条件目的：被拖拽环节不存在时直接返回原排期，防止引用空对象。
   */
  if (!changed) {
    return currentStages
  }
  changed.startDate = newStart
  changed.endDate = newEnd
  stageMap.set(changedStageId, changed)

  /**
   * 按模板顺序遍历，跳过被拖拽环节本身，对有依赖关系的后置环节按 FS 规则重算。
   * 循环目的：保证依赖链从前到后依次传播，避免乱序导致计算错误。
   */
  for (const stageTemplate of template.stageTemplates) {
    if (stageTemplate.id === changedStageId) {
      continue
    }

    /**
     * 条件目的：无依赖的环节不参与联动，保持原排期不变。
     */
    if (stageTemplate.dependencies.length === 0) {
      continue
    }

    const candidate = getDependencyStartCandidate(stageTemplate, stageMap, holidays)
    if (!candidate) {
      continue
    }

    const current = stageMap.get(stageTemplate.id)
    /**
     * 条件目的：环节实例缺失时跳过，不影响其他环节重算。
     */
    if (!current) {
      continue
    }

    /**
     * 条件目的：仅当依赖触发时间晚于当前开始时间时才顺延，避免无谓移动。
     */
    if (candidate > new Date(current.startDate)) {
      const currentStart = new Date(current.startDate)
      const currentEnd = new Date(current.endDate)
      const durationDays = diffDays(currentStart, currentEnd)
      current.startDate = toISODate(candidate)
      current.endDate = toISODate(addWorkingDays(candidate, durationDays, holidays))
      stageMap.set(stageTemplate.id, current)
    }
  }

  return template.stageTemplates.map((s) => stageMap.get(s.id)).filter(Boolean) as StageInstance[]
}

/**
 * 在时间轴拖拽后应用环节变更。
 *
 * @param {RequirementSchedule[]} schedules 原始排期
 * @param {ScheduleBarDragPayload} payload 拖拽载荷
 * @param {HolidayRange[]} holidays 工作日历
 * @returns {RequirementSchedule[]} 新排期
 */
export function applyScheduleDrag(
  schedules: RequirementSchedule[],
  payload: ScheduleBarDragPayload,
  holidays: HolidayRange[],
): RequirementSchedule[] {
  return schedules.map((schedule) => {
    /**
     * 条件目的：仅更新目标需求，避免影响其他需求排期。
     */
    if (schedule.requirementId !== payload.requirementId) {
      return schedule
    }

    const nextStages = schedule.stages.map((stage) => ({ ...stage }))
    const target = nextStages.find((stage) => stage.stageId === payload.stageId)

    /**
     * 条件目的：目标环节不存在时直接返回原计划。
     */
    if (!target) {
      return schedule
    }

    const start = new Date(target.startDate)
    const end = new Date(target.endDate)

    /**
     * 条件目的：根据拖拽动作更新起止时间。
     */
    if (payload.action === 'move') {
      target.startDate = toISODate(
        snapToWorkingDay(addWorkingDays(start, payload.deltaDays, holidays), holidays),
      )
      target.endDate = toISODate(
        snapToWorkingDay(addWorkingDays(end, payload.deltaDays, holidays), holidays),
      )
    } else if (payload.action === 'resize_start') {
      const nextStart = snapToWorkingDay(
        addWorkingDays(start, payload.deltaDays, holidays),
        holidays,
      )
      /**
       * 条件目的：防止开始日期晚于结束日期导致非法区间。
       */
      if (nextStart <= end) {
        target.startDate = toISODate(nextStart)
      }
    } else if (payload.action === 'resize_end') {
      const nextEnd = snapToWorkingDay(addWorkingDays(end, payload.deltaDays, holidays), holidays)
      /**
       * 条件目的：防止结束日期早于开始日期导致非法区间。
       */
      if (nextEnd >= start) {
        target.endDate = toISODate(nextEnd)
      }
    }

    return { ...schedule, stages: nextStages }
  })
}

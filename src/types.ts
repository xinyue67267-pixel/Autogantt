/**
 * AutoGantt核心类型定义。
 *
 * @description
 * - 与PRD字段命名保持一致
 * - 用于页面间共享业务对象
 */

export type StorageMode = 'local' | 'cloud' | 'hybrid'

export type TimelineViewMode = 'day' | 'week' | 'month' | 'year'

/** 管线（Pipeline）——需求所属的业务线，带自定义颜色 */
export interface Pipeline {
  /** 唯一标识 */
  id: string
  /** 管线名称 */
  name: string
  /** 甘特图条颜色，CSS 颜色值（如 "#C4B5FD"） */
  color: string
}

export type DependencyTrigger =
  | 'finish_100'
  | 'finish_percent'
  | 'finish_offset_days'
  | 'start_offset_days'

export type DependencyRelation = 'FS' | 'SS'

export interface HolidayRange {
  id: string
  name: string
  startDate: string
  endDate: string
  type: 'holiday' | 'workday'
}

export interface StageDependencyRule {
  preStageId: string
  relation: DependencyRelation
  trigger: DependencyTrigger
  value?: number
}

export type MilestoneLevel = 'L0' | 'L0.5' | 'L1' | 'L2'

export interface StageTemplate {
  id: string
  stageName: string
  stageCategory: string
  referencePersonDays: number
  /** 里程碑节点类型，空字符串表示非里程碑 */
  isMilestone: MilestoneLevel | ''
  dependencies: StageDependencyRule[]
}

export interface ParadigmTemplate {
  id: string
  templateName: string
  categoryId: string
  stageTemplates: StageTemplate[]
}

export interface Requirement {
  id: string
  requirementName: string
  levelId: string
  quantity: number
  expectedLaunchDate: string
  pipelineId: string
  templateId: string
  scheduleMode: 'backward_from_ddl' | 'forward_from_start'
  projectDDL?: string
  projectStartDate?: string
  deleted: boolean
}

export interface StageInstance {
  stageId: string
  stageName: string
  stageCategory: string
  /** 里程碑节点类型，空字符串表示非里程碑 */
  isMilestone: MilestoneLevel | ''
  startDate: string
  endDate: string
}

export interface RequirementSchedule {
  requirementId: string
  stages: StageInstance[]
}

export interface UserSession {
  email: string
  loggedIn: boolean
  syncStatus: 'synced' | 'syncing' | 'offline_pending' | 'conflict'
}

/** 环节库条目——全局预定义环节名称集合，供范式编辑时下拉选择 */
export interface StageLibraryItem {
  /** 唯一标识 */
  id: string
  /** 环节名称，全局唯一 */
  stageName: string
  /** 所属类别，与范式固定类别对应；可为空 */
  stageCategory: string
  /** 自定义颜色，CSS 颜色值（来自主题色板）；可为空，空时时间轴回退到管线颜色 */
  color?: string
  /** 是否停用（被范式引用时不可硬删除，标记停用） */
  deprecated: boolean
}

export interface AppState {
  categories: string[]
  levels: string[]
  pipelines: Pipeline[]
  holidays: HolidayRange[]
  paradigms: ParadigmTemplate[]
  requirements: Requirement[]
  /** 环节库：全局预定义环节名称集合 */
  stageLibrary: StageLibraryItem[]
  storageMode: StorageMode
  userSession: UserSession
}

export interface ScheduleBarDragPayload {
  requirementId: string
  stageId: string
  action: 'move' | 'resize_start' | 'resize_end'
  deltaDays: number
}

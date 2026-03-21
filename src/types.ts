/**
 * AutoGantt核心类型定义。
 *
 * @description
 * - 与PRD字段命名保持一致
 * - 用于页面间共享业务对象
 */

export type StorageMode = 'local' | 'cloud' | 'hybrid'

export type TimelineViewMode = 'day' | 'week' | 'month' | 'year'

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

export interface StageTemplate {
  id: string
  stageName: string
  stageCategory: string
  referencePersonDays: number
  isMilestone: boolean
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
  isMilestone: boolean
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

export interface AppState {
  categories: string[]
  levels: string[]
  pipelines: { id: string; name: string; color: string }[]
  holidays: HolidayRange[]
  paradigms: ParadigmTemplate[]
  requirements: Requirement[]
  storageMode: StorageMode
  userSession: UserSession
}

export interface ScheduleBarDragPayload {
  requirementId: string
  stageId: string
  action: 'move' | 'resize_start' | 'resize_end'
  deltaDays: number
}

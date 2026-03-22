/**
 * AutoGantt默认数据。
 *
 * @description
 * - 为首次进入本地模式提供可操作示例
 * - 字段命名与PRD保持一致
 */
import type { AppState, ParadigmTemplate } from '../types'

/**
 * 生成可复用的默认开发范式模板。
 *
 * @returns {ParadigmTemplate[]} 范式模板数组
 */
function createDefaultParadigms(): ParadigmTemplate[] {
  return [
    {
      id: 'tpl-default',
      templateName: '通用生产项目范式',
      categoryId: '通用',
      stageTemplates: [
        {
          id: 'stage-design',
          stageName: '需求设计',
          stageCategory: '设计',
          referencePersonDays: 3,
          isMilestone: '',
          dependencies: [],
        },
        {
          id: 'stage-dev',
          stageName: '开发实现',
          stageCategory: '开发',
          referencePersonDays: 5,
          isMilestone: '',
          dependencies: [
            { preStageId: 'stage-design', relation: 'FS', trigger: 'finish_100', value: 100 },
          ],
        },
        {
          id: 'stage-test',
          stageName: '测试验证',
          stageCategory: '测试',
          referencePersonDays: 3,
          isMilestone: '',
          dependencies: [
            { preStageId: 'stage-dev', relation: 'FS', trigger: 'finish_100', value: 100 },
          ],
        },
        {
          id: 'stage-release',
          stageName: '上线发布',
          stageCategory: '发布',
          referencePersonDays: 1,
          isMilestone: 'L1',
          dependencies: [
            { preStageId: 'stage-test', relation: 'FS', trigger: 'finish_100', value: 100 },
          ],
        },
      ],
    },
  ]
}

export const DEFAULT_APP_STATE: AppState = {
  categories: ['通用', '增长', '基础设施'],
  levels: ['P0', 'P1', 'P2', 'P3'],
  pipelines: [
    { id: 'pipe-main', name: '主线', color: '#C4B5FD' },
    { id: 'pipe-growth', name: '增长线', color: '#F9A8D4' },
  ],
  holidays: [
    { id: 'h1', name: '劳动节', startDate: '2026-05-01', endDate: '2026-05-03', type: 'holiday' },
    {
      id: 'h2',
      name: '劳动节调休',
      startDate: '2026-05-04',
      endDate: '2026-05-04',
      type: 'workday',
    },
  ],
  paradigms: createDefaultParadigms(),
  requirements: [
    {
      id: 'req-1',
      requirementName: '首页改版',
      levelId: 'P1',
      quantity: 2,
      expectedLaunchDate: '2026-05-20',
      pipelineId: 'pipe-main',
      templateId: 'tpl-default',
      scheduleMode: 'backward_from_ddl',
      projectDDL: '2026-05-20',
      deleted: false,
    },
  ],
  stageLibrary: [
    { id: 'slib-design', stageName: '需求设计', stageCategory: '设计', deprecated: false },
    { id: 'slib-dev', stageName: '开发实现', stageCategory: '开发', deprecated: false },
    { id: 'slib-test', stageName: '测试验证', stageCategory: '测试', deprecated: false },
    { id: 'slib-release', stageName: '上线发布', stageCategory: '发布', deprecated: false },
  ],
  scheduleOverrides: [],
  storageMode: 'local',
  userSession: {
    email: '',
    loggedIn: false,
    syncStatus: 'synced',
  },
}

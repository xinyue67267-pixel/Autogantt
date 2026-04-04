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
      id: 'tpl-role-costume-s',
      templateName: '角色时装-S',
      categoryId: '时装',
      pipelineId: 'pipe-role',
      stageTemplates: [
        {
          id: 'stage-concept',
          stageName: '概念设计',
          stageCategory: '',
          referencePersonDays: 15,
          isMilestone: '',
          dependencies: [],
        },
        {
          id: 'stage-3view',
          stageName: '三视图',
          stageCategory: '',
          referencePersonDays: 20,
          isMilestone: '',
          dependencies: [
            { preStageId: 'stage-concept', relation: 'FS', trigger: 'finish_100', value: 100 },
          ],
        },
        {
          id: 'stage-lowpoly',
          stageName: '低模',
          stageCategory: '',
          referencePersonDays: 40,
          isMilestone: '',
          dependencies: [
            { preStageId: 'stage-3view', relation: 'FS', trigger: 'finish_100', value: 100 },
          ],
        },
        {
          id: 'stage-rig',
          stageName: '绑定',
          stageCategory: '',
          referencePersonDays: 2,
          isMilestone: '',
          dependencies: [
            { preStageId: 'stage-lowpoly', relation: 'FS', trigger: 'finish_100', value: 100 },
          ],
        },
        {
          id: 'stage-texture',
          stageName: '贴图',
          stageCategory: '',
          referencePersonDays: 20,
          isMilestone: '',
          dependencies: [
            { preStageId: 'stage-lowpoly', relation: 'FS', trigger: 'finish_100', value: 100 },
          ],
        },
        {
          id: 'stage-artopt',
          stageName: '美术效果优化',
          stageCategory: '',
          referencePersonDays: 8,
          isMilestone: '',
          dependencies: [
            { preStageId: 'stage-texture', relation: 'FS', trigger: 'finish_100', value: 100 },
          ],
        },
        {
          id: 'stage-design',
          stageName: '策划配置',
          stageCategory: '',
          referencePersonDays: 1,
          isMilestone: '',
          dependencies: [
            { preStageId: 'stage-texture', relation: 'FS', trigger: 'finish_100', value: 100 },
          ],
        },
        {
          id: 'stage-vfx',
          stageName: '特效开发',
          stageCategory: '',
          referencePersonDays: 10,
          isMilestone: '',
          dependencies: [
            { preStageId: 'stage-rig', relation: 'FS', trigger: 'finish_100', value: 100 },
          ],
        },
        {
          id: 'stage-anim',
          stageName: '动作开发',
          stageCategory: '',
          referencePersonDays: 21,
          isMilestone: '',
          dependencies: [
            { preStageId: 'stage-rig', relation: 'FS', trigger: 'finish_100', value: 100 },
          ],
        },
        {
          id: 'stage-fulltest',
          stageName: '完整测试',
          stageCategory: '',
          referencePersonDays: 1,
          isMilestone: '',
          dependencies: [
            { preStageId: 'stage-artopt', relation: 'FS', trigger: 'finish_100', value: 100 },
          ],
        },
        {
          id: 'stage-001submit',
          stageName: '001提交',
          stageCategory: '',
          referencePersonDays: 1,
          isMilestone: '',
          dependencies: [
            { preStageId: 'stage-fulltest', relation: 'FS', trigger: 'finish_100', value: 100 },
          ],
        },
        {
          id: 'stage-regression',
          stageName: '回归测试',
          stageCategory: '',
          referencePersonDays: 1,
          isMilestone: '',
          dependencies: [
            { preStageId: 'stage-001submit', relation: 'FS', trigger: 'finish_100', value: 100 },
          ],
        },
      ],
    },
  ]
}

export const DEFAULT_APP_STATE: AppState = {
  categories: ['通用', '增长', '基础设施', '时装'],
  levels: ['P0', 'P1', 'P2', 'P3'],
  pipelines: [
    { id: 'pipe-role', name: '角色', color: '#C4B5FD' },
    { id: 'pipe-world', name: '世界', color: '#F9A8D4' },
    { id: 'pipe-pet', name: '宠物', color: '#6EE7B7' },
    { id: 'pipe-release', name: '发行', color: '#FCD34D' },
    { id: 'pipe-narrative', name: '叙事', color: '#FDA4AF' },
    { id: 'pipe-operation', name: '运营', color: '#94A3B8' },
    { id: 'pipe-system', name: '系统', color: '#C4B5FD' },
    { id: 'pipe-ark', name: 'ark', color: '#F9A8D4' },
    { id: 'pipe-infra', name: '基建', color: '#6EE7B7' },
  ],
  holidays: [
    // ── 2026 年（来源：国办发明电〔2025〕7号，数据完整权威）──
    {
      id: 'h26-01-holiday',
      name: '元旦',
      startDate: '2026-01-01',
      endDate: '2026-01-03',
      type: 'holiday',
    },
    {
      id: 'h26-01-work',
      name: '元旦调休上班',
      startDate: '2026-01-04',
      endDate: '2026-01-04',
      type: 'workday',
    },
    {
      id: 'h26-02-work1',
      name: '春节调休上班①',
      startDate: '2026-02-14',
      endDate: '2026-02-14',
      type: 'workday',
    },
    {
      id: 'h26-02-holiday',
      name: '春节',
      startDate: '2026-02-15',
      endDate: '2026-02-23',
      type: 'holiday',
    },
    {
      id: 'h26-02-work2',
      name: '春节调休上班②',
      startDate: '2026-02-28',
      endDate: '2026-02-28',
      type: 'workday',
    },
    {
      id: 'h26-04-holiday',
      name: '清明节',
      startDate: '2026-04-04',
      endDate: '2026-04-06',
      type: 'holiday',
    },
    {
      id: 'h26-05-holiday',
      name: '劳动节',
      startDate: '2026-05-01',
      endDate: '2026-05-05',
      type: 'holiday',
    },
    {
      id: 'h26-05-work',
      name: '劳动节调休上班',
      startDate: '2026-05-09',
      endDate: '2026-05-09',
      type: 'workday',
    },
    {
      id: 'h26-06-holiday',
      name: '端午节',
      startDate: '2026-06-19',
      endDate: '2026-06-21',
      type: 'holiday',
    },
    {
      id: 'h26-09-holiday',
      name: '中秋节',
      startDate: '2026-09-25',
      endDate: '2026-09-27',
      type: 'holiday',
    },
    {
      id: 'h26-09-work',
      name: '国庆调休上班①',
      startDate: '2026-09-20',
      endDate: '2026-09-20',
      type: 'workday',
    },
    {
      id: 'h26-10-holiday',
      name: '国庆节',
      startDate: '2026-10-01',
      endDate: '2026-10-07',
      type: 'holiday',
    },
    {
      id: 'h26-10-work',
      name: '国庆调休上班②',
      startDate: '2026-10-10',
      endDate: '2026-10-10',
      type: 'workday',
    },
    // ── 2027 年（节假日区间可由农历推算；调休补班待国务院 2026 年底公告后补充）──
    {
      id: 'h27-01-holiday',
      name: '元旦',
      startDate: '2027-01-01',
      endDate: '2027-01-03',
      type: 'holiday',
    },
    {
      id: 'h27-02-holiday',
      name: '春节',
      startDate: '2027-02-05',
      endDate: '2027-02-12',
      type: 'holiday',
    },
    {
      id: 'h27-04-holiday',
      name: '清明节',
      startDate: '2027-04-04',
      endDate: '2027-04-06',
      type: 'holiday',
    },
    {
      id: 'h27-05-holiday',
      name: '劳动节',
      startDate: '2027-05-01',
      endDate: '2027-05-05',
      type: 'holiday',
    },
    {
      id: 'h27-06-holiday',
      name: '端午节',
      startDate: '2027-06-09',
      endDate: '2027-06-11',
      type: 'holiday',
    },
    {
      id: 'h27-09-holiday',
      name: '中秋节',
      startDate: '2027-09-15',
      endDate: '2027-09-17',
      type: 'holiday',
    },
    {
      id: 'h27-10-holiday',
      name: '国庆节',
      startDate: '2027-10-01',
      endDate: '2027-10-07',
      type: 'holiday',
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
      pipelineId: 'pipe-role',
      templateId: 'tpl-role-costume-s',
      scheduleMode: 'backward_from_ddl',
      projectDDL: '2026-05-20',
      deleted: false,
    },
  ],
  stageLibrary: [
    {
      id: 'slib-concept',
      stageName: '概念设计',
      stageCategory: '',
      pipelineId: 'pipe-role',
      deprecated: false,
    },
    {
      id: 'slib-3view',
      stageName: '三视图',
      stageCategory: '',
      pipelineId: 'pipe-role',
      deprecated: false,
    },
    {
      id: 'slib-lowpoly',
      stageName: '低模',
      stageCategory: '',
      pipelineId: 'pipe-role',
      deprecated: false,
    },
    {
      id: 'slib-rig',
      stageName: '绑定',
      stageCategory: '',
      pipelineId: 'pipe-role',
      deprecated: false,
    },
    {
      id: 'slib-texture',
      stageName: '贴图',
      stageCategory: '',
      pipelineId: 'pipe-role',
      deprecated: false,
    },
    {
      id: 'slib-artopt',
      stageName: '美术效果优化',
      stageCategory: '',
      pipelineId: 'pipe-role',
      deprecated: false,
    },
    {
      id: 'slib-design',
      stageName: '策划配置',
      stageCategory: '',
      pipelineId: 'pipe-role',
      deprecated: false,
    },
    {
      id: 'slib-vfx',
      stageName: '特效开发',
      stageCategory: '',
      pipelineId: 'pipe-role',
      deprecated: false,
    },
    {
      id: 'slib-anim',
      stageName: '动作开发',
      stageCategory: '',
      pipelineId: 'pipe-role',
      deprecated: false,
    },
    {
      id: 'slib-fulltest',
      stageName: '完整测试',
      stageCategory: '',
      pipelineId: 'pipe-role',
      deprecated: false,
    },
    {
      id: 'slib-001submit',
      stageName: '001提交',
      stageCategory: '',
      pipelineId: 'pipe-role',
      deprecated: false,
    },
    {
      id: 'slib-regression',
      stageName: '回归测试',
      stageCategory: '',
      pipelineId: 'pipe-role',
      deprecated: false,
    },
  ],
  scheduleOverrides: [],
  storageMode: 'local',
  userSession: {
    email: '',
    loggedIn: false,
    syncStatus: 'synced',
  },
  theme: 'default',
}

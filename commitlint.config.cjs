/**
 * Commitlint配置（Conventional Commits）
 *
 * @description
 * - 通过commit-msg钩子强制校验提交信息
 */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'subject-case': [2, 'never', ['sentence-case', 'start-case', 'pascal-case', 'upper-case']],
  },
}


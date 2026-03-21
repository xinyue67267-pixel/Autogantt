/**
 * lint-staged配置
 *
 * @description
 * - 仅对暂存区文件做快速修复，提升提交体验
 * - 关键门禁（typecheck等）放到pre-push或显式`npm run check`
 */
module.exports = {
  '*.{js,jsx,ts,tsx}': [
    'node node_modules/eslint/bin/eslint.js --fix',
    'node node_modules/prettier/bin/prettier.cjs --write',
  ],
  '*.{css,html,json,md}': ['node node_modules/prettier/bin/prettier.cjs --write'],
}

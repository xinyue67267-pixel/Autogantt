/**
 * 质量门禁聚合脚本
 *
 * @description
 * - 替代`npm run check`在受限环境下的可执行性问题
 * - 明确执行顺序：ESLint → Prettier(check) → TypeScript(noEmit)
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

/**
 * 获取仓库根目录绝对路径。
 *
 * @returns {string} 仓库根目录绝对路径
 */
function getRepoRoot() {
  const thisFilePath = fileURLToPath(import.meta.url)
  return path.resolve(path.dirname(thisFilePath), '..')
}

/**
 * 运行一个node可执行脚本并确保失败时退出。
 *
 * @param {string} scriptPath 相对仓库根目录的脚本路径
 * @param {string[]} args 额外参数
 * @returns {void}
 */
function runNodeCli(scriptPath, args) {
  const root = getRepoRoot()
  const abs = path.resolve(root, scriptPath)
  const result = spawnSync(process.execPath, [abs, ...args], {
    cwd: root,
    stdio: 'inherit',
  })

  /**
   * 条件目的：在任一门禁失败时立即中断，避免产生“部分通过”的假阳性。
   */
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

/**
 * 主入口。
 *
 * @returns {void}
 */
function main() {
  runNodeCli('node_modules/eslint/bin/eslint.js', ['.', '--max-warnings', '0'])
  runNodeCli('node_modules/prettier/bin/prettier.cjs', ['.', '--check'])
  runNodeCli('node_modules/typescript/bin/tsc', ['-p', 'tsconfig.json', '--noEmit'])
}

main()


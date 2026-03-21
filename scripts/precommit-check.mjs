/**
 * 预提交仓库卫生检查
 *
 * @description
 * - 目标：拦截明显不应进入仓库的临时文件/大文件/调试产物
 * - 约束：如需提交此类文件，应先更新.gitignore或明确纳入版本管理策略
 */
import { execSync } from 'node:child_process'

/**
 * 获取当前暂存区文件列表。
 *
 * @returns {string[]} 暂存区文件路径（相对仓库根目录）
 */
function getStagedFiles() {
  const raw = execSync('git diff --cached --name-only --diff-filter=ACMR', {
    encoding: 'utf8',
  })

  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

/**
 * 判断文件路径是否应被阻止提交。
 *
 * @param {string} filePath 暂存区文件相对路径
 * @returns {{blocked: boolean, reason?: string}} 是否阻止及原因
 */
function evaluateFile(filePath) {
  const blockedExtensions = ['.log', '.zip', '.7z', '.tar', '.gz', '.rar', '.xlsx', '.csv']
  const blockedFolders = ['tmp/', 'temp/', 'logs/']

  /**
   * 条件目的：拦截常见“临时产物”目录。
   */
  for (const prefix of blockedFolders) {
    if (filePath.startsWith(prefix)) {
      return { blocked: true, reason: `禁止提交临时目录产物：${prefix}` }
    }
  }

  /**
   * 条件目的：拦截常见二进制与调试产物扩展名（避免污染repo与变更膨胀）。
   */
  for (const ext of blockedExtensions) {
    if (filePath.toLowerCase().endsWith(ext)) {
      return { blocked: true, reason: `禁止提交文件类型：${ext}` }
    }
  }

  return { blocked: false }
}

/**
 * 执行检查并在失败时退出进程。
 *
 * @returns {void}
 */
function main() {
  const staged = getStagedFiles()
  const blocked = []

  /**
   * 循环目的：逐个扫描暂存区文件并收集违规项，便于一次性给出可执行提示。
   */
  for (const file of staged) {
    const result = evaluateFile(file)
    if (result.blocked) {
      blocked.push({ file, reason: result.reason ?? 'unknown' })
    }
  }

  /**
   * 分支目的：在存在违规文件时阻止提交，提示用户更新.gitignore或调整提交内容。
   */
  if (blocked.length > 0) {
    console.error('提交被阻止：检测到不应入库的文件/目录。请更新.gitignore或移除暂存：')
    for (const item of blocked) {
      console.error(`- ${item.file}（${item.reason}）`)
    }
    process.exit(1)
  }
}

main()

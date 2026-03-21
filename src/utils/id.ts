/**
 * ID生成工具。
 *
 * @description
 * - 优先使用浏览器原生`crypto.randomUUID`
 * - 兼容不支持环境时降级为时间戳随机串
 */

/**
 * 创建唯一ID。
 *
 * @param {string} prefix 前缀
 * @returns {string} 唯一标识
 */
export function createId(prefix: string): string {
  /**
   * 条件目的：优先使用高质量UUID，降低碰撞概率。
   */
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100_000)}`
}

/**
 * 日期与工作日工具函数。
 *
 * @description
 * - 统一处理工作日计算逻辑
 * - 支持节假日区间与调休工作日
 */
import type { HolidayRange } from '../types'

/**
 * 将日期字符串标准化为YYYY-MM-DD。
 *
 * @param {Date | string} input 输入日期对象或日期字符串
 * @returns {string} 标准化日期字符串
 */
export function toISODate(input: Date | string): string {
  const value = typeof input === 'string' ? new Date(input) : input
  const year = value.getFullYear()
  const month = `${value.getMonth() + 1}`.padStart(2, '0')
  const day = `${value.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * 格式化日期为MM-DD。
 *
 * @param {Date | string} input 输入日期对象或日期字符串
 * @returns {string} MM-DD格式字符串
 */
export function formatMonthDay(input: Date | string): string {
  const value = typeof input === 'string' ? new Date(input) : input
  const month = `${value.getMonth() + 1}`.padStart(2, '0')
  const day = `${value.getDate()}`.padStart(2, '0')
  return `${month}-${day}`
}

/**
 * 格式化日期为YYYY-MM。
 *
 * @param {Date | string} input 输入日期对象或日期字符串
 * @returns {string} YYYY-MM格式字符串
 */
export function formatYearMonth(input: Date | string): string {
  const value = typeof input === 'string' ? new Date(input) : input
  const year = value.getFullYear()
  const month = `${value.getMonth() + 1}`.padStart(2, '0')
  return `${year}-${month}`
}

/**
 * 格式化日期为YYYY。
 *
 * @param {Date | string} input 输入日期对象或日期字符串
 * @returns {string} YYYY格式字符串
 */
export function formatYear(input: Date | string): string {
  const value = typeof input === 'string' ? new Date(input) : input
  return `${value.getFullYear()}`
}

/**
 * 复制一个日期对象，避免原对象被修改。
 *
 * @param {Date} value 原始日期
 * @returns {Date} 复制后的日期
 */
export function cloneDate(value: Date): Date {
  return new Date(value.getTime())
}

/**
 * 判断给定日期是否在指定区间内（含边界）。
 *
 * @param {string} date 日期
 * @param {string} startDate 区间起始
 * @param {string} endDate 区间结束
 * @returns {boolean} 是否命中区间
 */
export function isDateInRange(date: string, startDate: string, endDate: string): boolean {
  return date >= startDate && date <= endDate
}

/**
 * 判断是否为工作日。
 *
 * @param {Date} date 待判断日期
 * @param {HolidayRange[]} holidays 工作日历
 * @returns {boolean} 是否为工作日
 */
export function isWorkingDay(date: Date, holidays: HolidayRange[]): boolean {
  const iso = toISODate(date)
  const day = date.getDay()

  /**
   * 条件目的：先判断是否被调休明确标记为工作日，优先级高于默认双休规则。
   */
  const hasWorkdayOverride = holidays.some(
    (item) => item.type === 'workday' && isDateInRange(iso, item.startDate, item.endDate),
  )
  if (hasWorkdayOverride) {
    return true
  }

  /**
   * 条件目的：默认规则下，周六周日为非工作日。
   */
  if (day === 0 || day === 6) {
    return false
  }

  /**
   * 条件目的：命中节假日区间时，判定为非工作日。
   */
  const inHolidayRange = holidays.some(
    (item) => item.type === 'holiday' && isDateInRange(iso, item.startDate, item.endDate),
  )
  if (inHolidayRange) {
    return false
  }

  return true
}

/**
 * 在工作日语义下做日期偏移。
 *
 * @param {Date} base 基准日期
 * @param {number} deltaDays 偏移工作日数量，可正可负
 * @param {HolidayRange[]} holidays 工作日历
 * @returns {Date} 偏移结果日期
 */
export function addWorkingDays(base: Date, deltaDays: number, holidays: HolidayRange[]): Date {
  const result = cloneDate(base)

  /**
   * 条件目的：偏移量为0时，直接返回当天，避免额外循环。
   */
  if (deltaDays === 0) {
    return result
  }

  const step = deltaDays > 0 ? 1 : -1
  let count = Math.abs(deltaDays)

  /**
   * 循环目的：逐日推进，直到累计满足工作日偏移量。
   */
  while (count > 0) {
    result.setDate(result.getDate() + step)
    if (isWorkingDay(result, holidays)) {
      count -= 1
    }
  }

  return result
}

/**
 * 将日期吸附到最近工作日。
 *
 * @param {Date} value 原始日期
 * @param {HolidayRange[]} holidays 工作日历
 * @param {'forward' | 'backward'} direction 吸附方向
 * @returns {Date} 吸附后的工作日日期
 */
export function snapToWorkingDay(
  value: Date,
  holidays: HolidayRange[],
  direction: 'forward' | 'backward' = 'forward',
): Date {
  const result = cloneDate(value)

  /**
   * 条件目的：当日已经是工作日时不再偏移。
   */
  if (isWorkingDay(result, holidays)) {
    return result
  }

  const step = direction === 'forward' ? 1 : -1

  /**
   * 循环目的：沿着指定方向查找最近可用工作日。
   */
  while (!isWorkingDay(result, holidays)) {
    result.setDate(result.getDate() + step)
  }

  return result
}

/**
 * 计算两个日期之间相差天数（dateB - dateA）。
 *
 * @param {Date} dateA 起始日期
 * @param {Date} dateB 结束日期
 * @returns {number} 天数差
 */
export function diffDays(dateA: Date, dateB: Date): number {
  const dayMs = 24 * 60 * 60 * 1000
  return Math.round((dateB.getTime() - dateA.getTime()) / dayMs)
}

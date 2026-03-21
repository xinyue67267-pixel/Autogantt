/**
 * 设置页面。
 *
 * @description
 * - 管理工作日历、需求级别、模板分类
 * - 管理登录状态与存储模式
 */
import { useState } from 'react'
import { useAppStateContext } from '../context/AppStateContext'
import type { HolidayRange, StorageMode } from '../types'
import { createId } from '../utils/id'

/**
 * 设置页组件。
 *
 * @returns {JSX.Element} 设置页视图
 */
export function SettingsPage(): JSX.Element {
  const {
    state,
    setStorageMode,
    addLevel,
    removeLevel,
    addCategory,
    removeCategory,
    upsertHoliday,
    removeHoliday,
  } = useAppStateContext()
  const [newLevel, setNewLevel] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [holidayForm, setHolidayForm] = useState<Omit<HolidayRange, 'id'>>({
    name: '',
    startDate: '2026-10-01',
    endDate: '2026-10-07',
    type: 'holiday',
  })

  /**
   * 新增节假日/调休日历区间。
   *
   * @returns {void}
   */
  const handleAddHoliday = (): void => {
    /**
     * 条件目的：名称缺失时不新增，避免出现不可读条目。
     */
    if (!holidayForm.name.trim()) {
      return
    }
    upsertHoliday({
      ...holidayForm,
      id: createId('holiday'),
    })
    setHolidayForm((prev) => ({ ...prev, name: '' }))
  }

  /**
   * 切换存储模式。
   *
   * @param {StorageMode} mode 存储模式
   * @returns {void}
   */
  const handleStorageModeChange = (mode: StorageMode): void => {
    setStorageMode(mode)
  }

  return (
    <section className="grid-two">
      <div className="card">
        <h2>账号与同步</h2>
        <div className="row-gap">
          <label className="radio-line">
            <input
              type="radio"
              checked={state.storageMode === 'local'}
              onChange={() => handleStorageModeChange('local')}
            />
            本地模式
          </label>
          <label className="radio-line">
            <input
              type="radio"
              checked={state.storageMode === 'cloud'}
              onChange={() => handleStorageModeChange('cloud')}
            />
            云端模式
          </label>
          <label className="radio-line">
            <input
              type="radio"
              checked={state.storageMode === 'hybrid'}
              onChange={() => handleStorageModeChange('hybrid')}
            />
            本地+云端同步
          </label>
        </div>
        <p className="muted">
          当前同步状态：{state.userSession.syncStatus}；登录状态：
          {state.userSession.loggedIn ? '已登录' : '未登录'}
        </p>
      </div>

      <div className="card">
        <h2>需求级别维护</h2>
        <div className="inline-form">
          <input
            value={newLevel}
            placeholder="新增级别"
            onChange={(event) => setNewLevel(event.target.value)}
          />
          <button
            className="primary-btn"
            type="button"
            onClick={() => {
              addLevel(newLevel.trim())
              setNewLevel('')
            }}
          >
            添加
          </button>
        </div>
        <div className="chip-wrap">
          {state.levels.map((level) => (
            <button key={level} className="chip" type="button" onClick={() => removeLevel(level)}>
              {level} ×
            </button>
          ))}
        </div>

        <h2>模板分类维护</h2>
        <div className="inline-form">
          <input
            value={newCategory}
            placeholder="新增分类"
            onChange={(event) => setNewCategory(event.target.value)}
          />
          <button
            className="primary-btn"
            type="button"
            onClick={() => {
              addCategory(newCategory.trim())
              setNewCategory('')
            }}
          >
            添加
          </button>
        </div>
        <div className="chip-wrap">
          {state.categories.map((item) => (
            <button key={item} className="chip" type="button" onClick={() => removeCategory(item)}>
              {item} ×
            </button>
          ))}
        </div>
      </div>

      <div className="card span-two">
        <h2>工作日历</h2>
        <div className="field-grid">
          <label className="field">
            <span>名称</span>
            <input
              value={holidayForm.name}
              onChange={(event) =>
                setHolidayForm((prev) => ({ ...prev, name: event.target.value }))
              }
            />
          </label>
          <label className="field">
            <span>类型</span>
            <select
              value={holidayForm.type}
              onChange={(event) =>
                setHolidayForm((prev) => ({
                  ...prev,
                  type: event.target.value as 'holiday' | 'workday',
                }))
              }
            >
              <option value="holiday">节假日（非工作日）</option>
              <option value="workday">调休（工作日）</option>
            </select>
          </label>
          <label className="field">
            <span>开始日期</span>
            <input
              type="date"
              value={holidayForm.startDate}
              onChange={(event) =>
                setHolidayForm((prev) => ({ ...prev, startDate: event.target.value }))
              }
            />
          </label>
          <label className="field">
            <span>结束日期</span>
            <input
              type="date"
              value={holidayForm.endDate}
              onChange={(event) =>
                setHolidayForm((prev) => ({ ...prev, endDate: event.target.value }))
              }
            />
          </label>
        </div>
        <button className="primary-btn" type="button" onClick={handleAddHoliday}>
          新增日历区间
        </button>

        <table className="data-table">
          <thead>
            <tr>
              <th>名称</th>
              <th>类型</th>
              <th>开始</th>
              <th>结束</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {state.holidays.map((item) => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td>{item.type === 'holiday' ? '节假日' : '调休工作日'}</td>
                <td>{item.startDate}</td>
                <td>{item.endDate}</td>
                <td>
                  <button
                    className="danger-btn"
                    type="button"
                    onClick={() => removeHoliday(item.id)}
                  >
                    删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

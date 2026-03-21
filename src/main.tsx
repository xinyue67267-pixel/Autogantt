/**
 * AutoGantt 应用入口
 *
 * @description
 * - 挂载React根节点并渲染App
 */
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './App'
import { AppStateProvider } from './context/AppStateContext'
import './index.css'

/**
 * 渲染应用到页面根节点。
 *
 * @returns {void}
 */
function renderApp(): void {
  const rootEl = document.getElementById('root')

  /**
   * 条件目的：确保页面存在挂载点，避免空指针导致白屏。
   */
  if (!rootEl) {
    throw new Error('Root element "#root" not found.')
  }

  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <AppStateProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AppStateProvider>
    </React.StrictMode>,
  )
}

renderApp()

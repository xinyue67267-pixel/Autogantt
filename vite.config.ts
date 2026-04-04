/**
 * AutoGantt Vite配置
 *
 * @description
 * - 提供React编译能力与本地开发服务器
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
})

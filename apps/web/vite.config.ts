import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const logger = console;
const e2eApiUrl = process.env.JIXIA_E2E_API_URL;

/*
 * ========================================================================
 * 步骤1：加载 Web Vite 配置
 * ========================================================================
 * 目标：提供 Vite React 的本地开发与构建入口
 * 数据源：Task 1 锁定的 apps/web 包边界
 * 操作：
 * 1) 注册 React 插件
 * 2) 固定本地开发服务监听地址
 */
logger.info("开始加载 Web Vite 配置...");

// 1.1 注册 React 插件
const webConfig = defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    ...(e2eApiUrl
      ? {
          proxy: {
            "/api": {
              target: e2eApiUrl,
              changeOrigin: true
            }
          }
        }
      : {})
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.{test,spec}.{ts,tsx}"]
  }
});

// 1.2 固定本地开发服务监听地址
logger.info("Web Vite 配置加载完成");

export default webConfig;

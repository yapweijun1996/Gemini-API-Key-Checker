# Gemini API Key Checker

一个纯前端的 Gemini API Key 检测工具，支持：

- 本地化密钥管理（`localStorage`）
- 检测历史持久化（`IndexedDB`）
- PWA 支持（离线可访问/可安装）
- 管理员面板式界面（明暗主题切换、批量导入、批量运行）

> 说明：当前实现不涉及后端服务，所有数据都在浏览器端保存，适合本地管理和离线使用场景。

## 目录结构

- `index.html`：页面结构（侧边栏 + 主面板）
- `style.css`：主题样式（包含明亮 / 暗黑变量）
- `script.js`：核心逻辑（状态管理、模型检测、存储、IndexedDB、事件处理）
- `manifest.json`：PWA 清单（图标、显示模式、快捷方式）
- `sw.js`：Service Worker（离线缓存策略）
- `.github/workflows/deploy-pages.yml`：GitHub Pages 自动部署
- `icons/`：PWA 应用图标

## 快速开始（本地运行）

```bash
# 进入仓库根目录
cd Gemini-API-Key-Checker

# 直接启动静态服务即可
# 使用你熟悉的任意静态服务器，例如：
npx serve .
```

也可以直接双击打开 `index.html`，但建议用静态服务器确保 Service Worker 正常注册。

## 主要功能

- **Key 管理（localStorage）**
  - 新增/更新 Key（别名可选）
  - 批量粘贴导入（支持 `alias|key` 或只填 key）
  - 启用开关、全选、删除选中
  - 清理全部本地数据（包含键 + 设置）
- **检测执行**
  - 按“Run Enabled Checks”执行启用项
  - 按“Run Checked”只执行当前勾选项
  - 实时展示检测结果（Alive / Dead / Error）
- **历史记录（IndexedDB）**
  - 每次检测写入历史（时间、模型、状态、状态码、错误信息）
  - 历史列表可清空
- **PWA**
  - 支持安装提示（`beforeinstallprompt`）
  - 离线页面与静态资源回退
  - 主题色随明暗模式切换
- **模型选择**
  - `select` 改为可输入的组合框（`datalist`），可手动输入或快速选择

## 数据结构说明

- `localStorage` 键名：`gemini_api_admin_state_v1`
- 结构示例：

```json
{
  "appVersion": 1,
  "model": "gemini-2.5-flash",
  "theme": "dark",
  "keys": [
    {
      "id": "uuid-or-generated-id",
      "alias": "team-key-01",
      "key": "AIza...",
      "enabled": true,
      "lastCheckedAt": "2026-06-22T12:34:56.789Z",
      "lastResult": "Alive"
    }
  ]
}
```

- `IndexedDB`
  - DB 名：`gemini_api_admin_db`
  - Store：`key_check_history`
  - 默认展示最近 120 条

## GitHub Pages 部署

仓库已包含部署流程 `.github/workflows/deploy-pages.yml`，推送 `main` 或 `master` 即可触发。

### 部署前提

- 项目根目录包含 `index.html` / `manifest.json` / `icons/`
- 仓库启用 GitHub Pages，并设置 `github-pages` 环境
- 允许 `pages` 和 `id-token` 写权限（workflow 已预置）

## 审阅结果（重点）

### 发现的风险与改进建议

1. **安全边界（高）**  
   API Key 直接在前端内存中处理并用于请求。请仅在你信任的本地环境使用，不要把真实生产密钥长期明文暴露在公共电脑或未受控终端。  
   建议：改为后端中转验证（可选）以实现更安全的生产托管。

2. **模型输入校验（中）**  
   模型字段允许任意输入。虽然当前仅作为 URL 参数拼接，风险主要是错误输入导致无效请求。  
   建议：新增白名单校验（`gemini-2.5-flash`、`gemini-2.5-pro` 等）并提示不合法值。

3. **离线检测行为（低）**  
   离线模式会直接阻止检测，这是合理行为。历史与已存数据仍可查看。  
   建议：在提示文本中说明“仅本地展示，不执行联网校验”。

4. **UI 交互一致性（低）**  
   当前检测、删除事件处理逻辑较稳健；建议后续可统一按钮文案与状态提示文案（中英一致）以提升可维护性。

## 开发说明

- 本项目为纯静态站点，无构建链路
- 修改后可直接提交，重新推送触发 GitHub Pages 部署

## 许可

本仓库按当前仓库默认开源许可（如无说明请按你的组织规程补充）。

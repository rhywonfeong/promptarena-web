# PromptArena Web（生图大乱斗 · 网页版）

iPad 版 PromptArena（/Users/Apple/dev/PromptArena，SwiftUI）的**独立 Web 版**，功能全对齐：一条 prompt 并发发给多个 OpenRouter 图像模型，网格对比。两版代码互不相干，但**行为规格以 iPad 版为准**（对应 Swift 文件在文末），产品纪律完全继承。

## 技术栈与架构

- React 19 + Vite + TypeScript，TanStack Router（文件路由 `src/routes/`）/ Query（OpenRouter 三公开端点 + 汇率）/ Store（运行时状态）
- UI：shadcn/ui（radix 底座）+ Tailwind v4
- 数据：Dexie（IndexedDB）—— records 表 + images 表（**Blob 分表**，liveQuery 不拖全量 Blob 进内存）；设置/勾选/预设/翻译缓存/汇率 → localStorage
- 部署：Cloudflare Workers Static Assets + `/api/*` 同域透传 Worker（`wrangler.jsonc` 的 `run_worker_first: ["/api/*"]` 让 /api/* 先进 Worker，其余 asset-first 不进 Worker 不计费；OpenRouter 受限模型代理见 `worker/index.ts` 与 `src/lib/openrouter/proxy.ts`）；`npm run deploy`
- 浏览器直连 OpenRouter（官方支持 CORS），API key 存 localStorage；唯一「后端」是自家可选的同域代理开关（设置页，默认关）：地区受限模型（403，已知 `openai/gpt-image-2` + 运行中动态记录进 `settings.proxyModels`）的请求经本站 Worker 透传，key 不落 Worker

## 常用命令

```bash
npm run dev        # 本地开发
npm run build      # tsc -b && vite build
npm test           # vitest 单测（pricing/sse/estimate 契约锁定）
npm run smoke      # 拿真实 OpenRouter 响应跑解码链路（静默错误防线，改动 API 层后必跑）
npm run deploy     # build + wrangler deploy
```

## 结构速览

- `src/lib/openrouter/` — 全部 API（client/sse/types/errors/proxy），行为基准 PA/Networking/OpenRouterClient.swift
- `src/lib/generation/engine.ts` — 生成指挥官（建卡/并发/均摊入库/取消/重试/Agent 拆分），基准 PA/State/ComparisonViewModel.swift
- `src/lib/catalog/` — 计价推导（pricing.ts，gpt2 基准 $0.011/张）+ useCatalog
- `src/lib/db/` — Dexie schema + repos，基准 PA/Models/GenerationRecord.swift
- `src/lib/upscale/` — 高清晰化后台任务（原图作参考图 + 更高档重新生成）
- `src/stores/` — TanStack Store 单例（generation/viewer/upscale 运行时；settings/selection/translations 持久化）
- `src/components/viewer/` — 大图查看器（黑底全屏 overlay，挂在 __root 切路由不卸载）+ EditBar + LineageOverlay
- `src/assets/vendor/` — 10 个厂商位图 logo（复用 iPad 版打包资源，断网零请求）

## 产品纪律（用户明确规则，与 iPad 版一致，勿违反）

1. **动态花费只出现在三处**：模型行静态计价标签（"N gpt2"）、点生成时一轮预估（statusLine）、大图头部/历史条目实际消耗。看真实账单去 openrouter.ai/activity
2. 能力标签统一 "N max" 风格（`2K max`、`16 max`）
3. 批次头/列表头：主文本一行，元信息横排一行在正下方（`.secondary` 级颜色），操作按钮靠右垂直居中
4. 大图查看器提示词在图下方，默认单行省略可展开、点击复制
5. 成本以 API 返回 `usage.cost` 为准（整单按张均摊入库），不自己估算
6. 成功失败都入库，取消不入库；每轮生成/重试一个 batchId
7. 翻译（DeepSeek）结果持久缓存永不重翻，批间并发
8. 错误中文人话（401「API key 无效或未填（401）」等，见 errors.ts）

## 踩过的坑（本 Web 版新增，别再踩）

- **HTTP header 值不能含非 ASCII**：`X-OpenRouter-Title: 生图大乱斗` 的中文会让 fetch 直接抛 ByteString 错（Swift 版没传归因头所以没这问题）。归因头用英文 "PromptArena"
- **cards 的 display_pricing 嵌套在 endpoint 下，字段是驼峰 `unitLabel` 不是 `unit_label`**——解错无报错、计价全丢。已用真实样本写进 vitest（pricing.test.ts）锁死
- **IndexedDB 索引不支持 boolean**：liked 存 0/1
- **TanStack Store 的 setState 只接受 `(prev) => 完整 state` 的 updater**（此版本无对象 partial 形式）——用各 store 的 `patchXxx()` 辅助
- **shadcn CLI 4.x**：`init -b radix -p <preset>` 非交互；组件装 `src/components/ui/`
- URL 形式的生成结果可能被对端 CORS 挡下载 → 存 `remoteUrl` 用 `<img>` 展示（canvas 重编码跨域污染不可靠）
- **OpenRouter 地区限制按「来源 IP × 模型」拦（403），域本身国内可达**——所以同域代理（`/api/or/`）粒度按模型：内置 seed ∪ 403 动态记录（`proxy.ts`），公开端点/图标/verifyApiKey 永不代理。403 判定宽（`isRegionBlockError` 只看 status），观察期后可收紧文案匹配
- **CF Worker 的 fetch 出口跟随访问者接入舱位**（香港用户落 HKG → 出口判 HK → 仍 403，实测）：代理链路必须落固定出口 —— Worker → `or.collectui.pro`（va1 美国服务器 caddy 透传，ul-mirror tunnel 接入）→ openrouter.ai；**CF 注入的身份地理头（CF-IPCountry/CF-Connecting-IP 等）沿链路层层传染**，worker 与 caddy 两跳都要剥（`worker/index.ts` STRIP_HEADERS + va1 `/root/app/or-proxy/Caddyfile` 的 header_up -CF-*）；出口密钥 `X-Proxy-Key` = wrangler secret `PROXY_KEY` = va1 docker env = `ul-mirror/.env` 的 `OR_PROXY_KEY`
- **Workers「SPA + API」模式**：`main` + `assets.binding` + `run_worker_first: ["/api/*"]` + Worker 内 `env.ASSETS.fetch(request)` 兜底 SPA 深链接；透传用 `new Request(上游, request)` 官方 proxy 模式（headers/body 原样、响应不读 body 直接 return 即流式，SSE/Content-Encoding 透传无坑）；Worker 里未知 `/api/*` 要显式 404 别落 ASSETS（否则 200 出 index.html 干扰排障）。`worker/` 由 `tsconfig.worker.json` 独立 project 类型检查，不进 vite build（wrangler 自行 esbuild）
- 超时 abort 与用户取消要区分（前者按失败入库，后者不入库）：AbortSignal.timeout 的 reason 是 TimeoutError
- objectURL 统一走 `useBlobUrl` hook 回收，别手写 createObjectURL
- **shadcn v4 的 DropdownMenuContent 默认 `w-(--radix-dropdown-menu-trigger-width)`（菜单宽=触发按钮宽）**：长内容菜单（模型名列表）必须传 `w-auto min-w-64 max-w-80` 覆盖，否则文字竖向折行而非加宽（已踩：模型下拉）
- **Blob 无 type → data URL 是 `application/octet-stream` → OpenRouter input_references 400 拒绝**（已踩：原地编辑用结果图当参考图）：b64 解码时按魔数设 type（`sniffImageMime`），`blobToDataURL` 对非 image/* 的 blob 兜底嗅探；canvas 产物自带 type 无此问题
- **全局键盘监听必须排除输入场景**（`e.isComposing` + target closest input/textarea/contenteditable）：否则打拼音含 h 触发隐藏界面、输入法 Esc 关掉查看器（已踩）
- **TanStack Router flat 路由的点号=嵌套**：`history.tsx` 与 `history.$batchId.tsx` 是父子，子路由渲染在父的 `<Outlet/>` 里 —— 父页面没写 Outlet 时表现为「URL 变了页面不动」。列表+详情结构要拆 `xxx.tsx`(纯 Outlet) + `xxx.index.tsx`(列表) + `xxx.$id.tsx`(详情)
- **模型名显示口径**（全应用统一）：logo 标厂商 + `specificModelName()` 去掉 `Vendor: ` 前缀只留具体名（优先 `pricing.shortNames`）——truncate 掉前缀比吃掉具体名好；能力标签图标语义唯一：Expand=分辨率、Ratio=宽高比、Images=参考图(输入)、Grid2x2=张数(输出)、CircleDollarSign=计价（见 CapabilityTags.tsx）

## 行为规格对照（改 Web 版行为先看 iPad 版对应文件）

| 功能 | Swift 基准 |
|---|---|
| 生成流程/参数映射/预估 | PA/State/ComparisonViewModel.swift |
| API 请求/翻译提示词/Agent 拆分提示词/SSE | PA/Networking/OpenRouterClient.swift |
| 计价推导/静态实测表 | PA/State/ModelCatalog.swift |
| 记录字段/删批规则 | PA/Models/GenerationRecord.swift + State/HistoryStore.swift |
| 大图查看器交互 | PA/Views/ImageDetailView.swift |

Web 与 iPad 的有意差异：web 有鼠标（tooltip/右键菜单可用，模型完整名 hover、父图右键看演进链）；「保存到相册」→ 下载文件；upscale「可离开页面」= SPA 内切路由（标签页关了任务就停）。

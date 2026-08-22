# 生图大乱斗 · Web

一条提示词并发发给多个 OpenRouter 图像模型，瀑布流网格对比差异。支持参考图（图生图）、Agent 智能拆分、编辑演进链、高清晰化、历史与点赞收藏。

纯静态 SPA，浏览器直连 [OpenRouter](https://openrouter.ai)（API key 只存本机 localStorage），部署在 Cloudflare Workers。

## 使用

1. `npm install && npm run dev`
2. 打开设置页填 OpenRouter API key（[获取](https://openrouter.ai/settings/keys)）
3. 到「模型」页勾选参赛阵容（可存为预设），回主页输入提示词开始对比

## 开发

```bash
npm run dev        # 本地开发
npm run build      # 构建
npm test           # 单测（API 契约锁定）
npm run smoke      # 真实 OpenRouter 响应冒烟（改 API 层后必跑）
```

## 部署

```bash
npm run deploy     # build + wrangler deploy（Workers Static Assets）
```

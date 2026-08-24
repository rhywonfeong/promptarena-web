// 地区受限模型的同域代理判定（对端是 worker/index.ts 的透传 Worker）。
// OpenRouter 按来源 IP 对部分模型做 provider 合规拦截（403）：openrouter.ai 域
// 国内可达，受限的只是特定模型 —— 所以代理粒度按模型走，其余请求一律直连。
import { settingsStore, updateSettings } from "@/stores/settings";
import { APIError } from "./errors";

/** 内置已知地区受限模型（观察期种子；运行中 403 动态记录见 settingsStore.proxyModels） */
const KNOWN_REGION_BLOCKED = new Set(["openai/gpt-image-2"]);

/** 同域代理前缀 ⇔ 上游 origin（要与 worker/index.ts 的 UPSTREAMS 保持一致） */
const UPSTREAM = "https://openrouter.ai/";
const PROXY_PREFIX = "/api/or/";

/** 该模型是否需要经同域 Worker 转发（内置清单 ∪ 运行中动态记录） */
export function isProxiedModel(model: string): boolean {
  return KNOWN_REGION_BLOCKED.has(model) || settingsStore.state.proxyModels.includes(model);
}

/** 记一个直连 403 被拦的模型（幂等）；记录后它的请求自动改走代理 */
export function recordProxiedModel(model: string): void {
  if (isProxiedModel(model)) return;
  updateSettings({ proxyModels: [...settingsStore.state.proxyModels, model] });
}

/** 开关开且该模型受限时，把 openrouter 域绝对 URL 换成同域代理路径；其余原样 */
export function orUrl(url: string, model?: string): string {
  if (!model || !settingsStore.state.proxyEnabled || !isProxiedModel(model)) return url;
  return url.startsWith(UPSTREAM) ? PROXY_PREFIX + url.slice(UPSTREAM.length) : url;
}

/** 疑似地区限制（该 API 语境下 403 基本只有地区/封禁；观察期后如确认上游文案特征可再收紧） */
export function isRegionBlockError(e: unknown): boolean {
  return e instanceof APIError && e.status === 403;
}

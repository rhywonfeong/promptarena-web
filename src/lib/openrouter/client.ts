// 与 OpenRouter 通信的唯一出口（对应 PA/Networking/OpenRouterClient.swift）。
// 浏览器直连：官方支持 CORS，带 HTTP-Referer / X-OpenRouter-Title 归因头。
import {
  checkHTTP,
  emptyResultError,
  networkError,
} from "./errors";
import { drainStream, readSSE } from "./sse";
import { reencodeToWritable, sniffImageMime } from "@/lib/image/reencode";
import type {
  GenerateRequestBody,
  ImageGenResponse,
  ImageModelInfo,
  ModelCard,
} from "./types";

const BASE_URL = "https://openrouter.ai/api/v1";
/** ⚠️ HTTP header 值不允许非 ASCII（中文会让 fetch 直接抛 ByteString 错），
 *  OpenRouter 排行榜归因用英文标识 */
const APP_TITLE = "PromptArena";

/** 图像生成常要 30–90 秒且中途无数据，默认 fetch 无超时 —— 显式 180s（同 iPad 版） */
const GEN_TIMEOUT_MS = 180_000;

/** 合并多个 abort 源（用户取消 + 超时）。AbortSignal.any 需 Safari 17.4+，降级手动桥接 */
function combineSignals(signals: (AbortSignal | undefined)[]): AbortSignal {
  const ctrl = new AbortController();
  const valid = signals.filter((s): s is AbortSignal => !!s);
  if ("any" in AbortSignal) return AbortSignal.any(valid);
  const onAbort = (reason: unknown) => {
    ctrl.abort(reason);
    for (const s of valid) s.removeEventListener("abort", onAbort);
  };
  let aborted = false;
  for (const s of valid) {
    if (s.aborted) aborted = true;
    s.addEventListener("abort", () => onAbort(s.reason), { once: true });
  }
  if (aborted) ctrl.abort();
  return ctrl.signal;
}

interface FetchOptions {
  apiKey?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

async function orFetch(path: string, init: RequestInit, opts: FetchOptions = {}) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-OpenRouter-Title": APP_TITLE,
    ...(typeof location !== "undefined" ? { "HTTP-Referer": location.origin } : {}),
    ...(init.headers as Record<string, string>),
  };
  if (opts.apiKey) headers.Authorization = `Bearer ${opts.apiKey}`;

  const signal = opts.timeoutMs
    ? combineSignals([opts.signal, AbortSignal.timeout(opts.timeoutMs)])
    : opts.signal;

  let res: Response;
  try {
    res = await fetch(path.startsWith("http") ? path : BASE_URL + path, {
      ...init,
      headers,
      signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw networkError();
  }
  return res;
}

// ---------- 模型列表（公开端点，无需 key） ----------

export async function fetchImageModels(signal?: AbortSignal): Promise<ImageModelInfo[]> {
  const res = await orFetch("/images/models", { method: "GET" }, { signal });
  const text = await res.text();
  checkHTTP(res.status, text);
  const decoded = JSON.parse(text) as { data?: ImageModelInfo[] };
  return decoded.data ?? [];
}

// ---------- 生成图片（需要 API key，花钱！） ----------

export interface GenResult {
  /** 每张结果：规整成可写格式（webp→JPEG）的 Blob（含解码尺寸），
   *  或 URL 结果跨域下载失败时的 remoteUrl 兜底（只展示、不落库存） */
  images: ({ blob: Blob; width: number; height: number } | { remoteUrl: string })[];
  /** 本次请求实际花费（美元，整单） */
  costUsd?: number;
}

/** 请求一个模型生成图（n > 1 时单请求出多张）。
 *  referenceJPEGs：参考图（已压成 JPEG 的 Blob），空 = 纯文生图。 */
export async function generateImage(
  body: GenerateRequestBody,
  opts: { apiKey: string; signal?: AbortSignal },
): Promise<GenResult> {
  const res = await orFetch(
    "/images",
    { method: "POST", body: JSON.stringify(body) },
    { apiKey: opts.apiKey, signal: opts.signal, timeoutMs: GEN_TIMEOUT_MS },
  );
  const text = await res.text();
  checkHTTP(res.status, text);
  const decoded = JSON.parse(text) as ImageGenResponse;

  const items = decoded.data ?? [];
  if (!items.length) throw emptyResultError();

  // 优先收 b64；供应商回链接的逐个下载。统一规整成可写格式（webp → JPEG）。
  // URL 结果可能被对端 CORS 挡住（web 特有）：降级存链接用 <img> 展示
  const images: GenResult["images"] = [];
  for (const item of items) {
    if (item.b64_json) {
      try {
        const blob = await blobFromBase64(item.b64_json);
        images.push(await reencodeToWritable(blob));
      } catch {
        // b64 非法：fallthrough 到 url 分支（同 Swift）
        if (item.url) images.push(await downloadOrRemote(item.url, opts.signal));
      }
    } else if (item.url) {
      images.push(await downloadOrRemote(item.url, opts.signal));
    }
  }
  if (!images.length) throw emptyResultError();
  return { images, costUsd: decoded.usage?.cost };
}

/** base64 → Blob（按魔数设 MIME —— 空 type 的 Blob 下游 data URL 会是
 *  application/octet-stream，OpenRouter 400 拒绝，已踩）；atob 后立即转 Blob 释放大字符串 */
function blobFromBase64(b64: string): Promise<Blob> {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return Promise.resolve(new Blob([bytes], { type: sniffImageMime(bytes) }));
}

/** 下载 URL 结果图；跨域被挡或 HTTP 错误时降级 remoteUrl（不算失败，图还在） */
async function downloadOrRemote(
  url: string,
  signal?: AbortSignal,
): Promise<GenResult["images"][number]> {
  try {
    const img = await fetch(url, { signal });
    if (!img.ok) throw new Error(String(img.status));
    return await reencodeToWritable(await img.blob());
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    return { remoteUrl: url };
  }
}

// ---------- 厂商图标（官网模型页同款：catalog 聚合 author → 图标文件名） ----------

export async function fetchAuthorIcons(signal?: AbortSignal): Promise<Record<string, string>> {
  const res = await orFetch(
    "https://openrouter.ai/api/frontend/v1/catalog/models",
    { method: "GET" },
    { signal },
  );
  const text = await res.text();
  checkHTTP(res.status, text);
  const decoded = JSON.parse(text) as {
    data?: { author?: string; author_icon_uri?: string }[];
  };
  const icons: Record<string, string> = {};
  for (const entry of decoded.data ?? []) {
    if (!entry.author || icons[entry.author] != null) continue; // 每厂商只取第一个非空
    const uri = entry.author_icon_uri;
    if (!uri) continue;
    icons[entry.author] = uri.startsWith("http")
      ? uri
      : `https://openrouter.ai/images/icons/${uri}`;
  }
  return icons;
}

// ---------- 模型卡片增强（官方展示价 + 示例图 + 短名，一个请求全拿） ----------

export async function fetchImageCards(
  signal?: AbortSignal,
): Promise<Record<string, ModelCard>> {
  const res = await orFetch(
    "https://openrouter.ai/api/frontend/v1/models/find?active=true&fmt=cards&output_modalities=image",
    { method: "GET" },
    { signal },
  );
  const text = await res.text();
  checkHTTP(res.status, text);
  const decoded = JSON.parse(text) as { data?: { models?: ModelCard[] } };
  const cards: Record<string, ModelCard> = {};
  for (const card of decoded.data?.models ?? []) {
    if (card.slug) cards[card.slug] = card;
  }
  return cards;
}

// ---------- Key 验证（设置页输入时快速校验，免费） ----------

export interface KeyCheck {
  ok: boolean;
  /** key 的备注名（仅当用户真设置过才返回 —— OpenRouter 未设备注时 label 默认
   *  是 key 前缀片段，没信息量，过滤掉） */
  label?: string;
  error?: string;
  /** 账户概况（用户明确要求在设置页展示：真实账单类信息，不进生成流程 UI） */
  usageMonthly?: number;
  usageDaily?: number;
  /** null = 未设消费限额 */
  limitRemaining?: number | null;
  isFreeTier?: boolean;
  /** ISO 日期；null = 永不过期 */
  expiresAt?: string | null;
}

/** GET /api/v1/key：200 = 有效（带 key 元信息），401 = 无效。
 *  真实响应验证过：无效 key 返回 {"error":{"message":"User not found."}} + 401 */
export async function verifyApiKey(apiKey: string, signal?: AbortSignal): Promise<KeyCheck> {
  let res: Response;
  try {
    res = await orFetch("/key", { method: "GET" }, { apiKey, signal });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    return { ok: false, error: "网络请求失败，稍后再试" };
  }
  const text = await res.text();
  if (res.status >= 200 && res.status <= 299) {
    const info: KeyCheck = { ok: true };
    try {
      const data = (JSON.parse(text) as {
        data?: {
          label?: string;
          usage_daily?: number;
          usage_monthly?: number;
          limit_remaining?: number | null;
          is_free_tier?: boolean;
          expires_at?: string | null;
        };
      }).data;
      // 未设备注时 label 是 key 前缀形态（如 "sk-or-v1-abc…"）—— 无信息量，不显示
      if (data?.label && !data.label.startsWith("sk-")) info.label = data.label;
      if (typeof data?.usage_monthly === "number") info.usageMonthly = data.usage_monthly;
      if (typeof data?.usage_daily === "number") info.usageDaily = data.usage_daily;
      info.limitRemaining = data?.limit_remaining ?? null;
      info.isFreeTier = data?.is_free_tier;
      info.expiresAt = data?.expires_at ?? null;
    } catch {
      // 解析失败不影响有效性判定
    }
    return info;
  }
  try {
    const body = JSON.parse(text) as { error?: { message?: string } };
    const message = body.error?.message;
    return { ok: false, error: message ? `key 无效（401）：${message}` : "key 无效（401）" };
  } catch {
    return { ok: false, error: `key 无效（HTTP ${res.status}）` };
  }
}

// ---------- 描述翻译（chat completions，花一点点钱） ----------

const TRANSLATE_SYSTEM_PROMPT =
  "你是图像生成模型的产品文案翻译。把用户 JSON 数组里每个模型的英文 description " +
  "翻译成简洁自然的中文介绍：一句话、不超过 40 个字、保留关键卖点，去掉营销废话。" +
  '只返回一个 JSON 对象，键是模型 id 原样照抄，值是中文翻译，不要输出其他任何内容。';

export async function translateDescriptions(
  items: { id: string; text: string }[],
  opts: { apiKey: string; model: string; signal?: AbortSignal },
): Promise<Record<string, string>> {
  const res = await orFetch(
    "/chat/completions",
    {
      method: "POST",
      body: JSON.stringify({
        model: opts.model,
        messages: [
          { role: "system", content: TRANSLATE_SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(items) },
        ],
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
    },
    { apiKey: opts.apiKey, signal: opts.signal },
  );
  const text = await res.text();
  checkHTTP(res.status, text);
  const decoded = JSON.parse(text) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = decoded.choices?.[0]?.message?.content;
  if (!content) throw emptyResultError();
  return JSON.parse(content) as Record<string, string>;
}

// ---------- Agent 组织（系列生成拆分，SSE 流式） ----------

/** Agent 拆分用的内置默认系统提示词（设置页允许改，空/undefined 落回这份默认） */
export const SPLIT_SYSTEM_PROMPT_DEFAULT =
  "你是图像生成的策划。用户给出一个系列生成意图和数量 N，你把它拆解成 " +
  "正好 N 个互相独立、内容不重复的图像生成 prompt：每张画一个具体对象 " +
  "（人/物/场景），共同覆盖意图的主题范围；若意图要求标注名字或特征，" +
  "写进对应那张的 prompt 里。只返回 JSON 对象 " +
  '{"prompts": ["...", ...]}，恰好 N 条，不要输出其他内容。';

/** chat 流式增量：reasoning = 思考过程（推理模型才有），content = 正文 */
export type ChatStreamDelta = { type: "reasoning"; text: string } | { type: "content"; text: string };

export interface SplitOptions {
  apiKey: string;
  model: string;
  count: number;
  systemPrompt?: string;
  /** 修正轮：上一轮完整 JSON + 修正要求（模型看得到自己刚才给了什么） */
  previousJSON?: string;
  amendment?: string;
  onDelta?: (delta: ChatStreamDelta) => void;
  signal?: AbortSignal;
}

/** 把"系列生成意图"拆成正好 count 个独立的单张图像 prompt。
 *  SSE 流式：思考与正文增量经 onDelta 实时回调，全部收完后再整体解析 JSON。
 *  数量对齐：多的截断；少了用原意图兜底（不至于缺张）。 */
export async function splitSeriesPrompt(
  intent: string,
  opts: SplitOptions,
): Promise<string[]> {
  const messages: { role: string; content: string }[] = [
    {
      role: "system",
      content: opts.systemPrompt?.trim() || SPLIT_SYSTEM_PROMPT_DEFAULT,
    },
    { role: "user", content: `意图：${intent}\n数量：${opts.count}` },
  ];
  if (opts.previousJSON && opts.amendment) {
    messages.push({ role: "assistant", content: opts.previousJSON });
    messages.push({
      role: "user",
      content:
        `修正要求：${opts.amendment}\n` +
        `请据此重新给出全部 ${opts.count} 条 prompt，仍只返回 JSON 对象 ` +
        `{"prompts": ["...", ...]}，恰好 ${opts.count} 条，不要输出其他内容。`,
    });
  }

  const res = await orFetch(
    "/chat/completions",
    {
      method: "POST",
      body: JSON.stringify({
        model: opts.model,
        messages,
        temperature: 0.4,
        response_format: { type: "json_object" },
        stream: true,
      }),
    },
    { apiKey: opts.apiKey, signal: opts.signal },
  );

  if (!res.ok) {
    // 错误体也走这条流：读干拼回文本，交给统一的错误解析
    const body = await drainStream(res);
    checkHTTP(res.status, body);
  }

  let content = "";
  await readSSE(res, (line) => {
    if (!line.startsWith("data:")) return; // 跳过 ": OPENROUTER PROCESSING" 心跳与空行
    const payload = line.slice(5).trim();
    if (payload === "[DONE]") return;
    let chunk: { choices?: { delta?: { content?: string; reasoning?: string } }[] };
    try {
      chunk = JSON.parse(payload);
    } catch {
      return;
    }
    const delta = chunk.choices?.[0]?.delta;
    if (!delta) return;
    if (delta.reasoning) opts.onDelta?.({ type: "reasoning", text: delta.reasoning });
    if (delta.content) {
      content += delta.content;
      opts.onDelta?.({ type: "content", text: delta.content });
    }
  });

  let prompts: string[] | undefined;
  try {
    const obj = JSON.parse(content) as { prompts?: string[] };
    prompts = obj.prompts;
  } catch {
    // 整体解析失败 → 落到空结果
  }
  if (!prompts?.length) throw emptyResultError();
  const result = prompts.slice(0, opts.count);
  while (result.length < opts.count) result.push(intent);
  return result;
}

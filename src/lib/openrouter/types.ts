// OpenRouter 线上契约类型（对应 PA/Models/ImageModelInfo.swift + ImageGenResponse.swift）。
// ⚠️ Swift 版两大静默坑的移植纪律：所有 snake_case 键名逐字核对；
// display_pricing 嵌套在 endpoint 下（不在卡片顶层）。

// ---------- GET /api/v1/images/models ----------

export interface SupportedParameters {
  input_references?: { min?: number; max?: number };
  resolution?: { values?: string[] };
  aspect_ratio?: { values?: string[] };
  /** 单请求出图张数上限（各模型不一：1/4/6/10） */
  n?: { min?: number; max?: number };
}

export interface Architecture {
  input_modalities?: string[];
  output_modalities?: string[];
}

export interface ImageModelInfo {
  id: string; // 如 "google/gemini-2.5-flash-image"
  name: string; // 如 "Google: Gemini 2.5 Flash Image"
  created?: number; // Unix 时间戳，用来把新模型排前面
  description?: string;
  architecture?: Architecture;
  supported_parameters?: SupportedParameters;
}

// ---------- GET /api/frontend/v1/models/find?...&fmt=cards&output_modalities=image ----------

export interface DisplayPricing {
  kind?: string; // "unit"（按张）/ "token"
  sku_label?: string; // "Image Output"（蛇形）
  price?: string; // "0.035"
  /** ⚠️ 原始 JSON 里就是驼峰（不是 unit_label）—— 真实响应验证过，
   *  解错这层计价全丢且无报错（Swift 版同类坑） */
  unitLabel?: string; // "/image" | "/megapixel"
}

export interface ModelCard {
  slug?: string;
  name?: string;
  short_name?: string;
  author?: string;
  author_display_name?: string;
  author_icon_uri?: string;
  preview_thumbnail_url?: string;
  previews_by_modality?: {
    image?: { url?: string; thumbnail_url?: string };
  };
  /** 计价挂在 endpoint 下 —— 解错层级会静默解出空数组，价格全丢（Swift 已踩） */
  endpoint?: { display_pricing?: DisplayPricing[] };
}

// ---------- POST /api/v1/images ----------

export interface GenerateRequestBody {
  model: string;
  prompt: string;
  /** 分辨率档位（"512"/"1K"/"2K"/"4K"），undefined = 不传用模型默认 */
  resolution?: string;
  /** 宽高比（"1:1"/"16:9"/...），undefined = 不传用模型默认 */
  aspect_ratio?: string;
  /** 参考图（图生图） */
  input_references?: { type: "image_url"; image_url: { url: string } }[];
  /** 单请求出图张数，undefined = 不传（1 张） */
  n?: number;
}

export interface ImageGenResponse {
  data?: { b64_json?: string; url?: string }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    /** 本次请求实际花费（美元） */
    cost?: number;
  };
}

// ---------- 派生属性（对应 ImageModelInfo.swift 的 extension） ----------

/** id 的前半段就是供应商："bytedance-seed/seedream-5-0" → "bytedance-seed" */
export function vendorOf(id: string): string {
  return id.split("/")[0] ?? id;
}

/** 输入支持 image = 能吃参考图（图生图/编辑） */
export function supportsImageInput(m: ImageModelInfo): boolean {
  return m.architecture?.input_modalities?.includes("image") === true;
}

/** 参考图上限（0 = 不支持图生图） */
export function maxInputReferences(m: ImageModelInfo): number {
  return m.supported_parameters?.input_references?.max ?? 0;
}

export function supportedResolutions(m: ImageModelInfo): string[] {
  return m.supported_parameters?.resolution?.values ?? [];
}

export function supportedAspectRatios(m: ImageModelInfo): string[] {
  return m.supported_parameters?.aspect_ratio?.values ?? [];
}

/** 分辨率档名 → 像素数值（512→512，1K→1024，2K→2048，4K→4096）。非标准档名返回 null */
export function resolutionPixels(s: string): number | null {
  switch (s.toUpperCase()) {
    case "512":
      return 512;
    case "1K":
      return 1024;
    case "2K":
      return 2048;
    case "4K":
      return 4096;
    default:
      return null;
  }
}

const TIER_ORDER = ["512", "1K", "2K", "4K"];

/** 支持的最高分辨率档位（按档位序取最大而非字典序） */
export function maxResolution(m: ImageModelInfo): string | null {
  const values = supportedResolutions(m);
  if (!values.length) return null;
  return values.reduce((best, cur) =>
    TIER_ORDER.indexOf(cur) > TIER_ORDER.indexOf(best) ? cur : best,
  );
}

/** 不支持 wanted 时，选该模型支持档位里像素数值最接近的（如选 512 只支持 1K/2K → 取 1K）。
 *  支持列表为空或全是非标准档名时返回 null（回落"自动"） */
export function nearestResolution(m: ImageModelInfo, wanted: string): string | null {
  const list = supportedResolutions(m);
  if (list.includes(wanted)) return wanted;
  const target = resolutionPixels(wanted);
  if (target == null || !list.length) return null;
  let best: { res: string; px: number } | null = null;
  for (const res of list) {
    const px = resolutionPixels(res);
    if (px == null) continue;
    if (!best || Math.abs(px - target) < Math.abs(best.px - target)) best = { res, px };
  }
  return best?.res ?? null;
}

/** 声明的单请求最大出图张数（未声明按 1 保守） */
export function maxImages(m: ImageModelInfo): number {
  return Math.max(1, m.supported_parameters?.n?.max ?? 1);
}

/** 支持档里 ≤ 上限像素的最高档（按张模型同价白拿清晰度）。
 *  全部超过上限时取最低档（还是要出图） */
export function bestResolution(m: ImageModelInfo, capPixels: number): string | null {
  const tiers = supportedResolutions(m)
    .map((res) => ({ res, px: resolutionPixels(res) }))
    .filter((t): t is { res: string; px: number } => t.px != null);
  if (!tiers.length) return null;
  const under = tiers.filter((t) => t.px <= capPixels);
  if (under.length) return under.reduce((a, b) => (b.px > a.px ? b : a)).res;
  return tiers.reduce((a, b) => (b.px < a.px ? b : a)).res;
}

/** 紧凑位置（结果卡 badge 等）显示的模型名：截掉括号补语，只留主体部分。
 *  兼容半角 ( 与全角 （；括号在开头时兜底返回原名。 */
export function withoutParenthetical(name: string): string {
  for (const marker of ["(", "（"] as const) {
    const idx = name.indexOf(marker);
    if (idx > 0) {
      const head = name.slice(0, idx).trim();
      if (head) return head;
    }
  }
  return name;
}

/** 具体模型名：去掉 "Vendor: " 前缀 —— 厂商信息由 logo 标示，前缀冗余且
 *  挤占空间（长名 truncate 后只剩供应商前缀，具体名反而看不见） */
export function specificModelName(name: string): string {
  return withoutParenthetical(name).replace(/^[^:：]+:\s*/, "");
}

/** 模型名拆两行：主体（去 Vendor: 前缀、去括号补语）+ 括号补语（含括号，可缺省）。
 *  菜单/列表用：括号部分换行显示在下面，弹窗宽度按主体最大长度自适应 */
export function modelNameParts(name: string): { main: string; paren?: string } {
  for (const marker of ["(", "（"] as const) {
    const idx = name.indexOf(marker);
    if (idx > 0) {
      const head = name.slice(0, idx).trim();
      if (head) {
        return { main: head.replace(/^[^:：]+:\s*/, ""), paren: name.slice(idx).trim() };
      }
    }
  }
  return { main: name.replace(/^[^:：]+:\s*/, "") };
}

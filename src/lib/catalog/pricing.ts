// gpt2 计价推导（对应 PA/State/ModelCatalog.swift）。
// 计价模式：flat = 按张固定（分辨率不影响价格，发送时拉满分辨率）；
// perPixel = 按百万像素；measured = token 计价模型的实测均价（分辨率影响价格）。
import type { ModelCard } from "@/lib/openrouter/types";

export type PriceMode = "flat" | "perPixel" | "measured";

/** 基准：GPT Image 2 实测均价 $0.011/张（1024² 输出，activity 2026-08-20 四次均值） */
export const GPT2_BASE_PRICE = 0.011;

/** token 计价模型的实测均价（$/张，1024² 输出）—— 只收有实测的，不猜 */
export const TOKEN_MODEL_MEASURED: Record<string, number> = {
  "openai/gpt-image-2": 0.011,
  "openai/gpt-image-1-mini": 0.010,
  "google/gemini-2.5-flash-image": 0.039,
  "google/gemini-3.1-flash-image-preview": 0.061,
  "google/gemini-3-pro-image": 0.136,
  "google/gemini-3-pro-image-preview": 0.136,
  "microsoft/mai-image-2.5-pro": 0.114,
};

export interface CatalogPricing {
  /** 每张美元价（按 1MP 输出折算）+ 计价模式 */
  pricePerImage: Record<string, { usd: number; mode: PriceMode }>;
  /** token 计价且无实测均价的模型 —— UI 显示"按 token" */
  tokenPricedModels: Set<string>;
  /** 模型 id → 官方短名（如 "Seedream 5.0 Lite"） */
  shortNames: Record<string, string>;
  /** vendor → 厂商显示名（如 "bytedance-seed" → "ByteDance Seed"） */
  vendorNames: Record<string, string>;
  /** 模型 id → 官方示例图缩略图 URL */
  thumbnails: Record<string, string>;
  /** 模型 id → 官方示例图原图 URL */
  sampleOriginals: Record<string, string>;
}

export function emptyPricing(): CatalogPricing {
  return {
    pricePerImage: {},
    tokenPricedModels: new Set(),
    shortNames: {},
    vendorNames: {},
    thumbnails: {},
    sampleOriginals: {},
  };
}

/** 从 models/find 卡片派生计价与展示数据。计价换算（1MP 基准）：
 *  /image 固定每张价（多条质量档取最大，保守）→ flat；
 *  /megapixel 按像素 → perPixel（×1.05 折 1MP ≈ 1024²）；
 *  按张价目没有 → token 计价模型：有实测均价用估值（≈），没有标"按 token" */
export function derivePricing(cards: Record<string, ModelCard>): CatalogPricing {
  const out = emptyPricing();
  for (const [slug, card] of Object.entries(cards)) {
    if (card.short_name) out.shortNames[slug] = card.short_name;
    if (card.author && card.author_display_name) {
      out.vendorNames[card.author] = card.author_display_name;
    }
    if (card.preview_thumbnail_url) out.thumbnails[slug] = card.preview_thumbnail_url;
    const original = card.previews_by_modality?.image?.url;
    if (original) out.sampleOriginals[slug] = original;

    for (const p of card.endpoint?.display_pricing ?? []) {
      const value = p.price ? Number(p.price) : NaN;
      if (!Number.isFinite(value) || !p.unitLabel) continue;
      if (p.unitLabel === "/image") {
        const old = out.pricePerImage[slug];
        if (old?.mode === "flat" && old.usd >= value) continue; // 多条质量档取最大
        out.pricePerImage[slug] = { usd: value, mode: "flat" };
      } else if (p.unitLabel === "/megapixel") {
        out.pricePerImage[slug] = { usd: value * 1.05, mode: "perPixel" };
      }
    }
    if (!out.pricePerImage[slug]) {
      const hasToken = (card.endpoint?.display_pricing ?? []).some(
        (p) => p.kind === "token",
      );
      if (hasToken) {
        const measured = TOKEN_MODEL_MEASURED[slug];
        if (measured != null) out.pricePerImage[slug] = { usd: measured, mode: "measured" };
        else out.tokenPricedModels.add(slug);
      }
    }
  }
  return out;
}

export function gpt2Label(usd: number, approx: boolean): string {
  const ratio = usd / GPT2_BASE_PRICE;
  const num = ratio >= 10 ? ratio.toFixed(0) : ratio.toFixed(1);
  return `${approx ? "≈" : ""}${num} gpt2`;
}

/** 计价标签文案："6.6 gpt2"（价目精确）/ "≈12.4 gpt2"（实测估算）/
 *  "按 token"（无任何实测）/ null（无计价数据）。token 模型优先级：库内实测 > 静态实测表 */
export function priceLabel(
  modelId: string,
  pricing: CatalogPricing,
  measuredCosts: Record<string, number>,
): string | null {
  const isTokenPriced =
    pricing.tokenPricedModels.has(modelId) ||
    pricing.pricePerImage[modelId]?.mode === "measured";
  if (isTokenPriced && measuredCosts[modelId] != null) {
    return gpt2Label(measuredCosts[modelId], true);
  }
  const price = pricing.pricePerImage[modelId];
  if (price) return gpt2Label(price.usd, price.mode === "measured");
  return isTokenPriced ? "按 token" : null;
}

/** 实际消耗金额 → gpt2 文案（大图头部/历史条目用）。API usage 是真实账单，
 *  按基准单位换算是精确除法，不带 ≈ */
export function consumedLabel(usd: number): string {
  return gpt2Label(usd, false);
}

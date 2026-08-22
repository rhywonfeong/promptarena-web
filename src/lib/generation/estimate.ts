// 分辨率档位决策 + 单张预估（对应 ComparisonViewModel.resolutionFor / perImageEstimate）
import type { CatalogPricing } from "@/lib/catalog/pricing";
import {
  bestResolution,
  nearestResolution,
  resolutionPixels,
  type ImageModelInfo,
} from "@/lib/openrouter/types";

/** 分辨率档位决策：按张计费（flat，价格与分辨率无关）→ 该模型支持档里
 *  不超上限的最高档（同价拿清晰度，但尊重上限）；
 *  按量计费（按像素/token）→ 用户选的档位（"" = 不传；不支持 → 最靠近档） */
export function resolutionFor(
  info: ImageModelInfo,
  pricing: CatalogPricing,
  selectedResolution: string,
  flatCap: string,
): string | null {
  if (pricing.pricePerImage[info.id]?.mode === "flat") {
    const capPixels = resolutionPixels(flatCap) ?? 2048;
    return bestResolution(info, capPixels);
  }
  if (!selectedResolution) return null;
  return nearestResolution(info, selectedResolution);
}

/** 单张预估（美元）：flat / measured = 每张标价或实测均价；
 *  perPixel = 1MP 价 × 实际将发送档位的像素倍数（512²=0.26 … 4K²=16.8）；
 *  无计价数据（"按 token"且无实测）→ null */
export function perImageEstimate(
  modelId: string,
  resolution: string | null,
  pricing: CatalogPricing,
): number | null {
  const price = pricing.pricePerImage[modelId];
  if (!price) return null;
  if (price.mode === "flat" || price.mode === "measured") return price.usd;
  let megapixels = 1.05; // 1K / 未传 / 未知档
  switch (resolution?.toUpperCase()) {
    case "512":
      megapixels = 0.26;
      break;
    case "2K":
      megapixels = 4.2;
      break;
    case "4K":
      megapixels = 16.8;
      break;
  }
  return price.usd * megapixels;
}

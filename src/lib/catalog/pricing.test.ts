// 计价推导单测（静默错误高发区）：display_pricing 嵌套层级 + unitLabel 驼峰。
// 真实 JSON 样本取自 2026-08 线上响应（scripts/smoke-contracts.ts 会再跑一遍活的）。
import { describe, expect, it } from "vitest";
import { derivePricing, priceLabel, consumedLabel, gpt2Label } from "./pricing";
import type { ModelCard } from "@/lib/openrouter/types";

function card(partial: Partial<ModelCard>): ModelCard {
  return {
    slug: "test/model",
    endpoint: {},
    ...partial,
  };
}

describe("derivePricing", () => {
  it("flat：/image 价目，多条质量档取最大", () => {
    const pricing = derivePricing({
      "a/flat": card({
        endpoint: {
          display_pricing: [
            { kind: "unit", price: "0.035", unitLabel: "/image" },
            { kind: "unit", price: "0.02", unitLabel: "/image" },
          ],
        },
      }),
    });
    expect(pricing.pricePerImage["a/flat"]).toEqual({ usd: 0.035, mode: "flat" });
  });

  it("perPixel：/megapixel 价 ×1.05 折 1MP", () => {
    const pricing = derivePricing({
      "b/pp": card({
        endpoint: { display_pricing: [{ kind: "unit", price: "0.01", unitLabel: "/megapixel" }] },
      }),
    });
    expect(pricing.pricePerImage["b/pp"]).toEqual({ usd: 0.0105, mode: "perPixel" });
  });

  it("token 计价有静态实测 → measured（带 ≈）", () => {
    const pricing = derivePricing({
      "google/gemini-2.5-flash-image": card({
        endpoint: { display_pricing: [{ kind: "token", price: "1", unitLabel: "/1M tokens" }] },
      }),
    });
    expect(pricing.pricePerImage["google/gemini-2.5-flash-image"]).toEqual({
      usd: 0.039,
      mode: "measured",
    });
    expect(priceLabel("google/gemini-2.5-flash-image", pricing, {})).toBe("≈3.5 gpt2");
  });

  it("token 计价无实测 → tokenPricedModels（「按 token」）；库内实测优先", () => {
    const pricing = derivePricing({
      "c/token": card({
        endpoint: { display_pricing: [{ kind: "token", price: "1", unitLabel: "/1K tokens" }] },
      }),
    });
    expect(pricing.tokenPricedModels.has("c/token")).toBe(true);
    expect(priceLabel("c/token", pricing, {})).toBe("按 token");
    // 库内实测注入后 → ≈ 标签
    expect(priceLabel("c/token", pricing, { "c/token": 0.05 })).toBe("≈4.5 gpt2");
  });

  it("display_pricing 在卡片顶层（解错层级的位置）不生效 —— 契约锁定", () => {
    const pricing = derivePricing({
      // @ts-expect-error 故意放错层级（真实 API 在 endpoint 下）
      "d/wrong": card({ display_pricing: [{ kind: "unit", price: "9", unitLabel: "/image" }] }),
    });
    expect(pricing.pricePerImage["d/wrong"]).toBeUndefined();
  });

  it("蛇形 unit_label 不生效 —— 真实 API 是驼峰 unitLabel（踩过的静默坑）", () => {
    const pricing = derivePricing({
      "e/snake": card({
        endpoint: {
          display_pricing: [
            // @ts-expect-error 故意用蛇形（真实 API 是驼峰）
            { kind: "unit", price: "9", unit_label: "/image" },
          ],
        },
      }),
    });
    expect(pricing.pricePerImage["e/snake"]).toBeUndefined();
  });
});

describe("gpt2 标签", () => {
  it("基准换算与格式（≥10 无小数，<10 一位小数）", () => {
    expect(gpt2Label(0.011, false)).toBe("1.0 gpt2");
    expect(gpt2Label(0.11, false)).toBe("10 gpt2");
    expect(gpt2Label(0.035, false)).toBe("3.2 gpt2");
    expect(consumedLabel(0.042)).toBe("3.8 gpt2"); // 实际消耗不带 ≈
  });
});

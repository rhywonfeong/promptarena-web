// 参数映射与序号表单测（estimate.ts + task.ts 纯函数）
import { describe, expect, it } from "vitest";
import { perImageEstimate, resolutionFor } from "./estimate";
import { sequenceLabels, type GenerationTask } from "./task";
import { emptyPricing } from "@/lib/catalog/pricing";
import type { ImageModelInfo } from "@/lib/openrouter/types";

function model(partial: Partial<ImageModelInfo>): ImageModelInfo {
  return {
    id: "test/model",
    name: "Test: Model",
    supported_parameters: { resolution: { values: ["1K", "2K", "4K"] } },
    ...partial,
  };
}

function task(partial: Partial<GenerationTask>): GenerationTask {
  return {
    id: "test/model",
    modelId: "test/model",
    name: "Test: Model",
    maxReferences: 4,
    resolution: null,
    aspectRatio: null,
    phase: "loading",
    liked: false,
    seriesIndex: 0,
    ...partial,
  };
}

describe("resolutionFor", () => {
  const flatPricing = {
    ...emptyPricing(),
    pricePerImage: { "test/flat": { usd: 0.03, mode: "flat" as const } },
  };

  it("flat 模型拉满 ≤ 上限的最高档", () => {
    const m = model({ id: "test/flat", supported_parameters: { resolution: { values: ["1K", "2K", "4K"] } } });
    expect(resolutionFor(m, flatPricing, "512", "2K")).toBe("2K"); // 同价拿清晰度但不超上限
  });

  it("flat 全档超上限 → 取最低档（还是要出图）", () => {
    const m = model({ id: "test/flat", supported_parameters: { resolution: { values: ["2K", "4K"] } } });
    expect(resolutionFor(m, flatPricing, "", "1K")).toBe("2K");
  });

  it("按量模型：不支持的档取像素最接近档", () => {
    const m = model({ supported_parameters: { resolution: { values: ["1K", "2K"] } } });
    expect(resolutionFor(m, emptyPricing(), "512", "2K")).toBe("1K");
    expect(resolutionFor(m, emptyPricing(), "4K", "2K")).toBe("2K");
  });

  it("自动 = 不传（null）", () => {
    expect(resolutionFor(model({}), emptyPricing(), "", "2K")).toBeNull();
  });
});

describe("perImageEstimate", () => {
  const pricing = {
    ...emptyPricing(),
    pricePerImage: {
      "a/flat": { usd: 0.03, mode: "flat" as const },
      "b/pp": { usd: 0.01, mode: "perPixel" as const },
    },
  };

  it("flat / 无计价", () => {
    expect(perImageEstimate("a/flat", "512", pricing)).toBe(0.03); // flat 与分辨率无关
    expect(perImageEstimate("c/none", "2K", pricing)).toBeNull(); // 无法估
  });

  it("perPixel 按档位像素倍数（512=0.26 / 1K=1.05 / 2K=4.2 / 4K=16.8 / 未传=1.05）", () => {
    expect(perImageEstimate("b/pp", "512", pricing)).toBeCloseTo(0.0026);
    expect(perImageEstimate("b/pp", "1K", pricing)).toBeCloseTo(0.0105);
    expect(perImageEstimate("b/pp", "2K", pricing)).toBeCloseTo(0.042);
    expect(perImageEstimate("b/pp", "4K", pricing)).toBeCloseTo(0.168);
    expect(perImageEstimate("b/pp", null, pricing)).toBeCloseTo(0.0105);
  });
});

describe("sequenceLabels", () => {
  it("同模型多张 → k/N（seriesIndex 排序，与生成张序一致）；单张不进表", () => {
    const labels = sequenceLabels([
      task({ id: "m#1", seriesIndex: 1 }),
      task({ id: "x", modelId: "x" }),
      task({ id: "m", seriesIndex: 0 }),
    ]);
    expect(labels["m"]).toBe("1/2");
    expect(labels["m#1"]).toBe("2/2");
    expect(labels["x"]).toBeUndefined();
  });
});

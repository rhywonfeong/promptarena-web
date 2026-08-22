// USD→CNY 实时汇率（open.er-api.com 免费无 key），仅用于显示折算。
// 失败用上次缓存（usd_to_cny），再没有回退 7.0 —— 对应 ExchangeRateStore.swift
import { loadJSON, saveJSON } from "@/lib/utils/storage";

const FALLBACK_RATE = 7.0;

export function cachedRate(): number {
  const cached = loadJSON<number | null>("usd_to_cny", null);
  return typeof cached === "number" && cached > 0 ? cached : FALLBACK_RATE;
}

export async function fetchRate(): Promise<number> {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD");
    if (!res.ok) throw new Error(String(res.status));
    const body = (await res.json()) as { rates?: { CNY?: number } };
    const cny = body.rates?.CNY;
    if (typeof cny !== "number" || cny <= 0) throw new Error("bad rate");
    saveJSON("usd_to_cny", cny);
    return cny;
  } catch {
    return cachedRate();
  }
}

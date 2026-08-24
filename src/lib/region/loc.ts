// IP 归属地检测：设置页判断是否建议开「同域代理」。
// 生产 = 本站 Worker 直接报 CF 边缘看到的来源国家码（能开本站就能查）；
// dev = vite 代理到 cloudflare 的 cdn-cgi/trace（key=value 文本），两种格式统一解析。
import { useQuery } from "@tanstack/react-query";

/** 这些地区的 IP 会被部分 provider 按合规拦截（中国大陆 + 港澳台） */
export const RESTRICTED_COUNTRIES = new Set(["CN", "HK", "MO", "TW"]);

/** 解析归属地响应：Worker 的 {"country":"CN"} 或 trace 文本的 loc=CN；查不到 = null */
export function parseLoc(text: string): string | null {
  try {
    const json = JSON.parse(text) as { country?: string | null };
    return json.country ?? null;
  } catch {
    // 不是 JSON → 按 cloudflare trace 文本抽 loc=XX
  }
  const m = text.match(/^loc=([A-Z]{2})$/m);
  return m ? m[1] : null;
}

/** 当前 IP 的国家码（查不到返回 null，调用方静默不提示） */
export async function fetchLoc(signal?: AbortSignal): Promise<string | null> {
  const res = await fetch("/api/loc", { signal });
  return parseLoc(await res.text());
}

/** 国家码 → 中文名（Intl 原生；不支持时退回原码） */
export function regionName(code: string): string {
  try {
    return new Intl.DisplayNames(["zh"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** 设置页用的归属地查询（失败静默：不显示提示，不影响开关本身） */
export function useLoc() {
  return useQuery({
    queryKey: ["loc"],
    queryFn: ({ signal }) => fetchLoc(signal),
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
}

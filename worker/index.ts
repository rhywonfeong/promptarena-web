// 同域透传 Worker（OpenRouter 受限模型代理）：浏览器把 https://openrouter.ai/xxx
// 改写成 /api/or/xxx 发到本站，这里白名单校验后转发到固定出口 —— CF Worker 的 fetch
// 出口跟随访问者接入舱位（香港用户落 HKG 舱 → 出口仍判 HK → 403，已实测踩坑），
// 所以经 or.collectui.pro（va1 美国服务器上的 caddy 透传，tunnel 接入）转发，
// 出口地区恒为美国。key 由浏览器带在请求头里，仅透传不落盘。
// 路由：wrangler.jsonc 的 run_worker_first 让 /api/* 先进这里，其余 asset-first
// （静态资源不进 Worker 不计费；SPA 深链接由 ASSETS 兜底 → not_found_handling）。

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  /** or.collectui.pro 的共享密钥（wrangler secret），防出口被公网蹭用 */
  PROXY_KEY?: string;
}

/** CF 边缘看到的请求属性（workers-types 未安装，用结构类型取 country） */
type CFRequest = Request & { cf?: { country?: string } };

const UPSTREAM = "https://or.collectui.pro";
const PROXY_PREFIX = "/api/or/";

/** 404 工厂（复用同一个 Response 实例有 body-used 边界，每次新建最稳） */
const notFound = () => new Response("Not Found", { status: 404 });

/** 转发前必须剥掉的头：CF 边缘给浏览器→Worker 的请求注入了 CF-IPCountry /
 *  CF-Connecting-IP 等身份地理信息（值 = 用户的真实地区），原样透传给同样在 CF 后面的
 *  openrouter.ai 等于把「我在受限地区」递过去 —— 代理就白做了 */
const STRIP_HEADERS = [
  "cf-connecting-ip",
  "cf-ipcountry",
  "cf-ray",
  "cf-visitor",
  "cf-worker",
  "cf-ew-via",
  "cdn-loop",
  "x-forwarded-for",
  "x-forwarded-proto",
  "x-real-ip",
  "true-client-ip",
  "forwarded",
];

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith(PROXY_PREFIX)) {
      // 去前缀保留前导 /："/api/or/api/v1/images" → "/api/v1/images"
      const rest = url.pathname.slice(PROXY_PREFIX.length - 1);
      // 白名单防 open relay：只放行 API 与站内图标资源。rest 来自 pathname，
      // "//evil.com" 之类天然被前缀校验挡掉，无 SSRF 面
      const pathOk = rest.startsWith("/api/") || rest.startsWith("/images/");
      const methodOk = request.method === "GET" || request.method === "POST" || request.method === "HEAD";
      if (!pathOk || !methodOk) return notFound();
      // 官方 proxy 模式：method/headers/body 原样（Authorization 与 HTTP-Referer
      // 归因头都来自浏览器），只换 URL、剥掉身份地理头、带上出口密钥；
      // 响应不读 body 直接 return → 流式透传（SSE 可用）
      const fwd = new Request(UPSTREAM + rest + url.search, request);
      for (const h of STRIP_HEADERS) fwd.headers.delete(h);
      fwd.headers.set("X-Proxy-Key", env.PROXY_KEY ?? "");
      return fetch(fwd);
    }
    // IP 归属地：CF 边缘直接报来源国家码（设置页判断是否建议开代理；零外部依赖）
    if (url.pathname === "/api/loc") {
      const country = (request as CFRequest).cf?.country ?? null;
      return new Response(JSON.stringify({ country }), {
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }
    // 未知 API 路径直接 404（不落 ASSETS，免得 200 出 index.html 干扰排障）
    if (url.pathname.startsWith("/api/")) return notFound();
    return env.ASSETS.fetch(request);
  },
};

// 新版本自动更新：轮询线上 index.html 的主 chunk 文件名（Vite 内容寻址，部署即变），
// 发现新部署且页面空闲（刷新不会丢任何进行中的工作）时自动 reload。
// dev 不启用（有 HMR）；生产 60s 一查，回前台立刻查。
import { generationStore } from "@/stores/generation";
import { viewerStore } from "@/stores/viewer";
import { upscaleStore } from "@/stores/upscale";

const POLL_MS = 60_000;

/** 运行中页面的主 chunk（Vite 注入的入口 <script src="/assets/index-xxx.js">） */
function currentMainChunk(): string | null {
  const el = document.querySelector<HTMLScriptElement>('script[src*="/assets/index-"]');
  if (!el) return null;
  return new URL(el.src, location.href).pathname;
}

/** 线上部署的主 chunk（no-store + 时间戳参数绕一切缓存） */
async function deployedMainChunk(): Promise<string | null> {
  try {
    const res = await fetch(`/?_v=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    const html = await res.text();
    return html.match(/\/assets\/index-[^"']+\.js/)?.[0] ?? null;
  } catch {
    return null; // 网络失败：下轮再查
  }
}

/** 刷新安全：没有会因 reload 丢失的工作 ——
 *  生成/拆分/待发的代理重试/高清晰化/查看器（内存 Blob）/输入条草稿 */
function isIdle(): boolean {
  const g = generationStore.state;
  if (g.isRunning || g.isPlanning || g.splitPending) return false;
  if (g.draftPrompt.trim() || g.draftReferences.length) return false;
  if (Object.values(g.tasks).some((t) => t.phase === "loading" || t.autoRetryAt != null)) {
    return false;
  }
  if (viewerStore.state.items.length) return false;
  if (upscaleStore.state.tasks.some((t) => t.phase === "loading")) return false;
  return true;
}

/** 启动版本监测（__root 挂一次）。发现新部署后等空闲再刷：忙时最多延迟到下一轮轮询 */
export function startVersionWatch() {
  if (!import.meta.env.PROD) return;
  const current = currentMainChunk();
  if (!current) return;
  let pendingReload = false;

  const check = async () => {
    if (document.visibilityState !== "visible") return; // 后台 tab：回前台再说
    if (!pendingReload) {
      const deployed = await deployedMainChunk();
      if (!deployed || deployed === current) return;
      pendingReload = true;
    }
    if (isIdle()) location.reload();
  };

  setInterval(check, POLL_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void check();
  });
}

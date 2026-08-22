import { useEffect, useState } from "react";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";

import { AppShell } from "@/components/layout/AppShell";
import { ImageViewer } from "@/components/viewer/ImageViewer";
import { LineageOverlay } from "@/components/viewer/LineageOverlay";
import { TooltipProvider } from "@/components/ui/tooltip";
import { probeStorage, type StorageProbeResult } from "@/lib/db/db";

interface RouterContext {
  queryClient: QueryClient;
}

function RootLayout() {
  const [probe, setProbe] = useState<StorageProbeResult | null>(null);
  // 启动探测：Safari 私密模式 / 全局阻止 Cookie / 隐私扩展会拒写 —— 带原因告知
  useEffect(() => {
    void probeStorage().then(setProbe);
  }, []);

  return (
    <TooltipProvider delayDuration={300}>
      <AppShell>
        {probe && !probe.ok && (
          <div className="border-b border-orange-500/40 bg-orange-500/10 px-4 py-2 text-center text-xs text-orange-600">
            本地存储不可用（{probe.stage === "localStorage" ? "localStorage" : "IndexedDB"}
            {probe.error ? `：${probe.error}` : ""}），生成记录无法保存 ——
            请检查浏览器是否处于隐私/私密模式、是否全局阻止了 Cookie，或被隐私类扩展拦截
          </div>
        )}
        <Outlet />
        {/* 全屏 overlay 挂根层：切路由不卸载（内存 Blob 载荷 + upscale 后台任务） */}
        <ImageViewer />
        <LineageOverlay />
      </AppShell>
    </TooltipProvider>
  );
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});

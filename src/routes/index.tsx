// 主页（对应 ContentView）：上滚动区（本轮提示词 → 参考图 strip → 全失败横幅 →
// 结果网格 → 预估行）+ 底部输入栏（PromptBar + StatusLine）。
import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useStore } from "@tanstack/react-store";
import { Link } from "@tanstack/react-router";
import { RefreshCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCatalog } from "@/lib/catalog/useCatalog";
import { start } from "@/lib/generation/engine";
import { generationStore } from "@/stores/generation";
import { DraftReferenceStrip, PromptBar } from "@/components/home/PromptBar";
import { StatusLine } from "@/components/home/StatusLine";
import { ResultGrid } from "@/components/home/ResultGrid";
import {
  AllFailedBanner,
  CurrentPromptBar,
  EstimateLine,
  LastReferenceStrip,
} from "@/components/home/CurrentPromptBar";
import { useSelectedModels } from "@/components/home/ParamBar";
import { AgentSplitPanel } from "@/components/home/AgentSplitPanel";
import { ensureTranslations } from "@/lib/translate/translate";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const catalog = useCatalog();
  const selectedModels = useSelectedModels(catalog.modelById);
  const taskOrder = useStore(generationStore, (s) => s.taskOrder);

  // 模型列表加载完成后后台补翻译（不阻塞列表出现）
  useEffect(() => {
    if (catalog.state === "idle") ensureTranslations(catalog.models);
  }, [catalog.state, catalog.models]);

  function beginStart() {
    void start({ models: catalog.modelById, pricing: catalog.pricing });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {catalog.state === "loading" && (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            正在获取模型列表…
          </div>
        )}
        {catalog.state === "failed" && (
          <div className="flex flex-col items-center gap-3 p-8 text-center">
            <p className="text-sm text-muted-foreground">
              模型列表加载失败：{catalog.errorMessage ?? "网络错误"}
            </p>
            <p className="text-xs text-muted-foreground/70">请检查网络或代理是否放行 openrouter.ai</p>
            <Button variant="outline" size="sm" onClick={() => catalog.refetch()}>
              <RefreshCcw className="size-4" />
              重试
            </Button>
          </div>
        )}
        {catalog.state === "idle" &&
          (!taskOrder.length && !generationStore.state.isPlanning ? (
            // 空态：撑满可视剩余空间居中（不偏上）
            <div className="flex h-full flex-col items-center justify-center">
              <EmptyState />
            </div>
          ) : (
            <div className="space-y-3 p-4 pb-8">
              <CurrentPromptBar />
              <AgentSplitPanel />
              <LastReferenceStrip />
              <AllFailedBanner />
              <ResultGrid />
              <EstimateLine />
            </div>
          ))}
      </div>
      {/* 整个输入区（参考图 strip + 输入框 + 提示行）统一底部安全区与留白：
          桌面 ≥8px，iOS Home 条区不遮挡。参考图 strip 在输入区块的上方（区块外） */}
      <div className="pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <DraftReferenceStrip />
        <PromptBar selectedModels={selectedModels} catalogReady={catalog.state === "idle"} onStart={beginStart} />
        <StatusLine catalog={catalog} />
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 text-center text-muted-foreground">
      {/* 空态不用 app logo（那是品牌位）：用生成语义的图标，与历史/点赞空态同风格 */}
      <Sparkles className="size-10 opacity-40" />
      <p className="text-sm">还没有生成记录</p>
      <p className="text-xs text-muted-foreground/70">
        到 <Link to="/models" className="underline underline-offset-2">模型</Link> 页选几个模型、输入提示词，点生成开始对比
      </p>
      <p className="text-[11px] text-muted-foreground/50">
        每次提交都是全新一轮会话 —— 模型不会记得之前的生成内容
      </p>
    </div>
  );
}

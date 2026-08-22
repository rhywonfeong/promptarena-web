// 批次还原对比（对应 BatchDetailView）：把记录包装回卡片复用瀑布流网格 ——
// 一键还原那一轮的对比现场。Agent 批次附拆分明细清单（按张序还原、去重）。
import { createFileRoute, Link } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { recordsByBatch } from "@/lib/db/records.repo";
import { viewerOpen } from "@/stores/viewer";
import type { GenerationRecord } from "@/lib/db/db";
import { WaterfallGrid } from "@/components/common/WaterfallGrid";
import { StaticResultCard } from "@/components/history/StaticResultCard";
import { sequenceOf } from "@/components/history/recordHooks";
import { AgentPromptList } from "@/components/home/AgentSplitPanel";
import { relativeTime } from "@/lib/utils/format";

export const Route = createFileRoute("/history/$batchId")({
  component: BatchDetailPage,
});

function BatchDetailPage() {
  const { batchId } = Route.useParams();
  const records = useLiveQuery(() => recordsByBatch(batchId), [batchId], undefined);

  if (!records) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        加载中…
      </div>
    );
  }
  if (!records.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-sm text-muted-foreground">该批次不存在或已删除</p>
        <Link to="/history">
          <Button variant="outline" size="sm">回历史</Button>
        </Link>
      </div>
    );
  }

  const isAgent = records.some((r) => !!r.intentPrompt);
  const head = records[0];
  const seconds = records.map((r) => r.seconds).filter((s) => s > 0);
  const timeRange = seconds.length
    ? `${Math.min(...seconds).toFixed(1)}–${Math.max(...seconds).toFixed(1)}s`
    : "";
  // Agent 拆分明细：按 seriesIndex 还原、同 prompt 去重
  const subPrompts = isAgent
    ? [...new Map(records.filter((r) => r.intentPrompt).map((r) => [r.seriesIndex, r.prompt])).values()]
    : [];

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mx-auto max-w-5xl">
        <div className="mb-4 flex items-center gap-3">
          <Link to="/history">
            <Button variant="ghost" size="icon" aria-label="返回历史">
              <ArrowLeft className="size-5" />
            </Button>
          </Link>
          {/* 批次头两行排版纪律 */}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {isAgent && <Sparkles className="mr-1 inline size-3.5 text-primary" />}
              {isAgent ? head.intentPrompt : head.prompt}
            </p>
            <p className="mt-0.5 truncate text-xs text-secondary-foreground/70">
              {[isAgent ? "Agent 模式" : null, relativeTime(head.createdAt), `${records.length} 张`, timeRange]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </div>
        {subPrompts.length > 0 && (
          <div className="mb-4 rounded-xl border bg-card p-3">
            <p className="mb-2 text-xs text-muted-foreground">Agent 拆分明细（顺序对应卡片）</p>
            <AgentPromptList prompts={subPrompts} />
          </div>
        )}
        <WaterfallGrid
          items={records}
          itemKey={(r: GenerationRecord) => r.recordId}
          renderItem={(r: GenerationRecord) => (
            <StaticResultCard
              record={r}
              sequence={sequenceOf(records, r)}
              onOpen={() =>
                viewerOpen(
                  records.map((rec) => ({ kind: "record" as const, record: rec })),
                  records.indexOf(r),
                )
              }
            />
          )}
        />
      </div>
    </div>
  );
}

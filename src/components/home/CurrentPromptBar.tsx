// 本轮提示词条 + 参考图 strip + 预估行 + 全军覆没横幅（主页结果区顶部/底部小块）
import { useStore } from "@tanstack/react-store";
import { ChevronDown, ChevronUp, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { generationStore } from "@/stores/generation";
import { retryAll } from "@/lib/generation/engine";
import { viewerOpen } from "@/stores/viewer";
import { useBlobUrl } from "@/lib/image/blobUrl";
import { cachedRate, fetchRate } from "@/lib/rate/rate";
import { formatCny, formatUsd } from "@/lib/utils/format";
import { cn } from "@/lib/utils";

/** 本轮提示词（生成后输入框已清空，顶部留档）：短居中一行；长则可展开 */
export function CurrentPromptBar() {
  const prompt = useStore(generationStore, (s) => s.currentPrompt);
  const [expanded, setExpanded] = useState(false);
  if (!prompt) return null;
  const long = prompt.length > 80;
  return (
    <div className="flex min-w-0 justify-center px-2">
      <div className="min-w-0 max-w-full">
        <p
          className={cn(
            "break-words text-center text-sm text-muted-foreground [overflow-wrap:anywhere]",
            !expanded && "truncate",
          )}
        >
          {prompt}
        </p>
        {long && (
          <button
            className="mx-auto mt-0.5 flex items-center gap-0.5 text-xs text-muted-foreground/80"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
            {expanded ? "收起" : "展开全文"}
          </button>
        )}
      </div>
    </div>
  );
}

/** 本轮参考图 strip（start 后输入条已清空，结果区仍展示；点开全屏翻页对比） */
export function LastReferenceStrip() {
  const blobs = useStore(generationStore, (s) => s.lastReferenceBlobs);
  if (!blobs.length) return null;
  return (
    <div className="flex justify-center gap-2 px-2">
      {blobs.map((blob, i) => (
        <StripThumb
          key={i}
          blob={blob}
          onOpen={() =>
            viewerOpen(
              blobs.map((b) => ({ kind: "reference" as const, blob: b })),
              i,
            )
          }
        />
      ))}
    </div>
  );
}

function StripThumb({ blob, onOpen }: { blob: Blob; onOpen: () => void }) {
  const url = useBlobUrl(blob);
  return (
    <img
      src={url}
      alt=""
      className="size-10 cursor-zoom-in rounded-md border object-cover"
      onClick={onOpen}
    />
  );
}

/** 本轮预估行：「N 张预估 $X.XX · ≈¥Y.Y · M 个模型未计入」 */
export function EstimateLine() {
  const estimate = useStore(generationStore, (s) => s.estimate);
  const rate = useQuery({
    queryKey: ["rate", "USD"],
    queryFn: fetchRate,
    staleTime: 60 * 60 * 1000,
    initialData: cachedRate,
  }).data!;
  if (!estimate) return null;
  return (
    <div className="px-2 text-center text-xs text-muted-foreground">
      {estimate.imageCount} 张预估 {formatUsd(estimate.usd)}
      {estimate.usd > 0 && ` · ${formatCny(estimate.usd, rate)}`}
      {estimate.unpricedCount > 0 && ` · ${estimate.unpricedCount} 个模型未计入`}
    </div>
  );
}

/** 全军覆没横幅：所有卡片都失败 → 「本轮全部失败 · 重试全部」 */
export function AllFailedBanner() {
  const taskOrder = useStore(generationStore, (s) => s.taskOrder);
  const allFailed = useStore(generationStore, (s) =>
    s.taskOrder.length > 0 && !s.isRunning
      ? s.taskOrder.every((id) => s.tasks[id]?.phase === "failed")
      : false,
  );
  if (!taskOrder.length || !allFailed) return null;
  return (
    <div className="mx-2 flex items-center justify-center gap-3 rounded-lg border border-orange-500/40 bg-orange-500/10 px-3 py-2 text-sm text-orange-600">
      <TriangleAlert className="size-4" />
      <span>本轮全部失败</span>
      <Button variant="outline" size="sm" className="h-7 gap-1" onClick={() => void retryAll()}>
        重试全部
      </Button>
    </div>
  );
}

// 演进链 overlay（对应 LineageView）：沿 parentRecordId 回溯到最早祖先，
// 从上到下像聊天记录：图 → 模型名 + prompt + 元信息气泡 → 下箭头 → 下一代；
// 当前代描边高亮 +「当前」角标。叠在查看器之上的第二层 overlay。
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowDown, X } from "lucide-react";
import { useStore } from "@tanstack/react-store";
import { closeLineage, viewerOpen, viewerStore } from "@/stores/viewer";
import { lineageChain } from "@/lib/db/records.repo";
import type { GenerationRecord } from "@/lib/db/db";
import { useRecordSrc, recordMetaLine } from "@/components/history/recordHooks";
import { withoutParenthetical } from "@/lib/openrouter/types";
import { relativeTime } from "@/lib/utils/format";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function LineageOverlay() {
  const recordId = useStore(viewerStore, (s) => s.lineageRecordId);
  const chain = useLiveQuery(
    () => (recordId ? lineageChain(recordId) : Promise.resolve([])),
    [recordId],
    undefined,
  );

  if (!recordId) return null;
  if (!chain) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background text-foreground">
        <p className="text-sm text-muted-foreground">加载演进链…</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-background text-foreground">
      <header className="flex items-center gap-3 px-4 py-3">
        <span className="text-sm font-medium">演进链</span>
        <span className="text-xs text-muted-foreground">{chain.length} 代</span>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto text-foreground hover:bg-accent"
          onClick={closeLineage}
          aria-label="关闭"
        >
          <X className="size-5" />
        </Button>
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-8">
        {chain.map((record, i) => {
          const isCurrent = record.recordId === recordId;
          return (
            <div key={record.recordId}>
              <LineageNode record={record} isCurrent={isCurrent} />
              {i < chain.length - 1 && (
                <div className="flex justify-center py-1 text-muted-foreground/60">
                  <ArrowDown className="size-4" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LineageNode({
  record,
  isCurrent,
}: {
  record: GenerationRecord;
  isCurrent: boolean;
}) {
  const src = useRecordSrc(record);
  return (
    <div
      className={cn(
        "flex items-end gap-3 rounded-xl border p-3",
        isCurrent ? "border-primary bg-primary/10" : "border-border bg-muted/50",
      )}
    >
      {src ? (
        <img
          src={src}
          alt=""
          className="max-h-32 w-auto cursor-zoom-in rounded-lg object-contain"
          onClick={() => {
            closeLineage();
            viewerOpen([{ kind: "record", record }], 0);
          }}
        />
      ) : (
        <div className="h-24 w-24 rounded-lg bg-muted" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">
            {withoutParenthetical(record.modelName)}
          </span>
          {isCurrent && (
            <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] text-primary-foreground">当前</span>
          )}
        </div>
        <p className="mt-1 line-clamp-2 break-words text-xs text-foreground/80 [overflow-wrap:anywhere]">{record.prompt}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground/70">
          {recordMetaLine(record) || relativeTime(record.createdAt)}
        </p>
      </div>
    </div>
  );
}

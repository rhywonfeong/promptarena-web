// 历史页（对应 HistoryView）：成功记录按 batchId 分组倒序。
// 批次头两行排版纪律：主文本（提示词/意图）一行 + 元信息横排一行在其正下方 +
// 操作按钮靠右垂直居中。行 = 演进标记 + 缩略 + 模型名 + 序号 + 元信息 + ♥。
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowRight, GitBranch, Heart, History, Layers, RotateCcw, Sparkles, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { listAllDesc, deleteBatch, deleteRecord, getImage, setLiked } from "@/lib/db/records.repo";
import { openLineage, viewerOpen } from "@/stores/viewer";
import { start } from "@/lib/generation/engine";
import { patchGeneration } from "@/stores/generation";
import { useCatalog } from "@/lib/catalog/useCatalog";
import type { GenerationRecord } from "@/lib/db/db";
import { recordMetaLine, sequenceOf, useRecordSrc } from "@/components/history/recordHooks";
import { relativeTime } from "@/lib/utils/format";
import { Hint } from "@/components/common/Hint";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/history/")({
  component: HistoryPage,
});

interface BatchGroup {
  batchId: string;
  records: GenerationRecord[]; // 组内 seriesIndex 正序
  isEditLineage: boolean; // 编辑链批次（含 parentRecordId）
  isAgent: boolean;
}

function HistoryPage() {
  const done = useLiveQuery(() => listAllDesc(), [], undefined);
  const navigate = useNavigate({ from: "/history" });
  const catalog = useCatalog();

  /** 从历史重试失败记录：还原 prompt/参考图/父链，回主页单模型重跑（新批次） */
  async function retryFromRecord(record: GenerationRecord) {
    const blobs = await Promise.all(record.referenceImageIds.map((id) => getImage(id)));
    patchGeneration({
      draftPrompt: record.prompt,
      draftReferences: blobs
        .filter((b): b is Blob => !!b)
        .map((b) => ({ id: crypto.randomUUID(), blob: b })),
      pendingParentRecordId: record.parentRecordId ?? null,
    });
    navigate({ to: "/" });
    void start({ models: catalog.modelById, pricing: catalog.pricing }, [record.modelId], record.recordId);
  }
  const [deleteBatchId, setDeleteBatchId] = useState<string | null>(null);
  const [deleteRecordId, setDeleteRecordId] = useState<string | null>(null);

  const groups = useMemo<BatchGroup[]>(() => {
    if (!done) return [];
    const byBatch = new Map<string, GenerationRecord[]>();
    for (const rec of done) {
      const list = byBatch.get(rec.batchId) ?? [];
      list.push(rec);
      byBatch.set(rec.batchId, list);
    }
    return [...byBatch.entries()].map(([batchId, records]) => ({
      batchId,
      records: records.sort((a, b) => a.seriesIndex - b.seriesIndex || a.createdAt - b.createdAt),
      isEditLineage: records.some((r) => !!r.parentRecordId),
      isAgent: records.some((r) => !!r.intentPrompt),
    }));
  }, [done]);

  if (!done) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        加载中…
      </div>
    );
  }
  if (!groups.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-sm text-muted-foreground">
        <History className="size-10 opacity-40" />
        <p>还没有生成记录</p>
        <p className="text-xs text-muted-foreground/70">
          回 <Link to="/" className="underline underline-offset-2">主页</Link> 生成一轮就有了
        </p>
      </div>
    );
  }

  const batchToDelete = groups.find((g) => g.batchId === deleteBatchId);

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mx-auto max-w-3xl space-y-4">
        {groups.map((group) => (
          <BatchCard
            key={group.batchId}
            group={group}
            onOpenBatch={() => navigate({ to: "/history/$batchId", params: { batchId: group.batchId } })}
            onOpenLineage={(recordId) => openLineage(recordId)}
            onRetry={(record) => void retryFromRecord(record)}
            onDeleteBatch={() => setDeleteBatchId(group.batchId)}
            onDeleteRecord={(id) => setDeleteRecordId(id)}
          />
        ))}
      </div>

      <AlertDialog open={!!deleteBatchId} onOpenChange={(v) => !v && setDeleteBatchId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除这一轮？</AlertDialogTitle>
            <AlertDialogDescription>
              {batchToDelete ? `${batchToDelete.records.length} 张图片` : ""}将一并删除，不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteBatchId) void deleteBatch(deleteBatchId);
                setDeleteBatchId(null);
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={!!deleteRecordId} onOpenChange={(v) => !v && setDeleteRecordId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除这条记录？</AlertDialogTitle>
            <AlertDialogDescription>图片文件将一并删除，不可恢复。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteRecordId) void deleteRecord(deleteRecordId);
                setDeleteRecordId(null);
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function BatchCard({
  group,
  onOpenBatch,
  onOpenLineage,
  onRetry,
  onDeleteBatch,
  onDeleteRecord,
}: {
  group: BatchGroup;
  onOpenBatch: () => void;
  onOpenLineage: (recordId: string) => void;
  onRetry: (record: GenerationRecord) => void;
  onDeleteBatch: () => void;
  onDeleteRecord: (id: string) => void;
}) {
  const head = group.records[0];
  // 「还原对比」只在 ≥2 张成功图时有意义（全失败/单图无对比价值）
  const doneCount = group.records.filter((r) => r.status === "done").length;
  const seconds = group.records.map((r) => r.seconds).filter((s) => s > 0);
  const timeRange = seconds.length
    ? seconds.length === 1
      ? `${seconds[0].toFixed(1)}s`
      : `${Math.min(...seconds).toFixed(1)}–${Math.max(...seconds).toFixed(1)}s`
    : "";

  return (
    <section className="rounded-xl border bg-card">
      {/* 批次头：主文本一行 + 元信息一行正下方 + 按钮靠右垂直居中 */}
      <header className="flex items-center gap-3 border-b p-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {group.isAgent && <Sparkles className="mr-1 inline size-3.5 text-primary" />}
            {group.isAgent ? group.records[0].intentPrompt : head.prompt}
          </p>
          <p className="mt-0.5 truncate text-xs text-secondary-foreground/70">
            {group.isAgent ? "Agent 模式 · " : ""}
            {group.records.length} 张 · {relativeTime(head.createdAt)}
            {timeRange ? ` · ${timeRange}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {group.isEditLineage ? (
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => onOpenLineage(group.records[0].recordId)}
            >
              <GitBranch className="size-3.5" />
              查看演进链
            </Button>
          ) : (
            doneCount >= 2 && (
              <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={onOpenBatch}>
                <Layers className="size-3.5" />
                还原对比
              </Button>
            )
          )}
          <Button variant="ghost" size="icon" className="size-8" onClick={onDeleteBatch} aria-label="删除整批">
            <Trash2 className="size-4 text-muted-foreground" />
          </Button>
        </div>
      </header>
      <ul className="divide-y">
        {group.records.map((record) => (
          <RecordRow
            key={record.recordId}
            record={record}
            sequence={sequenceOf(group.records, record)}
            onOpen={() =>
              viewerOpen(
                group.records.map((r) => ({ kind: "record" as const, record: r })),
                group.records.indexOf(record),
              )
            }
            onOpenLineage={() => onOpenLineage(record.recordId)}
            onRetry={() => onRetry(record)}
            onDelete={() => onDeleteRecord(record.recordId)}
          />
        ))}
      </ul>
    </section>
  );
}

function RecordRow({
  record,
  sequence,
  onOpen,
  onOpenLineage,
  onRetry,
  onDelete,
}: {
  record: GenerationRecord;
  sequence?: string;
  onOpen: () => void;
  onOpenLineage: () => void;
  onRetry: () => void;
  onDelete: () => void;
}) {
  const src = useRecordSrc(record);
  const [liked, setLikedState] = useState(record.liked === 1);
  const failed = record.status === "failed";

  // 失败行：错误信息 + 重试（无图不可点开/点赞）
  if (failed) {
    return (
      <li className="group flex items-center gap-3 p-3 transition-colors hover:bg-accent/30">
        {record.parentRecordId && (
          <Hint label="由上一张编辑而来">
            <span className="flex shrink-0 items-center text-muted-foreground/60">
              <GitBranch className="size-3.5" />
              <ArrowRight className="size-3" />
            </span>
          </Hint>
        )}
        <div className="flex size-14 shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground/50">
          <TriangleAlert className="size-5 text-orange-500" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm">
            {record.modelName.replace(/^.*?: /, "")}
            {sequence && <span className="ml-1.5 font-mono text-xs text-muted-foreground">{sequence}</span>}
          </p>
          {record.intentPrompt && record.prompt !== record.intentPrompt && (
            <p className="truncate text-xs text-muted-foreground">{record.prompt}</p>
          )}
          <p className="mt-0.5 truncate text-xs text-orange-500">{record.errorMessage ?? "生成失败"}</p>
        </div>
        <Button variant="outline" size="sm" className="h-7 shrink-0 gap-1" onClick={onRetry}>
          <RotateCcw className="size-3" />
          重试
        </Button>
        <button
          className="shrink-0 p-1.5 text-muted-foreground/50 transition-opacity md:opacity-0 md:group-hover:opacity-100"
          onClick={onDelete}
          aria-label="删除"
        >
          <Trash2 className="size-4" />
        </button>
      </li>
    );
  }

  return (
    <li
      className="group flex cursor-pointer items-center gap-3 p-3 transition-colors hover:bg-accent/30"
      onClick={onOpen}
      onContextMenu={(e) => {
        e.preventDefault();
        onOpenLineage();
      }}
    >
      {record.parentRecordId && (
        <Hint label="由上一张编辑而来">
          <span className="flex shrink-0 items-center text-muted-foreground/60">
            <GitBranch className="size-3.5" />
            <ArrowRight className="size-3" />
          </span>
        </Hint>
      )}
      {src ? (
        <img src={src} alt="" className="size-14 shrink-0 cursor-zoom-in rounded-md border object-cover" />
      ) : (
        <div className="size-14 shrink-0 rounded-md border bg-muted" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">
          {record.modelName.replace(/^.*?: /, "")}
          {sequence && <span className="ml-1.5 font-mono text-xs text-muted-foreground">{sequence}</span>}
        </p>
        {record.intentPrompt && record.prompt !== record.intentPrompt && (
          <p className="truncate text-xs text-muted-foreground">{record.prompt}</p>
        )}
        <p className="mt-0.5 truncate text-xs text-secondary-foreground/70">{recordMetaLine(record)}</p>
      </div>
      <button
        className={cn("shrink-0 p-1.5", liked ? "text-red-400" : "text-muted-foreground/50")}
        onClick={() => {
          const next = !liked;
          setLikedState(next);
          void setLiked(record.recordId, next);
        }}
        aria-label="点赞"
      >
        <Heart className={cn("size-4", liked && "fill-current")} />
      </button>
      <button
        // 触屏无 hover：移动端始终显示；桌面 hover 才淡入，视觉更干净
        className="shrink-0 p-1.5 text-muted-foreground/50 transition-opacity md:opacity-0 md:group-hover:opacity-100"
        onClick={onDelete}
        aria-label="删除"
      >
        <Trash2 className="size-4" />
      </button>
    </li>
  );
}

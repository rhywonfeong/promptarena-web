// 来源卡（对应 ImageDetailView 的来源卡区）+ 提示词块：
// 编辑链批次 = [父图缩略 + 标注（同模型→「同模型」，不同→父图像素）] + 提示词；
// 普通批次 = [本轮参考图最多 4 张 + "+N" 折叠] + 提示词。
// 提示词默认单行省略、点击复制（✓ 2 秒）、>36 字给「展开」。
import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, Copy, Plus } from "lucide-react";
import { findRecord, getImage } from "@/lib/db/records.repo";
import type { GenerationRecord } from "@/lib/db/db";
import { openLineage, viewerOpen } from "@/stores/viewer";
import { useBlobUrl } from "@/lib/image/blobUrl";
import { Hint } from "@/components/common/Hint";
import { cn } from "@/lib/utils";

export function SourceCard({
  record,
  prompt,
}: {
  record?: GenerationRecord;
  prompt: string;
}) {
  // 父图（编辑链）
  const parent = useLiveQuery(
    () => (record?.parentRecordId ? findRecord(record.parentRecordId) : Promise.resolve(undefined)),
    [record?.parentRecordId],
    undefined,
  );
  // 本轮参考图 blob 列表
  const refBlobs = useLiveQuery(
    async () => {
      const ids = record?.referenceImageIds ?? [];
      return Promise.all(ids.map((id) => getImage(id)));
    },
    [record?.referenceImageIds?.join(",")],
    [],
  ) ?? [];

  return (
    // 图像正下方的来源卡：整组（缩略 + plus + 提示词）水平居中、垂直居中对齐
    <div className="flex items-center justify-center gap-2">
      {parent && <ParentThumb parent={parent} currentModel={record?.modelId} />}
      {!parent && refBlobs.length > 0 && (
        <div className="flex shrink-0 items-center gap-1">
          {refBlobs.slice(0, 4).map((blob, i) => (
            <RefThumb key={i} blob={blob} onOpen={() => viewerOpen(
              (refBlobs.filter(Boolean) as Blob[]).map((b) => ({ kind: "reference" as const, blob: b })),
              i,
            )} />
          ))}
          {refBlobs.length > 4 && (
            <span className="flex h-11 w-11 items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">
              +{refBlobs.length - 4}
            </span>
          )}
        </div>
      )}
      {(parent || refBlobs.length > 0) && <Plus className="size-3.5 shrink-0 text-muted-foreground/50" />}
      <PromptChunk prompt={prompt} />
    </div>
  );
}

function ParentThumb({
  parent,
  currentModel,
}: {
  parent: GenerationRecord;
  currentModel?: string;
}) {
  const blob = useLiveQuery(() => getImage(parent.imageId ?? ""), [parent.imageId], undefined);
  const url = useBlobUrl(blob);
  const sameModel = parent.modelId === currentModel;
  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <Hint label="点击查看父图 · 右键查看演进链">
      <button
        className="relative"
        onClick={() => {
          // 点父图 → 查看父记录（可继续向上回溯）
          viewerOpen([{ kind: "record", record: parent }], 0);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          openLineage(parent.recordId); // 右键查看演进链（web；iPad 用长按）
        }}
      >
        {url ? (
          <img src={url} alt="" className="size-11 rounded-md border border-border object-cover" />
        ) : (
          <div className="size-11 rounded-md border border-border bg-muted" />
        )}
      </button>
      </Hint>
      <span className="text-[10px] text-muted-foreground">
        {sameModel ? "同模型" : parent.width && parent.height ? `${parent.width}×${parent.height}` : ""}
      </span>
    </div>
  );
}

function RefThumb({ blob, onOpen }: { blob?: Blob; onOpen: () => void }) {
  const url = useBlobUrl(blob);
  return url ? (
    <img
      src={url}
      alt=""
      className="h-11 w-11 cursor-zoom-in rounded-md border border-border object-cover"
      onClick={onOpen}
    />
  ) : (
    <div className="h-11 w-11 rounded-md bg-muted" />
  );
}

function PromptChunk({ prompt }: { prompt: string }) {  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const long = prompt.length > 36;

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  if (!prompt) return null;
  return (
    // 复制图标紧跟 prompt 文字尾部（不推到最右）：文字自适应宽、过长截断时图标跟在省略号后
    <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-left">
      <p
        className={cn(
          "min-w-0 break-words text-sm leading-6 text-foreground/90 [overflow-wrap:anywhere]",
          !expanded && "truncate",
        )}
      >
        {prompt}
      </p>
      {/* 复制：纯图标（图标即语义，不加文字）；成功变 ✓ 2 秒 */}
      <Hint label={copied ? "已复制" : "复制提示词"}>
      <button
        className={cn(
          "shrink-0 cursor-pointer p-0.5",
          copied ? "text-green-500" : "text-muted-foreground hover:text-foreground/80",
        )}
        onClick={() => void navigator.clipboard.writeText(prompt).then(() => setCopied(true))}
        aria-label={copied ? "已复制" : "复制提示词"}
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
      </Hint>
      {long && (
        <button
          className="shrink-0 text-xs text-muted-foreground hover:text-foreground/80"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "收起" : "展开"}
        </button>
      )}
    </div>
  );
}

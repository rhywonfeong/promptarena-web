// 点赞页（对应 LikedView）：模型筛选 chips（vendor logo + 名 + 计数，多的在前，
// 再点取消）+ 自适应网格（固定高图 + 红♥角标 + 模型名）。
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Heart } from "lucide-react";
import { listLikedDone } from "@/lib/db/records.repo";
import { viewerOpen } from "@/stores/viewer";
import type { GenerationRecord } from "@/lib/db/db";
import { VendorAvatar } from "@/components/common/VendorAvatar";
import { useRecordSrc } from "@/components/history/recordHooks";
import { withoutParenthetical } from "@/lib/openrouter/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/liked")({
  component: LikedPage,
});

function LikedPage() {
  const liked = useLiveQuery(() => listLikedDone(), [], undefined);
  const [filter, setFilter] = useState<string | null>(null);

  const byModel = useMemo(() => {
    if (!liked) return [];
    const counts = new Map<string, number>();
    for (const r of liked) counts.set(r.modelId, (counts.get(r.modelId) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [liked]);

  const visible = filter ? (liked ?? []).filter((r) => r.modelId === filter) : (liked ?? []);

  if (!liked) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        加载中…
      </div>
    );
  }
  if (!liked.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-sm text-muted-foreground">
        <Heart className="size-10 opacity-40" />
        <p>还没有点赞的图</p>
        <p className="text-xs text-muted-foreground/70">在结果卡片或大图里点 ♥ 收藏好图</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap gap-1.5 border-b p-3">
        <button
          className={cn(
            "h-8 rounded-full border px-3 text-xs transition-colors",
            !filter ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent",
          )}
          onClick={() => setFilter(null)}
        >
          全部 {liked.length}
        </button>
        {byModel.map(([modelId, count]) => (
          <ModelChip key={modelId} modelId={modelId} count={count} active={filter === modelId} onClick={() => setFilter(filter === modelId ? null : modelId)} />
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
          {visible.map((record, i) => (
            <LikedCell
              key={record.recordId}
              record={record}
              onOpen={() =>
                viewerOpen(
                  visible.map((r) => ({ kind: "record" as const, record: r })),
                  i,
                )
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ModelChip({
  modelId,
  count,
  active,
  onClick,
}: {
  modelId: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  const vendor = modelId.split("/")[0];
  return (
    <button
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors",
        active ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent",
      )}
      onClick={onClick}
    >
      <VendorAvatar vendor={vendor} className="size-4" />
      {modelId.split("/")[1] ?? modelId}
      <span className="text-muted-foreground/70">{count}</span>
    </button>
  );
}

function LikedCell({ record, onOpen }: { record: GenerationRecord; onOpen: () => void }) {
  const src = useRecordSrc(record);
  return (
    <div
      className="group relative cursor-zoom-in overflow-hidden rounded-xl border bg-card"
      onClick={onOpen}
    >
      {src ? (
        <img src={src} alt="" className="h-36 w-full object-cover" />
      ) : (
        <div className="h-36 w-full bg-muted" />
      )}
      <span className="absolute right-1.5 top-1.5 rounded-md bg-black/60 p-1 text-red-400">
        <Heart className="size-3.5 fill-current" />
      </span>
      <p className="truncate px-2 py-1.5 text-xs text-muted-foreground">
        {withoutParenthetical(record.modelName)}
      </p>
    </div>
  );
}

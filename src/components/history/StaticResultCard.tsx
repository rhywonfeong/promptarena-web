// 静态结果卡（历史还原/点赞用）：直接渲染 GenerationRecord，不接运行时 store。
// 头部右侧只放尺寸标签（同 iPad 版 ResultCardView）—— 耗时在图上胶囊、消耗在大图头部。
import { Heart, TriangleAlert } from "lucide-react";
import type { GenerationRecord } from "@/lib/db/db";
import { setLiked } from "@/lib/db/records.repo";
import { useRecordSrc } from "./recordHooks";
import { sizeLabel } from "@/lib/utils/format";
import { withoutParenthetical } from "@/lib/openrouter/types";
import { cn } from "@/lib/utils";

export function StaticResultCard({
  record,
  sequence,
  onOpen,
}: {
  record: GenerationRecord;
  sequence?: string;
  onOpen?: () => void;
}) {
  const src = useRecordSrc(record);
  const size = sizeLabel(record.width, record.height, record.resolution);

  return (
    <div className="relative overflow-hidden rounded-xl border bg-card">
      <div className="flex h-11 items-center gap-2 px-3">
        <span className="truncate text-sm font-medium">
          {withoutParenthetical(record.modelName)}
        </span>
        {size && <span className="ml-auto shrink-0 text-xs text-muted-foreground">{size}</span>}
      </div>
      <div className="relative">
        {src ? (
          <img
            src={src}
            alt=""
            className="w-full cursor-zoom-in object-cover"
            style={record.width && record.height ? { aspectRatio: `${record.width} / ${record.height}` } : undefined}
            onClick={onOpen}
          />
        ) : record.status === "failed" ? (
          <div className="flex min-h-24 flex-col items-center justify-center gap-1 p-3 text-center">
            <TriangleAlert className="size-5 text-orange-500" />
            <span className="text-xs text-orange-500">{record.errorMessage ?? "生成失败"}</span>
          </div>
        ) : (
          <div className="aspect-square bg-muted" />
        )}
        {sequence && (
          <span className="absolute left-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-xs font-mono text-white">
            {sequence}
          </span>
        )}
        {record.seconds > 0 && (
          <span className="absolute bottom-2 right-2 rounded-md bg-black/60 px-1.5 py-0.5 text-xs text-white">
            {record.seconds.toFixed(1)}s
          </span>
        )}
        <LikeButton record={record} />
      </div>
    </div>
  );
}

function LikeButton({ record }: { record: GenerationRecord }) {
  const liked = record.liked === 1;
  return (
    <button
      className={cn(
        "absolute right-2 top-2 rounded-md bg-black/60 p-1.5 text-white transition-transform active:scale-90",
        liked && "text-red-400",
      )}
      onClick={() => void setLiked(record.recordId, !liked)}
      aria-label="点赞"
    >
      <Heart className={cn("size-4", liked && "fill-current")} />
    </button>
  );
}

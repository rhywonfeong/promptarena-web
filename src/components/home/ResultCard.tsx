// 结果卡（对应 PA/Views/ResultCardView.swift）：头部模型名 + 尺寸标签；
// loading 占位（1:1 灰块转圈，布局不跳）/ done（图 + 耗时胶囊 + ♥ + 序号角标）/
// failed（错误消息 + 重试小按钮；地区受限时是自动重试倒计时）。序号角标 loading 就显示。
import { Globe, Heart, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { useStore } from "@tanstack/react-store";
import { generationStore } from "@/stores/generation";
import { enableProxyAndRetry, retry, toggleLike } from "@/lib/generation/engine";
import type { GenerationTask } from "@/lib/generation/task";
import { settingsStore } from "@/stores/settings";
import { useBlobUrl } from "@/lib/image/blobUrl";
import { withoutParenthetical } from "@/lib/openrouter/types";
import { viewerOpen } from "@/stores/viewer";
import { cn } from "@/lib/utils";

export const CARD_HEADER_HEIGHT = 44; // 头部行高（WaterfallGrid 高度推算用）

export function ResultCardView({
  task,
  sequence,
  columnWidth,
}: {
  task: GenerationTask;
  sequence?: string;
  columnWidth: number;
}) {
  // 地区受限但代理开关没开：失败卡显示「开启代理并重试」引导（而不是干等用户去设置页）
  const proxyEnabled = useStore(settingsStore, (s) => s.proxyEnabled);
  return (
    <div className="relative overflow-hidden rounded-xl border bg-card">
      <div className="flex h-11 items-center gap-2 px-3">
        <span className="truncate text-sm font-medium">
          {withoutParenthetical(task.name)}
        </span>
        {task.sizeLabel && (
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">{task.sizeLabel}</span>
        )}
      </div>
      {task.phase === "loading" && (
        <>
          <div className="flex items-center justify-center bg-muted" style={{ height: columnWidth }}>
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <span className="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
              <span className="text-xs">生成中…</span>
            </div>
          </div>
          {sequence && <CornerBadge label={sequence} />}
        </>
      )}
      {task.phase === "failed" && (
        <>
          <div className="flex min-h-24 flex-col items-center justify-center gap-2 p-4 text-center">
            <span className="text-xs text-orange-500">{task.errorMessage}</span>
            {task.autoRetryAt != null ? (
              <AutoRetryCountdown at={task.autoRetryAt} />
            ) : task.regionBlocked && !proxyEnabled ? (
              <>
                <span className="text-xs text-muted-foreground">该模型不允许当前地区直连</span>
                <button
                  className="flex items-center gap-1 rounded-md border border-orange-500/50 px-2 py-1 text-xs text-orange-600 transition-colors hover:bg-orange-500/10"
                  onClick={() => void enableProxyAndRetry(task.id)}
                >
                  <Globe className="size-3" />
                  开启代理并重试
                </button>
              </>
            ) : (
              <button
                className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent"
                onClick={() => void retry(task.id)}
              >
                <RotateCcw className="size-3" />
                重试
              </button>
            )}
          </div>
          {sequence && <CornerBadge label={sequence} />}
        </>
      )}
      {task.phase === "done" && <DoneBody task={task} sequence={sequence} />}
    </div>
  );
}

/** 疑似地区受限的自动重试倒计时（原始错误下方）：到点 engine 会把卡片切回 loading */
function AutoRetryCountdown({ at }: { at: number }) {
  const [left, setLeft] = useState(() => Math.max(0, Math.ceil((at - Date.now()) / 1000)));
  useEffect(() => {
    const timer = setInterval(
      () => setLeft(Math.max(0, Math.ceil((at - Date.now()) / 1000))),
      250,
    );
    return () => clearInterval(timer);
  }, [at]);
  return (
    <span className="text-xs text-muted-foreground">
      疑似地区受限，已记录 · {left}s 后经代理自动重试
    </span>
  );
}

function CornerBadge({ label }: { label: string }) {
  return (
    <span className="absolute left-2 top-13 z-10 rounded-md bg-black/60 px-1.5 py-0.5 text-xs font-mono text-white">
      {label}
    </span>
  );
}

/** 点开大图：翻页范围 = 本轮全部任务卡 */
function openViewerForTask(task: GenerationTask) {
  const order = generationStore.state.taskOrder;
  const items = order
    .map((id) => generationStore.state.tasks[id])
    .filter((t): t is GenerationTask => !!t)
    .map((t) => ({ kind: "task" as const, task: t }));
  const index = items.findIndex((it) => it.task.id === task.id);
  if (index >= 0) viewerOpen(items, index);
}

function DoneBody({ task, sequence }: { task: GenerationTask; sequence?: string }) {
  const liked = useStore(generationStore, (s) => s.tasks[task.id]?.liked ?? false);
  const url = useBlobUrl(task.blob);
  const ratio = task.width && task.height ? `${task.width} / ${task.height}` : "1 / 1";

  return (
    <div className="relative">
      {url ? (
        <img
          src={url}
          alt=""
          className="w-full cursor-zoom-in object-cover"
          style={{ aspectRatio: ratio }}
          onClick={() => openViewerForTask(task)}
        />
      ) : task.remoteUrl ? (
        <img
          src={task.remoteUrl}
          alt=""
          className="w-full cursor-zoom-in object-cover"
          onClick={() => openViewerForTask(task)}
        />
      ) : null}
      {sequence && (
        <span className="absolute left-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-xs font-mono text-white">
          {sequence}
        </span>
      )}
      {task.seconds != null && (
        <span className="absolute bottom-2 right-2 rounded-md bg-black/60 px-1.5 py-0.5 text-xs text-white">
          {task.seconds.toFixed(1)}s
        </span>
      )}
      <button
        className={cn(
          "absolute right-2 top-2 rounded-md bg-black/60 p-1.5 text-white transition-transform active:scale-90",
          liked && "text-red-400",
        )}
        onClick={() => void toggleLike(task.id)}
        aria-label="点赞"
      >
        <Heart className={cn("size-4", liked && "fill-current")} />
      </button>
    </div>
  );
}

// 大图查看器（对应 ImageDetailView，最重的视图）：黑底全屏 overlay。
// 翻页 = 键盘 ←→ / 两侧点击 / 触摸滑动；缩放 = 滚轮（光标中心）/ 双指 / 双击复位；
// 按住 H 或长按隐藏全部覆盖层（看被盖住的细节）；预取相邻页；提示词图下单行
// 省略点击复制可展开；来源卡（父图 / 本轮参考图 + prompt）；♥ / 下载。
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@tanstack/react-store";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronLeft, ChevronRight, Download, Heart, Wand2, X, ZoomIn } from "lucide-react";
import { viewerClose, viewerNavigate, viewerStore, type ViewerItem } from "@/stores/viewer";
import { findRecord, getImage, setLiked } from "@/lib/db/records.repo";
import { useBlobUrl } from "@/lib/image/blobUrl";
import { downloadBlob } from "@/lib/image/download";
import { consumedLabel } from "@/lib/catalog/pricing";
import { useCatalog } from "@/lib/catalog/useCatalog";
import { formatBytes, sizeLabel } from "@/lib/utils/format";
import { withoutParenthetical } from "@/lib/openrouter/types";
import { generationStore } from "@/stores/generation";
import { patchLike } from "@/lib/generation/engine";
import { canUpscale, higherResolutions, runUpscale } from "@/lib/upscale/upscale";
import { SourceCard } from "./SourceCard";
import { EditBar } from "./EditBar";
import { Hint } from "@/components/common/Hint";
import { cn } from "@/lib/utils";

export function ImageViewer() {
  const items = useStore(viewerStore, (s) => s.items);
  const index = useStore(viewerStore, (s) => s.index);
  const open = items.length > 0;
  const item = items[index];
  const [hideUI, setHideUI] = useState(false);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const pressPoint = useRef<{ x: number; y: number } | null>(null);
  const holdTimer = useRef<number | null>(null);

  const data = useItemData(item, items, index);
  const catalog = useCatalog();
  // 记录统一解析（task 卡只有 recordId，DB 是真相源）—— 来源卡/编辑条共用，
  // 曾踩：来源卡拿不到 record → 编辑生成的图看不到父图（参考原图）
  const viewerRecord = useLiveQuery(
    () =>
      data.record
        ? Promise.resolve(data.record)
        : data.recordId
          ? findRecord(data.recordId)
          : Promise.resolve(undefined),
    [data.recordId, data.record],
    undefined,
  );
  const [liked, setLikedState] = useState(data.likedInitial);
  const [editOpen, setEditOpen] = useState(false);
  useEffect(() => {
    setLikedState(data.likedInitial); // 翻页重置为数据源值
    setEditOpen(false);
  }, [data.likedInitial, index]);

  // 序号：同批次内同模型多张（与网格角标同口径）
  const sequence = useMemo(() => {
    if (items.length < 2 || item?.kind === "reference") return undefined;
    const key = (it: ViewerItem) =>
      it.kind === "task" ? it.task.modelId : it.kind === "record" ? it.record.modelId : "";
    const group = items.filter((it) => key(it) === key(item!));
    if (group.length < 2) return undefined;
    return `${group.indexOf(item) + 1}/${group.length}`;
  }, [items, item]);

  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if (!open) return;
      // 焦点在输入框/输入法组合中（编辑条打字、拼音候选）时，快捷键一律让路 ——
      // 曾踩：打拼音含 h 触发隐藏界面、输入法 Esc 关掉查看器
      const target = e.target as HTMLElement;
      if (
        e.isComposing ||
        target.isContentEditable ||
        !!target.closest("input, textarea, [contenteditable]")
      ) {
        return;
      }
      if (e.key === "Escape") viewerClose();
      else if (e.key === "ArrowLeft") viewerNavigate(-1);
      else if (e.key === "ArrowRight") viewerNavigate(1);
    },
    [open],
  );
  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onKey]);

  // 翻页时复位缩放/隐藏态
  useEffect(() => {
    setHideUI(false);
  }, [index]);

  if (!open || !item) return null;

  function download() {
    const filename = `${data.name.replace(/[^\w-]+/g, "_")}-${(data.recordId ?? "").slice(0, 8)}.jpg`;
    if (item.kind === "task" && item.task.blob) downloadBlob(item.task.blob, filename);
    else if (item.kind === "reference") downloadBlob(item.blob, filename);
    else if (data.src) {
      void fetch(data.src)
        .then((r) => r.blob())
        .then((b) => downloadBlob(b, filename))
        .catch(() => data.src && window.open(data.src, "_blank"));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex select-none flex-col bg-background">
      {!hideUI && (
        // 头部两行（同 iPad 版）：模型名 + 序号一行，元信息（耗时·尺寸·消耗）一行在其下
        <header className="flex shrink-0 flex-col gap-0.5 px-4 py-3 text-foreground">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="min-w-0 truncate text-sm font-medium">{data.name}</span>
            {sequence && (
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 font-mono text-xs">{sequence}</span>
            )}
            <button className="ml-auto shrink-0 rounded-md p-1.5 hover:bg-accent" onClick={viewerClose} aria-label="关闭">
              <X className="size-5" />
            </button>
          </div>
          {data.meta && <p className="truncate text-xs text-muted-foreground">{data.meta}</p>}
        </header>
      )}

      <div
        className="relative flex min-h-0 flex-1 touch-pan-y items-center justify-center overflow-hidden"
        onPointerDown={(e) => {
          holdTimer.current = window.setTimeout(() => setHideUI(true), 350);
          dragStart.current = { x: e.clientX, y: e.clientY };
          pressPoint.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerUp={() => {
          if (holdTimer.current) clearTimeout(holdTimer.current);
          dragStart.current = null;
          if (holdTimer.current) setHideUI(false);
        }}
        onPointerMove={(e) => {
          if (!dragStart.current) return;
          const dx = e.clientX - dragStart.current.x;
          const dy = e.clientY - dragStart.current.y;
          if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
            viewerNavigate(dx < 0 ? 1 : -1);
            dragStart.current = null;
          }
        }}
        onPointerCancel={() => {
          if (holdTimer.current) clearTimeout(holdTimer.current);
          dragStart.current = null;
        }}
        onClick={(e) => {
          // 点空白处关闭（带返回栈语义）：点到的不是图片/按钮、且没有拖动翻页才算
          const target = e.target as HTMLElement;
          if (target.closest("button, img")) return;
          const press = pressPoint.current;
          if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) return;
          viewerClose();
        }}
      >
        <ZoomableImage src={data.src} resetKey={index} />
        {!hideUI && (
          <>
            <NavButton side="left" disabled={index === 0} onClick={() => viewerNavigate(-1)} />
            <NavButton side="right" disabled={index === items.length - 1} onClick={() => viewerNavigate(1)} />
            {/* 参考图查看模式：无点赞/编辑（此入口无「编辑此图」，防套娃 —— 同 iPad 版） */}
            {item.kind !== "reference" && (
              <button
                className={cn(
                  "absolute right-3 top-3 rounded-lg bg-black/50 p-2 text-white",
                  liked && "text-red-400",
                )}
                onClick={() => {
                  if (!data.recordId) return;
                  setLikedState(!liked); // 乐观翻转
                  void setLiked(data.recordId, !liked);
                  if (item.kind === "task") patchLike(item.task.id, !liked);
                }}
                aria-label="点赞"
              >
                <Heart className={cn("size-5", liked && "fill-current")} />
              </button>
            )}
            <div className="absolute bottom-3 right-3 flex gap-2">
              {data.record && canUpscale(data.record, catalog.modelById[data.record.modelId]) && (
                <UpscaleButton record={data.record} model={catalog.modelById[data.record.modelId]} />
              )}
              {item.kind !== "reference" && (
                <Hint label="边看边说：以这张图为参考继续生成">
                  <button
                    className={cn(
                      "rounded-lg bg-black/50 p-2 text-white hover:bg-black/70",
                      // 激活态用主题色 + 前景字色（曾用 bg-accent 浅灰底，白图标看不见像"空按钮"）
                      editOpen && "bg-primary text-primary-foreground hover:bg-primary/90",
                    )}
                    onClick={() => setEditOpen((v) => !v)}
                    aria-label="编辑此图"
                  >
                    <Wand2 className="size-5" />
                  </button>
                </Hint>
              )}
              <button className="rounded-lg bg-black/50 p-2 text-white hover:bg-black/70" onClick={download} aria-label="下载">
                <Download className="size-5" />
              </button>
            </div>
          </>
        )}
      </div>

      {!hideUI && (
        <footer className="max-h-48 shrink-0 overflow-y-auto px-4 py-3 text-foreground">
          {/* 编辑时来源卡让位（编辑条自带当前图缩略与提示输入，重复显示无意义） */}
          {editOpen ? (
            viewerRecord && (
              <EditBar record={viewerRecord} currentBlob={data.blob} catalog={catalog} onClose={() => setEditOpen(false)} />
            )
          ) : (
            item.kind !== "reference" && <SourceCard record={viewerRecord} prompt={data.prompt} />
          )}
        </footer>
      )}
    </div>
  );
}

/** item → 展示数据（task / record / reference 三态归一） */
function useItemData(item: ViewerItem | undefined, items: ViewerItem[], index: number) {
  const task = item?.kind === "task" ? item.task : undefined;
  const record = item?.kind === "record" ? item.record : undefined;
  const runtimePrompt = useStore(generationStore, (s) => s.currentPrompt);

  // record / reference 图片异步取（objectURL 生命周期由 hook 管理）
  const [recordBlob, setRecordBlob] = useState<Blob | undefined>();
  useEffect(() => {
    let alive = true;
    setRecordBlob(undefined);
    if (record?.imageId) void getImage(record.imageId).then((b) => alive && setRecordBlob(b));
    return () => {
      alive = false;
    };
  }, [record?.imageId]);
  const recordUrl = useBlobUrl(recordBlob);
  const taskUrl = useBlobUrl(task?.blob);
  const refUrl = useBlobUrl(item?.kind === "reference" ? item.blob : undefined);

  // 预取相邻两页（翻回零闪烁）
  useEffect(() => {
    for (const off of [-1, 1]) {
      const neighbor = items[index + off];
      if (neighbor?.kind === "record" && neighbor.record.imageId) void getImage(neighbor.record.imageId);
    }
  }, [items, index]);

  const refOriginal = item?.kind === "reference" ? item.original : undefined;
  const name =
    item?.kind === "reference"
      ? refOriginal?.name
        ? `参考图（${refOriginal.name}）`
        : "参考图"
      : withoutParenthetical(task?.name ?? record?.modelName ?? "");
  const prompt = task ? (task.promptOverride ?? runtimePrompt) : (record?.prompt ?? "");
  const seconds = task?.seconds ?? record?.seconds ?? 0;
  const metaParts: string[] = [];
  if (seconds > 0) metaParts.push(`${seconds.toFixed(1)} 秒`);
  const size = task?.sizeLabel ?? (record ? sizeLabel(record.width, record.height, record.resolution) : "");
  if (size) metaParts.push(size);
  const cost = task?.costUsd ?? record?.costUsd ?? 0;
  if (cost > 0) metaParts.push(consumedLabel(cost));

  // 参考图：解码尺寸 + 文件大小（发送前检查图清不清、大不大的依据）
  const refBlob = item?.kind === "reference" ? item.blob : undefined;
  const [refDims, setRefDims] = useState<{ w: number; h: number } | undefined>();
  useEffect(() => {
    let alive = true;
    setRefDims(undefined);
    if (refBlob) {
      void createImageBitmap(refBlob)
        .then((b) => {
          if (alive) setRefDims({ w: b.width, h: b.height });
          b.close();
        })
        .catch(() => {
          // 解码失败就不显示尺寸
        });
    }
    return () => {
      alive = false;
    };
  }, [refBlob]);
  if (refBlob) {
    if (refDims) metaParts.push(`${refDims.w}×${refDims.h}`);
    metaParts.push(formatBytes(refBlob.size));
    // 压缩前信息（选图瞬间压缩：长边 1536 + JPEG 0.8；original 记录原图）
    if (refOriginal) {
      metaParts.push(`原图 ${refOriginal.width}×${refOriginal.height} · ${formatBytes(refOriginal.size)}`);
    }
  }

  return {
    name,
    prompt,
    meta: metaParts.join(" · "),
    src: taskUrl ?? recordUrl ?? refUrl ?? record?.remoteUrl,
    blob: task?.blob ?? recordBlob,
    recordId: task?.recordId ?? record?.recordId,
    likedInitial: task?.liked ?? record?.liked === 1,
    record,
  };
}

/** 高清晰化入口：只有一档更高直接跑；多档弹选择；没有则提示 */
function UpscaleButton({ record, model }: { record: NonNullable<ReturnType<typeof useItemData>["record"]>; model: NonNullable<ReturnType<typeof useCatalog>["modelById"][string]> }) {
  const [notice, setNotice] = useState<string | null>(null);
  const tiers = higherResolutions(model, record);

  function pick(tier: string) {
    runUpscale(record, model, tier);
    setNotice(`已开始高清晰化到 ${tier}（后台进行，切页面不影响）`);
    setTimeout(() => setNotice(null), 3000);
  }

  return (
    <>
      {notice && (
        <span className="absolute bottom-16 right-3 max-w-56 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
          {notice}
        </span>
      )}
      {tiers.length === 1 ? (
        <Hint label={`用更高分辨率重新生成（${tiers[0]}）`}>
          <button
            className="rounded-lg bg-black/50 p-2 text-white hover:bg-black/70"
            onClick={() => pick(tiers[0])}
            aria-label="高清晰化"
          >
            <ZoomIn className="size-5" />
          </button>
        </Hint>
      ) : tiers.length > 1 ? (
        <div className="flex overflow-hidden rounded-lg bg-black/50">
          {tiers.map((tier) => (
            <button
              key={tier}
              className="border-r border-white/10 px-2 py-2 text-xs text-white last:border-r-0 hover:bg-black/70"
              onClick={() => pick(tier)}
            >
              {tier}
            </button>
          ))}
        </div>
      ) : (
        <button
          className="rounded-lg bg-black/50 p-2 text-white/40"
          onClick={() => {
            setNotice("当前已是最高分辨率档位");
            setTimeout(() => setNotice(null), 2000);
          }}
          aria-label="高清晰化（不可用）"
        >
          <ZoomIn className="size-5" />
        </button>
      )}
    </>
  );
}

/** 点赞乐观翻转：翻页重置为数据源值，点击立即翻转 + 写库（task 卡同步 patchTask） */
function NavButton({
  side,
  disabled,
  onClick,
}: {
  side: "left" | "right";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "absolute top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/50 p-3 text-white transition-opacity",
        side === "left" ? "left-3" : "right-3",
        disabled ? "pointer-events-none opacity-30" : "hover:bg-black/70",
      )}
      onClick={onClick}
      disabled={disabled}
      aria-label={side === "left" ? "上一张" : "下一张"}
    >
      {side === "left" ? <ChevronLeft className="size-6" /> : <ChevronRight className="size-6" />}
    </button>
  );
}

/** 缩放图：滚轮（光标中心）/ 双指 / 双击复位，1–4x；resetKey 变化复位 */
function ZoomableImage({ src, resetKey }: { src?: string; resetKey: number }) {
  const [scale, setScale] = useState(1);
  const [origin, setOrigin] = useState("50% 50%");
  const pinch = useRef<{ dist: number; scale: number } | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setScale(1); // 翻页复位
  }, [resetKey, src]);

  function wheelZoom(e: React.WheelEvent) {
    e.preventDefault();
    const rect = frameRef.current!.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setOrigin(`${x}% ${y}%`);
    setScale((s) => Math.min(4, Math.max(1, s - e.deltaY * 0.0015)));
  }

  function touchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      pinch.current = { dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), scale };
    }
  }
  function touchMove(e: React.TouchEvent) {
    if (e.touches.length === 2 && pinch.current) {
      const [a, b] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      setScale(Math.min(4, Math.max(1, (pinch.current.scale * dist) / pinch.current.dist)));
    }
  }

  return (
    <div
      ref={frameRef}
      className="flex h-full w-full items-center justify-center"
      onWheel={wheelZoom}
      onTouchStart={touchStart}
      onTouchMove={touchMove}
      onDoubleClick={() => setScale((s) => (s > 1 ? 1 : 2))}
    >
      {src ? (
        <img
          src={src}
          alt=""
          draggable={false}
          className="max-h-full max-w-full object-contain transition-transform duration-150"
          style={{ transform: `scale(${scale})`, transformOrigin: origin }}
        />
      ) : (
        <p className="text-sm text-muted-foreground">图片加载中…</p>
      )}
    </div>
  );
}

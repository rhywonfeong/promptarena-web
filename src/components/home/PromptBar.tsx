// 底部输入栏（对应 ContentView.promptBar）：参考图 strip → 参数行 →
// [添加参考图] [多行输入框] [生成/取消] → statusLine（StatusLine 独立组件）。
import { useRef } from "react";
import { useStore } from "@tanstack/react-store";
import { ImagePlus, Send, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generationStore, patchGeneration } from "@/stores/generation";
import { settingsStore, updateSettings } from "@/stores/settings";
import { cancel } from "@/lib/generation/engine";
import { viewerOpen } from "@/stores/viewer";
import { downscaleReference } from "@/lib/image/downscale";
import { useBlobUrl } from "@/lib/image/blobUrl";
import type { ImageModelInfo } from "@/lib/openrouter/types";
import { ParamBar } from "./ParamBar";

/** 输入条参考图 strip（放输入区块上方）。删除按钮小巧、hover 微放大；
 *  容器留出顶部 padding，负偏移的按钮不被 overflow 裁切。
 *  点击缩略图打开大图查看器（翻页范围 = 当前这组参考图，同 iPad 版） */
export function DraftReferenceStrip() {
  const refs = useStore(generationStore, (s) => s.draftReferences);
  if (!refs.length) return null;
  return (
    <div className="flex gap-2 overflow-x-auto px-3 pt-2 pb-1">
      {refs.map((ref, i) => (
        <ReferenceChip
          key={ref.id}
          blob={ref.blob}
          onOpen={() =>
            viewerOpen(
              refs.map((r) => ({
                kind: "reference" as const,
                blob: r.blob,
                original: r.original,
              })),
              i,
            )
          }
          onRemove={() =>
            generationStore.setState((s) => ({
              ...s,
              draftReferences: s.draftReferences.filter((r) => r.id !== ref.id),
            }))
          }
        />
      ))}
    </div>
  );
}

function ReferenceChip({
  blob,
  onOpen,
  onRemove,
}: {
  blob: Blob;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const url = useBlobUrl(blob);
  return (
    <div className="relative size-16 shrink-0">
      {url && (
        <img
          src={url}
          alt=""
          className="size-16 cursor-zoom-in rounded-lg object-cover"
          onClick={onOpen}
        />
      )}
      <button
        className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-destructive text-white shadow transition-transform hover:scale-125"
        onClick={onRemove}
        aria-label="移除参考图"
      >
        <X className="size-2.5" />
      </button>
    </div>
  );
}

export function PromptBar({
  selectedModels,
  catalogReady,
  onStart,
}: {
  selectedModels: ImageModelInfo[];
  catalogReady: boolean;
  /** 点生成（可能先弹参数确认，由页面决定） */
  onStart: () => void;
}) {
  const draftPrompt = useStore(generationStore, (s) => s.draftPrompt);
  const isRunning = useStore(generationStore, (s) => s.isRunning);
  const apiKey = useStore(settingsStore, (s) => s.apiKey);
  const fileInput = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const canStart =
    draftPrompt.trim().length > 0 && selectedModels.length > 0 && !!apiKey.trim() && catalogReady;

  async function pickFiles(files: FileList | null) {
    if (!files?.length) return;
    const downscaled: {
      id: string;
      blob: Blob;
      original?: { width: number; height: number; size: number; name?: string };
    }[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      try {
        const blob = await downscaleReference(file);
        // 记录压缩前的尺寸/体积（查看时体现压缩）
        let original: { width: number; height: number; size: number; name?: string } | undefined;
        try {
          const bitmap = await createImageBitmap(file);
          original = { width: bitmap.width, height: bitmap.height, size: file.size, name: file.name };
          bitmap.close();
        } catch {
          // 原图解码失败就不带 original
        }
        downscaled.push({ id: crypto.randomUUID(), blob, original });
      } catch {
        // 单张解码失败跳过，不炸整组
      }
    }
    if (downscaled.length) {
      // Agent 模式不支持参考图：加图时若开着就自动切回普通模式（开关也已隐藏）
      const wasSmartSplit = settingsStore.state.smartSplit;
      if (wasSmartSplit) updateSettings({ smartSplit: false });
      generationStore.setState((s) => ({
        ...s,
        draftReferences: [...s.draftReferences, ...downscaled],
        notice: wasSmartSplit ? "已加入参考图，Agent 模式不支持参考图，已切回普通模式" : null,
      }));
    }
    if (fileInput.current) fileInput.current.value = ""; // 允许重复选同一张
  }

  return (
    // 底部安全区由外层（index.tsx 的输入区容器）统一处理，这里只控制与提示行的紧凑间距
    <div className="border-t bg-background/95 px-3 pt-3 pb-2 backdrop-blur">
      <div className="mb-2">
        <ParamBar selectedModels={selectedModels} />
      </div>
      <div className="flex items-end gap-2">
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => pickFiles(e.target.files)}
        />
        {/* 添加参考图按钮固定在输入行左侧，不随有无参考图换位置 */}
        <Button
          variant="outline"
          size="icon"
          className="size-10 shrink-0"
          onClick={() => fileInput.current?.click()}
          aria-label="添加参考图"
        >
          <ImagePlus className="size-5" />
        </Button>
        <textarea
          ref={textareaRef}
          className="max-h-32 min-h-10 flex-1 resize-none rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
          rows={1}
          placeholder="输入提示词，开始全新一轮对比（与之前的生成互不相干）…"
          value={draftPrompt}
          onChange={(e) => {
            patchGeneration({ draftPrompt: e.target.value });
            const el = e.target;
            el.style.height = "auto";
            el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (canStart && !isRunning) onStart();
            }
          }}
        />
        {isRunning ? (
          <Button variant="destructive" size="sm" className="h-10 shrink-0 gap-1.5" onClick={() => cancel()}>
            <Square className="size-4" />
            取消
          </Button>
        ) : (
          <Button size="sm" className="h-10 shrink-0 gap-1.5" disabled={!canStart} onClick={onStart}>
            <Send className="size-4" />
            生成
          </Button>
        )}
      </div>
    </div>
  );
}

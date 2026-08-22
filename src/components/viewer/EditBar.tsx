// 边看边说（编辑条，对应 ImageDetailView 的 EditBar）：当前图 + 追加参考图 +
// 新提示词 + 模型/分辨率/比例/张数 badge。发送 → 关查看器 → 主页直接开跑单模型
// （不弹确认 —— 边看边说要的就是即时性），记录挂 parentRecordId。
// 每页独立编辑草稿：翻页暂存、翻回恢复。
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Check, ChevronDown, Expand, Grid2x2, Plus, Ratio, Send, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import type { GenerationRecord } from "@/lib/db/db";
import type { Catalog } from "@/lib/catalog/useCatalog";
import { updateSettings } from "@/stores/settings";
import { patchGeneration } from "@/stores/generation";
import { start } from "@/lib/generation/engine";
import { viewerClose } from "@/stores/viewer";
import { downscaleReference } from "@/lib/image/downscale";
import { useBlobUrl } from "@/lib/image/blobUrl";
import {
  maxImages,
  maxInputReferences,
  nearestResolution,
  supportedAspectRatios,
  modelNameParts,
} from "@/lib/openrouter/types";
import { capabilityTagsFor, CapabilityTags } from "@/components/models/CapabilityTags";
import { VendorAvatar } from "@/components/common/VendorAvatar";
import { Hint } from "@/components/common/Hint";
import { isMac } from "@/lib/utils/platform";
import { cn } from "@/lib/utils";

interface Draft {
  prompt: string;
  extraRefs: { id: string; blob: Blob }[];
  modelId: string;
  resolution: string; // "" = 自动
  aspectRatio: string;
  count: number;
}

export function EditBar({
  record,
  currentBlob,
  catalog,
  onClose,
}: {
  record: GenerationRecord;
  /** 当前图 Blob（作第一张参考图） */
  currentBlob?: Blob;
  catalog: Catalog;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const model0 = catalog.modelById[record.modelId];
  // 只列支持参考图的模型；默认原模型
  const editableModels = catalog.models.filter((m) => maxInputReferences(m) > 0);

  const draftKey = record.recordId;
  const drafts = useRef(new Map<string, Draft>());
  const [draft, setDraft] = useState<Draft>(() => ({
    prompt: "",
    extraRefs: [],
    // 原模型不支持参考图时兜底到第一个支持参考图的模型 —— 否则发送时整组被过滤、静默无反应
    modelId:
      model0 && maxInputReferences(model0) > 0
        ? record.modelId
        : (editableModels[0]?.id ?? record.modelId),
    resolution: record.resolution,
    aspectRatio: record.aspectRatio,
    count: 1,
  }));

  // 翻页暂存 / 恢复
  useEffect(() => {
    const existing = drafts.current.get(draftKey);
    if (existing) setDraft(existing);
  }, [draftKey]);
  function update(patch: Partial<Draft>) {
    setDraft((d) => {
      const next = { ...d, ...patch };
      drafts.current.set(draftKey, next);
      return next;
    });
  }

  const model = catalog.modelById[draft.modelId] ?? model0;
  if (!model) return null;
  const refsMax = maxInputReferences(model);
  const totalRefs = 1 + draft.extraRefs.length; // 当前图 + 追加
  const canSend = draft.prompt.trim().length > 0 && totalRefs <= Math.max(1, refsMax);

  const resolutionOptions = ["自动", ...(model.supported_parameters?.resolution?.values ?? [])];
  const ratioOptions = ["自动", ...supportedAspectRatios(model).slice(0, 10)];
  const countOptions = Array.from({ length: maxImages(model) }, (_, i) => i + 1);

  async function pickExtra(files: FileList | null) {
    if (!files?.length) return;
    const added: { id: string; blob: Blob }[] = [];
    for (const f of Array.from(files)) {
      if (!f.type.startsWith("image/")) continue;
      try {
        added.push({ id: crypto.randomUUID(), blob: await downscaleReference(f) });
      } catch {
        // 跳过解码失败的
      }
    }
    if (added.length) update({ extraRefs: [...draft.extraRefs, ...added] });
  }

  function send() {
    if (!draft.prompt.trim() || !currentBlob) return;
    patchGeneration({
      draftPrompt: draft.prompt,
      draftReferences: [
        { id: crypto.randomUUID(), blob: currentBlob },
        ...draft.extraRefs,
      ],
      pendingParentRecordId: record.recordId,
    });
    // 参数写回全局记住值（模型不支持时发送侧会自动落档）
    updateSettings({
      resolution: draft.resolution,
      aspectRatio: draft.aspectRatio,
      imageCount: draft.count,
    });
    viewerClose();
    navigate({ to: "/" });
    // 直接开跑单模型（不弹确认 —— 边看边说要的就是即时性）
    void start(
      {
        models: catalog.modelById,
        pricing: catalog.pricing,
      },
      [draft.modelId],
    );
  }

  return (
    // 卡片（输入框区块）+ 区块外的能力/计价标签行（居中，跟随当前编辑的模型）。
    // 桌面端限宽居中（max-w-2xl），输入框不占满全屏宽
    <div className="mx-auto w-full max-w-2xl space-y-2">
    <div className="space-y-2 rounded-xl border border-border bg-background/95 p-3 text-foreground">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">边看边说</span>
        <button className="ml-auto p-1 text-muted-foreground hover:text-foreground" onClick={onClose} aria-label="收起编辑条">
          <X className="size-4" />
        </button>
      </div>
      {/* 上排：当前图 + 追加参考图 + 新提示词 + 发送 */}
      <div className="flex items-end gap-2">
        {currentBlob && <Thumb blob={currentBlob} label="原图" />}
        {draft.extraRefs.map((r) => (
          <Thumb
            key={r.id}
            blob={r.blob}
            onRemove={() => update({ extraRefs: draft.extraRefs.filter((x) => x.id !== r.id) })}
          />
        ))}
        <input type="file" accept="image/*" multiple hidden id="editbar-ref" onChange={(e) => void pickExtra(e.target.files)} />
        {/* Enter = 换行；发送只认按钮或 ⌘/Ctrl+Enter（右下角印提示） */}
        <div className="relative min-w-0 flex-1">
          <Textarea
            className="max-h-24 min-h-9 border-border bg-muted/50 pr-14 text-sm text-foreground placeholder:text-muted-foreground/60"
            rows={1}
            placeholder="说说要怎么改…"
            value={draft.prompt}
            onChange={(e) => update({ prompt: e.target.value })}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                (e.metaKey || e.ctrlKey) &&
                !e.nativeEvent.isComposing &&
                canSend
              ) {
                e.preventDefault();
                send();
              }
            }}
          />
          <span className="pointer-events-none absolute bottom-2 right-2 hidden select-none gap-1 sm:flex">
            <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] leading-3 text-muted-foreground">
              {isMac ? "⌘" : "Ctrl"}
            </kbd>
            <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] leading-3 text-muted-foreground">
              ↩
            </kbd>
          </span>
        </div>
        <Button size="sm" className="h-9 shrink-0 gap-1" disabled={!canSend} onClick={send}>
          <Send className="size-3.5" />
          发送
        </Button>
      </div>
      {/* 下排：加参考图 + 模型/分辨率/比例/张数 badge */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Hint label={`追加参考图（上限 ${refsMax}）`}>
          <label
            className={cn(
              "flex size-8 cursor-pointer items-center justify-center rounded-full border border-dashed border-border text-muted-foreground",
              totalRefs >= Math.max(1, refsMax) && "pointer-events-none opacity-40",
            )}
          >
            <Plus className="size-4" />
            <input type="file" accept="image/*" hidden onChange={(e) => void pickExtra(e.target.files)} />
          </label>
        </Hint>
        <BadgeMenu
          leading={
            <VendorAvatar
              vendor={model.id.split("/")[0]}
              displayName={catalog.pricing.vendorNames[model.id.split("/")[0]]}
              officialIcon={catalog.authorIcons[model.id.split("/")[0]]}
              className="size-3.5 shrink-0"
            />
          }
          value={modelNameParts(catalog.pricing.shortNames[model.id] ?? model.name).main}
          options={editableModels.map((m) => m.id)}
          labelOf={(id) =>
            modelNameParts(catalog.pricing.shortNames[id] ?? catalog.modelById[id]?.name ?? id).main
          }
          subLabelOf={(id) =>
            modelNameParts(catalog.pricing.shortNames[id] ?? catalog.modelById[id]?.name ?? id).paren
          }
          hint="编辑用的模型（默认原模型）"
          renderLeading={(id) => {
            const vendor = id.split("/")[0];
            return (
              <VendorAvatar
                vendor={vendor}
                displayName={catalog.pricing.vendorNames[vendor]}
                officialIcon={catalog.authorIcons[vendor]}
                className="size-4 shrink-0"
              />
            );
          }}
          onSelect={(id) => {
            const next = catalog.modelById[id];
            update({
              modelId: id,
              // 切模型后不支持的值：分辨率取最近档、比例回落自动
              resolution: next ? (nearestResolution(next, draft.resolution) ?? "") : "",
              aspectRatio: next && supportedAspectRatios(next).includes(draft.aspectRatio) ? draft.aspectRatio : "",
              count: Math.min(draft.count, next ? maxImages(next) : 1),
            });
          }}
        />
        <BadgeMenu
          icon={Expand}
          value={draft.resolution || "自动"}
          options={resolutionOptions}
          labelOf={(v) => v}
          hint="分辨率"
          onSelect={(v) => update({ resolution: v === "自动" ? "" : v })}
        />
        <BadgeMenu
          icon={Ratio}
          value={draft.aspectRatio || "自动"}
          options={ratioOptions}
          labelOf={(v) => v}
          hint="宽高比"
          onSelect={(v) => update({ aspectRatio: v === "自动" ? "" : v })}
        />
        {maxImages(model) > 1 && (
          <BadgeMenu
            icon={Grid2x2}
            value={`${draft.count} 张`}
            options={countOptions.map(String)}
            labelOf={(v) => `${v} 张`}
            hint="张数"
            onSelect={(v) => update({ count: Number(v) })}
          />
        )}
      </div>
    </div>
      {/* 当前编辑模型的能力/计价标签（带图标：照片叠=参考图输入上限、四宫格=输出张数），
          放输入框区块外、整体居中 */}
      <div className="flex justify-center pt-1">
        <CapabilityTags tags={capabilityTagsFor(model, catalog.pricing, catalog.measuredCosts)} />
      </div>
    </div>
  );
}

function Thumb({ blob, label, onRemove }: { blob: Blob; label?: string; onRemove?: () => void }) {
  const url = useBlobUrl(blob);
  return (
    <div className="relative size-11 shrink-0">
      {url && <img src={url} alt="" className="size-11 rounded-md border border-border object-cover" />}
      {onRemove && (
        <button
          className="absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full bg-foreground text-background"
          onClick={onRemove}
          aria-label="移除"
        >
          <X className="size-2.5" />
        </button>
      )}
      {label && <span className="sr-only">{label}</span>}
    </div>
  );
}

function BadgeMenu({
  icon: Icon,
  leading,
  value,
  options,
  labelOf,
  subLabelOf,
  hint,
  renderLeading,
  onSelect,
}: {
  /** 徽标图标（分辨率=扩展、比例=比例框、张数=四宫格 —— 全应用统一语义） */
  icon?: typeof Wand2;
  /** 前缀自定义节点（模型 badge 传厂商 logo，替代 Vendor: 前缀） */
  leading?: React.ReactNode;
  value: string;
  options: string[];
  labelOf: (v: string) => string;
  /** 第二行小字（模型名的括号补语，换行显示） */
  subLabelOf?: (v: string) => string | undefined;
  /** hover 提示（渲染为 Hint，不是 DOM title） */
  hint: string;
  /** 菜单项前缀（模型菜单传厂商 logo） */
  renderLeading?: (v: string) => React.ReactNode;
  onSelect: (v: string) => void;
}) {
  return (
    <DropdownMenu>
      <Hint label={hint}>
        <DropdownMenuTrigger asChild>
          <button
            // 图标-文字间距 3（用户明确规则）；图标区分语义（两个「自动」不再分不清）
            className="flex h-7 items-center gap-[3px] rounded-full border border-border px-2.5 text-xs text-muted-foreground hover:bg-accent"
          >
            {leading ?? (Icon ? <Icon className="size-3.5 shrink-0" /> : null)}
            <span className="max-w-32 truncate">{value}</span>
            <ChevronDown className="size-3 shrink-0" />
          </button>
        </DropdownMenuTrigger>
      </Hint>
      <DropdownMenuContent
          align="start"
          className="max-h-64 w-auto min-w-64 max-w-80 overflow-y-auto"
        >
        {options.map((opt) => (
          <DropdownMenuItem key={opt} onClick={() => onSelect(opt)}>
            {renderLeading?.(opt)}
            <span className="min-w-0">
              <span className="block whitespace-nowrap">{labelOf(opt)}</span>
              {subLabelOf?.(opt) && (
                <span className="block whitespace-nowrap text-xs text-muted-foreground">
                  {subLabelOf(opt)}
                </span>
              )}
            </span>
            {opt === value && <Check className="ml-auto size-3.5 shrink-0" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export type { Draft as EditDraft };

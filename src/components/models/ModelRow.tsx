// 模型行：logo + 短名 + 中文描述（未翻到回退英文，再回退「暂无描述」）+
// 能力标签行（"N max" 风格 + 计价）+ 官方示例图缩略（点开看原图）+ 勾选圆标。
// 点整行勾选/取消。
import { useStore } from "@tanstack/react-store";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { VendorAvatar } from "@/components/common/VendorAvatar";
import { translationsStore } from "@/stores/translations";
import { selectionStore, toggleModel } from "@/stores/selection";
import type { CatalogPricing } from "@/lib/catalog/pricing";
import type { ImageModelInfo } from "@/lib/openrouter/types";
import { capabilityTagsFor, CapabilityTags } from "./CapabilityTags";
import { Hint } from "@/components/common/Hint";
import { cn } from "@/lib/utils";

export function ModelRow({
  model,
  pricing,
  measuredCosts,
  authorIcon,
  onOpenSample,
}: {
  model: ImageModelInfo;
  pricing: CatalogPricing;
  measuredCosts: Record<string, number>;
  authorIcon?: string;
  onOpenSample?: (model: ImageModelInfo) => void;
}) {
  const selected = useStore(selectionStore, (s) => s.selectedModelIds.includes(model.id));
  const translation = useStore(translationsStore, (s) => s.dict[model.id]);

  const vendor = model.id.split("/")[0];
  const shortName = pricing.shortNames[model.id] ?? model.name;
  const vendorDisplay = pricing.vendorNames[vendor];
  const description = translation ?? model.description ?? "暂无描述";
  const thumb = pricing.thumbnails[model.id];

  return (
    <Hint label={model.id}>
    <button
      // min-w-0：grid 子项默认 min-width:auto，长内容会把整列顶出屏幕宽（手机上横滚的根因）
      className="flex w-full min-w-0 items-center gap-3 rounded-xl border bg-card p-3 text-left transition-colors hover:bg-accent/40"
      onClick={() => toggleModel(model.id)}
    >
      <VendorAvatar vendor={vendor} displayName={vendorDisplay} officialIcon={authorIcon} className="size-10 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="truncate break-words text-sm font-medium">{shortName}</div>
        <p className="mt-0.5 line-clamp-2 break-words text-xs leading-4 text-muted-foreground [overflow-wrap:anywhere]">
          {description}
        </p>
        <div className="mt-1.5">
          <CapabilityTags tags={capabilityTagsFor(model, pricing, measuredCosts)} />
        </div>
      </div>
      {thumb && (
        <img
          src={thumb}
          alt=""
          className="size-11 shrink-0 rounded-md border object-cover"
          onClick={(e) => {
            e.stopPropagation();
            onOpenSample?.(model);
          }}
        />
      )}
      <span
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
          selected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
        )}
      >
        {selected && <Check className="size-3" />}
      </span>
    </button>
    </Hint>
  );
}

/** 「已选 N」等筛选 chips 上的计数徽标 */
export function CountBadge({ n }: { n: number }) {
  return <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{n}</Badge>;
}

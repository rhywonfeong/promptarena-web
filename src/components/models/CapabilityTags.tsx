// 能力标签行（统一 "N max" 风格 —— 用户明确规则）：
// 分辨率 `<res> max` / 参考图 `N max` 或「不支持参考图」/ 多张 `N max` / 计价 `N gpt2`
// 每个标签带形状差异明显的图标，图标-文字间距 3（用户明确规则）。
// 全应用统一图标语义：Expand=分辨率、Ratio=宽高比、Images=参考图（输入）、
// Grid2x2=张数（输出）、CircleDollarSign=计价 —— EditBar 徽标同此体系。
import { CircleDollarSign, Expand, Grid2x2, Images, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Hint } from "@/components/common/Hint";
import { priceLabel, type CatalogPricing } from "@/lib/catalog/pricing";
import {
  maxImages,
  maxInputReferences,
  maxResolution,
  type ImageModelInfo,
} from "@/lib/openrouter/types";
import { cn } from "@/lib/utils";

export interface CapabilityTag {
  text: string;
  tone?: "default" | "muted" | "accent";
  icon?: LucideIcon;
  /** hover 说明（计价标签解释 gpt2 单位与 ≈ 的含义） */
  title?: string;
}

/** 一个模型的能力标签集（模型行与大图弹窗共用，保证口径一致） */
export function capabilityTagsFor(
  model: ImageModelInfo,
  pricing: CatalogPricing,
  measuredCosts: Record<string, number>,
): CapabilityTag[] {
  const tags: CapabilityTag[] = [];
  const resMax = maxResolution(model);
  if (resMax) tags.push({ text: `${resMax} max`, icon: Expand });
  const refs = maxInputReferences(model);
  tags.push(
    refs > 0
      ? { text: `${refs} max`, icon: Images }
      : { text: "不支持参考图", tone: "muted", icon: Images },
  );
  const images = maxImages(model);
  if (images > 1) tags.push({ text: `${images} max`, icon: Grid2x2 });
  const price = priceLabel(model.id, pricing, measuredCosts);
  if (price) {
    // hover 说明：gpt2 是单位不是模型名，≈ 表示按库内实测估算（可解释性，已踩"看不懂"）
    const ratio = price.replace("≈", "");
    tags.push({
      text: price,
      tone: "accent",
      icon: CircleDollarSign,
      title: price.startsWith("≈")
        ? `每张价格约为基准（GPT Image 2 实测 $0.011/张）的 ${ratio} 倍 —— 按你库里的实际花费估算（该模型按 token 计价，无固定每张价目）`
        : `每张价格为基准（GPT Image 2 实测 $0.011/张）的 ${ratio} 倍`,
    });
  }
  return tags;
}

export function CapabilityTags({
  tags,
  variant = "light",
}: {
  tags: CapabilityTag[];
  variant?: "light" | "dark";
}) {
  const dark = variant === "dark";
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
      {tags.map((tag, i) => {
        const badge = (
          <Badge
            key={i}
            variant="outline"
            className={cn(
            "cursor-default gap-[3px] select-none px-1.5",
            dark
              ? cn(
                  "border-white/20 bg-white/10 text-white/80",
                  tag.tone === "accent" && "border-white/30 bg-white/15 text-white",
                )
              : tag.tone === "muted"
                ? "border-transparent bg-muted text-muted-foreground"
                : tag.tone === "accent"
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "",
          )}
          >
            {tag.icon && <tag.icon className="size-3 shrink-0" />}
            <span>{tag.text}</span>
          </Badge>
        );
        return tag.title ? (
          <Hint key={i} label={tag.title}>
            {badge}
          </Hint>
        ) : (
          badge
        );
      })}
    </div>
  );
}

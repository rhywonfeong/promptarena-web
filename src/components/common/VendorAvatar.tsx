// 厂商 logo 四层回退：① 打包位图（断网零请求）→ ② openrouter 自托管官方图标
// （部分 SVG，<img> 解不了会自然 onerror 下落）→ ③ gstatic faviconV2 →
// ④ 首字母圆标（djb2 稳定哈希取色）
import { useMemo, useState } from "react";
import {
  BUNDLED_VENDOR_ICONS,
  FAVICON_DOMAINS,
  faviconUrl,
  initialColor,
} from "@/lib/vendor/vendorAssets";
import { cn } from "@/lib/utils";

export function VendorAvatar({
  vendor,
  displayName,
  officialIcon,
  className,
}: {
  vendor: string;
  displayName?: string;
  /** openrouter 自托管官方图标 URL（fetchAuthorIcons 的结果） */
  officialIcon?: string;
  className?: string;
}) {
  const bundled = BUNDLED_VENDOR_ICONS[vendor];
  const domain = FAVICON_DOMAINS[vendor];
  // 回退链：打包 → 官方 → gstatic → 首字母
  const chain = useMemo(() => {
    const list: string[] = [];
    if (bundled) list.push(bundled);
    if (officialIcon) list.push(officialIcon);
    if (domain) list.push(faviconUrl(domain));
    return list;
  }, [bundled, officialIcon, domain]);
  const [index, setIndex] = useState(0);
  const initial = (displayName ?? vendor).trim().charAt(0).toUpperCase() || "?";

  if (index >= chain.length) {
    return (
      <div
        className={cn("flex items-center justify-center rounded-full text-sm font-medium text-black/70", className)}
        style={{ backgroundColor: initialColor(vendor) }}
        aria-hidden
      >
        {initial}
      </div>
    );
  }
  return (
    <img
      src={chain[index]}
      alt=""
      className={cn("rounded-full bg-muted object-contain", className)}
      onError={() => setIndex((i) => i + 1)}
    />
  );
}

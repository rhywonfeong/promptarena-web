// 模型选择页（对应 ModelPickerView）：预设条 + 筛选条（特殊筛选互斥 + vendor 可叠加）
// + 搜索（⌘K 聚焦、带清除按钮）+ 全选/全不选（作用于当前可见）+ 模型行列表 + 示例图浏览。
// 「全部」高亮条件 = 四个筛选全没开；进入页面兜底补拉 cards。
import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useStore } from "@tanstack/react-store";
import { useLiveQuery } from "dexie-react-hooks";
import { CheckCircle2, ChevronLeft, ChevronRight, Heart, Search, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCatalog } from "@/lib/catalog/useCatalog";
import { ensureTranslations } from "@/lib/translate/translate";
import { translationsStore } from "@/stores/translations";
import { selectionStore, setSelected } from "@/stores/selection";
import { db } from "@/lib/db/db";
import { vendorOf, type ImageModelInfo } from "@/lib/openrouter/types";
import { VendorAvatar } from "@/components/common/VendorAvatar";
import { PresetBar } from "@/components/models/PresetBar";
import { ModelRow } from "@/components/models/ModelRow";
import { capabilityTagsFor, CapabilityTags } from "@/components/models/CapabilityTags";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/models")({
  component: ModelsPage,
});

type SpecialFilter = "selected" | "liked" | "unused";

import { isMac } from "@/lib/utils/platform";

function ModelsPage() {
  const catalog = useCatalog();
  const selected = useStore(selectionStore, (s) => s.selectedModelIds);
  const isTranslating = useStore(translationsStore, (s) => s.isTranslating);
  const [special, setSpecial] = useState<SpecialFilter | null>(null);
  const [vendorFilter, setVendorFilter] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sampleModel, setSampleModel] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // ⌘K / Ctrl+K 聚焦搜索 —— 只在本页生效（不抢其他页面的快捷键）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // 点过赞 / 用过的模型集合（历史聚合）
  const usedModels = useLiveQuery(
    async () => {
      const rows = await db.records.toArray();
      return {
        liked: new Set(rows.filter((r) => r.liked === 1 && r.status === "done").map((r) => r.modelId)),
        used: new Set(rows.filter((r) => r.status === "done").map((r) => r.modelId)),
      };
    },
    [],
    { liked: new Set<string>(), used: new Set<string>() },
  ) ?? { liked: new Set<string>(), used: new Set<string>() };

  // 触发翻译（刚填 key 或换翻译模型时，进此页补翻）
  useEffect(() => {
    if (catalog.state === "idle") ensureTranslations(catalog.models);
  }, [catalog.state, catalog.models]);

  const visible = useMemo(() => {
    let list = catalog.models;
    if (special === "selected") list = list.filter((m) => selected.includes(m.id));
    else if (special === "liked") list = list.filter((m) => usedModels.liked.has(m.id));
    else if (special === "unused") list = list.filter((m) => !usedModels.used.has(m.id));
    if (vendorFilter) list = list.filter((m) => vendorOf(m.id) === vendorFilter);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q),
      );
    }
    return list;
  }, [catalog.models, special, vendorFilter, query, selected, usedModels]);

  // vendor chips：模型数多在前
  const vendors = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of catalog.models) {
      const v = vendorOf(m.id);
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [catalog.models]);

  const visibleIds = visible.map((m) => m.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));

  function toggleSelectAll() {
    if (allVisibleSelected) {
      setSelected(selected.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelected([...new Set([...selected, ...visibleIds])]);
    }
  }

  if (catalog.state === "loading") {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        正在获取模型列表…
      </div>
    );
  }
  if (catalog.state === "failed") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-sm text-muted-foreground">模型列表加载失败</p>
        <Button variant="outline" size="sm" onClick={() => catalog.refetch()}>重试</Button>
      </div>
    );
  }

  const likedCount = catalog.models.filter((m) => usedModels.liked.has(m.id)).length;
  const unusedCount = catalog.models.filter((m) => !usedModels.used.has(m.id)).length;

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b p-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-sm font-semibold">
            {isTranslating ? "翻译描述中…" : `已选 ${selected.length} 个模型`}
          </h1>
          {/* 全选/全不选作用于当前可见 —— 放标题旁（对应 iPad 版 toolbar 左侧位置） */}
          <Button variant="outline" size="sm" className="h-8" onClick={toggleSelectAll}>
            {allVisibleSelected ? "全不选" : "全选"}
          </Button>
          <div className="ml-auto flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <div className="relative min-w-0 flex-1 sm:flex-none">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                ref={searchRef}
                // 移动端占满行；平板/桌面舒展（256 → 320px）。pr 给清除按钮/快捷键提示留位
                className="w-full pl-8 pr-9 sm:w-64 lg:w-80"
                placeholder="搜索模型名 / id"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query ? (
                <button
                  className="absolute right-2 top-2 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                  onClick={() => setQuery("")}
                  aria-label="清除搜索"
                >
                  <X className="size-4" />
                </button>
              ) : (
                // 两个分开的键位提示（⌘ 和 K 各一个键帽，中间留隙）
                <span className="pointer-events-none absolute right-2 top-2.5 hidden gap-1 sm:flex">
                  <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] leading-3 text-muted-foreground">
                    {isMac ? "⌘" : "Ctrl"}
                  </kbd>
                  <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] leading-3 text-muted-foreground">
                    K
                  </kbd>
                </span>
              )}
            </div>
          </div>
        </div>
        <PresetBar activeModelIds={catalog.models.map((m) => m.id)} />
        {/* 特殊筛选（互斥，各带图标与专属色 —— 同 iPad 版）+ vendor 筛选（可叠加） */}
        <div className="flex flex-wrap gap-1.5">
          <FilterChip
            active={!special && !vendorFilter}
            label="全部"
            onClick={() => {
              setSpecial(null);
              setVendorFilter(null);
            }}
          />
          <FilterChip
            active={special === "selected"}
            label={`已选 ${selected.length}`}
            icon={CheckCircle2}
            iconClass="text-primary"
            activeClass="border-primary bg-primary/10 text-primary"
            onClick={() => setSpecial(special === "selected" ? null : "selected")}
          />
          <FilterChip
            active={special === "liked"}
            label={`点过赞 ${likedCount}`}
            icon={Heart}
            iconClass="fill-current text-red-500"
            activeClass="border-red-500 bg-red-500/10 text-red-600"
            onClick={() => setSpecial(special === "liked" ? null : "liked")}
          />
          <FilterChip
            active={special === "unused"}
            label={`未用过 ${unusedCount}`}
            icon={Sparkles}
            iconClass="text-orange-500"
            activeClass="border-orange-500 bg-orange-500/10 text-orange-600"
            onClick={() => setSpecial(special === "unused" ? null : "unused")}
          />
          {vendors.map(([vendor, count]) => (
            <button
              key={vendor}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors",
                vendorFilter === vendor
                  ? "border-primary bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent",
              )}
              onClick={() => setVendorFilter(vendorFilter === vendor ? null : vendor)}
            >
              <VendorAvatar
                vendor={vendor}
                displayName={catalog.pricing.vendorNames[vendor]}
                officialIcon={catalog.authorIcons[vendor]}
                className="size-4"
              />
              {catalog.pricing.vendorNames[vendor] ?? vendor}
              <span className="text-muted-foreground/70">{count}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-3">
        {/* 移动端/平板竖向单列（触屏扫描自然），桌面（lg+）双列。
            grid-cols-N 自带 minmax(0,1fr) 不会被长内容撑宽。
            min-h-full + flex 列布局：空态在剩余空间居中，页脚提示沉底 */}
        <div className="flex min-h-full flex-col">
          <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-2 lg:max-w-5xl lg:grid-cols-2">
            {visible.map((model) => (
              <ModelRow
                key={model.id}
                model={model}
                pricing={catalog.pricing}
                measuredCosts={catalog.measuredCosts}
                authorIcon={catalog.authorIcons[vendorOf(model.id)]}
                onOpenSample={(m) => setSampleModel(m.id)}
              />
            ))}
          </div>
          {!visible.length && (
            <div className="flex flex-1 items-center justify-center py-8 text-sm text-muted-foreground">
              没有符合条件的模型
            </div>
          )}
          <p className="mt-auto py-4 text-center text-xs text-muted-foreground">
            选好后回 <Link to="/" className="underline underline-offset-2">主页</Link> 点生成开始对比
          </p>
        </div>
      </div>
      <SampleViewer
        models={visible}
        modelId={sampleModel}
        onClose={() => setSampleModel(null)}
        onNavigate={(id) => setSampleModel(id)}
        catalog={catalog}
      />
    </div>
  );
}

function FilterChip({
  active,
  label,
  icon: Icon,
  iconClass,
  activeClass,
  onClick,
}: {
  active: boolean;
  label: string;
  icon?: typeof Heart;
  /** 图标常态色（激活态跟随 chip 主色） */
  iconClass?: string;
  /** 激活态专属配色（已选=蓝 / 点赞=红 / 未用过=橙 —— 同 iPad 版） */
  activeClass?: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        // 图标-文字间距 3（用户明确规则）
        "flex h-8 items-center gap-[3px] rounded-full border px-3 text-xs transition-colors",
        active
          ? (activeClass ?? "border-primary bg-primary/10 text-primary font-medium")
          : "text-muted-foreground hover:bg-accent",
      )}
      onClick={onClick}
    >
      {Icon && <Icon className={cn("size-3.5", active ? "" : iconClass)} />}
      {label}
    </button>
  );
}

/** 官方示例图浏览：全屏 Dialog。头部两行（名称 + 能力标签，同 iPad 版排版）
 *  固定不动；图片区固定高度，加载中显示占位 —— 弹窗不会被图像加载撑开。 */
function SampleViewer({
  models,
  modelId,
  onClose,
  onNavigate,
  catalog,
}: {
  models: ImageModelInfo[];
  modelId: string | null;
  onClose: () => void;
  onNavigate: (id: string) => void;
  catalog: ReturnType<typeof useCatalog>;
}) {
  const index = models.findIndex((m) => m.id === modelId);
  const model = index >= 0 ? models[index] : null;
  const original = model ? catalog.pricing.sampleOriginals[model.id] : undefined;
  const [imageLoaded, setImageLoaded] = useState(false);
  // 切换模型时重置加载态
  useEffect(() => {
    setImageLoaded(false);
  }, [modelId]);

  // 预载相邻两个模型的示例图（同 iPad 版预取）：new Image() 触发下载进浏览器
  // HTTP 缓存，切换时 onLoad 立即命中、直接显示不转圈
  useEffect(() => {
    for (const off of [-1, 1]) {
      const neighbor = models[index + off];
      const url = neighbor ? catalog.pricing.sampleOriginals[neighbor.id] : undefined;
      if (url) {
        const img = new Image();
        img.src = url;
      }
    }
  }, [index, models, catalog.pricing.sampleOriginals]);

  return (
    <Dialog open={!!model} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl sm:max-w-4xl">
        {model && (
          <>
            <DialogHeader>
              {/* 两行结构（同大图查看器/iPad 版）：模型名一行，附加信息一行在其下 */}
              <DialogTitle className="text-left text-sm font-medium">
                {catalog.pricing.shortNames[model.id] ?? model.name}
              </DialogTitle>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">
                  {index + 1}/{models.length}
                </span>
                <CapabilityTags
                  tags={capabilityTagsFor(model, catalog.pricing, catalog.measuredCosts)}
                />
              </div>
            </DialogHeader>
            {/* 图片区固定高度：加载中占位转圈，不会随图像加载把弹窗撑开 */}
            <div className="relative flex h-[65vh] items-center justify-center overflow-hidden rounded-lg bg-muted/50">
              {original ? (
                <>
                  {!imageLoaded && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                      <span className="size-7 animate-spin rounded-full border-2 border-muted-foreground/25 border-t-muted-foreground" />
                      <span className="text-xs">示例图加载中…</span>
                    </div>
                  )}
                  <img
                    src={original}
                    alt=""
                    onLoad={() => setImageLoaded(true)}
                    className={cn(
                      "max-h-full max-w-full object-contain transition-opacity duration-200",
                      imageLoaded ? "opacity-100" : "opacity-0",
                    )}
                  />
                </>
              ) : (
                <p className="text-sm text-muted-foreground">该模型暂无官方示例图</p>
              )}
              {index > 0 && (
                <Button
                  variant="secondary"
                  size="icon"
                  className="absolute left-2 rounded-full"
                  onClick={() => onNavigate(models[index - 1].id)}
                  aria-label="上一个模型"
                >
                  <ChevronLeft className="size-5" />
                </Button>
              )}
              {index >= 0 && index < models.length - 1 && (
                <Button
                  variant="secondary"
                  size="icon"
                  className="absolute right-2 rounded-full"
                  onClick={() => onNavigate(models[index + 1].id)}
                  aria-label="下一个模型"
                >
                  <ChevronRight className="size-5" />
                </Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

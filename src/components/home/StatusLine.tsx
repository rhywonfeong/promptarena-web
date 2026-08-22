// statusLine（对应 ContentView 的状态行优先级链）：
// notice（一次性）→ key 未配置 → 未选模型 → 单模型能力行 → 阵容/已选 N 模型。
// 单模型行可点：弹出最近使用过的模型快速切换（要换更多进模型页）。
import { Check, ChevronRight, ChevronsUpDown, Images, Info, TriangleAlert } from "lucide-react";
import { useStore } from "@tanstack/react-store";
import { useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { generationStore, patchGeneration } from "@/stores/generation";
import { settingsStore } from "@/stores/settings";
import { selectionStore, setSelected } from "@/stores/selection";
import { upscaleStore } from "@/stores/upscale";
import { sameSet } from "@/components/models/presetUtils";
import type { Catalog } from "@/lib/catalog/useCatalog";
import { capabilityTagsFor, CapabilityTags } from "@/components/models/CapabilityTags";
import { modelNameParts, type ImageModelInfo } from "@/lib/openrouter/types";
import { listDoneDesc } from "@/lib/db/records.repo";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { VendorAvatar } from "@/components/common/VendorAvatar";
import { cn } from "@/lib/utils";

export function StatusLine({ catalog }: { catalog: Catalog }) {
  const notice = useStore(generationStore, (s) => s.notice);
  const upscaling = useStore(upscaleStore, (s) => s.tasks.filter((t) => t.phase === "loading").length);
  const apiKey = useStore(settingsStore, (s) => s.apiKey);
  const selectedIds = useStore(selectionStore, (s) => s.selectedModelIds);
  const selected = (selectedIds ?? []).map((id) => catalog.modelById[id]).filter(Boolean);

  let content: React.ReactNode = null;
  if (notice) {
    content = (
      <button className="text-left text-amber-600" onClick={() => patchGeneration({ notice: null })}>
        {notice}
      </button>
    );
  } else if (!apiKey.trim()) {
    content = <span>未配置 API key —— 到「设置」里填写 OpenRouter key 后开始</span>;
  } else if (!selected.length) {
    content = <span>还没选择模型 —— 到「模型」页挑几个参赛选手</span>;
  } else if (selected.length === 1) {
    content = <SingleModelSwitcher model={selected[0]} catalog={catalog} />;
  } else {
    // 勾选与某预设有效成员一致时显示阵容名
    const presets = selectionStore.state.presets;
    const activeModelIds = Object.keys(catalog.modelById);
    const matched = presets.find((p) =>
      sameSet(
        p.modelIds.filter((id) => activeModelIds.includes(id)),
        selectedIds ?? [],
      ),
    );
    content = (
      <span>
        {matched ? `阵容「${matched.name}」· ${selected.length} 个模型` : `已选 ${selected.length} 个模型`}
        ，点生成后并发请求{upscaling > 0 ? ` · ${upscaling} 个高清晰化进行中` : ""}
      </span>
    );
  }
  // pl-12（48px）= 输入栏"添加参考图"按钮宽（40）+ 间距（8）：提示行与输入框左缘对齐
  return (
    <div className="flex h-6 items-center gap-1.5 pl-12 pr-2 text-xs text-muted-foreground">
      {notice ? (
        <TriangleAlert className="size-3.5 shrink-0 text-amber-600" />
      ) : (
        <Info className="size-3.5 shrink-0" />
      )}
      <div className="min-w-0 flex-1 truncate">{content}</div>
    </div>
  );
}

/** 单模型行：模型名 + 能力标签，点开快速切换到最近用过的模型；
 *  要换更多直接进模型页 */
function SingleModelSwitcher({ model, catalog }: { model: ImageModelInfo; catalog: Catalog }) {
  const navigate = useNavigate();
  // 最近使用过的模型（成功记录按时间倒序去重）
  const recent = useLiveQuery(
    async () => {
      const rows = await listDoneDesc();
      const seen = new Set<string>();
      const out: { id: string; name: string }[] = [];
      for (const r of rows) {
        if (!seen.has(r.modelId)) {
          seen.add(r.modelId);
          out.push({ id: r.modelId, name: r.modelName });
          if (out.length >= 8) break;
        }
      }
      return out;
    },
    [],
    [],
  );

  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <Popover>
        {/* 切换只作用于模型名（标签是能力信息，不参与触发） */}
        <PopoverTrigger asChild>
          <button className="flex shrink-0 items-center gap-1 rounded-md px-1 -mx-1 hover:bg-accent">
            <span className="max-w-40 truncate text-xs">
              {modelNameParts(catalog.pricing.shortNames[model.id] ?? model.name).main}
            </span>
            <ChevronsUpDown className="size-3 shrink-0 text-muted-foreground/60" />
          </button>
        </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-1.5">
        <p className="px-2 py-1 text-xs text-muted-foreground">最近使用</p>
        {(recent ?? []).map((r) => (
          <button
            key={r.id}
            className={cn(
              "flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent",
              r.id === model.id && "text-primary",
            )}
            onClick={() => setSelected([r.id])}
          >
            <Check className={cn("size-3.5 shrink-0", r.id === model.id ? "opacity-100" : "opacity-0")} />
            <VendorAvatar
              vendor={r.id.split("/")[0]}
              displayName={catalog.pricing.vendorNames[r.id.split("/")[0]]}
              officialIcon={catalog.authorIcons[r.id.split("/")[0]]}
              className="size-4 shrink-0"
            />
            <span className="min-w-0">
              <span className="block truncate">
                {modelNameParts(catalog.pricing.shortNames[r.id] ?? r.name).main}
              </span>
              {modelNameParts(catalog.pricing.shortNames[r.id] ?? r.name).paren && (
                <span className="block truncate text-xs text-muted-foreground">
                  {modelNameParts(catalog.pricing.shortNames[r.id] ?? r.name).paren}
                </span>
              )}
            </span>
          </button>
        ))}
        <Separator className="my-1" />
        <button
          className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent"
          onClick={() => navigate({ to: "/models" })}
        >
          <Images className="size-3.5" />
          更多模型…
          <ChevronRight className="ml-auto size-3.5" />
        </button>
      </PopoverContent>
      </Popover>
      <CapabilityTags tags={capabilityTagsFor(model, catalog.pricing, catalog.measuredCosts)} />
    </span>
  );
}

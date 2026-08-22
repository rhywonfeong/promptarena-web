// 参数行（对应 ContentView 的 GenerationParamBar）：分辨率 / 宽高比 / 每模型张数
// 三组胶囊 + 张数 >1 时的「Agent 模式」开关。选项 = 所选模型支持值的并集。
import { useStore } from "@tanstack/react-store";
import { ChevronDown, Sparkles } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { settingsStore, updateSettings } from "@/stores/settings";
import { generationStore } from "@/stores/generation";
import { selectionStore } from "@/stores/selection";
import { supportedAspectRatios, type ImageModelInfo } from "@/lib/openrouter/types";
import { cn } from "@/lib/utils";

/** UI 比例档（顺序固定；"自动"单列，不进列表 —— 与 iPad 版一致） */
export const ASPECT_RATIO_UI_ORDER = [
  "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "1:2", "2:1",
  "9:16", "16:9", "9:19.5", "19.5:9", "9:20", "20:9", "9:21", "21:9",
];

function unionIntersect(values: string[], selectedModels: ImageModelInfo[]): string[] {
  if (!selectedModels.length) return values;
  return values.filter((v) => selectedModels.every((m) => supportedAspectRatios(m).includes(v)));
}

export function ParamBar({ selectedModels }: { selectedModels: ImageModelInfo[] }) {
  const s = useStore(settingsStore);
  const smartSplit = useStore(settingsStore, (st) => st.smartSplit);
  const refCount = useStore(generationStore, (st) => st.draftReferences.length);

  // 分辨率不按并集过滤：按量模型发送时自动落最近档，这里给全档
  const resolutionOptions = ["自动", "512", "1K", "2K", "4K"];
  const ratioOptions = ["自动", ...unionIntersect(ASPECT_RATIO_UI_ORDER, selectedModels)];
  const maxN = Math.max(1, ...selectedModels.map((m) => (m.supported_parameters?.n?.max ?? 1)));
  const countOptions = Array.from({ length: maxN }, (_, i) => i + 1);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ParamPill
        label="分辨率"
        value={s.resolution || "自动"}
        options={resolutionOptions}
        display={(v) => v}
        onSelect={(v) => updateSettings({ resolution: v === "自动" ? "" : v })}
      />
      <ParamPill
        label="比例"
        value={s.aspectRatio || "自动"}
        options={ratioOptions}
        display={(v) => v}
        onSelect={(v) => updateSettings({ aspectRatio: v === "自动" ? "" : v })}
      />
      <ParamPill
        label="张数"
        value={`${s.imageCount}`}
        options={countOptions.map(String)}
        display={(v) => `${v} 张`}
        onSelect={(v) => updateSettings({ imageCount: Number(v) })}
      />
      {/* Agent 模式不支持参考图：有参考图时不显示开关（产品决策） */}
      {s.imageCount > 1 && refCount === 0 && (
        <button
          className={cn(
            "flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors",
            smartSplit ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground",
          )}
          onClick={() => updateSettings({ smartSplit: !smartSplit })}
        >
          <Sparkles className="size-3.5" />
          <span>Agent 模式</span>
          <Switch
            className="scale-75"
            checked={smartSplit}
            onCheckedChange={(v) => updateSettings({ smartSplit: v })}
            onClick={(e) => e.stopPropagation()}
          />
        </button>
      )}
    </div>
  );
}

function ParamPill({
  label,
  value,
  options,
  display,
  onSelect,
}: {
  label: string;
  value: string;
  options: string[];
  display: (v: string) => string;
  onSelect: (v: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex h-8 items-center gap-1 rounded-full border px-3 text-sm text-muted-foreground transition-colors hover:bg-accent">
          <span className="text-foreground">{value}</span>
          <span className="text-xs">{label}</span>
          <ChevronDown className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {options.map((opt) => (
          <DropdownMenuItem key={opt} onClick={() => onSelect(opt)}>
            {display(opt)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** 勾选模型快照（供 StatusLine 等复用） */
export function useSelectedModels(models: Record<string, ImageModelInfo>): ImageModelInfo[] {
  const ids = useStore(selectionStore, (s) => s.selectedModelIds);
  return (ids ?? []).map((id) => models[id]).filter(Boolean);
}

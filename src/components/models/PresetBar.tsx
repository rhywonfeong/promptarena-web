// 预设（阵容）条：存为阵容 + 预设 chips（点 = 调出；右键/菜单 = 编辑成员/重命名/删除）。
// 编辑成员是专门模式条：载入预设成员 → 列表正常增减 → 「保存改动」同名覆盖写回。
import { useState } from "react";
import { useStore } from "@tanstack/react-store";
import { Bookmark, BookmarkPlus, Check, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { selectionStore, deletePreset, renamePreset, savePreset, setSelected } from "@/stores/selection";
import { effectiveMembers, sameSet } from "./presetUtils";
import { Hint } from "@/components/common/Hint";
import { cn } from "@/lib/utils";

export function PresetBar({ activeModelIds }: { activeModelIds: string[] }) {
  const presets = useStore(selectionStore, (s) => s.presets);
  const selected = useStore(selectionStore, (s) => s.selectedModelIds);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");

  // 编辑成员模式：载入预设 → 列表增减 → 保存写回（同名覆盖）
  if (editingId) {
    const preset = presets.find((p) => p.id === editingId);
    if (!preset) {
      setEditingId(null);
      return null;
    }
    return (
      <div className="flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-2 py-1.5">
        <span className="text-xs text-muted-foreground">编辑阵容「{preset.name}」成员</span>
        <div className="ml-auto flex gap-1.5">
          <Button
            size="sm"
            className="h-7"
            onClick={() => {
              savePreset(preset.name, selected);
              setEditingId(null);
            }}
          >
            <Check className="size-3.5" />
            保存改动
          </Button>
          <Button size="sm" variant="outline" className="h-7" onClick={() => setEditingId(null)}>
            <X className="size-3.5" />
            取消
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <SavePresetChip
        disabled={
          !selected.length ||
          presets.some((p) => sameSet(effectiveMembers(p, activeModelIds), selected))
        }
        count={selected.length}
      />
      {presets.map((preset) =>
        renaming === preset.id ? (
          <div key={preset.id} className="flex items-center gap-1">
            <Input
              autoFocus
              className="h-8 w-36 text-xs"
              value={renameText}
              onChange={(e) => setRenameText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && renameText.trim()) {
                  renamePreset(preset.id, renameText.trim());
                  setRenaming(null);
                }
              }}
            />
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              onClick={() => {
                if (renameText.trim()) renamePreset(preset.id, renameText.trim());
                setRenaming(null);
              }}
            >
              <Check className="size-3.5" />
            </Button>
          </div>
        ) : (
          <DropdownMenu key={preset.id}>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  "flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors hover:bg-accent",
                  "text-muted-foreground",
                )}
                onClick={() => {
                  // 点 = 调出（替换勾选并切「已选」视图）
                  setSelected(effectiveMembers(preset, activeModelIds));
                }}
              >
                <Bookmark className="size-3.5" />
                {preset.name}
                <span className="text-muted-foreground/70">
                  {effectiveMembers(preset, activeModelIds).length}
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => setEditingId(preset.id)}>
                <Pencil className="size-3.5" />
                编辑成员
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setRenaming(preset.id);
                  setRenameText(preset.name);
                }}
              >
                <Pencil className="size-3.5" />
                重命名
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={() => deletePreset(preset.id)}>
                <Trash2 className="size-3.5" />
                删除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      )}
    </div>
  );
}

function SavePresetChip({ disabled, count }: { disabled: boolean; count: number }) {
  return (
    <Hint label="没勾选或勾选已与某预设一致">
      <span className="inline-flex">
        <button
          disabled={disabled}
          className={cn(
            "flex h-8 items-center gap-1.5 rounded-full border border-dashed px-3 text-xs transition-colors",
            disabled ? "cursor-not-allowed text-muted-foreground/40" : "text-muted-foreground hover:bg-accent",
          )}
          onClick={() => {
            const presets = selectionStore.state.presets;
            savePreset(`阵容 ${presets.length + 1}`, selectionStore.state.selectedModelIds);
          }}
        >
          <BookmarkPlus className="size-3.5" />
          存为阵容（{count}）
        </button>
      </span>
    </Hint>
  );
}

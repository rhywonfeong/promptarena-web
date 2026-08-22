// 已选模型（selected_model_ids）+ 阵容预设（model_presets），localStorage 持久化
import { Store } from "@tanstack/react-store";
import { loadJSON, saveJSON } from "@/lib/utils/storage";

export interface ModelPreset {
  id: string;
  name: string;
  modelIds: string[];
  createdAt: number;
}

interface SelectionState {
  selectedModelIds: string[];
  presets: ModelPreset[];
  /** 预设名（阵容显示用；勾选与某预设一致时） */
}

export const selectionStore = new Store<SelectionState>({
  selectedModelIds: loadJSON("selected_model_ids", [] as string[]),
  presets: loadJSON("model_presets", [] as ModelPreset[]),
});

selectionStore.subscribe(() => {
  saveJSON("selected_model_ids", selectionStore.state.selectedModelIds);
  saveJSON("model_presets", selectionStore.state.presets);
});

function patchSelection(patch: Partial<SelectionState>) {
  selectionStore.setState((s) => ({ ...s, ...patch }));
}

export function toggleModel(id: string) {
  selectionStore.setState((s) => ({
    ...s,
    selectedModelIds: s.selectedModelIds.includes(id)
      ? s.selectedModelIds.filter((x) => x !== id)
      : [...s.selectedModelIds, id],
  }));
}

export function setSelected(ids: string[]) {
  patchSelection({ selectedModelIds: ids });
}

/** 存为阵容：同名覆盖（保留原 createdAt，顺序 = 首次创建顺序） */
export function savePreset(name: string, modelIds: string[]) {
  selectionStore.setState((s) => {
    const existing = s.presets.find((p) => p.name === name);
    const preset: ModelPreset = existing
      ? { ...existing, modelIds }
      : { id: crypto.randomUUID(), name, modelIds, createdAt: Date.now() };
    return {
      ...s,
      presets: existing
        ? s.presets.map((p) => (p.name === name ? preset : p))
        : [...s.presets, preset],
    };
  });
}

export function deletePreset(id: string) {
  patchSelection({ presets: selectionStore.state.presets.filter((p) => p.id !== id) });
}

export function renamePreset(id: string, name: string) {
  patchSelection({
    presets: selectionStore.state.presets.map((p) => (p.id === id ? { ...p, name } : p)),
  });
}

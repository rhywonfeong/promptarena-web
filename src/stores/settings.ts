// 设置 store（对应 UserDefaults 的各键，key 名照搬）+ localStorage 持久化
import { Store } from "@tanstack/react-store";
import { loadJSON, saveJSON } from "@/lib/utils/storage";

export interface SettingsState {
  /** openrouter_api_key */
  apiKey: string;
  /** translate_model（DeepSeek 国内无限制且便宜；Google 系部分地区 403） */
  translateModel: string;
  /** gen_resolution（首次默认 1K 省 token；"" = 自动） */
  resolution: string;
  /** gen_aspect_ratio（"" = 自动） */
  aspectRatio: string;
  /** gen_image_count（每模型张数） */
  imageCount: number;
  /** smart_split（Agent 模式，仅张数 >1 有意义） */
  smartSplit: boolean;
  /** ask_split_confirmation：拆分完成后先确认 */
  askSplitConfirmation: boolean;
  /** split_system_prompt（空 = 内置默认） */
  splitSystemPrompt: string;
  /** flat_resolution_cap：按张计费模型的分辨率拉满上限 */
  flatResolutionCap: string;
}

const DEFAULTS: SettingsState = {
  apiKey: "",
  translateModel: "deepseek/deepseek-v4-flash",
  resolution: "1K",
  aspectRatio: "",
  imageCount: 1,
  smartSplit: false,
  askSplitConfirmation: true,
  splitSystemPrompt: "",
  flatResolutionCap: "2K",
};

export const settingsStore = new Store<SettingsState>({
  ...DEFAULTS,
  ...loadJSON("settings", {}),
});

settingsStore.subscribe(() => {
  saveJSON("settings", settingsStore.state);
});

export function updateSettings(patch: Partial<SettingsState>) {
  settingsStore.setState((s) => ({ ...s, ...patch }));
}

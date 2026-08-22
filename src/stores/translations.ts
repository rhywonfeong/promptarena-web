// 描述中文缓存（model_description_translations_zh）：持久存 localStorage，永不重翻。
// 翻译管线见 lib/translate —— 批完成即合并落盘，UI 渐进切中文。
import { Store } from "@tanstack/react-store";
import { loadJSON, saveJSON } from "@/lib/utils/storage";

interface TranslationsState {
  dict: Record<string, string>;
  isTranslating: boolean;
}

export const translationsStore = new Store<TranslationsState>({
  dict: loadJSON("model_description_translations_zh", {} as Record<string, string>),
  isTranslating: false,
});

let runCount = 0;

/** 翻译管线的运行计数（并发调用时全部结束才算完） */
export function beginTranslateRun() {
  runCount++;
  if (!translationsStore.state.isTranslating) {
    translationsStore.setState((s) => ({ ...s, isTranslating: true }));
  }
}

export function endTranslateRun() {
  runCount = Math.max(0, runCount - 1);
  if (runCount === 0 && translationsStore.state.isTranslating) {
    translationsStore.setState((s) => ({ ...s, isTranslating: false }));
  }
}

export function mergeTranslations(batch: Record<string, string>) {
  translationsStore.setState((s) => {
    const dict = { ...s.dict, ...batch };
    saveJSON("model_description_translations_zh", dict);
    return { ...s, dict };
  });
}

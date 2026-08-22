/** 是否 Apple 平台（决定快捷键提示显示 ⌘ 还是 Ctrl） */
export const isMac =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

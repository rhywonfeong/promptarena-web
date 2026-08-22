// 主题：三态（跟随系统 / 浅色 / 深色），html.dark class + localStorage 记住选择。
// 默认跟随系统；选了"跟随系统"时系统切换实时生效。
export type ThemeSetting = "system" | "light" | "dark";

const KEY = "theme";

export function storedSetting(): ThemeSetting {
  const v = localStorage.getItem(KEY);
  return v === "light" || v === "dark" ? v : "system";
}

function resolve(setting: ThemeSetting): "light" | "dark" {
  return setting === "system"
    ? matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light"
    : setting;
}

export function applySetting(setting: ThemeSetting) {
  document.documentElement.classList.toggle("dark", resolve(setting) === "dark");
}

export function setThemeSetting(setting: ThemeSetting) {
  localStorage.setItem(KEY, setting);
  applySetting(setting);
}

// 选了"跟随系统"时，系统主题变化实时跟随（模块加载时注册一次）
if (typeof window !== "undefined") {
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (storedSetting() === "system") applySetting("system");
  });
}

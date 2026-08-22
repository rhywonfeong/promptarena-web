// localStorage 封装（UserDefaults 的 web 等价物）：JSON 序列化 + 读写容错
export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 存不进去（隐私模式等）：内存态仍可用，静默
  }
}

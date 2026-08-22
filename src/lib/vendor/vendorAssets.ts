// vendor 资产：打包位图映射 + favicon 域名表 + djb2 稳定哈希取色
// （对应 ModelPickerView.faviconDomains 与 logo 四层回退；位图直接复用 iPad 版打包资源）
import vendorBlackForestLabs from "@/assets/vendor/vendor-black-forest-labs.png";
import vendorBytedanceSeed from "@/assets/vendor/vendor-bytedance-seed.png";
import vendorGoogle from "@/assets/vendor/vendor-google.png";
import vendorKrea from "@/assets/vendor/vendor-krea.png";
import vendorMicrosoft from "@/assets/vendor/vendor-microsoft.png";
import vendorOpenai from "@/assets/vendor/vendor-openai.png";
import vendorQwen from "@/assets/vendor/vendor-qwen.png";
import vendorRecraft from "@/assets/vendor/vendor-recraft.png";
import vendorSourceful from "@/assets/vendor/vendor-sourceful.png";
import vendorXai from "@/assets/vendor/vendor-x-ai.png";

/** ① 打包位图（断网零请求显示） */
export const BUNDLED_VENDOR_ICONS: Record<string, string> = {
  openai: vendorOpenai,
  google: vendorGoogle,
  recraft: vendorRecraft,
  "bytedance-seed": vendorBytedanceSeed,
  microsoft: vendorMicrosoft,
  qwen: vendorQwen,
  "x-ai": vendorXai,
  krea: vendorKrea,
  "black-forest-labs": vendorBlackForestLabs,
  sourceful: vendorSourceful,
};

/** ③ gstatic faviconV2 兜底用的域名映射 */
export const FAVICON_DOMAINS: Record<string, string> = {
  openai: "openai.com",
  google: "google.com",
  recraft: "recraft.ai",
  "bytedance-seed": "seed.bytedance.com",
  microsoft: "microsoft.com",
  qwen: "qwen.ai",
  "x-ai": "x.ai",
  krea: "krea.ai",
  "black-forest-labs": "bfl.ai",
  sourceful: "sourceful.ai",
};

export function faviconUrl(domain: string): string {
  return `https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}/&size=128`;
}

/** djb2 稳定哈希（String.hashValue 每次启动随机化，不能用） */
export function djb2(str: string): number {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = (h * 33 + str.charCodeAt(i)) & 0x7fffffff;
  }
  return h;
}

/** 首字母圆标取色：hue = hash % 360，sat 0.42 / bri 0.72（同 Swift） */
export function initialColor(seed: string): string {
  return `hsl(${djb2(seed) % 360}, 42%, 72%)`;
}

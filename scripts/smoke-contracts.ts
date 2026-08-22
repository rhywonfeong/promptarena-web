// 契约冒烟：拿真实 OpenRouter 响应跑解码/推导链路（静默错误高发区的防线）。
// 运行：npx tsx scripts/smoke-contracts.ts
import { derivePricing, priceLabel } from "../src/lib/catalog/pricing";
import { fetchImageCards, fetchImageModels } from "../src/lib/openrouter/client";
import {
  maxInputReferences,
  maxImages,
  maxResolution,
  nearestResolution,
  withoutParenthetical,
} from "../src/lib/openrouter/types";

async function main() {
  const models = await fetchImageModels();
  if (!models.length) throw new Error("models 空");
  const withRefs = models.filter((m) => maxInputReferences(m) > 0);
  const withN = models.filter((m) => maxImages(m) > 1);
  const withRes = models.filter((m) => maxResolution(m));
  console.log(`✓ models 解码 ${models.length} 条 | 参考图>0: ${withRefs.length} | n>1: ${withN.length} | 有分辨率档: ${withRes.length}`);
  const sample = models.find((m) => m.id.includes("seedream")) ?? models[0];
  console.log(`  sample ${sample.id} → maxRes=${maxResolution(sample)} n=${maxImages(sample)} refs=${maxInputReferences(sample)}`);
  const gemini = models.find((m) => m.id.includes("gemini"));
  if (gemini) {
    console.log(`  nearestResolution(gemini, "3K")=${nearestResolution(gemini, "3K")}（应为其支持档）`);
  }

  const cards = await fetchImageCards();
  if (!Object.keys(cards).length) throw new Error("cards 空");
  const pricing = derivePricing(cards);
  const priced = Object.keys(pricing.pricePerImage).length;
  if (priced < 10) throw new Error(`计价推导异常：仅 ${priced} 个模型有价格（unitLabel 层级可能又变了）`);
  const flat = Object.entries(pricing.pricePerImage).filter(([, p]) => p.mode === "flat").length;
  const perPixel = Object.entries(pricing.pricePerImage).filter(([, p]) => p.mode === "perPixel").length;
  const measured = Object.entries(pricing.pricePerImage).filter(([, p]) => p.mode === "measured").length;
  const tokenOnly = pricing.tokenPricedModels.size;
  console.log(`✓ cards 解码 ${Object.keys(cards).length} 张 | 计价 ${priced}（flat ${flat}/perPixel ${perPixel}/measured ${measured}/按token ${tokenOnly}）`);
  const seedream = Object.keys(cards).find((k) => k.includes("seedream-5-0-lite"));
  if (seedream) {
    console.log(`  ${seedream} priceLabel = ${priceLabel(seedream, pricing, {})}`);
  }
  const shortNames = Object.keys(pricing.shortNames).length;
  const thumbs = Object.keys(pricing.thumbnails).length;
  if (shortNames < 10 || thumbs < 10) throw new Error("短名/示例图解码异常");
  console.log(`✓ 短名 ${shortNames} | 缩略图 ${thumbs} | 厂商名 ${Object.keys(pricing.vendorNames).length}`);

  console.log(`✓ withoutParenthetical("Google: Gemini 3 Pro Image (preview)") = "${withoutParenthetical("Google: Gemini 3 Pro Image (preview)")}"`);
  console.log("全部通过 ✅");
}

main().catch((e) => {
  console.error("❌ 冒烟失败:", e);
  process.exit(1);
});

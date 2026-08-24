// 同域代理判定契约：开关粒度按模型、前缀映射与动态记录的幂等
import { beforeEach, describe, expect, it } from "vitest";
import { serverError } from "./errors";
import { parseLoc } from "@/lib/region/loc";
import { isProxiedModel, isRegionBlockError, orUrl, recordProxiedModel } from "./proxy";
import { settingsStore, updateSettings } from "@/stores/settings";

const BLOCKED = "openai/gpt-image-2"; // 内置已知受限模型
const NORMAL = "google/gemini-3-pro-image";

beforeEach(() => {
  updateSettings({ proxyEnabled: false, proxyModels: [] });
});

describe("orUrl", () => {
  it("开关关：受限模型也原样直连", () => {
    expect(orUrl("https://openrouter.ai/api/v1/images", BLOCKED)).toBe(
      "https://openrouter.ai/api/v1/images",
    );
  });

  it("开关开 + 受限模型：openrouter 域换成同域代理前缀（含 frontend 绝对 URL 与 query）", () => {
    updateSettings({ proxyEnabled: true });
    expect(orUrl("https://openrouter.ai/api/v1/images", BLOCKED)).toBe("/api/or/api/v1/images");
    expect(
      orUrl("https://openrouter.ai/api/frontend/v1/models/find?active=true", BLOCKED),
    ).toBe("/api/or/api/frontend/v1/models/find?active=true");
  });

  it("开关开但普通模型 / 不带 model / 非 openrouter 域：一律原样", () => {
    updateSettings({ proxyEnabled: true });
    expect(orUrl("https://openrouter.ai/api/v1/images", NORMAL)).toBe(
      "https://openrouter.ai/api/v1/images",
    );
    expect(orUrl("https://openrouter.ai/api/v1/images/models")).toBe(
      "https://openrouter.ai/api/v1/images/models",
    );
    expect(orUrl("https://cdn.example.com/a.webp", BLOCKED)).toBe("https://cdn.example.com/a.webp");
  });
});

describe("isProxiedModel / recordProxiedModel", () => {
  it("内置清单命中；动态记录后命中且去重", () => {
    expect(isProxiedModel(BLOCKED)).toBe(true);
    expect(isProxiedModel(NORMAL)).toBe(false);
    recordProxiedModel(NORMAL);
    recordProxiedModel(NORMAL); // 幂等
    expect(settingsStore.state.proxyModels).toEqual([NORMAL]);
    expect(isProxiedModel(NORMAL)).toBe(true);
  });
});

describe("isRegionBlockError", () => {
  it("403 的 APIError 才算疑似地区限制", () => {
    expect(isRegionBlockError(serverError(403, "Country not supported"))).toBe(true);
    expect(isRegionBlockError(serverError(401, "User not found"))).toBe(false);
    expect(isRegionBlockError(new Error("请求失败（HTTP 403）"))).toBe(false);
    expect(isRegionBlockError(new DOMException("aborted", "AbortError"))).toBe(false);
  });
});

describe("parseLoc", () => {
  it("Worker JSON 与 cloudflare trace 文本都能解析；查不到为 null", () => {
    expect(parseLoc('{"country":"CN"}')).toBe("CN");
    expect(parseLoc('{"country":null}')).toBe(null);
    expect(parseLoc("fl=x\nh=openrouter.ai\nip=1.2.3.4\nloc=JP\ntls=HTTP/2\n")).toBe("JP");
    expect(parseLoc("garbage")).toBe(null);
  });
});

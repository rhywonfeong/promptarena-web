// SSE 解析器单测：残行缓冲、心跳行跳过、[DONE] 收尾
import { describe, expect, it } from "vitest";
import { readSSE } from "./sse";

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  let i = 0;
  return new Response(
    new ReadableStream({
      pull(controller) {
        if (i < chunks.length) controller.enqueue(encoder.encode(chunks[i++]));
        else controller.close();
      },
    }),
  );
}

describe("readSSE", () => {
  it("按行回调，保留残行缓冲（一条消息拆两个 chunk）", async () => {
    const lines: string[] = [];
    await readSSE(
      sseResponse(["data: {\"a\":", "1}\n", "data: [DONE]\n"]),
      (l) => lines.push(l),
    );
    expect(lines).toEqual(['data: {"a":1}', "data: [DONE]"]);
  });

  it("最后一行不带换行也能收到", async () => {
    const lines: string[] = [];
    await readSSE(sseResponse(["data: tail-no-newline"]), (l) => lines.push(l));
    expect(lines).toEqual(["data: tail-no-newline"]);
  });

  it("空流不炸", async () => {
    const lines: string[] = [];
    await readSSE(sseResponse([]), (l) => lines.push(l));
    expect(lines).toEqual([]);
  });
});

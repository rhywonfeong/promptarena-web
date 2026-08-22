// SSE 流式解析（Agent 拆分用）。EventSource 不能 POST，必须 fetch + ReadableStream。
// 每行一个事件："data: {JSON}"；": OPENROUTER PROCESSING" 是心跳注释；"data: [DONE]" 收尾。

export async function readSSE(res: Response, onLine: (line: string) => void) {
  if (!res.body) throw new Error("响应没有内容流");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop()!; // 末行可能不完整，留缓冲
    for (const line of lines) onLine(line.trimEnd());
  }
  if (buf) onLine(buf.trimEnd());
}

/** 读干整个流拼成文本（非 2xx 时错误体也走流，读干再交给统一错误解析） */
export async function drainStream(res: Response): Promise<string> {
  let body = "";
  await readSSE(res, (line) => {
    body += line;
    body += "\n";
  });
  return body;
}

// 错误归一（对应 PA/Networking/APIError.swift）：各种失败统一成能直接显示的中文。
// 自定义 error 类而不是纯字符串，engine 靠 name === "AbortError" 区分用户取消。

export class APIError extends Error {
  /** HTTP 状态码（网络层失败等无状态时缺省）；engine 靠它识别 403 地区拦截 */
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "APIError";
    this.status = status;
  }
}

export function httpError(status: number): APIError {
  if (status === 401) {
    return new APIError("API key 无效或未填（401）。请到设置里填写 OpenRouter key。", status);
  }
  return new APIError(`服务器返回了 HTTP ${status}`, status);
}

export function serverError(status: number, message: string): APIError {
  return new APIError(`请求失败（HTTP ${status}）：${message}`, status);
}

export const emptyResultError = () => new APIError("生成成功但没返回图片");
export const invalidImageDataError = () => new APIError("返回的数据不是合法图片");
export const networkError = () =>
  new APIError("网络请求失败：请检查网络或代理是否放行 openrouter.ai");

/** 统一错误检查：非 2xx 时优先取 OpenRouter 错误体里的 message */
export function checkHTTP(status: number, text: string): void {
  if (status >= 200 && status <= 299) return;
  try {
    const body = JSON.parse(text) as { error?: { message?: string } };
    const message = body.error?.message;
    if (message) throw serverError(status, message);
  } catch (e) {
    if (e instanceof APIError) throw e;
    // JSON 解析失败 → 落到 httpError
  }
  throw httpError(status);
}

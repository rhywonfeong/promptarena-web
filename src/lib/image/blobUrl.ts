// objectURL 生命周期统一管理：blob 变化或卸载即 revoke，杜绝泄漏
import { useEffect, useState } from "react";

export function useBlobUrl(blob: Blob | undefined): string | undefined {
  const [url, setUrl] = useState<string | undefined>();

  useEffect(() => {
    if (!blob) {
      setUrl(undefined);
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);

  return url;
}

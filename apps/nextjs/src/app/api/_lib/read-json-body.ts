export type JsonBodyResult =
  | { readonly status: "ok"; readonly body: unknown }
  | { readonly status: "too_large" }
  | { readonly status: "invalid" };

export const readJsonBody = async (
  req: Request,
  maxBytes: number,
): Promise<JsonBodyResult> => {
  const declaredLength = Number(req.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return { status: "too_large" };
  }

  if (!req.body) return { status: "invalid" };
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return { status: "too_large" };
    }
    chunks.push(value);
  }

  try {
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return {
      status: "ok",
      body: JSON.parse(new TextDecoder().decode(bytes)) as unknown,
    };
  } catch {
    return { status: "invalid" };
  }
};

import { APIError, fetchTransport, type HttpTransport } from "./client.ts";

const ERASER_ICON_BASE_URL = "/api/icons/eraser";

export async function fetchEraserIcon(
  iconName: string,
  transport: HttpTransport = fetchTransport,
) {
  const response = await transport.fetch(
    `${ERASER_ICON_BASE_URL}/${encodeURIComponent(iconName)}`,
    { signal: AbortSignal.timeout(12_000) },
  );
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string; code?: string } | null;
    throw new APIError(response.status, body?.error ?? "Could not load diagram icon.", body?.code);
  }
  return response.blob();
}

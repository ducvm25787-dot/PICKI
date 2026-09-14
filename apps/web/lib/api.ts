/** Same-origin proxy via Next.js rewrites → Nest API on :3000 */
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/v1";

export class ApiUnreachableError extends Error {
  constructor() {
    super(
      "API chưa chạy. Terminal: bash scripts/start-local.sh (cần thấy Picki API listening :3000)",
    );
    this.name = "ApiUnreachableError";
  }
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
      },
    });
  } catch {
    throw new ApiUnreachableError();
  }

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(err.error?.message ?? `API error ${String(res.status)}`);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

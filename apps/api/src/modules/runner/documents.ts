import { randomUUID } from "node:crypto";
import { readFile, mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { PickiError } from "@picki/shared";

const MAX_BYTES = 300 * 1024;
const DOC_DIR = path.join(process.cwd(), "storage", "private", "runner-docs");

export const runnerDocKinds = ["cccd-front", "cccd-back", "vehicle"] as const;
export type RunnerDocKind = (typeof runnerDocKinds)[number];

export function isRunnerDocKind(value: string): value is RunnerDocKind {
  return (runnerDocKinds as readonly string[]).includes(value);
}

export async function saveRunnerDocument(dataUrl: string): Promise<string> {
  const match = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(dataUrl.trim());
  if (!match) throw new PickiError("VALIDATION_ERROR", "Ảnh không hợp lệ");
  if (match[1]?.toLowerCase() !== "image/jpeg") {
    throw new PickiError("VALIDATION_ERROR", "Chỉ hỗ trợ ảnh JPEG đã nén");
  }
  const buffer = Buffer.from(match[2]!, "base64");
  if (buffer.length > MAX_BYTES) {
    throw new PickiError("VALIDATION_ERROR", "Ảnh phải dưới 300KB");
  }
  await mkdir(DOC_DIR, { recursive: true });
  const filename = `${randomUUID()}.jpg`;
  await writeFile(path.join(DOC_DIR, filename), buffer);
  return filename;
}

export async function readRunnerDocument(filename: string): Promise<string> {
  if (!/^[0-9a-f-]{36}\.jpg$/i.test(filename)) {
    throw new PickiError("NOT_FOUND", "Không thấy ảnh");
  }
  try {
    const buffer = await readFile(path.join(DOC_DIR, filename));
    return `data:image/jpeg;base64,${buffer.toString("base64")}`;
  } catch {
    throw new PickiError("NOT_FOUND", "Không thấy ảnh");
  }
}

export async function removeRunnerDocument(filename: string | null) {
  if (!filename || !/^[0-9a-f-]{36}\.jpg$/i.test(filename)) return;
  await unlink(path.join(DOC_DIR, filename)).catch(() => undefined);
}

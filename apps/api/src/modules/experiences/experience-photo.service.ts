import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { PickiError } from "@picki/shared";

const MAX_BYTES = 300 * 1024;
const UPLOAD_DIR = path.join(process.cwd(), "storage", "uploads", "experiences");

@Injectable()
export class ExperiencePhotoService {
  async saveFromDataUrl(dataUrl: string): Promise<string> {
    const match = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(dataUrl.trim());
    if (!match) throw new PickiError("VALIDATION_ERROR", "Ảnh không hợp lệ");
    if (match[1]?.toLowerCase() !== "image/jpeg") {
      throw new PickiError("VALIDATION_ERROR", "Chỉ hỗ trợ ảnh JPEG đã nén");
    }
    const buffer = Buffer.from(match[2]!, "base64");
    if (buffer.length > MAX_BYTES) {
      throw new PickiError("VALIDATION_ERROR", "Ảnh phải dưới 300KB");
    }
    await mkdir(UPLOAD_DIR, { recursive: true });
    const filename = `${randomUUID()}.jpg`;
    await writeFile(path.join(UPLOAD_DIR, filename), buffer);
    return `/v1/uploads/experiences/${filename}`;
  }
}

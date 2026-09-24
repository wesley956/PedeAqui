import { createHash } from "node:crypto";

export type ConversationMediaKind = "image" | "audio" | "video" | "document";

export const CONVERSATION_MEDIA_BUCKET = "conversation-media";
export const MAX_AGENT_MEDIA_BYTES = 4 * 1024 * 1024;

const limits: Record<ConversationMediaKind, number> = {
  image: 5 * 1024 * 1024,
  audio: 16 * 1024 * 1024,
  video: 16 * 1024 * 1024,
  document: 100 * 1024 * 1024,
};

const mimeKinds = new Map<string, ConversationMediaKind>([
  ["image/jpeg", "image"], ["image/png", "image"], ["image/webp", "image"],
  ["audio/mpeg", "audio"], ["audio/ogg", "audio"], ["audio/mp4", "audio"],
  ["audio/aac", "audio"], ["audio/amr", "audio"], ["audio/wav", "audio"],
  ["video/mp4", "video"],
  ["application/pdf", "document"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "document"],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "document"],
  ["application/vnd.openxmlformats-officedocument.presentationml.presentation", "document"],
]);

const extensions: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
  "audio/mpeg": "mp3", "audio/ogg": "ogg", "audio/mp4": "m4a",
  "audio/aac": "aac", "audio/amr": "amr", "audio/wav": "wav",
  "video/mp4": "mp4", "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
};

export class ConversationMediaValidationError extends Error {
  constructor(public readonly kind: string, message: string) {
    super(message);
    this.name = "ConversationMediaValidationError";
  }
}

function startsWith(bytes: Uint8Array, signature: number[], offset = 0) {
  return signature.every((value, index) => bytes[index + offset] === value);
}

function ascii(bytes: Uint8Array, start: number, length: number) {
  return Buffer.from(bytes.subarray(start, start + length)).toString("ascii");
}

export function detectConversationMediaMime(bytes: Uint8Array, declaredMime: string): string | null {
  const declared = (declaredMime.split(";", 1)[0] ?? "").trim().toLowerCase();
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "image/webp";
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
  if (ascii(bytes, 0, 4) === "OggS") return "audio/ogg";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WAVE") return "audio/wav";
  if (ascii(bytes, 0, 3) === "ID3" || startsWith(bytes, [0xff, 0xfb]) || startsWith(bytes, [0xff, 0xf3]) || startsWith(bytes, [0xff, 0xf2])) return "audio/mpeg";
  if (ascii(bytes, 4, 4) === "ftyp") {
    return declared === "audio/mp4" ? "audio/mp4" : "video/mp4";
  }
  if (ascii(bytes, 0, 5) === "#!AMR") return "audio/amr";
  if (startsWith(bytes, [0xff, 0xf1]) || startsWith(bytes, [0xff, 0xf9])) return "audio/aac";
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) && mimeKinds.get(declared) === "document") return declared;
  return null;
}

export function validateConversationMedia(
  bytes: Uint8Array,
  declaredMime: string,
  expectedKind: ConversationMediaKind,
  maximum = limits[expectedKind],
) {
  if (bytes.byteLength < 4 || bytes.byteLength > maximum) {
    throw new ConversationMediaValidationError("media_size_rejected", `Arquivo fora do limite de ${Math.floor(maximum / 1024 / 1024)} MB.`);
  }
  const mimeType = detectConversationMediaMime(bytes, declaredMime);
  if (!mimeType || !mimeKinds.has(mimeType) || mimeKinds.get(mimeType) !== expectedKind) {
    throw new ConversationMediaValidationError("media_mime_rejected", "O conteúdo real do arquivo não corresponde a um formato permitido.");
  }
  const extension = extensions[mimeType];
  if (!extension) throw new ConversationMediaValidationError("media_mime_rejected", "Formato de arquivo sem extensão segura.");
  return {
    mimeType,
    extension,
    sizeBytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

export function safeMediaFilename(value: string | null | undefined, mimeType: string) {
  const extension = extensions[mimeType] ?? "bin";
  const base = (value ?? "arquivo")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._ -]/g, "_")
    .replace(/\.{2,}/g, ".")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 180) || "arquivo";
  return base.toLowerCase().endsWith(`.${extension}`) ? base : `${base}.${extension}`;
}

export function conversationMediaPath(input: {
  organizationId: string;
  storeId: string;
  conversationId: string;
  messageId: string;
  extension: string;
}) {
  for (const value of Object.values(input)) {
    if (!/^[a-zA-Z0-9-]{1,80}$/.test(value)) throw new Error("Escopo de mídia inválido.");
  }
  return `${input.organizationId}/${input.storeId}/${input.conversationId}/${input.messageId}/original.${input.extension}`;
}

export function maxInboundMediaBytes(kind: ConversationMediaKind) {
  return limits[kind];
}

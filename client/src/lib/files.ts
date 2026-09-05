/** Bound browser memory use before base64 conversion; server validates MIME and content independently. */
export function readUploadBase64(file: File): Promise<string> {
  if (!file.size || file.size > 15 * 1024 * 1024) return Promise.reject(new Error("Choose a non-empty file no larger than 15 MB"));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string" || !reader.result.includes(",")) return reject(new Error("File could not be read"));
      resolve(reader.result.slice(reader.result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(new Error("File could not be read"));
    reader.onabort = () => reject(new Error("File reading was cancelled"));
    reader.readAsDataURL(file);
  });
}

/** Quote CSV fields and neutralize spreadsheet formula interpretation. */
export function csvCell(value: unknown): string {
  if (value == null) return "";
  let text = String(value);
  if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function safeExternalUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : undefined;
  } catch { return undefined; }
}

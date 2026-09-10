export type User = { id: string; email: string; name: string };
export type Entry = {
  id: string;
  owner: string;
  name: string;
  kind: "file" | "folder";
  mime: string;
  size: number;
  parent: string | null;
  starred: number;
  trashed: number;
  created: string;
  updated: string;
  share_token: string | null;
  share_expires: number | null;
};
export type Statement = { sql: string; params?: unknown[] };
export const QUOTA = 1024 * 1024 * 1024;
export const MAX_FILE = 20 * 1024 * 1024;
export function fileCategory(mime: string) {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (
    mime.includes("pdf") ||
    mime.startsWith("text/") ||
    /document|sheet|presentation/.test(mime)
  )
    return "document";
  return "other";
}
export function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const power = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 3);
  return `${(bytes / 1024 ** power).toFixed(power ? 1 : 0)} ${["B", "KB", "MB", "GB"][power]}`;
}

import { query, putBlob, getBlob, deleteBlob } from "@runtime";
import { type Entry, type User, MAX_FILE, QUOTA } from "@/lib/types";
import { ApiError, nameSchema } from "@/lib/validation";

export async function owned(id: string, user: User) {
  const [entry] = await query<Entry>(
    "SELECT * FROM entries WHERE id = ? AND owner = ?",
    [id, user.id],
  );
  if (!entry) throw new ApiError(404, "File or folder not found");
  return entry;
}
export async function validParent(parent: string | null, user: User) {
  if (parent === null) return;
  const folder = await owned(parent, user);
  if (folder.kind !== "folder" || folder.trashed)
    throw new ApiError(400, "Choose an available folder");
}
export async function createEntry(
  user: User,
  name: string,
  kind: Entry["kind"],
  parent: string | null,
  bytes?: Uint8Array,
  mime = "",
) {
  name = nameSchema.parse(name);
  await validParent(parent, user);
  const id = crypto.randomUUID();
  const date = new Date().toISOString();
  const size = bytes?.byteLength ?? 0;
  if (size > MAX_FILE) throw new ApiError(413, "Files can be up to 20 MB");
  if (bytes) await putBlob(id, bytes);
  try {
    const rows = await query<Entry>(
      "INSERT INTO entries (id,owner,name,kind,parent,mime,size,created,updated) SELECT ?,?,?,?,?,?,?,?,? WHERE (SELECT COALESCE(SUM(size),0) FROM entries WHERE owner = ?) + ? <= ? AND (SELECT COUNT(*) FROM entries WHERE owner = ?) < 5000 AND (COALESCE(?, '') = '' OR EXISTS (SELECT id FROM entries WHERE id = ? AND owner = ? AND kind = 'folder' AND trashed = 0)) RETURNING *",
      [
        id,
        user.id,
        name,
        kind,
        parent,
        mime,
        size,
        date,
        date,
        user.id,
        size,
        QUOTA,
        user.id,
        parent,
        parent,
        user.id,
      ],
    );
    if (!rows.length)
      throw new ApiError(
        409,
        "Storage limit reached. Remove files from trash to free space.",
      );
    return rows[0];
  } catch (error) {
    if (bytes) await deleteBlob(id).catch(() => {});
    throw error;
  }
}
export async function updateEntry(
  id: string,
  user: User,
  changes: {
    name?: string;
    starred?: boolean;
    trashed?: boolean;
    parent?: string | null;
  },
) {
  const entry = await owned(id, user);
  if (changes.trashed && entry.kind === "folder") {
    const [child] = await query(
      "SELECT id FROM entries WHERE parent = ? AND owner = ? LIMIT 1",
      [id, user.id],
    );
    if (child)
      throw new ApiError(
        409,
        "Move or permanently delete this folder’s contents first",
      );
  }
  if (changes.parent !== undefined) {
    await validParent(changes.parent, user);
    let parent = changes.parent;
    const visited = new Set<string>();
    while (parent) {
      if (parent === id || visited.has(parent))
        throw new ApiError(400, "A folder cannot contain itself");
      visited.add(parent);
      parent = (await owned(parent, user)).parent;
    }
  }
  if (changes.trashed === false)
    await validParent(
      changes.parent !== undefined ? changes.parent : entry.parent,
      user,
    );
  const sets: string[] = ["updated = ?"];
  const values: unknown[] = [new Date().toISOString()];
  for (const key of ["name", "starred", "trashed", "parent"] as const) {
    const value = changes[key];
    if (value !== undefined) {
      sets.push(`${key} = ?`);
      values.push(typeof value === "boolean" ? Number(value) : value);
    }
  }
  if (changes.trashed) {
    sets.push("share_token = NULL", "share_expires = NULL");
  }
  const guards: string[] = [];
  const guardValues: unknown[] = [];
  if (changes.trashed && entry.kind === "folder") {
    guards.push("NOT EXISTS (SELECT id FROM entries WHERE parent = ?)");
    guardValues.push(id);
  }
  const targetParent =
    changes.parent !== undefined ? changes.parent : entry.parent;
  if (
    targetParent &&
    (changes.parent !== undefined || changes.trashed === false)
  ) {
    guards.push(
      "EXISTS (SELECT id FROM entries WHERE id = ? AND owner = ? AND kind = 'folder' AND trashed = 0)",
    );
    guardValues.push(targetParent, user.id);
    guards.push(
      "NOT EXISTS (WITH RECURSIVE ancestors AS (SELECT id,parent FROM entries WHERE id = ? UNION SELECT e.id,e.parent FROM entries e JOIN ancestors a ON e.id = a.parent) SELECT id FROM ancestors WHERE id = ?)",
    );
    guardValues.push(targetParent, id);
  }
  const [updated] = await query<Entry>(
    `UPDATE entries SET ${sets.join(", ")} WHERE id = ? AND owner = ? ${guards.length ? `AND ${guards.join(" AND ")}` : ""} RETURNING *`,
    [...values, id, user.id, ...guardValues],
  );
  if (!updated)
    throw new ApiError(409, "This item changed. Refresh and try again.");
  return updated;
}
export async function removeEntry(id: string, user: User) {
  const entry = await owned(id, user);
  if (!entry.trashed) throw new ApiError(409, "Move this item to trash first");
  const [child] = await query(
    "SELECT id FROM entries WHERE parent = ? AND owner = ? LIMIT 1",
    [id, user.id],
  );
  if (child) throw new ApiError(409, "This folder still contains items");
  if (entry.kind === "file") await deleteBlob(id);
  const deleted = await query(
    "DELETE FROM entries WHERE id = ? AND owner = ? AND NOT EXISTS (SELECT child.id FROM entries child WHERE child.parent = ?) RETURNING id",
    [id, user.id, id],
  );
  if (!deleted.length)
    throw new ApiError(409, "This folder still contains items");
}
export async function download(entry: Entry) {
  if (entry.trashed || entry.kind !== "file")
    throw new ApiError(404, "File not found");
  const body = await getBlob(entry.id);
  if (!body) throw new ApiError(404, "File contents are unavailable");
  const name = encodeURIComponent(entry.name).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return new Response(body, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="download"; filename*=UTF-8''${name}`,
      "Content-Length": String(entry.size),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}

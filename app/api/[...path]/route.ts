import { z, ZodError } from "zod";
import { query, currentUser, authenticate } from "@runtime";
import { type Entry, QUOTA, MAX_FILE } from "@/lib/types";
import {
  ApiError,
  assertSameOrigin,
  readJson,
  folderSchema,
  updateSchema,
  nameSchema,
} from "@/lib/validation";
import {
  owned,
  createEntry,
  updateEntry,
  removeEntry,
  download,
} from "@/lib/files";
export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
async function handle(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    const { path } = await context.params;
    const [resource, id, action] = path;
    const method = request.method;
    if (!["GET", "HEAD"].includes(method)) assertSameOrigin(request);
    if (resource === "health" && method === "GET" && path.length === 1) {
      await query("SELECT 1");
      return json({ status: "ok" });
    }
    if (resource === "auth" && path.length === 2 && method === "POST")
      return await authenticate(request, id);
    if (resource === "shares" && id && path.length === 2 && method === "GET") {
      if (!/^[a-f0-9]{64}$/.test(id))
        throw new ApiError(404, "Link is unavailable");
      const [entry] = await query<Entry>(
        "SELECT * FROM entries WHERE share_token = ? AND share_expires > ? AND trashed = 0",
        [id, Date.now()],
      );
      if (!entry)
        throw new ApiError(404, "This link has expired or was revoked");
      return await download(entry);
    }
    const user = await currentUser();
    if (!user) throw new ApiError(401, "Sign in to continue");
    if (resource === "me" && method === "GET" && path.length === 1)
      return json(user);
    if (resource !== "files") throw new ApiError(404, "Endpoint not found");
    if (!id && method === "GET") {
      const entries = await query<Entry>(
        "SELECT * FROM entries WHERE owner = ? ORDER BY updated DESC LIMIT 5000",
        [user.id],
      );
      return json({
        entries,
        used: entries.reduce((sum, e) => sum + Number(e.size), 0),
        quota: QUOTA,
      });
    }
    if (!id && method === "POST") {
      const data = folderSchema.parse(await readJson(request));
      return json(
        await createEntry(user, data.name, "folder", data.parent),
        201,
      );
    }
    if (id === "upload" && method === "POST" && path.length === 2) {
      const url = new URL(request.url);
      const name = nameSchema.parse(url.searchParams.get("name"));
      const parent = z
        .string()
        .uuid()
        .nullable()
        .parse(url.searchParams.get("parent"));
      if (Number(request.headers.get("content-length")) > MAX_FILE)
        throw new ApiError(413, "Files can be up to 20 MB");
      const reader = request.body?.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      if (reader)
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > MAX_FILE) {
            await reader.cancel();
            throw new ApiError(413, "Files can be up to 20 MB");
          }
          chunks.push(value);
        }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      const mime = (
        request.headers.get("content-type") ?? "application/octet-stream"
      ).slice(0, 180);
      return json(
        await createEntry(user, name, "file", parent, bytes, mime),
        201,
      );
    }
    z.string().uuid().parse(id);
    if (action === "download" && method === "GET" && path.length === 3)
      return await download(await owned(id, user));
    if (action === "share" && path.length === 3) {
      const entry = await owned(id, user);
      if (entry.kind !== "file" || entry.trashed)
        throw new ApiError(400, "Only available files can be shared");
      if (method === "POST") {
        const token = Array.from(
          crypto.getRandomValues(new Uint8Array(32)),
          (b) => b.toString(16).padStart(2, "0"),
        ).join("");
        const expires = Date.now() + 7 * 24 * 60 * 60 * 1000;
        await query(
          "UPDATE entries SET share_token = ?, share_expires = ? WHERE id = ? AND owner = ?",
          [token, expires, id, user.id],
        );
        return json({ token, expires });
      }
      if (method === "DELETE") {
        await query(
          "UPDATE entries SET share_token = NULL, share_expires = NULL WHERE id = ? AND owner = ?",
          [id, user.id],
        );
        return json({ ok: true });
      }
    }
    if (path.length === 2 && method === "GET")
      return json(await owned(id, user));
    if (path.length === 2 && method === "PATCH")
      return json(
        await updateEntry(
          id,
          user,
          updateSchema.parse(await readJson(request)),
        ),
      );
    if (path.length === 2 && method === "DELETE") {
      await removeEntry(id, user);
      return json({ ok: true });
    }
    throw new ApiError(405, "Method not allowed");
  } catch (error) {
    if (error instanceof ZodError)
      return json(
        { error: error.issues[0]?.message ?? "Invalid request" },
        400,
      );
    if (error instanceof ApiError)
      return json({ error: error.message }, error.status);
    console.error(
      "Request failed",
      error instanceof Error ? error.message : "Unknown error",
    );
    return json(
      { error: "Storage is temporarily unavailable. Please try again." },
      503,
    );
  }
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;

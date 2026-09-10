import { Pool, types } from "pg";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { Statement, User } from "@/lib/types";
import {
  ApiError,
  credentialsSchema,
  readJson,
  assertSameOrigin,
} from "@/lib/validation";
import { hashPassword, verifyPassword, tokenHash } from "@/lib/password";
types.setTypeParser(20, Number);
const globalState = globalThis as typeof globalThis & { koudePool?: Pool };
const pool =
  globalState.koudePool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
  });
globalState.koudePool = pool;
const uploadDir = process.env.UPLOAD_DIR ?? "/app/uploads";
export const loginPath = "/login";
export const logoutPath = "/api/auth/logout";
export const platformAuth = false;
function sqlParams(sql: string) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}
export async function query<T>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  if (!/^\s*(INSERT|UPDATE|DELETE)/i.test(sql))
    return (await pool.query(sqlParams(sql), params)).rows as T[];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(728491)");
    const result = await client.query(sqlParams(sql), params);
    await client.query("COMMIT");
    return result.rows as T[];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
export async function batch(statements: Statement[]) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(728491)");
    for (const statement of statements)
      await client.query(sqlParams(statement.sql), statement.params ?? []);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
function blobPath(key: string) {
  if (!/^[0-9a-f-]{36}$/.test(key)) throw new ApiError(400, "Invalid file key");
  return join(uploadDir, key);
}
export async function putBlob(key: string, bytes: Uint8Array) {
  await mkdir(uploadDir, { recursive: true, mode: 0o700 });
  await writeFile(blobPath(key), bytes, { flag: "wx", mode: 0o600 });
}
export async function getBlob(key: string): Promise<ReadableStream | null> {
  try {
    const bytes = await readFile(blobPath(key));
    return new ReadableStream({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}
export async function deleteBlob(key: string) {
  try {
    await unlink(blobPath(key));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
}
export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get("koude_session")?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const [user] = await query<User>(
    "SELECT u.id,u.email,u.name FROM users u JOIN sessions s ON s.user_id = u.id WHERE s.token_hash = ? AND s.expires > ?",
    [tokenHash(token), Date.now()],
  );
  return user ?? null;
}
async function rateLimit(key: string, limit: number) {
  const now = Date.now();
  const bucket = Math.floor(now / 900000);
  const [row] = await query<{ attempts: number }>(
    "INSERT INTO auth_limits (key,bucket,attempts) VALUES (?,?,1) ON CONFLICT (key) DO UPDATE SET attempts = CASE WHEN auth_limits.bucket = EXCLUDED.bucket THEN auth_limits.attempts + 1 ELSE 1 END, bucket = EXCLUDED.bucket RETURNING attempts",
    [key, bucket],
  );
  if (row.attempts > limit)
    throw new ApiError(429, "Too many attempts. Try again in 15 minutes.");
}
export async function authenticate(
  request: Request,
  action: string,
): Promise<Response> {
  assertSameOrigin(request);
  const cookieStore = await cookies();
  if (action === "logout") {
    const token = cookieStore.get("koude_session")?.value;
    if (token)
      await query("DELETE FROM sessions WHERE token_hash = ?", [
        tokenHash(token),
      ]);
    cookieStore.delete("koude_session");
    return Response.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!["login", "register"].includes(action))
    throw new ApiError(404, "Endpoint not found");
  await rateLimit("global", 100);
  const data = credentialsSchema.parse(await readJson(request));
  await rateLimit(tokenHash(data.email), 10);
  let user: User;
  if (action === "register") {
    if (!data.name) throw new ApiError(400, "Enter your name");
    const passwordHash = await hashPassword(data.password);
    const rows = await query<User>(
      "INSERT INTO users (id,email,name,password_hash) VALUES (?,?,?,?) ON CONFLICT (email) DO NOTHING RETURNING id,email,name",
      [crypto.randomUUID(), data.email, data.name, passwordHash],
    );
    if (!rows.length)
      throw new ApiError(409, "Could not create this account. Try signing in.");
    user = rows[0];
  } else {
    const [found] = await query<User & { password_hash: string }>(
      "SELECT id,email,name,password_hash FROM users WHERE email = ?",
      [data.email],
    );
    const valid = await verifyPassword(
      data.password,
      found?.password_hash ??
        `00000000000000000000000000000000:${"0".repeat(128)}`,
    );
    if (!found || !valid)
      throw new ApiError(401, "Email or password is incorrect");
    user = { id: found.id, email: found.email, name: found.name };
  }
  const token = randomBytes(32).toString("hex");
  const expires = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const oldToken = cookieStore.get("koude_session")?.value;
  const statements: Statement[] = [
    { sql: "DELETE FROM sessions WHERE expires < ?", params: [Date.now()] },
    {
      sql: "DELETE FROM auth_limits WHERE bucket < ?",
      params: [Math.floor(Date.now() / 900000) - 1],
    },
  ];
  if (oldToken)
    statements.push({
      sql: "DELETE FROM sessions WHERE token_hash = ?",
      params: [tokenHash(oldToken)],
    });
  statements.push({
    sql: "INSERT INTO sessions (token_hash,user_id,expires) VALUES (?,?,?)",
    params: [tokenHash(token), user.id, expires],
  });
  await batch(statements);
  cookieStore.set("koude_session", token, {
    httpOnly: true,
    secure: (process.env.APP_ORIGIN ?? "").startsWith("https://"),
    sameSite: "lax",
    path: "/",
    expires: new Date(expires),
  });
  return Response.json(
    { user },
    {
      status: action === "register" ? 201 : 200,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

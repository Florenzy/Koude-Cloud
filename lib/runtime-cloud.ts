import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import type { Statement, User } from "@/lib/types";
import { ApiError } from "@/lib/validation";
const bindings = env as unknown as { DB: D1Database; BUCKET: R2Bucket };
export const loginPath = "/signin-with-chatgpt?return_to=%2F";
export const logoutPath = "/signout-with-chatgpt?return_to=%2F";
export const platformAuth = true;
export async function currentUser(): Promise<User | null> {
  const user = await getChatGPTUser();
  return user
    ? {
        id: user.userId,
        email: user.email,
        name: user.fullName ?? user.email.split("@")[0],
      }
    : null;
}
export async function query<T>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await bindings.DB.prepare(sql)
    .bind(...params)
    .all<T>();
  return result.results;
}
export async function batch(statements: Statement[]) {
  await bindings.DB.batch(
    statements.map((s) => bindings.DB.prepare(s.sql).bind(...(s.params ?? []))),
  );
}
export async function putBlob(key: string, bytes: Uint8Array) {
  await bindings.BUCKET.put(key, bytes);
}
export async function getBlob(key: string): Promise<ReadableStream | null> {
  return (await bindings.BUCKET.get(key))?.body ?? null;
}
export async function deleteBlob(key: string) {
  await bindings.BUCKET.delete(key);
}
export async function authenticate(
  _request: Request,
  _action: string,
): Promise<Response> {
  throw new ApiError(400, "Use Sign in with ChatGPT");
}

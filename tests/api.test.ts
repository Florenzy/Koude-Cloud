import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const harness = vi.hoisted(() => ({
  database: null as unknown as {
    query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
  },
  cookies: new Map<string, string>(),
  options: new Map<string, unknown>(),
}));
vi.mock("pg", () => ({
  types: { setTypeParser() {} },
  Pool: class {
    async query(sql: string, params: unknown[] = []) {
      if (sql.includes("pg_advisory_xact_lock")) return { rows: [] };
      return harness.database.query(sql, params);
    }
    async connect() {
      return { query: this.query.bind(this), release() {} };
    }
  },
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      harness.cookies.has(name)
        ? { value: harness.cookies.get(name) }
        : undefined,
    set: (name: string, value: string, options: unknown) => {
      harness.cookies.set(name, value);
      harness.options.set(name, options);
    },
    delete: (name: string) => harness.cookies.delete(name),
  }),
}));
let database: PGlite;
let directory: string;
let route: typeof import("@/app/api/[...path]/route");
let userA: string;
let cookieA: string;
let cookieB: string;
let folder: string;
let file: string;
let token: string;
async function read(response: Response) {
  return response.json() as Promise<{
    user: { id: string };
    id: string;
    used: number;
    entries: ({ id: string } & Record<string, unknown>)[];
    token: string;
  }>;
}
async function call(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  const request = new Request(`http://localhost:3000/api/${path}`, {
    method,
    headers: {
      origin: "http://localhost:3000",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return route[method](request, {
    params: Promise.resolve({ path: path.split("?")[0].split("/") }),
  });
}
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "koude-test-"));
  process.env.UPLOAD_DIR = directory;
  process.env.APP_ORIGIN = "https://koude.test";
  database = new PGlite();
  await database.exec(await readFile("db/postgres/001_initial.sql", "utf8"));
  harness.database = database;
  route = await import("@/app/api/[...path]/route");
});
afterAll(async () => {
  await database.close();
  await rm(directory, { recursive: true, force: true });
});
describe.sequential("REST lifecycle", () => {
  it("requires authentication", async () => {
    expect((await call("GET", "files")).status).toBe(401);
  });
  it("registers an account with a hashed session", async () => {
    const response = await call("POST", "auth/register", {
      email: "anton@example.com",
      password: "long-test-password",
      name: "Anton",
    });
    expect(response.status).toBe(201);
    userA = (await read(response)).user.id;
    cookieA = harness.cookies.get("koude_session")!;
    expect(cookieA).toHaveLength(64);
    expect(harness.options.get("koude_session")).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
    });
    const result = await database.query<{ token_hash: string }>(
      "SELECT token_hash FROM sessions",
    );
    expect(result.rows[0].token_hash).not.toBe(cookieA);
  });
  it("rejects duplicate registration and incorrect passwords", async () => {
    expect(
      (
        await call("POST", "auth/register", {
          email: "anton@example.com",
          password: "long-test-password",
          name: "Anton",
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await call("POST", "auth/login", {
          email: "anton@example.com",
          password: "wrong-test-password",
        })
      ).status,
    ).toBe(401);
  });
  it("creates folders and rejects malformed requests", async () => {
    expect((await call("POST", "files", { name: "../no" })).status).toBe(400);
    expect(
      (await call("POST", "files", { name: "x", owner: "other" })).status,
    ).toBe(400);
    const response = await call("POST", "files", { name: "Documents" });
    expect(response.status).toBe(201);
    folder = (await read(response)).id;
  });
  it("uploads and downloads identical bytes", async () => {
    const request = new Request(
      `http://localhost:3000/api/files/upload?name=notes.txt&parent=${folder}`,
      {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          "Content-Type": "text/plain",
        },
        body: "Hello from Koude",
      },
    );
    const response = await route.POST(request, {
      params: Promise.resolve({ path: ["files", "upload"] }),
    });
    expect(response.status).toBe(201);
    file = (await read(response)).id;
    const downloaded = await call("GET", `files/${file}/download`);
    expect(await downloaded.text()).toBe("Hello from Koude");
    expect(downloaded.headers.get("content-disposition")).toContain(
      "attachment",
    );
  });
  it("renames, stars, and lists persisted files", async () => {
    expect(
      (
        await call("PATCH", `files/${file}`, {
          name: "new name.txt",
          starred: true,
        })
      ).status,
    ).toBe(200);
    const data = await read(await call("GET", "files"));
    expect(data.used).toBe(16);
    expect(
      data.entries.find((e: { id: string }) => e.id === file),
    ).toMatchObject({ name: "new name.txt", starred: 1 });
  });
  it("blocks folder cycles and trashing non-empty folders", async () => {
    const child = await read(
      await call("POST", "files", { name: "Child", parent: folder }),
    );
    expect(
      (await call("PATCH", `files/${folder}`, { parent: child.id })).status,
    ).toBe(400);
    expect(
      (await call("PATCH", `files/${folder}`, { trashed: true })).status,
    ).toBe(409);
  });
  it("rejects forged ownership and cross-site writes", async () => {
    expect(
      (await call("PATCH", `files/${file}`, { owner: "someone" })).status,
    ).toBe(400);
    expect(
      (
        await call(
          "PATCH",
          `files/${file}`,
          { name: "hacked" },
          { origin: "https://evil.test" },
        )
      ).status,
    ).toBe(403);
  });
  it("isolates accounts for reads, downloads and writes", async () => {
    await call("POST", "auth/register", {
      email: "other@example.com",
      password: "another-test-password",
      name: "Other",
    });
    cookieB = harness.cookies.get("koude_session")!;
    expect((await read(await call("GET", "files"))).entries).toHaveLength(0);
    for (const [method, path, body] of [
      ["GET", `files/${file}`],
      ["GET", `files/${file}/download`],
      ["PATCH", `files/${file}`, { starred: true }],
      ["DELETE", `files/${file}`],
      ["POST", `files/${file}/share`],
      ["POST", "files", { name: "Intruder", parent: folder }],
    ] as const)
      expect((await call(method, path, body)).status).toBe(404);
    harness.cookies.set("koude_session", cookieA);
    const login = await call("POST", "auth/login", {
      email: "anton@example.com",
      password: "long-test-password",
    });
    expect(login.status).toBe(200);
    cookieA = harness.cookies.get("koude_session")!;
  });
  it("creates links that expire and can be revoked", async () => {
    const response = await call("POST", `files/${file}/share`);
    expect(response.status).toBe(200);
    token = (await read(response)).token;
    harness.cookies.clear();
    expect(await (await call("GET", `shares/${token}`)).text()).toBe(
      "Hello from Koude",
    );
    await database.query("UPDATE entries SET share_expires = 0 WHERE id = $1", [
      file,
    ]);
    expect((await call("GET", `shares/${token}`)).status).toBe(404);
    harness.cookies.set("koude_session", cookieA);
    token = (await read(await call("POST", `files/${file}/share`))).token;
    await call("DELETE", `files/${file}/share`);
    expect((await call("GET", `shares/${token}`)).status).toBe(404);
  });
  it("handles trash, restore and permanent deletion", async () => {
    expect((await call("DELETE", `files/${file}`)).status).toBe(409);
    await call("PATCH", `files/${file}`, { trashed: true });
    expect((await call("GET", `files/${file}/download`)).status).toBe(404);
    expect(
      (await call("PATCH", `files/${file}`, { trashed: false })).status,
    ).toBe(200);
    expect((await call("GET", `files/${file}/download`)).status).toBe(200);
    await call("PATCH", `files/${file}`, { trashed: true });
    expect((await call("DELETE", `files/${file}`)).status).toBe(200);
    expect((await call("GET", `files/${file}`)).status).toBe(404);
    await expect(readFile(join(directory, file))).rejects.toThrow();
  });
  it("enforces upload limits before reading bytes", async () => {
    const request = new Request(
      "http://localhost:3000/api/files/upload?name=large.bin",
      { method: "POST", headers: { "Content-Length": "21000000" }, body: "x" },
    );
    expect(
      (
        await route.POST(request, {
          params: Promise.resolve({ path: ["files", "upload"] }),
        })
      ).status,
    ).toBe(413);
  });
  it("enforces storage quota and cleans up a rejected upload", async () => {
    await database.query("UPDATE entries SET size = 1073741824 WHERE id = $1", [
      folder,
    ]);
    const request = new Request(
      "http://localhost:3000/api/files/upload?name=quota.txt",
      { method: "POST", body: "x" },
    );
    expect(
      (
        await route.POST(request, {
          params: Promise.resolve({ path: ["files", "upload"] }),
        })
      ).status,
    ).toBe(409);
    await database.query("UPDATE entries SET size = 0 WHERE id = $1", [folder]);
  });
  it("revokes sessions on logout", async () => {
    expect((await call("POST", "auth/logout")).status).toBe(200);
    harness.cookies.set("koude_session", cookieA);
    expect((await call("GET", "files")).status).toBe(401);
    harness.cookies.set("koude_session", cookieB);
    expect((await call("GET", "me")).status).toBe(200);
  });
  it("throttles repeated login attempts", async () => {
    for (let i = 0; i < 10; i++)
      await call("POST", "auth/login", {
        email: "nobody@example.com",
        password: "wrong-test-password",
      });
    expect(
      (
        await call("POST", "auth/login", {
          email: "nobody@example.com",
          password: "wrong-test-password",
        })
      ).status,
    ).toBe(429);
  });
});

import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { database, identity, objects } from "./cloud-bindings";
vi.mock("@runtime", async () => import("@/lib/runtime-cloud"));
vi.mock("@/app/chatgpt-auth", () => ({ getChatGPTUser: async () => identity }));
import { GET, POST, PATCH } from "@/app/api/[...path]/route";
const context = (path: string[]) => ({ params: Promise.resolve({ path }) });
beforeAll(async () => {
  database.exec(await readFile("drizzle/0000_rich_genesis.sql", "utf8"));
});
afterAll(() => database.close());
it("persists hosted uploads and returns the stored bytes", async () => {
  const response = await POST(
    new Request("https://cloud.test/api/files/upload?name=cloud.txt", {
      method: "POST",
      body: "Cloud bytes",
    }),
    context(["files", "upload"]),
  );
  expect(response.status).toBe(201);
  const entry = (await response.json()) as { id: string };
  expect(objects.has(entry.id)).toBe(true);
  const download = await GET(
    new Request(`https://cloud.test/api/files/${entry.id}/download`),
    context(["files", entry.id, "download"]),
  );
  expect(await download.text()).toBe("Cloud bytes");
});
it("isolates hosted identities", async () => {
  identity.userId = "second-cloud-owner";
  const response = await GET(
    new Request("https://cloud.test/api/files"),
    context(["files"]),
  );
  expect(
    ((await response.json()) as { entries: unknown[] }).entries,
  ).toHaveLength(0);
  identity.userId = "cloud-owner";
});
it("accepts valid folder moves on SQLite", async () => {
  const folderResponse = await POST(
    new Request("https://cloud.test/api/files", {
      method: "POST",
      body: JSON.stringify({ name: "Folder" }),
    }),
    context(["files"]),
  );
  expect(folderResponse.status).toBe(201);
  const folder = (await folderResponse.json()) as { id: string };
  const entry = database
    .prepare("SELECT id FROM entries WHERE kind = 'file'")
    .get() as { id: string };
  const moved = await PATCH(
    new Request(`https://cloud.test/api/files/${entry.id}`, {
      method: "PATCH",
      body: JSON.stringify({ parent: folder.id }),
    }),
    context(["files", entry.id]),
  );
  expect(moved.status).toBe(200);
  expect(((await moved.json()) as { parent: string }).parent).toBe(folder.id);
});

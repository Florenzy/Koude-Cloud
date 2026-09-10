import { DatabaseSync } from "node:sqlite";
export const database = new DatabaseSync(":memory:");
export const objects = new Map<string, Uint8Array>();
export const identity = {
  userId: "cloud-owner",
  email: "cloud@example.com",
  fullName: "Cloud Owner",
};
export const env = {
  DB: {
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          return {
            async all() {
              return {
                results: database
                  .prepare(sql)
                  .all(...(params as (string | number | null)[])),
              };
            },
          };
        },
      };
    },
  },
  BUCKET: {
    async put(key: string, bytes: Uint8Array) {
      objects.set(key, bytes);
    },
    async get(key: string) {
      const bytes = objects.get(key);
      return bytes
        ? {
            body: new ReadableStream({
              start(controller) {
                controller.enqueue(bytes);
                controller.close();
              },
            }),
          }
        : null;
    },
    async delete(key: string) {
      objects.delete(key);
    },
  },
};

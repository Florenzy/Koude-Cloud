import { describe, it, expect } from "vitest";
import {
  nameSchema,
  updateSchema,
  credentialsSchema,
  assertSameOrigin,
} from "@/lib/validation";
import { hashPassword, verifyPassword, tokenHash } from "@/lib/password";
import { fileCategory, formatBytes } from "@/lib/types";
describe("validation", () => {
  it("rejects path traversal and control characters", () => {
    for (const name of [
      "../secret",
      "folder/file",
      "folder\\file",
      "\nname",
      "..",
      ".",
      " ",
      "a".repeat(181),
    ])
      expect(nameSchema.safeParse(name).success).toBe(false);
    expect(nameSchema.parse("  Рейкьявик.pdf  ")).toBe("Рейкьявик.pdf");
  });
  it("rejects unknown mutation fields", () => {
    expect(updateSchema.safeParse({ owner: "other-user" }).success).toBe(false);
    expect(updateSchema.safeParse({}).success).toBe(false);
    expect(
      updateSchema.safeParse({ trashed: false, starred: true }).success,
    ).toBe(true);
  });
  it("normalizes email and enforces password length", () => {
    expect(
      credentialsSchema.parse({
        email: " A@EXAMPLE.COM ",
        password: "a-long-password",
      }).email,
    ).toBe("a@example.com");
    expect(
      credentialsSchema.safeParse({ email: "a@example.com", password: "short" })
        .success,
    ).toBe(false);
  });
  it("rejects cross-origin mutations", () => {
    expect(() =>
      assertSameOrigin(
        new Request("https://koude.test/api/files", {
          method: "POST",
          headers: { origin: "https://evil.test" },
        }),
      ),
    ).toThrow();
    expect(() =>
      assertSameOrigin(
        new Request("https://koude.test/api/files", {
          method: "POST",
          headers: { origin: "https://koude.test" },
        }),
      ),
    ).not.toThrow();
  });
});
describe("passwords", () => {
  it("salts every password and compares the full hash", async () => {
    const a = await hashPassword("correct-horse-battery");
    const b = await hashPassword("correct-horse-battery");
    expect(a).not.toBe(b);
    expect(await verifyPassword("correct-horse-battery", a)).toBe(true);
    expect(await verifyPassword("wrong-horse-battery", a)).toBe(false);
    expect(await verifyPassword("anything", "broken")).toBe(false);
    expect(tokenHash("session")).toHaveLength(64);
  });
});
it("formats file metadata", () => {
  expect(formatBytes(0)).toBe("0 B");
  expect(formatBytes(1024)).toBe("1.0 KB");
  expect(fileCategory("image/png")).toBe("image");
  expect(fileCategory("application/pdf")).toBe("document");
  expect(fileCategory("application/zip")).toBe("other");
});

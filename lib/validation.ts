import { z } from "zod";
export const nameSchema = z
  .string()
  .refine(
    (value) => !/[\x00-\x1f\x7f]/.test(value),
    "This name contains unsupported characters",
  )
  .transform((value) => value.trim())
  .pipe(
    z
      .string()
      .min(1, "Enter a name")
      .max(180, "Use 180 characters or fewer")
      .refine(
        (value) =>
          !/[\x00-\x1f\x7f/\\]/.test(value) && value !== "." && value !== "..",
        "This name contains unsupported characters",
      ),
  );
export const folderSchema = z
  .object({
    name: nameSchema,
    parent: z.string().uuid().nullable().default(null),
  })
  .strict();
export const updateSchema = z
  .object({
    name: nameSchema.optional(),
    starred: z.boolean().optional(),
    trashed: z.boolean().optional(),
    parent: z.string().uuid().nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "No changes supplied");
export const credentialsSchema = z
  .object({
    email: z
      .string()
      .trim()
      .email()
      .max(254)
      .transform((value) => value.toLowerCase()),
    password: z.string().min(12, "Use at least 12 characters").max(128),
    name: z.string().trim().min(1).max(80).optional(),
  })
  .strict();
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    throw new ApiError(403, "Request origin is not allowed");
  if (request.headers.get("sec-fetch-site") === "cross-site")
    throw new ApiError(403, "Request origin is not allowed");
}
export async function readJson(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "Request body is required");
  let length = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 8192) {
      await reader.cancel();
      throw new ApiError(413, "Request is too large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ApiError(400, "Invalid JSON");
  }
}

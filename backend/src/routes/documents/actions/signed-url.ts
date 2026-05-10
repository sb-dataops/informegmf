import type { Context } from "hono";

export interface SignedUrlDeps {
  bucketName: string;
}

// NOTE: el nombre 'signed-url' es legado; en realidad devuelve la URL pública
// directa del bucket (no firmada). Se preserva el comportamiento original.
export async function signedUrl(
  c: Context,
  deps: SignedUrlDeps,
): Promise<Response> {
  const { bucketName } = deps;
  const gcsPath = c.req.query("path");
  if (!gcsPath) {
    return c.json({ error: "path requerido" }, 400);
  }

  const publicUrl = `https://storage.googleapis.com/${bucketName}/${gcsPath}`;
  return c.json({ url: publicUrl });
}

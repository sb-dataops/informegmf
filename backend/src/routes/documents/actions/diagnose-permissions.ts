import type { Context } from "hono";
import type { Bucket } from "@google-cloud/storage";

interface PermissionCheck {
  ok: boolean | null;
  status: number | null;
  detail: string | null;
}

function errToCheck(err: unknown): Pick<PermissionCheck, "ok" | "status" | "detail"> {
  const e = err as { code?: number; message?: string };
  return {
    ok: false,
    status: typeof e.code === "number" ? e.code : null,
    detail: e.message ?? String(err),
  };
}

export interface DiagnoseDeps {
  bucket: Bucket;
  bucketName: string;
  serviceAccountEmail: string | null;
}

export async function diagnosePermissions(
  c: Context,
  deps: DiagnoseDeps,
): Promise<Response> {
  const { bucket, bucketName, serviceAccountEmail } = deps;
  const tempObjectPath = `diagnostico-permisos/${Date.now()}.txt`;
  const tempFile = bucket.file(tempObjectPath);

  const bucketCheck: PermissionCheck = { ok: false, status: null, detail: null };
  try {
    const [metadata] = await bucket.getMetadata();
    bucketCheck.ok = true;
    bucketCheck.status = 200;
    void metadata;
  } catch (err) {
    Object.assign(bucketCheck, errToCheck(err));
  }

  const listCheck: PermissionCheck = { ok: false, status: null, detail: null };
  try {
    await bucket.getFiles({ maxResults: 1 });
    listCheck.ok = true;
    listCheck.status = 200;
  } catch (err) {
    Object.assign(listCheck, errToCheck(err));
  }

  const writeCheck: PermissionCheck = { ok: false, status: null, detail: null };
  try {
    await tempFile.save(
      Buffer.from(`diagnostic check ${new Date().toISOString()}`),
      { metadata: { contentType: "text/plain" } },
    );
    writeCheck.ok = true;
    writeCheck.status = 200;
  } catch (err) {
    Object.assign(writeCheck, errToCheck(err));
  }

  const deleteCheck: PermissionCheck = { ok: null, status: null, detail: null };
  if (writeCheck.ok) {
    try {
      await tempFile.delete();
      deleteCheck.ok = true;
      deleteCheck.status = 204;
    } catch (err) {
      Object.assign(deleteCheck, errToCheck(err));
    }
  }

  return c.json({
    bucket: bucketName,
    service_account: serviceAccountEmail,
    checks: {
      bucket_metadata: bucketCheck,
      list_objects: listCheck,
      write_object: writeCheck,
      delete_object: deleteCheck,
    },
  });
}

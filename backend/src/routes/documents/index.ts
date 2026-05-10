import { Hono } from "hono";
import { getBucket, getBucketName } from "../../services/gcs.js";
import { getServiceAccountEmail, parseAction } from "./helpers.js";
import { diagnosePermissions } from "./actions/diagnose-permissions.js";
import { uploadDocument } from "./actions/upload.js";
import { listDocuments } from "./actions/list.js";
import { deleteDocument } from "./actions/delete.js";
import { viewDocument } from "./actions/view.js";
import { signedUrl } from "./actions/signed-url.js";

const router = new Hono();

router.all("/", async (c) => {
  try {
    const bucket = getBucket();
    const bucketName = getBucketName();
    const serviceAccountEmail = await getServiceAccountEmail(bucket);

    console.log("GCS config loaded", {
      bucketConfigured: true,
      bucketName,
      serviceAccountEmail,
    });

    const action = await parseAction(c);

    if (action === "diagnose-permissions") {
      return diagnosePermissions(c, { bucket, bucketName, serviceAccountEmail });
    }
    if (action === "upload" && c.req.method === "POST") {
      return uploadDocument(c, { bucket, bucketName });
    }
    if (action === "list") {
      return listDocuments(c);
    }
    if (action === "delete" && c.req.method === "POST") {
      return deleteDocument(c, { bucket });
    }
    if (action === "view") {
      return viewDocument(c, { bucket });
    }
    if (action === "signed-url") {
      return signedUrl(c, { bucketName });
    }

    return c.json(
      { error: "action requerido: upload, list, delete, view, signed-url" },
      400,
    );
  } catch (error: unknown) {
    console.error("GCS error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

export const documentsRouter = router;

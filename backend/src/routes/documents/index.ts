import { Hono } from "hono";
import { getBucket, getBucketName } from "../../services/gcs.js";
import { getServiceAccountEmail, parseAction } from "./helpers.js";
import { diagnosePermissions } from "./actions/diagnose-permissions.js";
import { uploadDocument } from "./actions/upload.js";
import { listDocuments } from "./actions/list.js";
import { deleteDocument } from "./actions/delete.js";
import { viewDocument } from "./actions/view.js";
import { signedUrl } from "./actions/signed-url.js";
import { EDIT_ROLES, type AppRole } from "../../services/roles.js";
import type { AuthUser } from "../../middleware/auth.js";

// requireAnyRole (montado en index.ts) ya garantizó un rol de staff y fijó c.get("roles").
const router = new Hono<{ Variables: { user: AuthUser; roles: AppRole[] } }>();

// Acciones que MUTAN datos: requieren editor o admin (coincide con `canEdit` del frontend).
const MUTATION_ACTIONS = new Set(["upload", "delete"]);
// Acciones solo-admin (diagnóstico que expone SA/bucket/internos).
const ADMIN_ACTIONS = new Set(["diagnose-permissions"]);

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

    // Autorización por-acción (reusa roles ya resueltos por requireAnyRole).
    const roles = c.get("roles") ?? [];
    if (ADMIN_ACTIONS.has(action) && !roles.includes("admin")) {
      return c.json({ error: "No autorizado: requiere rol admin" }, 403);
    }
    if (
      MUTATION_ACTIONS.has(action) &&
      !roles.some((r) => EDIT_ROLES.includes(r))
    ) {
      return c.json({ error: "No autorizado: requiere rol editor o admin" }, 403);
    }

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

import { Hono } from "hono";
import { auctionCompleteHandler } from "./auction-complete.js";
import { deadlineAlertsHandler } from "./deadline-alerts.js";
import { testNotificationsHandler } from "./test-notifications.js";

// Cloud Run + Cloud Scheduler protegen estas rutas via OIDC (oidcMiddleware
// en index.ts del backend). En local dev, JOBS_OIDC_AUDIENCE puede ir vacio
// y el middleware deja pasar las requests para testing con curl.
const router = new Hono();

router.post("/auction-complete", auctionCompleteHandler);
router.post("/deadline-alerts", deadlineAlertsHandler);
router.post("/test-notifications", testNotificationsHandler);

export const jobsRouter = router;

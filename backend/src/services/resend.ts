import { Resend } from "resend";
import { config } from "../config.js";

let cached: Resend | null = null;
function client(): Resend {
  if (!cached) cached = new Resend(config.resendApiKey);
  return cached;
}

export async function sendEmail(params: {
  from?: string;
  to: string | string[];
  subject: string;
  html: string;
}) {
  const { data, error } = await client().emails.send({
    from: params.from ?? config.resendFromEmail,
    to: params.to,
    subject: params.subject,
    html: params.html,
  });
  if (error) throw new Error(`Resend error: ${error.message ?? JSON.stringify(error)}`);
  return data;
}

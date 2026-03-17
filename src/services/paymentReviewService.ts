import { supabase } from "@/integrations/supabase/client";

export async function markPaymentReviewAsReviewed(placa: string): Promise<void> {
  const normalizedPlaca = placa.trim().toUpperCase();

  const { error } = await supabase
    .from("payment_review_status")
    .upsert(
      {
        placa: normalizedPlaca,
        last_reviewed_at: new Date().toISOString(),
      },
      { onConflict: "placa" },
    );

  if (error) {
    throw new Error(error.message);
  }
}

-- Add index on Payment.stripeSubscriptionId for webhook lookup performance
CREATE INDEX IF NOT EXISTS "Payment_stripeSubscriptionId_idx" ON "Payment"("stripeSubscriptionId");

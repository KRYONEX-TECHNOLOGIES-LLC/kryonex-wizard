# Pricing Update - January 2026

## New Pricing Structure

Effective immediately, top-up pricing has been updated to reflect premium value:

### Per-Unit Pricing
- **Call Minutes**: $0.65/minute (previously $0.33/minute)
- **SMS Messages**: $0.10/message (previously $0.08/message)

### Top-Up Packages

| Package | Quantity | New Price | Old Price | Per-Unit Cost |
|---------|----------|-----------|-----------|---------------|
| Call Top-Up Small | 300 minutes | **$195** | $99 | $0.65/min |
| Call Top-Up Large | 800 minutes | **$520** | $265 | $0.65/min |
| SMS Top-Up Small | 500 texts | **$50** | $40 | $0.10/text |
| SMS Top-Up Large | 1000 texts | **$100** | $80 | $0.10/text |

## Implementation Status

✅ **Frontend Updated** - `frontend/src/lib/billingConstants.js`  
✅ **Backend Verified** - Uses Stripe price IDs (no hardcoded amounts)  
⚠️ **Stripe Dashboard** - Requires manual update (see below)

## Stripe Dashboard Updates Required

You **must** update the following Stripe Products/Prices to match the new pricing:

1. **Login to Stripe Dashboard** → Products
2. **Update these price IDs:**

   - `STRIPE_TOPUP_CALL_300` → Set to **$195.00**
   - `STRIPE_TOPUP_CALL_800` → Set to **$520.00**
   - `STRIPE_TOPUP_SMS_500` → Set to **$50.00**
   - `STRIPE_TOPUP_SMS_1000` → Set to **$100.00**

3. **How to update:**
   - Go to each Product
   - Click "Add another price"
   - Enter new amount
   - Set as default price
   - Archive old price (don't delete - preserves history)

4. **Update `.env` file** with new Stripe price IDs if they changed:
   ```
   STRIPE_TOPUP_CALL_300=price_xxx_new
   STRIPE_TOPUP_CALL_800=price_xxx_new
   STRIPE_TOPUP_SMS_500=price_xxx_new
   STRIPE_TOPUP_SMS_1000=price_xxx_new
   ```

## Margin Analysis

With Retell's typical costs ($0.10-0.15/min for calls, $0.01/SMS):

- **Call Margins**: 77-85% gross margin
- **SMS Margins**: 90% gross margin

## Competitive Positioning

Industry comparison:
- Air.ai: $1.00/minute
- Bland.ai: $0.90/minute
- **Kryonex**: $0.65/minute ← Still competitive, much better margins

## Notes

- Plan tier included minutes/SMS remain unchanged (300/500/800 min tiers)
- Only affects top-up purchases
- Users will see new pricing immediately in the app
- Old Stripe checkout links will use old pricing until Stripe is updated

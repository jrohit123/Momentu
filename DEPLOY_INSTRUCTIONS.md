# Deploy send-daily-summary Function

## Quick Deploy Command

In your terminal, navigate to the project root directory and run:

```bash
supabase functions deploy send-daily-summary
```

## If you're not logged in:

First, log in to Supabase:

```bash
supabase login
```

Then deploy:

```bash
supabase functions deploy send-daily-summary
```

## Alternative: Using npx (if Supabase CLI is not installed globally)

```bash
npx supabase login
npx supabase functions deploy send-daily-summary
```

## After Deployment

1. **Set the RESEND_API_KEY secret:**
   - Go to Supabase Dashboard > Settings > Edge Functions > Secrets
   - Add a new secret:
     - Name: `RESEND_API_KEY`
     - Value: Your Resend API key

2. **Test the function:**
   - See `supabase/functions/send-daily-summary/TEST.md` for testing instructions

## Verify Deployment

After deploying, you should see `send-daily-summary` listed in:
- Supabase Dashboard > Edge Functions


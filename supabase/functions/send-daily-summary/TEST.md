# Testing the Daily Summary Email Function

## Manual Testing

### 1. Test with a specific date

```bash
curl -X POST \
  'https://ifsboadntqhpypurswkz.supabase.co/functions/v1/send-daily-summary' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlmc2JvYWRudHFocHlwdXJzd2t6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDUxMTA4MywiZXhwIjoyMDgwMDg3MDgzfQ.2d_Hs-g5uQMdt7p0IEUFFqD_ArgioneOlUhZcqJU-8c' \
  -H 'Content-Type: application/json' \
  -d '{
    "targetDate": "2025-12-18",
    "organizationId": "00000000-0000-0000-0000-000000000001"
  }'
```

### 2. Test for all organizations (current date)

```bash
curl -X POST \
  'https://ifsboadntqhpypurswkz.supabase.co/functions/v1/send-daily-summary' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlmc2JvYWRudHFocHlwdXJzd2t6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDUxMTA4MywiZXhwIjoyMDgwMDg3MDgzfQ.2d_Hs-g5uQMdt7p0IEUFFqD_ArgioneOlUhZcqJU-8c' \
  -H 'Content-Type: application/json' \
  -d '{}'
```

## Common Issues

### No emails sent

1. **Check RESEND_API_KEY**: Make sure the environment variable is set in Supabase Dashboard > Settings > Edge Functions > Secrets
2. **Check logs**: View function logs in Supabase Dashboard > Edge Functions > send-daily-summary > Logs
3. **Check task completions**: The function only sends emails if there are task completions for the target date
4. **Check holidays**: Emails are skipped on holidays unless tasks were completed
5. **Check user assignments**: Users must have task assignments to receive emails

### Function not deployed

```bash
supabase functions deploy send-daily-summary
```

### Check function logs

In Supabase Dashboard:
1. Go to Edge Functions
2. Click on `send-daily-summary`
3. View the Logs tab

The function logs will show:
- Which organizations are being processed
- Which users are being processed
- How many task completions were found
- Whether emails were sent successfully
- Any errors that occurred

## Expected Response

```json
{
  "message": "Daily summary emails processed",
  "results": [
    {
      "userId": "user-id",
      "email": "user@example.com",
      "success": true
    }
  ],
  "totalProcessed": 1,
  "successful": 1,
  "failed": 0,
  "errors": []
}
```


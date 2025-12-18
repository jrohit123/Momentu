# Daily Summary Email Function

This edge function sends daily task completion summary emails to users with a CC to their managers.

## Features

- Sends emails based on organization settings (time and day preference)
- Skips holidays unless tasks were completed on that day
- Includes task completion statistics and details
- CCs the user's manager if they have one

## Configuration

Admins can configure email notifications in the System Settings panel:

1. **Notification Time**: Time of day when emails are sent (24-hour format, e.g., "18:00")
2. **Email Day Preference**: 
   - "Same Day": Email sent at end of day for that day's tasks
   - "Previous Day": Email sent next morning for previous day's tasks

## Setup

### 1. Deploy the Edge Function

```bash
supabase functions deploy send-daily-summary
```

### 2. Set Environment Variables

In your Supabase project dashboard, go to Settings > Edge Functions and add:

- `RESEND_API_KEY`: Your Resend API key
- `SUPABASE_URL`: Your Supabase project URL (automatically available)
- `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase service role key (automatically available)

### 3. Schedule the Function

You have several options to schedule the function:

#### Option A: External Cron Service (Recommended)

Use a service like [cron-job.org](https://cron-job.org) or [EasyCron](https://www.easycron.com):

- **URL**: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-daily-summary`
- **Method**: POST
- **Headers**: 
  - `Authorization: Bearer YOUR_SERVICE_ROLE_KEY`
  - `Content-Type: application/json`
- **Body**: `{}` (empty JSON object)
- **Schedule**: Every 5 minutes (to catch the configured notification times)

#### Option B: Supabase pg_cron (If Available)

If your Supabase project has the `pg_cron` extension enabled:

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule to run every 5 minutes
SELECT cron.schedule(
  'send-daily-summaries',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-daily-summary',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
```

#### Option C: Manual Testing

You can manually trigger the function for testing:

```bash
curl -X POST \
  'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-daily-summary' \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json' \
  -d '{}'
```

Or test for a specific date:

```bash
curl -X POST \
  'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-daily-summary' \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"targetDate": "2025-12-22", "organizationId": "YOUR_ORG_ID"}'
```

## How It Works

1. The function checks each organization's email notification settings
2. For each organization, it determines if it's time to send emails based on:
   - Current time vs. configured notification time
   - Email day preference (same day vs. previous day)
3. For each active user:
   - Checks if the target date is a holiday (public holiday, weekly off, or personal holiday)
   - If it's a holiday with no task completions, skips the email
   - Otherwise, fetches task completions for that date
   - Builds a summary with statistics and task details
   - Sends email to user with CC to manager (if manager exists)

## Email Content

The email includes:
- Summary statistics (total scheduled, completion rate, completed/partial/not done counts)
- Detailed task list with status, progress, and notes
- Holiday indicator if applicable
- Delayed task indicators

## Notes

- The function uses the service role key to bypass RLS policies
- Emails are only sent if there are task completions for the target date
- Holidays are skipped unless tasks were completed on that day
- The function processes all organizations in the system


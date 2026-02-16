import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

interface TaskCompletion {
  task_name: string;
  status: string;
  quantity_completed: number | null;
  benchmark: number | null;
  notes: string | null;
  scheduled_date: string;
  completion_date: string;
}

interface UserSummary {
  userId: string;
  email: string;
  fullName: string;
  managerEmail: string | null;
  managerName: string | null;
  completions: TaskCompletion[];
  totalScheduled: number;
  totalCompleted: number;
  totalPartial: number;
  totalNotDone: number;
  totalPending: number;
  totalDelayed: number;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get the target date based on the request
    const { targetDate, organizationId } = await req.json().catch(() => ({
      targetDate: null,
      organizationId: null,
    }));

    console.log("Starting daily summary email function");
    
    // If no targetDate provided, determine based on current time and organization settings
    let summaryDate: Date;
    if (targetDate) {
      summaryDate = new Date(targetDate);
    } else {
      // Default to today, will be adjusted based on organization settings
      summaryDate = new Date();
      summaryDate.setHours(0, 0, 0, 0);
    }

    const dateStr = summaryDate.toISOString().split("T")[0];
    console.log(`Processing date: ${dateStr}`);

    // Get all organizations or specific one
    let organizationsQuery = supabase.from("organizations").select("id");
    if (organizationId) {
      organizationsQuery = organizationsQuery.eq("id", organizationId);
    }
    const { data: organizations, error: orgError } = await organizationsQuery;

    if (orgError) throw orgError;
    if (!organizations || organizations.length === 0) {
      return new Response(
        JSON.stringify({ message: "No organizations found" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const results: Array<{ userId: string; email: string; success: boolean; error?: string }> = [];

    // Process each organization
    for (const org of organizations) {
      console.log(`Processing organization: ${org.id}`);
      
      // Get organization settings
      const { data: orgSettings, error: settingsError } = await supabase
        .from("organization_settings")
        .select("setting_key, setting_value")
        .eq("organization_id", org.id);

      if (settingsError) {
        console.error(`Error fetching settings for org ${org.id}:`, settingsError);
        continue;
      }

      const settingsMap: Record<string, string> = {};
      orgSettings?.forEach((s) => {
        settingsMap[s.setting_key] = s.setting_value;
      });

      const emailTime = settingsMap["email_notification_time"] || "18:00";
      const emailDay = settingsMap["email_notification_day"] || "same";
      const timezone = settingsMap["timezone"] || "Asia/Kolkata";

      console.log(`Org ${org.id} settings: emailTime=${emailTime}, emailDay=${emailDay}`);

      // Determine the actual date to process based on email_day setting
      let processDate: Date;
      if (emailDay === "previous") {
        // For "previous", send email for yesterday
        processDate = new Date(summaryDate);
        processDate.setDate(processDate.getDate() - 1);
      } else {
        // For "same", use the provided date (or today)
        processDate = new Date(summaryDate);
      }

      const processDateStr = processDate.toISOString().split("T")[0];
      console.log(`Processing date for org ${org.id}: ${processDateStr}`);

      // Get all active users in this organization
      const { data: users, error: usersError } = await supabase
        .from("users")
        .select("id, email, full_name, manager_id")
        .eq("organization_id", org.id)
        .eq("is_active", true);

      if (usersError) {
        console.error(`Error fetching users for org ${org.id}:`, usersError);
        continue;
      }

      if (!users || users.length === 0) {
        console.log(`No active users found for org ${org.id}`);
        continue;
      }

      console.log(`Found ${users.length} active users in org ${org.id}`);

      // Get manager emails for users who have managers
      const managerIds = users
        .map((u) => u.manager_id)
        .filter((id): id is string => id !== null);
      
      const managerMap = new Map<string, { email: string; full_name: string }>();
      if (managerIds.length > 0) {
        const { data: managers } = await supabase
          .from("users")
          .select("id, email, full_name")
          .in("id", managerIds);

        managers?.forEach((m) => {
          managerMap.set(m.id, { email: m.email, full_name: m.full_name });
        });
      }

      // Check if it's a holiday for this organization
      // Check public holidays
      const { data: publicHoliday } = await supabase
        .from("public_holidays")
        .select("id")
        .eq("holiday_date", processDateStr)
        .maybeSingle();

      // Check weekly offs (organization-wide)
      const dayOfWeek = processDate.getDay(); // 0 = Sunday, 6 = Saturday
      const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
      const dayName = dayNames[dayOfWeek];

      const { data: weeklyOff } = await supabase
        .from("weekly_offs")
        .select("id")
        .eq("day_of_week", dayName)
        .maybeSingle();

      // Process each user
      for (const user of users) {
        try {
          console.log(`\nProcessing user: ${user.email} (${user.full_name})`);
          
          // Check user's personal holidays
          const { data: personalHoliday } = await supabase
            .from("personal_holidays")
            .select("id")
            .eq("user_id", user.id)
            .lte("start_date", processDateStr)
            .gte("end_date", processDateStr)
            .eq("approval_status", "approved")
            .maybeSingle();

          // Check user's weekly offs
          const { data: userWeeklyOff } = await supabase
            .from("user_weekly_offs")
            .select("id")
            .eq("user_id", user.id)
            .eq("day_of_week", dayName)
            .maybeSingle();

          const isHoliday = !!publicHoliday || !!weeklyOff || !!personalHoliday || !!userWeeklyOff;
          
          if (isHoliday) {
            console.log(`  Holiday detected for ${user.email}: publicHoliday=${!!publicHoliday}, weeklyOff=${!!weeklyOff}, personalHoliday=${!!personalHoliday}, userWeeklyOff=${!!userWeeklyOff}`);
          }

          // Get task assignments for this user first
          const { data: assignments, error: assignError } = await supabase
            .from("task_assignments")
            .select(`
              id,
              task:tasks (
                id,
                name,
                benchmark
              )
            `)
            .eq("assigned_to", user.id);

          if (assignError) {
            console.error(`Error fetching assignments for user ${user.id}:`, assignError);
            continue;
          }

          if (!assignments || assignments.length === 0) {
            console.log(`Skipping email for ${user.email} - no task assignments`);
            continue;
          }

          const assignmentIds = assignments.map((a: any) => a.id);
          console.log(`  User ${user.email} has ${assignmentIds.length} task assignment(s)`);

          // Get task completions for this user on this date
          // Check both scheduled_date (when task was due) and completion_date (when it was completed)
          const { data: completions, error: compError } = await supabase
            .from("task_completions")
            .select(`
              id,
              assignment_id,
              status,
              quantity_completed,
              notes,
              scheduled_date,
              completion_date
            `)
            .in("assignment_id", assignmentIds)
            .or(`scheduled_date.eq.${processDateStr},completion_date.eq.${processDateStr}`);

          if (compError) {
            console.error(`  Error fetching completions for user ${user.id}:`, compError);
            continue;
          }

          console.log(`  Found ${completions?.length || 0} completion(s) for ${processDateStr}`);
          
          if (completions && completions.length > 0) {
            completions.forEach((c: any) => {
              console.log(`    - Completion: scheduled_date=${c.scheduled_date}, completion_date=${c.completion_date}, status=${c.status}`);
            });
          }

          if (compError) {
            console.error(`Error fetching completions for user ${user.id}:`, compError);
            continue;
          }

          // If it's a holiday and no tasks were completed, skip
          if (isHoliday && (!completions || completions.length === 0)) {
            console.log(`  Skipping email for ${user.email} - holiday with no task completions`);
            continue;
          }

          // Build a map of assignment_id -> task for quick lookup
          const assignmentTaskMap = new Map<string, { name: string; benchmark: number | null }>();
          assignments?.forEach((a: any) => {
            if (a.task) {
              assignmentTaskMap.set(a.id, {
                name: a.task.name,
                benchmark: a.task.benchmark,
              });
            }
          });

          // Build summary from completions
          const taskCompletions: TaskCompletion[] = (completions || []).map((c: any) => {
            const taskInfo = assignmentTaskMap.get(c.assignment_id);
            return {
              task_name: taskInfo?.name || "Unknown Task",
              status: c.status,
              quantity_completed: c.quantity_completed,
              benchmark: taskInfo?.benchmark || null,
              notes: c.notes,
              scheduled_date: c.scheduled_date,
              completion_date: c.completion_date,
            };
          });

          // Count scheduled tasks (tasks with scheduled_date matching the target date)
          const scheduledCount = completions?.filter(
            (c: any) => c.scheduled_date === processDateStr
          ).length || 0;

          const summary: UserSummary = {
            userId: user.id,
            email: user.email,
            fullName: user.full_name,
            managerEmail: user.manager_id ? managerMap.get(user.manager_id)?.email || null : null,
            managerName: user.manager_id ? managerMap.get(user.manager_id)?.full_name || null : null,
            completions: taskCompletions,
            totalScheduled: scheduledCount || taskCompletions.length,
            totalCompleted: taskCompletions.filter((t) => t.status === "completed").length,
            totalPartial: taskCompletions.filter((t) => t.status === "partial").length,
            totalNotDone: taskCompletions.filter((t) => t.status === "not_done").length,
            totalPending: taskCompletions.filter((t) => t.status === "pending").length,
            totalDelayed: taskCompletions.filter((t) => t.status === "delayed").length,
          };

          // Only send email if there are task completions
          // (For holidays, we already checked above)
          if (taskCompletions.length === 0) {
            console.log(`  Skipping email for ${user.email} - no task completions for ${processDateStr}`);
            if (assignments && assignments.length > 0) {
              console.log(`    Note: User has ${assignments.length} task assignment(s) but no completions for this date`);
            } else {
              console.log(`    Note: User has no task assignments`);
            }
            continue;
          }
          
          console.log(`  Preparing to send email to ${user.email} with ${taskCompletions.length} task completion(s)`);

          // Check if RESEND_API_KEY is configured
          if (!RESEND_API_KEY) {
            console.error("RESEND_API_KEY is not configured. Cannot send emails.");
            throw new Error("Email service not configured. Please set RESEND_API_KEY.");
          }

          // Send email
          console.log(`Preparing to send email to ${user.email}${summary.managerEmail ? ` (CC: ${summary.managerEmail})` : ""}`);
          const isPersonalLeave = !!personalHoliday;
          const emailHtml = generateEmailHTML(summary, processDateStr, isHoliday, isPersonalLeave);
          
          const emailPayload: any = {
            from: "Momentum <onboarding@resend.dev>",
            to: [user.email],
            subject: `Daily Task Summary - ${formatDate(processDateStr)}`,
            html: emailHtml,
          };

          if (summary.managerEmail) {
            emailPayload.cc = [summary.managerEmail];
          }

          const emailRes = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${RESEND_API_KEY}`,
            },
            body: JSON.stringify(emailPayload),
          });

          if (!emailRes.ok) {
            const errorData = await emailRes.json().catch(() => ({ message: "Unknown error" }));
            console.error(`Failed to send email to ${user.email}:`, errorData);
            throw new Error(errorData.message || "Failed to send email");
          }

          const emailResponseData = await emailRes.json();
          console.log(`Email sent successfully to ${user.email}. Resend ID: ${emailResponseData.id}`);

          results.push({
            userId: user.id,
            email: user.email,
            success: true,
          });

          console.log(`Email sent successfully to ${user.email}`);
        } catch (error: any) {
          console.error(`Error processing user ${user.email}:`, error);
          results.push({
            userId: user.id,
            email: user.email,
            success: false,
            error: error.message,
          });
        }
      }
    }

    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    
    console.log(`Email processing complete. Total: ${results.length}, Successful: ${successful}, Failed: ${failed}`);
    
    if (failed > 0) {
      console.error("Failed email attempts:", results.filter((r) => !r.success));
    }

    return new Response(
      JSON.stringify({
        message: "Daily summary emails processed",
        results,
        totalProcessed: results.length,
        successful,
        failed,
        errors: results.filter((r) => !r.success).map((r) => ({ email: r.email, error: r.error })),
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in send-daily-summary function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function generateEmailHTML(summary: UserSummary, dateStr: string, isHoliday: boolean, isPersonalLeave = false): string {
  const formattedDate = formatDate(dateStr);
  // Exclude tasks on leave days from completion % - show N/A when user was on personal leave
  const completionRate = isPersonalLeave
    ? null
    : summary.totalScheduled > 0
      ? Math.round(
          ((summary.totalCompleted + summary.totalPartial * 0.5) / summary.totalScheduled) * 100
        )
      : 0;

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Daily Task Summary - ${formattedDate}</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
        <div style="background: white; border-radius: 12px; padding: 30px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #6366f1; margin-bottom: 5px;">Momentum</h1>
            <p style="color: #888; font-size: 14px;">by aitamate</p>
          </div>
          
          <h2 style="color: #1e293b; margin-top: 0;">Daily Task Summary</h2>
          <p style="color: #64748b; margin-bottom: 20px;">
            ${formattedDate}
            ${isHoliday ? '<span style="background: #fef3c7; color: #92400e; padding: 2px 8px; border-radius: 4px; font-size: 12px; margin-left: 8px;">Holiday</span>' : ""}
          </p>

          ${summary.totalScheduled === 0 && summary.completions.length === 0
      ? `<p style="color: #64748b;">No tasks were scheduled for this day.</p>`
      : `
          <!-- Summary Stats -->
          <div style="background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%); border-radius: 8px; padding: 20px; margin-bottom: 30px;">
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin-bottom: 15px;">
              <div style="text-align: center;">
                <div style="font-size: 32px; font-weight: bold; color: #6366f1;">${summary.totalScheduled}</div>
                <div style="font-size: 12px; color: #64748b; text-transform: uppercase;">Scheduled</div>
              </div>
              <div style="text-align: center;">
                <div style="font-size: 32px; font-weight: bold; color: #10b981;">${completionRate !== null ? `${completionRate}%` : "N/A"}</div>
                <div style="font-size: 12px; color: #64748b; text-transform: uppercase;">Completion${isPersonalLeave ? " (on leave)" : ""}</div>
              </div>
            </div>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 15px; padding-top: 15px; border-top: 1px solid #e2e8f0;">
              <div style="text-align: center;">
                <div style="font-size: 20px; font-weight: bold; color: #10b981;">${summary.totalCompleted}</div>
                <div style="font-size: 11px; color: #64748b;">Completed</div>
              </div>
              <div style="text-align: center;">
                <div style="font-size: 20px; font-weight: bold; color: #f59e0b;">${summary.totalPartial}</div>
                <div style="font-size: 11px; color: #64748b;">Partial</div>
              </div>
              <div style="text-align: center;">
                <div style="font-size: 20px; font-weight: bold; color: #ef4444;">${summary.totalNotDone}</div>
                <div style="font-size: 11px; color: #64748b;">Not Done</div>
              </div>
            </div>
            ${summary.totalDelayed > 0
        ? `<div style="text-align: center; margin-top: 10px; padding-top: 10px; border-top: 1px solid #e2e8f0;">
              <div style="font-size: 16px; font-weight: bold; color: #f97316;">${summary.totalDelayed} Delayed</div>
            </div>`
        : ""}
          </div>

          <!-- Task Details -->
          ${summary.completions.length > 0
      ? `
          <h3 style="color: #1e293b; margin-top: 30px; margin-bottom: 15px;">Task Details</h3>
          <div style="space-y: 10px;">
            ${summary.completions
          .map(
            (task) => `
              <div style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; margin-bottom: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                  <div style="font-weight: 600; color: #1e293b;">${task.task_name}</div>
                  <span style="
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 11px;
                    font-weight: 600;
                    ${task.status === "completed"
                ? "background: #d1fae5; color: #065f46;"
                : task.status === "partial"
                ? "background: #fef3c7; color: #92400e;"
                : task.status === "not_done"
                ? "background: #fee2e2; color: #991b1b;"
                : task.status === "delayed"
                ? "background: #fed7aa; color: #9a3412;"
                : "background: #f3f4f6; color: #374151;"}
                  ">
                    ${task.status.charAt(0).toUpperCase() + task.status.slice(1).replace("_", " ")}
                  </span>
                </div>
                ${task.benchmark && task.quantity_completed !== null
            ? `<div style="font-size: 13px; color: #64748b; margin-top: 5px;">
                  Progress: ${task.quantity_completed} / ${task.benchmark} (${Math.round((task.quantity_completed / task.benchmark) * 100)}%)
                </div>`
            : ""}
                ${task.notes
            ? `<div style="font-size: 13px; color: #64748b; margin-top: 5px; font-style: italic;">
                  "${task.notes}"
                </div>`
            : ""}
                ${task.completion_date !== task.scheduled_date
            ? `<div style="font-size: 12px; color: #f97316; margin-top: 5px;">
                  ⏱ Completed on ${formatDate(task.completion_date)} (scheduled for ${formatDate(task.scheduled_date)})
                </div>`
            : ""}
              </div>
            `
          )
          .join("")}
          </div>
        `
      : `<p style="color: #64748b;">No task completions recorded for this day.</p>`}
        `}

          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; text-align: center; color: #94a3b8; font-size: 12px;">
            <p>This is an automated summary from Momentum.</p>
            <p>If you have any questions, please contact your administrator.</p>
          </div>
        </div>
      </body>
    </html>
  `;
}

serve(handler);


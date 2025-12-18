import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

interface InvitationEmailRequest {
  email: string;
  inviterName: string;
  organizationName: string;
  role: string;
  invitationToken: string;
  appUrl: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { 
      status: 200,
      headers: corsHeaders 
    });
  }

  try {
    // Verify authentication token is present
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    const { 
      email, 
      inviterName, 
      organizationName, 
      role, 
      invitationToken,
      appUrl 
    }: InvitationEmailRequest = await req.json();

    console.log(`Sending invitation email to ${email} for organization ${organizationName}`);

    const signupUrl = `${appUrl}/auth?invitation=${invitationToken}`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Momentum <onboarding@resend.dev>",
        to: [email],
        subject: `You've been invited to join ${organizationName} on Momentum`,
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Invitation to Momentum</title>
            </head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="color: #6366f1; margin-bottom: 5px;">Momentum</h1>
                <p style="color: #888; font-size: 14px;">by aitamate</p>
              </div>
              
              <div style="background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%); border-radius: 12px; padding: 30px; margin-bottom: 30px;">
                <h2 style="margin-top: 0; color: #1e293b;">You're Invited!</h2>
                <p style="margin-bottom: 20px;">
                  <strong>${inviterName}</strong> has invited you to join <strong>${organizationName}</strong> on Momentum as a <strong>${role}</strong>.
                </p>
                <p style="margin-bottom: 20px;">
                  Momentum helps teams track daily tasks, manage performance benchmarks, and improve accountability.
                </p>
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${signupUrl}" style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">
                    Accept Invitation
                  </a>
                </div>
              <p style="font-size: 14px; color: #64748b;">
                Or copy and paste this link into your browser:<br>
                <a href="${signupUrl}" style="color: #6366f1; word-break: break-all;">${signupUrl}</a>
              </p>
            </div>
            
              <div style="text-align: center; color: #94a3b8; font-size: 12px;">
                <p>This invitation will expire in 7 days.</p>
                <p>If you didn't expect this invitation, you can safely ignore this email.</p>
              </div>
            </body>
          </html>
        `,
      }),
    });

    const emailResponse = await res.json();

    if (!res.ok) {
      console.error("Resend API error:", emailResponse);
      throw new Error(emailResponse.message || "Failed to send email");
    }

    console.log("Invitation email sent successfully:", emailResponse);

    return new Response(JSON.stringify(emailResponse), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error in send-invitation-email function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);

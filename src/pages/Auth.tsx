import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { Loader2, TrendingUp, Building2, UserPlus } from "lucide-react";

const Auth = () => {
  const [searchParams] = useSearchParams();
  const invitationToken = searchParams.get("token");
  
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [signupMode, setSignupMode] = useState<"new-org" | "invitation">(
    invitationToken ? "invitation" : "new-org"
  );
  const [invitationDetails, setInvitationDetails] = useState<{
    email: string;
    organization_name: string;
    role: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  // Fetch invitation details if token exists
  useEffect(() => {
    if (invitationToken) {
      fetchInvitationDetails();
    }
  }, [invitationToken]);

  const fetchInvitationDetails = async () => {
    const { data, error } = await supabase
      .from("invitations")
      .select(`
        email,
        role,
        organizations:organization_id(name)
      `)
      .eq("token", invitationToken)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .single();

    if (data && !error) {
      setInvitationDetails({
        email: data.email,
        organization_name: (data.organizations as any)?.name || "Unknown",
        role: data.role,
      });
      setEmail(data.email);
      setIsLogin(false);
      setSignupMode("invitation");
    } else {
      toast({
        title: "Invalid Invitation",
        description: "This invitation link is invalid or has expired.",
        variant: "destructive",
      });
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        toast({ title: "Welcome back!", description: "Signed in successfully" });
        navigate("/dashboard");
      } else {
        // Build metadata based on signup mode
        const metadata: Record<string, string> = { full_name: fullName };
        
        if (signupMode === "invitation" && invitationToken) {
          metadata.invitation_token = invitationToken;
        } else if (signupMode === "new-org" && organizationName.trim()) {
          metadata.organization_name = organizationName.trim();
        }

        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: metadata,
            emailRedirectTo: `${window.location.origin}/dashboard`,
          },
        });
        if (error) throw error;
        toast({ title: "Success!", description: "Account created successfully" });
        navigate("/dashboard");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-secondary/5 to-background p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2 animate-fade-in">
          <div className="flex justify-center mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-10 h-10 text-primary" />
              <h1 className="font-heading text-4xl font-bold text-primary">Momentum</h1>
            </div>
          </div>
          <p className="text-muted-foreground">Keep Your Team Moving Forward</p>
        </div>

        <Card className="shadow-lg border-border/50 animate-scale-in">
          <CardHeader>
            <CardTitle className="font-heading">
              {isLogin ? "Welcome Back" : invitationDetails ? "Accept Invitation" : "Create Account"}
            </CardTitle>
            <CardDescription>
              {isLogin 
                ? "Sign in to continue your momentum" 
                : invitationDetails 
                  ? `Join ${invitationDetails.organization_name} as ${invitationDetails.role}`
                  : "Start managing your tasks effectively"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAuth} className="space-y-4">
              {!isLogin && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="fullName">Full Name</Label>
                    <Input
                      id="fullName"
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="John Doe"
                      required
                    />
                  </div>

                  {!invitationToken && (
                    <div className="space-y-3">
                      <Label>How would you like to join?</Label>
                      <RadioGroup
                        value={signupMode}
                        onValueChange={(v) => setSignupMode(v as "new-org" | "invitation")}
                        className="space-y-2"
                      >
                        <div className="flex items-center space-x-3 p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer">
                          <RadioGroupItem value="new-org" id="new-org" />
                          <Label htmlFor="new-org" className="flex items-center gap-2 cursor-pointer">
                            <Building2 className="w-4 h-4 text-primary" />
                            Create a new organization
                          </Label>
                        </div>
                        <div className="flex items-center space-x-3 p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer">
                          <RadioGroupItem value="invitation" id="invitation" />
                          <Label htmlFor="invitation" className="flex items-center gap-2 cursor-pointer">
                            <UserPlus className="w-4 h-4 text-primary" />
                            I have an invitation link
                          </Label>
                        </div>
                      </RadioGroup>
                    </div>
                  )}

                  {signupMode === "new-org" && !invitationToken && (
                    <div className="space-y-2">
                      <Label htmlFor="orgName">Organization Name</Label>
                      <Input
                        id="orgName"
                        type="text"
                        value={organizationName}
                        onChange={(e) => setOrganizationName(e.target.value)}
                        placeholder="Acme Inc."
                        required
                      />
                      <p className="text-xs text-muted-foreground">
                        You'll be the admin of this organization
                      </p>
                    </div>
                  )}

                  {signupMode === "invitation" && !invitationToken && (
                    <div className="p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
                      <p>Please use the invitation link sent to your email to sign up.</p>
                    </div>
                  )}
                </>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                  disabled={!!invitationDetails}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>
              <Button 
                type="submit" 
                className="w-full" 
                disabled={loading || (!isLogin && signupMode === "invitation" && !invitationToken)}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Please wait
                  </>
                ) : (
                  <>{isLogin ? "Sign In" : invitationDetails ? "Accept & Create Account" : "Create Account"}</>
                )}
              </Button>
            </form>

            <div className="mt-4 text-center text-sm">
              <button
                type="button"
                onClick={() => setIsLogin(!isLogin)}
                className="text-primary hover:underline"
              >
                {isLogin ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
              </button>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          By aitamate · Intelligent Task Management
        </p>
      </div>
    </div>
  );
};

export default Auth;
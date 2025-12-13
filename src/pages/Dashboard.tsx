import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { TrendingUp, LogOut, Calendar, CheckCircle2, ListChecks, Palmtree, Shield } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import DailyView from "@/components/dashboard/DailyView";
import MonthlyView from "@/components/dashboard/MonthlyView";
import { TaskList } from "@/components/tasks/TaskList";
import { TaskCreateDialog } from "@/components/tasks/TaskCreateDialog";
import { HolidayManagement } from "@/components/holidays/HolidayManagement";
import { UserManagement } from "@/components/admin/UserManagement";
import { useUserRole } from "@/hooks/useUserRole";

type ViewMode = "daily" | "monthly" | "tasks" | "holidays" | "admin";

const Dashboard = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("daily");
  const [showTaskDialog, setShowTaskDialog] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isAdmin, loading: roleLoading } = useUserRole(user?.id || "");

  useEffect(() => {
    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (!session) {
        navigate("/auth");
      }
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!session) {
        navigate("/auth");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast({ title: "Signed out successfully" });
    navigate("/auth");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse flex items-center gap-2 text-primary">
          <TrendingUp className="w-8 h-8" />
          <span className="font-heading text-xl">Loading Momentum...</span>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/20 to-background">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-8 h-8 text-primary" />
              <div>
                <h1 className="font-heading text-2xl font-bold text-primary">Momentum</h1>
                <p className="text-xs text-muted-foreground">by <a href="https://www.aitamate.com" target="_blank" className="text-primary hover:underline">aitamate</a></p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant={viewMode === "daily" ? "default" : "outline"}
                onClick={() => setViewMode("daily")}
                size="sm"
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Daily
              </Button>
              <Button
                variant={viewMode === "monthly" ? "default" : "outline"}
                onClick={() => setViewMode("monthly")}
                size="sm"
              >
                <Calendar className="w-4 h-4 mr-2" />
                Monthly
              </Button>
              <Button
                variant={viewMode === "tasks" ? "default" : "outline"}
                onClick={() => setViewMode("tasks")}
                size="sm"
              >
                <ListChecks className="w-4 h-4 mr-2" />
                Tasks
              </Button>
              <Button
                variant={viewMode === "holidays" ? "default" : "outline"}
                onClick={() => setViewMode("holidays")}
                size="sm"
              >
                <Palmtree className="w-4 h-4 mr-2" />
                Holidays
              </Button>
              {isAdmin && (
                <Button
                  variant={viewMode === "admin" ? "default" : "outline"}
                  onClick={() => setViewMode("admin")}
                  size="sm"
                >
                  <Shield className="w-4 h-4 mr-2" />
                  Admin
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={handleSignOut}>
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {viewMode === "daily" ? (
          <DailyView user={user} onCreateTask={() => setShowTaskDialog(true)} />
        ) : viewMode === "monthly" ? (
          <MonthlyView user={user} />
        ) : viewMode === "tasks" ? (
          <TaskList user={user} onCreateClick={() => setShowTaskDialog(true)} />
        ) : viewMode === "holidays" ? (
          <HolidayManagement user={user} />
        ) : viewMode === "admin" ? (
          <UserManagement user={user} />
        ) : null}

        <TaskCreateDialog
          open={showTaskDialog}
          onOpenChange={setShowTaskDialog}
          onSuccess={() => {
            // Refresh task list if we're on the tasks view
            if (viewMode === "tasks") {
              window.location.reload();
            }
          }}
        />
      </main>
    </div>
  );
};

export default Dashboard;
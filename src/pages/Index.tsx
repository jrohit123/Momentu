import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { TrendingUp, CheckCircle2, Calendar, BarChart3, Users, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const Index = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Check if user is already logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate("/dashboard");
      }
    });
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-secondary/10">
      {/* Hero Section */}
      <div className="container mx-auto px-4 py-16">
        <div className="flex flex-col items-center justify-center space-y-8 text-center animate-fade-in">
          <div className="flex items-center gap-3">
            <TrendingUp className="w-16 h-16 text-primary" />
            <h1 className="font-heading text-6xl font-bold text-primary">Momentum</h1>
          </div>
          
          <div className="max-w-3xl space-y-4">
            <h2 className="font-heading text-4xl font-bold text-foreground">
              Keep Your Team Moving Forward
            </h2>
            <p className="text-xl text-muted-foreground">
              Intelligent task management that respects work-life balance with smart scheduling,
              holiday management, and real-time team analytics
            </p>
          </div>

          <div className="flex gap-4 mt-8">
            <Button
              size="lg"
              onClick={() => navigate("/auth")}
              className="text-lg px-8 py-6"
            >
              Get Started
              <TrendingUp className="ml-2 w-5 h-5" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => navigate("/auth")}
              className="text-lg px-8 py-6"
            >
              Sign In
            </Button>
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-24 animate-scale-in">
          <FeatureCard
            icon={<CheckCircle2 className="w-8 h-8 text-primary" />}
            title="Smart Task Scheduling"
            description="Google Calendar-style custom recurrence with intelligent carry-forward logic that skips holidays and weekly offs"
          />
          <FeatureCard
            icon={<Calendar className="w-8 h-8 text-secondary" />}
            title="Holiday Management"
            description="Comprehensive weekly off, public holiday, and personal holiday tracking that automatically adjusts task schedules"
          />
          <FeatureCard
            icon={<BarChart3 className="w-8 h-8 text-accent" />}
            title="Team Analytics"
            description="Real-time dashboards showing completion rates, pending tasks, and team performance metrics"
          />
          <FeatureCard
            icon={<Users className="w-8 h-8 text-success" />}
            title="Flexible Delegation"
            description="Assign tasks to team members, colleagues, or even upward to managers with full visibility"
          />
          <FeatureCard
            icon={<Zap className="w-8 h-8 text-warning" />}
            title="Daily & Monthly Views"
            description="Track tasks with intuitive daily checklists and comprehensive monthly calendar matrices"
          />
          <FeatureCard
            icon={<TrendingUp className="w-8 h-8 text-primary" />}
            title="Momentum Tracking"
            description="Visual progress indicators and completion percentages to keep your team motivated"
          />
        </div>

        {/* Footer */}
        <div className="text-center mt-24 space-y-2">
          <p className="text-muted-foreground">Powered by aitamate</p>
          <a
            href="https://www.aitamate.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline"
          >
            www.aitamate.com
          </a>
        </div>
      </div>
    </div>
  );
};

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

const FeatureCard = ({ icon, title, description }: FeatureCardProps) => {
  return (
    <div className="group p-6 rounded-xl border border-border bg-card hover:border-primary/30 hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
      <div className="mb-4 transform group-hover:scale-110 transition-transform duration-300">
        {icon}
      </div>
      <h3 className="font-heading text-xl font-semibold mb-2 text-foreground">{title}</h3>
      <p className="text-muted-foreground">{description}</p>
    </div>
  );
};

export default Index;
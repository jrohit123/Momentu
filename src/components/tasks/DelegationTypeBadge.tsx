import { Badge } from "@/components/ui/badge";
import { ArrowUp, ArrowDown, Users, User } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type DelegationType = "self" | "downward" | "peer" | "upward" | null;

interface DelegationTypeBadgeProps {
  delegationType: DelegationType;
  showIcon?: boolean;
  className?: string;
}

export const DelegationTypeBadge = ({
  delegationType,
  showIcon = true,
  className = "",
}: DelegationTypeBadgeProps) => {
  if (!delegationType) return null;

  const getBadgeConfig = () => {
    switch (delegationType) {
      case "self":
        return {
          label: "Self",
          variant: "secondary" as const,
          icon: User,
          tooltip: "Assigned to yourself",
          className: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
        };
      case "upward":
        return {
          label: "Manager",
          variant: "outline" as const,
          icon: ArrowUp,
          tooltip: "Assigned to your manager or higher",
          className: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800",
        };
      case "downward":
        return {
          label: "Downward",
          variant: "outline" as const,
          icon: ArrowDown,
          tooltip: "Assigned to your subordinate",
          className: "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800",
        };
      case "peer":
        return {
          label: "Peer",
          variant: "outline" as const,
          icon: Users,
          tooltip: "Assigned to a peer",
          className: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800",
        };
      default:
        return null;
    }
  };

  const config = getBadgeConfig();
  if (!config) return null;

  const Icon = config.icon;

  const badge = (
    <Badge
      variant={config.variant}
      className={`text-xs ${config.className} ${className}`}
    >
      {showIcon && <Icon className="w-3 h-3 mr-1" />}
      {config.label}
    </Badge>
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {badge}
        </TooltipTrigger>
        <TooltipContent>
          <p>{config.tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};


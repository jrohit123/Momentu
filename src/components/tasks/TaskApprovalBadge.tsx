import { Badge } from "@/components/ui/badge";
import { CheckCircle, Clock, XCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type ApprovalStatus = "pending" | "approved" | "rejected" | null;

interface TaskApprovalBadgeProps {
  approvalStatus: ApprovalStatus;
  showIcon?: boolean;
  className?: string;
}

export const TaskApprovalBadge = ({
  approvalStatus,
  showIcon = true,
  className = "",
}: TaskApprovalBadgeProps) => {
  if (!approvalStatus) return null;

  const getBadgeConfig = () => {
    switch (approvalStatus) {
      case "approved":
        return {
          label: "Approved",
          variant: "secondary" as const,
          icon: CheckCircle,
          tooltip: "Task completion has been approved",
          className: "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800",
        };
      case "pending":
        return {
          label: "Pending",
          variant: "outline" as const,
          icon: Clock,
          tooltip: "Task completion is pending approval",
          className: "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-800",
        };
      case "rejected":
        return {
          label: "Rejected",
          variant: "outline" as const,
          icon: XCircle,
          tooltip: "Task completion was rejected",
          className: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800",
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

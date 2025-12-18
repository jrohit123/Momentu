import { useState, useCallback, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle, X, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import * as XLSX from "xlsx";
import { useOrganizationMembers } from "@/hooks/useOrganizationMembers";
import { useSystemSettings } from "@/hooks/useSystemSettings";

interface ExcelUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  currentUserId: string;
}

interface ParsedTask {
  name: string;
  description?: string;
  category?: string;
  benchmark?: number;
  recurrence_type: string;
  recurrence_config?: any;
  assignees?: string[]; // Array of user IDs or emails
  dependencies?: string[]; // Array of task names (will be resolved to IDs)
  rowNumber: number;
  errors?: string[];
}

export const ExcelUploadDialog = ({ open, onOpenChange, onSuccess, currentUserId }: ExcelUploadDialogProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [parsedTasks, setParsedTasks] = useState<ParsedTask[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [successCount, setSuccessCount] = useState(0);
  const [userProfile, setUserProfile] = useState<{ organization_id: string } | null>(null);
  const { toast } = useToast();

  // Fetch user profile to get organization_id
  useEffect(() => {
    if (open && currentUserId) {
      const fetchProfile = async () => {
        try {
          const { data, error } = await supabase
            .from("users")
            .select("organization_id")
            .eq("id", currentUserId)
            .single();

          if (!error && data) {
            setUserProfile(data);
          }
        } catch (error) {
          console.error("Error fetching profile:", error);
        }
      };
      fetchProfile();
    } else {
      setUserProfile(null);
    }
  }, [open, currentUserId]);

  const { members: organizationMembers = [], loading: membersLoading } = useOrganizationMembers(userProfile?.organization_id || null);
  const { settings, loading: settingsLoading } = useSystemSettings(userProfile?.organization_id || null);

  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    // Validate file type
    const validTypes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
      "application/vnd.ms-excel", // .xls
      "text/csv", // .csv
    ];
    
    const validExtensions = [".xlsx", ".xls", ".csv"];
    const fileExtension = selectedFile.name.substring(selectedFile.name.lastIndexOf(".")).toLowerCase();

    if (!validTypes.includes(selectedFile.type) && !validExtensions.includes(fileExtension)) {
      toast({
        title: "Invalid file type",
        description: "Please upload an Excel (.xlsx, .xls) or CSV file.",
        variant: "destructive",
      });
      return;
    }

    setFile(selectedFile);
    setErrors([]);
    setParsedTasks([]);
    setSuccessCount(0);

    try {
      await parseFile(selectedFile);
    } catch (error: any) {
      toast({
        title: "Error parsing file",
        description: error.message || "Failed to parse the file. Please check the format.",
        variant: "destructive",
      });
      setFile(null);
    }
  }, [toast]);

  const parseFile = async (file: File): Promise<void> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          if (!data) {
            reject(new Error("Failed to read file"));
            return;
          }

          const workbook = XLSX.read(data, { type: "binary" });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

          if (jsonData.length === 0) {
            reject(new Error("The file is empty or has no data rows."));
            return;
          }

          const tasks: ParsedTask[] = [];
          const parseErrors: string[] = [];

          jsonData.forEach((row: any, index: number) => {
            const rowNumber = index + 2; // +2 because row 1 is header, and index is 0-based
            const taskErrors: string[] = [];

            // Required field: Task Name
            const name = String(row["Task Name"] || row["task_name"] || row["Name"] || "").trim();
            if (!name) {
              taskErrors.push("Task Name is required");
            }

            // Optional fields
            const description = String(row["Description"] || row["description"] || "").trim() || undefined;
            const category = String(row["Category"] || row["category"] || "").trim() || undefined;
            
            // Benchmark (must be a positive number if provided)
            let benchmark: number | undefined = undefined;
            const benchmarkStr = String(row["Benchmark"] || row["benchmark"] || "").trim();
            if (benchmarkStr) {
              const benchmarkNum = parseFloat(benchmarkStr);
              if (isNaN(benchmarkNum) || benchmarkNum <= 0) {
                taskErrors.push("Benchmark must be a positive number");
              } else {
                benchmark = benchmarkNum;
              }
            }

            // Recurrence Type (default to "none")
            const recurrenceTypeStr = String(row["Recurrence Type"] || row["recurrence_type"] || row["Recurrence"] || "none").trim().toLowerCase();
            const validRecurrenceTypes = ["none", "daily", "weekly", "monthly", "yearly", "custom"];
            const recurrence_type = validRecurrenceTypes.includes(recurrenceTypeStr) ? recurrenceTypeStr : "none";

            // Recurrence Config (parse JSON if provided)
            let recurrence_config: any = undefined;
            const recurrenceConfigStr = String(row["Recurrence Config"] || row["recurrence_config"] || "").trim();
            if (recurrenceConfigStr && recurrence_type !== "none") {
              try {
                recurrence_config = JSON.parse(recurrenceConfigStr);
              } catch {
                // If not JSON, try to parse simple formats
                if (recurrence_type === "weekly") {
                  // Try to parse days like "Mon,Wed,Fri" or "1,3,5"
                  const daysStr = recurrenceConfigStr;
                  const dayMap: Record<string, number> = {
                    "sun": 0, "mon": 1, "tue": 2, "wed": 3, "thu": 4, "fri": 5, "sat": 6,
                    "sunday": 0, "monday": 1, "tuesday": 2, "wednesday": 3, "thursday": 4, "friday": 5, "saturday": 6
                  };
                  const days = daysStr.split(",").map(d => {
                    const trimmed = d.trim().toLowerCase();
                    if (dayMap[trimmed] !== undefined) return dayMap[trimmed];
                    const num = parseInt(trimmed);
                    if (!isNaN(num) && num >= 0 && num <= 6) return num;
                    return null;
                  }).filter(d => d !== null) as number[];
                  if (days.length > 0) {
                    recurrence_config = { days };
                  }
                } else if (recurrence_type === "monthly") {
                  // Try to parse day of month
                  const dayOfMonth = parseInt(recurrenceConfigStr);
                  if (!isNaN(dayOfMonth) && dayOfMonth >= 1 && dayOfMonth <= 31) {
                    recurrence_config = { monthlyType: "date", dayOfMonth };
                  }
                }
              }
            }

            // Assignees (comma-separated emails or names)
            const assigneesStr = String(row["Assignees"] || row["assignees"] || row["Assigned To"] || "").trim();
            const assignees: string[] = assigneesStr
              ? assigneesStr.split(",").map(a => a.trim()).filter(a => a.length > 0)
              : [];

            // Dependencies (comma-separated task names)
            const dependenciesStr = String(row["Dependencies"] || row["dependencies"] || row["Depends On"] || "").trim();
            const dependencies: string[] = dependenciesStr
              ? dependenciesStr.split(",").map(d => d.trim()).filter(d => d.length > 0)
              : [];

            if (taskErrors.length > 0) {
              parseErrors.push(`Row ${rowNumber}: ${taskErrors.join(", ")}`);
            }

            if (name) {
              tasks.push({
                name,
                description,
                category,
                benchmark,
                recurrence_type,
                recurrence_config,
                assignees,
                dependencies,
                rowNumber,
                errors: taskErrors.length > 0 ? taskErrors : undefined,
              });
            }
          });

          setParsedTasks(tasks);
          if (parseErrors.length > 0) {
            setErrors(parseErrors);
          }

          resolve();
        } catch (error: any) {
          reject(new Error(`Failed to parse file: ${error.message}`));
        }
      };

      reader.onerror = () => {
        reject(new Error("Failed to read file"));
      };

      if (file.name.endsWith(".csv")) {
        reader.readAsText(file);
      } else {
        reader.readAsBinaryString(file);
      }
    });
  };

  const handleUpload = async () => {
    if (parsedTasks.length === 0) {
      toast({
        title: "No tasks to upload",
        description: "Please select a file with valid task data.",
        variant: "destructive",
      });
      return;
    }

    if (membersLoading || settingsLoading) {
      toast({
        title: "Loading",
        description: "Please wait while we load organization data...",
      });
      return;
    }

    setUploading(true);
    setProgress(0);
    setSuccessCount(0);
    const uploadErrors: string[] = [];

    try {
      // Get user profile for organization_id
      const { data: userProfile, error: profileError } = await supabase
        .from("users")
        .select("organization_id, manager_id")
        .eq("id", currentUserId)
        .single();

      if (profileError || !userProfile) {
        throw new Error("Failed to fetch user profile");
      }

      // Create a map of email/name to user ID for assignees
      const assigneeMap = new Map<string, string>();
      if (!organizationMembers || !Array.isArray(organizationMembers)) {
        throw new Error("Organization members data is not available. Please try again.");
      }
      organizationMembers.forEach(member => {
        assigneeMap.set(member.email.toLowerCase(), member.id);
        if (member.full_name) {
          assigneeMap.set(member.full_name.toLowerCase(), member.id);
        }
      });

      // Create a map of task name to task ID for dependencies (will be populated as we create tasks)
      const taskNameToIdMap = new Map<string, string>();
      const pendingDependencies: Array<{ taskId: string; dependencyNames: string[] }> = [];

      // Process each task
      for (let i = 0; i < parsedTasks.length; i++) {
        const task = parsedTasks[i];
        setProgress(Math.round(((i + 1) / parsedTasks.length) * 100));

        try {
          // Resolve assignees
          const assigneeIds: string[] = [];
          for (const assignee of task.assignees || []) {
            const userId = assigneeMap.get(assignee.toLowerCase());
            if (userId) {
              assigneeIds.push(userId);
            } else {
              uploadErrors.push(`Row ${task.rowNumber}: Assignee "${assignee}" not found in organization`);
            }
          }

          // Create the task
          const { data: newTask, error: taskError } = await supabase
            .from("tasks")
            .insert({
              name: task.name,
              description: task.description || null,
              category: task.category || null,
              benchmark: task.benchmark || null,
              recurrence_type: task.recurrence_type,
              recurrence_config: task.recurrence_config || null,
              created_by: currentUserId,
            })
            .select()
            .single();

          if (taskError) throw taskError;

          // Store task name to ID mapping for dependencies
          taskNameToIdMap.set(task.name.toLowerCase(), newTask.id);

          // Create assignments
          if (assigneeIds.length > 0) {
            // Determine delegation types for each assignee
            const assignmentRecords = await Promise.all(
              assigneeIds.map(async (assigneeId) => {
                let delegationType: "self" | "downward" | "peer" | "upward" = "self";
                
                if (assigneeId !== currentUserId) {
                  try {
                    const { data: isManager } = await supabase.rpc("is_manager_of", {
                      manager_id: currentUserId,
                      user_id: assigneeId,
                    });
                    
                    if (isManager) {
                      delegationType = "downward";
                    } else {
                      const { data: isSubordinate } = await supabase.rpc("is_manager_of", {
                        manager_id: assigneeId,
                        user_id: currentUserId,
                      });
                      
                      if (isSubordinate) {
                        delegationType = settings?.allow_upward_delegation ? "upward" : "peer";
                      } else {
                        delegationType = "peer";
                      }
                    }
                  } catch (error) {
                    console.error("Error determining delegation type:", error);
                    delegationType = "peer";
                  }
                }

                return {
                  task_id: newTask.id,
                  assigned_to: assigneeId,
                  assigned_by: currentUserId,
                  delegation_type: delegationType,
                };
              })
            );

            const { error: assignError } = await supabase
              .from("task_assignments")
              .insert(assignmentRecords);

            if (assignError) {
              uploadErrors.push(`Row ${task.rowNumber}: Failed to create assignments - ${assignError.message}`);
            }
          } else {
            // If no assignees, assign to self
            const { error: selfAssignError } = await supabase
              .from("task_assignments")
              .insert({
                task_id: newTask.id,
                assigned_to: currentUserId,
                assigned_by: currentUserId,
                delegation_type: "self",
              });

            if (selfAssignError) {
              uploadErrors.push(`Row ${task.rowNumber}: Failed to assign task to self - ${selfAssignError.message}`);
            }
          }

          // Store dependencies for later processing (after all tasks are created)
          if (task.dependencies && task.dependencies.length > 0) {
            pendingDependencies.push({
              taskId: newTask.id,
              dependencyNames: task.dependencies,
            });
          }

          setSuccessCount(i + 1);
        } catch (error: any) {
          uploadErrors.push(`Row ${task.rowNumber}: ${error.message || "Failed to create task"}`);
        }
      }

      // Process dependencies (after all tasks are created)
      for (const pendingDep of pendingDependencies) {
        try {
          const dependencyIds: string[] = [];
          for (const depName of pendingDep.dependencyNames) {
            const depId = taskNameToIdMap.get(depName.toLowerCase());
            if (depId) {
              dependencyIds.push(depId);
            } else {
              uploadErrors.push(`Task "${pendingDep.taskId}": Dependency "${depName}" not found`);
            }
          }

          if (dependencyIds.length > 0) {
            const dependencyRecords = dependencyIds.map(depId => ({
              task_id: pendingDep.taskId,
              depends_on_task_id: depId,
            }));

            const { error: depError } = await supabase
              .from("task_dependencies")
              .insert(dependencyRecords);

            if (depError) {
              uploadErrors.push(`Task "${pendingDep.taskId}": Failed to create dependencies - ${depError.message}`);
            }
          }
        } catch (error: any) {
          uploadErrors.push(`Task "${pendingDep.taskId}": Error processing dependencies - ${error.message}`);
        }
      }

      if (uploadErrors.length > 0) {
        setErrors(uploadErrors);
        toast({
          title: "Upload completed with errors",
          description: `${successCount} tasks created, ${uploadErrors.length} errors occurred.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Success",
          description: `Successfully created ${successCount} tasks.`,
        });
        onSuccess();
        handleClose();
      }
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message || "An error occurred while uploading tasks.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setParsedTasks([]);
    setErrors([]);
    setSuccessCount(0);
    setProgress(0);
    onOpenChange(false);
  };

  const downloadTemplate = () => {
    // Create a template Excel file
    const templateData = [
      {
        "Task Name": "Example Task 1",
        "Description": "This is an example task",
        "Category": "Development",
        "Benchmark": "10",
        "Recurrence Type": "weekly",
        "Recurrence Config": '{"days": [1, 3, 5]}',
        "Assignees": "user@example.com, another@example.com",
        "Dependencies": "",
      },
      {
        "Task Name": "Example Task 2",
        "Description": "Another example task",
        "Category": "Testing",
        "Benchmark": "",
        "Recurrence Type": "daily",
        "Recurrence Config": "",
        "Assignees": "",
        "Dependencies": "Example Task 1",
      },
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Tasks");
    XLSX.writeFile(wb, "task_upload_template.xlsx");
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" />
            Bulk Upload Tasks from Excel
          </DialogTitle>
          <DialogDescription>
            Upload an Excel (.xlsx, .xls) or CSV file to create multiple tasks at once. Download the template to see the required format.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Download Template Button */}
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={downloadTemplate}
              className="flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Download Template
            </Button>
          </div>

          {/* File Upload */}
          <div className="space-y-2">
            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <Upload className="w-10 h-10 mb-3 text-muted-foreground" />
                <p className="mb-2 text-sm text-muted-foreground">
                  <span className="font-semibold">Click to upload</span> or drag and drop
                </p>
                <p className="text-xs text-muted-foreground">Excel (.xlsx, .xls) or CSV files</p>
              </div>
              <input
                type="file"
                className="hidden"
                accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                onChange={handleFileSelect}
                disabled={uploading}
              />
            </label>
            {file && (
              <div className="flex items-center gap-2 p-2 bg-muted rounded">
                <FileSpreadsheet className="w-4 h-4" />
                <span className="text-sm flex-1">{file.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setFile(null)}
                  disabled={uploading}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>

          {/* Parsed Tasks Preview */}
          {parsedTasks.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">Preview ({parsedTasks.length} tasks)</h4>
                {successCount > 0 && (
                  <div className="flex items-center gap-2 text-sm text-success">
                    <CheckCircle className="w-4 h-4" />
                    {successCount} created
                  </div>
                )}
              </div>
              <div className="max-h-48 overflow-y-auto border rounded p-2 space-y-1">
                {parsedTasks.map((task, index) => (
                  <div
                    key={index}
                    className={`text-xs p-2 rounded ${
                      task.errors ? "bg-destructive/10 text-destructive" : "bg-muted"
                    }`}
                  >
                    <div className="font-medium">
                      Row {task.rowNumber}: {task.name}
                    </div>
                    {task.errors && (
                      <div className="text-xs mt-1">
                        {task.errors.join(", ")}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Errors */}
          {errors.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {errors.map((error, index) => (
                    <div key={index} className="text-xs">
                      {error}
                    </div>
                  ))}
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Progress */}
          {uploading && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Uploading tasks...</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose} disabled={uploading}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleUpload}
            disabled={!file || parsedTasks.length === 0 || uploading || membersLoading || settingsLoading}
          >
            {uploading ? "Uploading..." : `Upload ${parsedTasks.length} Tasks`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};


import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import { format } from "date-fns";
import type { Database } from "@/integrations/supabase/types";

type TaskStatus = Database["public"]["Enums"]["task_status"];

interface MonthlyTaskData {
  assignment: {
    id: string;
    task: {
      id: string;
      name: string;
      description: string | null;
      category: string | null;
      benchmark: number | null;
      recurrence_type: string;
    };
  };
  dailyStatuses: Map<string, TaskStatus>;
  dailyNotes: Map<string, string | null>;
  dailyQuantities: Map<string, number | null>;
}

interface WorkingDayInfo {
  isWorkingDay: boolean;
  reason?: string;
}

/**
 * Export monthly task data to Excel
 */
export const exportMonthlyToExcel = async (
  tasks: MonthlyTaskData[],
  daysInMonth: Date[],
  monthName: string,
  isWorkingDay: (date: Date) => WorkingDayInfo
) => {
  // Create workbook
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(monthName);

  // Set column widths
  worksheet.getColumn(1).width = 30; // Task Name
  worksheet.getColumn(2).width = 15; // Category
  worksheet.getColumn(3).width = 12; // Frequency
  worksheet.getColumn(4).width = 10; // Benchmark
  daysInMonth.forEach((_, index) => {
    worksheet.getColumn(5 + index).width = 8; // Date columns
  });

  // Define border style
  const borderStyle: Partial<ExcelJS.Border> = {
    style: "thin",
    color: { argb: "FF000000" },
  };

  // Header row
  const headerData: any[] = ["Task Name", "Category", "Frequency", "Benchmark"];
  const dateValues: Date[] = [];
  daysInMonth.forEach((day) => {
    // Create a UTC date-only value (no time, no timezone issues)
    const year = day.getFullYear();
    const month = day.getMonth();
    const date = day.getDate();
    const dateOnly = new Date(Date.UTC(year, month, date, 0, 0, 0, 0));
    headerData.push(dateOnly);
    dateValues.push(dateOnly);
  });
  const headerRow = worksheet.addRow(headerData);

  // Apply formatting to header row
  headerRow.eachCell((cell, colNumber) => {
    cell.font = { bold: true };
    cell.border = {
      top: borderStyle,
      bottom: borderStyle,
      left: borderStyle,
      right: borderStyle,
    };
    
    // Apply date format to date columns (columns 5 onwards)
    if (colNumber > 4) {
      const dateIndex = colNumber - 5;
      // Set the value explicitly as a date and apply date-only format
      cell.value = dateValues[dateIndex];
      cell.numFmt = "dd-mmm-yy"; // Excel date format (date only, no time)
    }
  });

  // Task rows
  tasks.forEach((taskData) => {
    const task = taskData.assignment.task;
    const rowData: any[] = [
      task.name,
      task.category || "-",
      getFrequencyLabel(task.recurrence_type),
      task.benchmark || "-",
    ];

    // Check if there are any notes for this task
    let hasNotes = false;
    const notesRowData: any[] = ["-", "Comments for above task", "", ""];

    daysInMonth.forEach((day) => {
      const dateStr = format(day, "yyyy-MM-dd");
      const status = taskData.dailyStatuses.get(dateStr) || "not_applicable";
      const workingDayInfo = isWorkingDay(day);
      const notes = taskData.dailyNotes.get(dateStr);
      const quantity = taskData.dailyQuantities.get(dateStr);

      if (!workingDayInfo.isWorkingDay) {
        rowData.push("WO/H");
        notesRowData.push("");
      } else {
        rowData.push(getStatusSymbol(status, quantity));
        if (notes && notes.trim()) {
          notesRowData.push(notes);
          hasNotes = true;
        } else {
          notesRowData.push("");
        }
      }
    });

    const row = worksheet.addRow(rowData);

    // Apply formatting to task row
    row.eachCell((cell, colNumber) => {
      // Make first column bold
      if (colNumber === 1) {
        cell.font = { bold: true };
      }
      cell.border = {
        top: borderStyle,
        bottom: borderStyle,
        left: borderStyle,
        right: borderStyle,
      };
    });

    // Add notes row if there are any notes
    if (hasNotes) {
      const notesRow = worksheet.addRow(notesRowData);
      notesRow.eachCell((cell) => {
        cell.border = {
          top: borderStyle,
          bottom: borderStyle,
          left: borderStyle,
          right: borderStyle,
        };
      });
    }
  });

  // Hide gridlines
  worksheet.views = [
    {
      showGridLines: false,
      state: "frozen",
      xSplit: 4, // Freeze first 4 columns (A-D)
      ySplit: 1, // Freeze first row (header)
      topLeftCell: "E2", // Top-left cell of the scrollable area
      activeCell: "E2",
    },
  ];

  // Generate filename
  const filename = `Monthly_Tasks_${monthName.replace(/\s+/g, "_")}.xlsx`;

  // Write file
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);

  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};


 // Export monthly task data to CSV

export const exportMonthlyToCSV = (
  tasks: MonthlyTaskData[],
  daysInMonth: Date[],
  monthName: string,
  isWorkingDay: (date: Date) => WorkingDayInfo
) => {
  // Prepare CSV data
  const rows: string[] = [];

  // Header row
  const header = ["Task Name", "Category", "Frequency", "Benchmark"];
  daysInMonth.forEach((day) => {
    header.push(format(day, "dd-MMM-yy"));
  });
  rows.push(header.join(","));

  // Task rows
  tasks.forEach((taskData) => {
    const task = taskData.assignment.task;
    const row = [
      `"${task.name}"`,
      `"${task.category || "-"}"`,
      `"${getFrequencyLabel(task.recurrence_type)}"`,
      task.benchmark?.toString() || "-",
    ];

    // Check if there are any notes for this task
    let hasNotes = false;
    const notesRow = ['"-"', '"Comments for above task"', '""', '""']; // "Notes" label in second column, empty for other task info columns

    daysInMonth.forEach((day) => {
      const dateStr = format(day, "yyyy-MM-dd");
      const status = taskData.dailyStatuses.get(dateStr) || "not_applicable";
      const workingDayInfo = isWorkingDay(day);
      const notes = taskData.dailyNotes.get(dateStr);
      const quantity = taskData.dailyQuantities.get(dateStr);

      if (!workingDayInfo.isWorkingDay) {
        row.push("WO/H");
        notesRow.push('""'); // Empty note cell for weekly off
      } else {
        row.push(getStatusSymbol(status, quantity));
        // Add notes if available, otherwise empty cell
        if (notes && notes.trim()) {
          // Escape quotes in notes for CSV
          const escapedNotes = notes.replace(/"/g, '""');
          notesRow.push(`"${escapedNotes}"`);
          hasNotes = true;
        } else {
          notesRow.push('""');
        }
      }
    });

    rows.push(row.join(","));
    
    // Add notes row if there are any notes
    if (hasNotes) {
      rows.push(notesRow.join(","));
    }
  });

  // Create CSV content
  const csvContent = rows.join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);

  link.setAttribute("href", url);
  link.setAttribute("download", `Monthly_Tasks_${monthName.replace(/\s+/g, "_")}.csv`);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// Helper functions
const getFrequencyLabel = (type: string): string => {
  switch (type) {
    case "daily":
      return "Daily";
    case "weekly":
      return "Weekly";
    case "monthly":
      return "Monthly";
    case "yearly":
      return "Yearly";
    case "none":
      return "One-time";
    case "custom":
      return "Custom";
    default:
      return type;
  }
};

const getStatusSymbol = (status: TaskStatus, quantity: number | null | undefined = null): string => {
  switch (status) {
    case "completed":
      return "Completed";
    case "partial":
      // Return quantity_completed if available, otherwise "Partial"
      return quantity !== null && quantity !== undefined ? quantity.toString() : "Partial";
    case "not_done":
      return "Not Done";
    case "pending":
      return "Pending";
    case "delayed":
      return "Delayed";
    case "not_applicable":
      return "NA";
    case "scheduled":
      return "Scheduled";
    default:
      return "";
  }
};



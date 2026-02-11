import type { Load } from "@/hooks/useLoads";
import { format, getWeek, parseISO } from "date-fns";
import * as XLSX from "xlsx";

interface TimeWindowData {
  origin: {
    plannedArrival: string;
    plannedDeparture: string;
    actualArrival: string;
    actualDeparture: string;
  };
  destination: {
    plannedArrival: string;
    plannedDeparture: string;
    actualArrival: string;
    actualDeparture: string;
  };
  backload?: {
    enabled: boolean;
    destination: string;
    cargoType: string;
    offloadingDate: string;
    quantities?: {
      bins: number;
      crates: number;
      pallets: number;
    };
    notes?: string;
  };
}

// Parse time_window JSON
function parseTimeWindow(timeWindow: string): TimeWindowData {
  try {
    const data = JSON.parse(timeWindow);
    return {
      origin: {
        plannedArrival: data.origin?.plannedArrival || "",
        plannedDeparture: data.origin?.plannedDeparture || "",
        actualArrival: data.origin?.actualArrival || "",
        actualDeparture: data.origin?.actualDeparture || "",
      },
      destination: {
        plannedArrival: data.destination?.plannedArrival || "",
        plannedDeparture: data.destination?.plannedDeparture || "",
        actualArrival: data.destination?.actualArrival || "",
        actualDeparture: data.destination?.actualDeparture || "",
      },
      backload: data.backload?.enabled
        ? {
            enabled: true,
            destination: data.backload.destination || "",
            cargoType: data.backload.cargoType || "",
            offloadingDate: data.backload.offloadingDate || "",
            quantities: data.backload.quantities || {
              bins: 0,
              crates: 0,
              pallets: 0,
            },
            notes: data.backload.notes || "",
          }
        : undefined,
    };
  } catch {
    return {
      origin: {
        plannedArrival: "",
        plannedDeparture: "",
        actualArrival: "",
        actualDeparture: "",
      },
      destination: {
        plannedArrival: "",
        plannedDeparture: "",
        actualArrival: "",
        actualDeparture: "",
      },
    };
  }
}

// Status labels
const statusLabels: Record<string, string> = {
  scheduled: "Scheduled",
  "in-transit": "In Transit",
  pending: "Pending",
  delivered: "Delivered",
};

// Cargo type labels
const cargoLabels: Record<string, string> = {
  VanSalesRetail: "Van Sales/Retail",
  Retail: "Retail",
  Vendor: "Vendor",
  RetailVendor: "Retail Vendor",
  Fertilizer: "Fertilizer",
  BV: "BV (Backload)",
  CBC: "CBC (Backload)",
  Packaging: "Packaging (Backload)",
};

// Priority labels
const priorityLabels: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

interface ExportOptions {
  filename?: string;
  sheetName?: string;
}

export function exportLoadsToExcel(
  loads: Load[],
  options: ExportOptions = {},
): void {
  const {
    filename = `loads-export-${format(new Date(), "yyyy-MM-dd")}`,
    sheetName = "Loads",
  } = options;

  // Transform loads data for Excel
  const excelData = loads.map((load) => {
    const timeWindow = parseTimeWindow(load.time_window);
    const isBackload = load.load_id.startsWith("BL-");

    // Build backload quantities string
    let backloadQuantities = "";
    if (timeWindow.backload?.quantities) {
      const { bins, crates, pallets } = timeWindow.backload.quantities;
      const parts: string[] = [];
      if (bins > 0) parts.push(`${bins} bins`);
      if (crates > 0) parts.push(`${crates} crates`);
      if (pallets > 0) parts.push(`${pallets} pallets`);
      backloadQuantities = parts.join(", ");
    }

    return {
      "Load ID": load.load_id,
      Type: isBackload ? "Backload" : "Primary",
      Status: statusLabels[load.status] || load.status,
      Priority: priorityLabels[load.priority] || load.priority,
      Origin: load.origin,
      Destination: load.destination,
      "Cargo Type": cargoLabels[load.cargo_type] || load.cargo_type,
      Quantity: load.quantity,
      "Weight (T)": load.weight,
      "Loading Date": format(parseISO(load.loading_date), "dd/MM/yyyy"),
      "Offloading Date": format(parseISO(load.offloading_date), "dd/MM/yyyy"),
      "Origin Planned Arrival": timeWindow.origin.plannedArrival,
      "Origin Planned Departure": timeWindow.origin.plannedDeparture,
      "Origin Actual Arrival": timeWindow.origin.actualArrival,
      "Origin Actual Departure": timeWindow.origin.actualDeparture,
      "Destination Planned Arrival": timeWindow.destination.plannedArrival,
      "Destination Planned Departure": timeWindow.destination.plannedDeparture,
      "Destination Actual Arrival": timeWindow.destination.actualArrival,
      "Destination Actual Departure": timeWindow.destination.actualDeparture,
      Vehicle: load.fleet_vehicle?.vehicle_id || "",
      "Vehicle Type": load.fleet_vehicle?.type || "",
      Driver: load.driver?.name || "",
      "Driver Contact": load.driver?.contact || "",
      "Special Handling": load.special_handling?.join(", ") || "",
      Notes: load.notes || "",
      "Has Planned Backload": timeWindow.backload?.enabled ? "Yes" : "No",
      "Backload Destination": timeWindow.backload?.destination || "",
      "Backload Cargo Type": timeWindow.backload?.cargoType
        ? cargoLabels[timeWindow.backload.cargoType] ||
          timeWindow.backload.cargoType
        : "",
      "Backload Offloading Date": timeWindow.backload?.offloadingDate || "",
      "Backload Quantities": backloadQuantities,
      "Backload Notes": timeWindow.backload?.notes || "",
    };
  });

  // Calculate current week number
  const currentWeek = getWeek(new Date(), { weekStartsOn: 1 });
  const currentYear = new Date().getFullYear();
  const titleRow = [
    `Matanuska Local Planning - Week ${currentWeek}, ${currentYear}`,
  ];

  // Create workbook and worksheet with title row
  const workbook = XLSX.utils.book_new();

  // Create worksheet with title at top
  const worksheet = XLSX.utils.aoa_to_sheet([titleRow, []]);

  // Add the data starting from row 3 (after title and blank row)
  XLSX.utils.sheet_add_json(worksheet, excelData, { origin: "A3" });

  // Set column widths
  const columnWidths = [
    { wch: 15 }, // Load ID
    { wch: 10 }, // Type
    { wch: 12 }, // Status
    { wch: 10 }, // Priority
    { wch: 20 }, // Origin
    { wch: 20 }, // Destination
    { wch: 18 }, // Cargo Type
    { wch: 10 }, // Quantity
    { wch: 10 }, // Weight
    { wch: 12 }, // Loading Date
    { wch: 14 }, // Offloading Date
    { wch: 12 }, // Origin Planned Arr
    { wch: 12 }, // Origin Planned Dep
    { wch: 12 }, // Origin Actual Arr
    { wch: 12 }, // Origin Actual Dep
    { wch: 12 }, // Dest Planned Arr
    { wch: 12 }, // Dest Planned Dep
    { wch: 12 }, // Dest Actual Arr
    { wch: 12 }, // Dest Actual Dep
    { wch: 12 }, // Vehicle
    { wch: 12 }, // Vehicle Type
    { wch: 20 }, // Driver
    { wch: 15 }, // Driver Contact
    { wch: 25 }, // Special Handling
    { wch: 40 }, // Notes
    { wch: 18 }, // Has Planned Backload
    { wch: 20 }, // Backload Destination
    { wch: 18 }, // Backload Cargo Type
    { wch: 18 }, // Backload Offloading Date
    { wch: 25 }, // Backload Quantities
    { wch: 40 }, // Backload Notes
  ];
  worksheet["!cols"] = columnWidths;

  // Merge cells for the title row
  worksheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }];

  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  // Create summary sheet
  // Count loads with planned backloads
  const loadsWithPlannedBackloads = loads.filter((l) => {
    const tw = parseTimeWindow(l.time_window);
    return tw.backload?.enabled;
  }).length;

  const summaryData = [
    { Metric: "Total Loads", Value: loads.length },
    {
      Metric: "Scheduled",
      Value: loads.filter((l) => l.status === "scheduled").length,
    },
    {
      Metric: "In Transit",
      Value: loads.filter((l) => l.status === "in-transit").length,
    },
    {
      Metric: "Pending",
      Value: loads.filter((l) => l.status === "pending").length,
    },
    {
      Metric: "Delivered",
      Value: loads.filter((l) => l.status === "delivered").length,
    },
    { Metric: "", Value: "" },
    {
      Metric: "Total Quantity",
      Value: loads.reduce((sum, l) => sum + l.quantity, 0),
    },
    {
      Metric: "Total Weight (T)",
      Value: loads.reduce((sum, l) => sum + l.weight, 0),
    },
    { Metric: "", Value: "" },
    {
      Metric: "Primary Loads",
      Value: loads.filter((l) => !l.load_id.startsWith("BL-")).length,
    },
    {
      Metric: "Backloads (Scheduled)",
      Value: loads.filter((l) => l.load_id.startsWith("BL-")).length,
    },
    {
      Metric: "Loads with Planned Backload",
      Value: loadsWithPlannedBackloads,
    },
    { Metric: "", Value: "" },
    {
      Metric: "Report Generated",
      Value: format(new Date(), "dd/MM/yyyy HH:mm"),
    },
  ];

  const summarySheet = XLSX.utils.json_to_sheet(summaryData);
  summarySheet["!cols"] = [{ wch: 20 }, { wch: 25 }];
  XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");

  // Generate and download the file
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

// Export loads for a specific week
export function exportWeeklyLoadsToExcel(
  loads: Load[],
  weekNumber: number,
  year: number,
  weekStart: Date,
  weekEnd: Date,
): void {
  exportLoadsToExcel(loads, {
    filename: `loads-week-${weekNumber}-${year}`,
    sheetName: `Week ${weekNumber}`,
  });
}

// Simplified export with fewer columns (excludes timing, status details, etc.)
export function exportLoadsToExcelSimplified(
  loads: Load[],
  options: ExportOptions = {},
): void {
  const {
    filename = `loads-simplified-${format(new Date(), "yyyy-MM-dd")}`,
    sheetName = "Loads",
  } = options;

  // Transform loads data for simplified Excel export
  const excelData = loads.map((load) => {
    const timeWindow = parseTimeWindow(load.time_window);

    // Build backload quantities string
    let backloadQuantities = "";
    if (timeWindow.backload?.quantities) {
      const { bins, crates, pallets } = timeWindow.backload.quantities;
      const parts: string[] = [];
      if (bins > 0) parts.push(`${bins} bins`);
      if (crates > 0) parts.push(`${crates} crates`);
      if (pallets > 0) parts.push(`${pallets} pallets`);
      backloadQuantities = parts.join(", ");
    }

    return {
      "Load ID": load.load_id,
      Origin: load.origin,
      Destination: load.destination,
      "Cargo Type": cargoLabels[load.cargo_type] || load.cargo_type,
      "Loading Date": format(parseISO(load.loading_date), "dd/MM/yyyy"),
      "Offloading Date": format(parseISO(load.offloading_date), "dd/MM/yyyy"),
      Vehicle: load.fleet_vehicle?.vehicle_id || "",
      "Vehicle Type": load.fleet_vehicle?.type || "",
      Driver: load.driver?.name || "",
      "Backload Destination": timeWindow.backload?.destination || "",
      "Backload Cargo Type": timeWindow.backload?.cargoType
        ? cargoLabels[timeWindow.backload.cargoType] ||
          timeWindow.backload.cargoType
        : "",
      "Backload Offloading Date": timeWindow.backload?.offloadingDate || "",
      "Backload Quantities": backloadQuantities,
    };
  });

  // Calculate current week number
  const currentWeek = getWeek(new Date(), { weekStartsOn: 1 });
  const currentYear = new Date().getFullYear();
  const titleRow = [
    `Matanuska Local Planning - Week ${currentWeek}, ${currentYear}`,
  ];

  // Create workbook and worksheet with title row
  const workbook = XLSX.utils.book_new();

  // Create worksheet with title at top
  const worksheet = XLSX.utils.aoa_to_sheet([titleRow, []]);

  // Add the data starting from row 3 (after title and blank row)
  XLSX.utils.sheet_add_json(worksheet, excelData, { origin: "A3" });

  // Set column widths for simplified version
  const columnWidths = [
    { wch: 15 }, // Load ID
    { wch: 20 }, // Origin
    { wch: 20 }, // Destination
    { wch: 18 }, // Cargo Type
    { wch: 12 }, // Loading Date
    { wch: 14 }, // Offloading Date
    { wch: 12 }, // Vehicle
    { wch: 12 }, // Vehicle Type
    { wch: 20 }, // Driver
    { wch: 20 }, // Backload Destination
    { wch: 18 }, // Backload Cargo Type
    { wch: 18 }, // Backload Offloading Date
    { wch: 25 }, // Backload Quantities
  ];
  worksheet["!cols"] = columnWidths;

  // Merge cells for the title row
  worksheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }];

  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  // Generate and download the file
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

// Export simplified version for a specific week
export function exportWeeklyLoadsToExcelSimplified(
  loads: Load[],
  weekNumber: number,
  year: number,
): void {
  exportLoadsToExcelSimplified(loads, {
    filename: `loads-simplified-week-${weekNumber}-${year}`,
    sheetName: `Week ${weekNumber}`,
  });
}

import { Load } from "@/hooks/useLoads";
import
  {
    endOfMonth,
    format,
    getDay,
    parseISO,
    startOfMonth,
    subMonths,
  } from "date-fns";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

// Type extension for jspdf-autotable
interface jsPDFWithAutoTable extends jsPDF {
  lastAutoTable: {
    finalY: number;
  };
}

interface ReportOptions {
  loads: Load[];
  timeRange: "3months" | "6months" | "12months";
  reportType: "summary" | "distribution" | "routes" | "time-analysis" | "full";
}

interface CargoDistribution {
  name: string;
  value: number;
  percentage: number;
}

interface StatusDistribution {
  name: string;
  value: number;
  percentage: number;
}

interface RouteData {
  route: string;
  loads: number;
  weight: number;
}

interface DayOfWeekData {
  day: string;
  loads: number;
  avgWeight: number;
}

interface MonthlyTrend {
  month: string;
  loads: number;
  totalWeight: number;
}

const CARGO_LABELS: Record<string, string> = {
  VanSalesRetail: "Van Sales/Retail",
  Retail: "Retail",
  Vendor: "Vendor",
  RetailVendor: "Retail Vendor",
  Fertilizer: "Fertilizer",
  Export: "Export",
  BV: "BV (Backload)",
  CBC: "CBC (Backload)",
  Packaging: "Packaging (Backload)",
};

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Scheduled",
  "in-transit": "In Transit",
  delivered: "Delivered",
  pending: "Pending",
};

function getFilteredLoads(
  loads: Load[],
  timeRange: ReportOptions["timeRange"],
): Load[] {
  const now = new Date();
  const monthsToSubtract =
    timeRange === "3months" ? 3 : timeRange === "6months" ? 6 : 12;
  const startDate = subMonths(now, monthsToSubtract);

  return loads.filter((load) => {
    const loadDate = parseISO(load.loading_date);
    return loadDate >= startDate && loadDate <= now;
  });
}

function calculateCargoDistribution(loads: Load[]): CargoDistribution[] {
  const distribution: Record<string, number> = {};
  loads.forEach((load) => {
    distribution[load.cargo_type] = (distribution[load.cargo_type] || 0) + 1;
  });

  const total = loads.length;
  return Object.entries(distribution)
    .map(([name, value]) => ({
      name: CARGO_LABELS[name] || name,
      value,
      percentage: total > 0 ? Math.round((value / total) * 100) : 0,
    }))
    .sort((a, b) => b.value - a.value);
}

function calculateStatusDistribution(loads: Load[]): StatusDistribution[] {
  const distribution: Record<string, number> = {};
  loads.forEach((load) => {
    distribution[load.status] = (distribution[load.status] || 0) + 1;
  });

  const total = loads.length;
  return Object.entries(distribution).map(([name, value]) => ({
    name: STATUS_LABELS[name] || name,
    value,
    percentage: total > 0 ? Math.round((value / total) * 100) : 0,
  }));
}

function calculateTopRoutes(loads: Load[]): RouteData[] {
  const routes: Record<string, { loads: number; weight: number }> = {};
  loads.forEach((load) => {
    const route = `${load.origin} → ${load.destination}`;
    if (!routes[route]) {
      routes[route] = { loads: 0, weight: 0 };
    }
    routes[route].loads += 1;
    routes[route].weight += load.weight || 0;
  });
  return Object.entries(routes)
    .map(([route, data]) => ({ route, ...data }))
    .sort((a, b) => b.loads - a.loads)
    .slice(0, 10);
}

function calculateDayOfWeekDistribution(loads: Load[]): DayOfWeekData[] {
  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const dayData: Record<number, { loads: number; totalWeight: number }> = {};

  loads.forEach((load) => {
    const loadDate = parseISO(load.loading_date);
    const day = getDay(loadDate);
    if (!dayData[day]) {
      dayData[day] = { loads: 0, totalWeight: 0 };
    }
    dayData[day].loads += 1;
    dayData[day].totalWeight += load.weight || 0;
  });

  return days.map((day, index) => ({
    day,
    loads: dayData[index]?.loads || 0,
    avgWeight:
      dayData[index] && dayData[index].loads > 0
        ? Math.round(dayData[index].totalWeight / dayData[index].loads)
        : 0,
  }));
}

function calculateMonthlyTrend(
  loads: Load[],
  timeRange: ReportOptions["timeRange"],
): MonthlyTrend[] {
  const now = new Date();
  const monthsToSubtract =
    timeRange === "3months" ? 3 : timeRange === "6months" ? 6 : 12;
  const months: MonthlyTrend[] = [];

  for (let i = monthsToSubtract - 1; i >= 0; i--) {
    const monthDate = subMonths(now, i);
    const monthStart = startOfMonth(monthDate);
    const monthEnd = endOfMonth(monthDate);

    const monthLoads = loads.filter((load) => {
      const loadDate = parseISO(load.loading_date);
      return loadDate >= monthStart && loadDate <= monthEnd;
    });

    months.push({
      month: format(monthDate, "MMM yyyy"),
      loads: monthLoads.length,
      totalWeight: monthLoads.reduce((sum, l) => sum + (l.weight || 0), 0),
    });
  }

  return months;
}

function calculateSummaryStats(loads: Load[]) {
  const totalLoads = loads.length;
  const totalWeight = loads.reduce((sum, l) => sum + (l.weight || 0), 0);
  const deliveredCount = loads.filter((l) => l.status === "delivered").length;
  const avgWeightPerLoad =
    totalLoads > 0 ? Math.round(totalWeight / totalLoads) : 0;
  const deliveryRate =
    totalLoads > 0 ? Math.round((deliveredCount / totalLoads) * 100) : 0;
  const uniqueRoutes = new Set(loads.map((l) => `${l.origin}-${l.destination}`))
    .size;

  return {
    totalLoads,
    totalWeight,
    avgWeightPerLoad,
    deliveryRate,
    uniqueRoutes,
  };
}

export function exportReportsToPdf({
  loads,
  timeRange,
  reportType,
}: ReportOptions): void {
  const filteredLoads = getFilteredLoads(loads, timeRange);
  const doc = new jsPDF();

  const timeRangeLabel =
    timeRange === "3months"
      ? "3 Months"
      : timeRange === "6months"
        ? "6 Months"
        : "12 Months";
  const reportDate = format(new Date(), "MMMM d, yyyy");

  // Colors
  const primaryColor: [number, number, number] = [99, 102, 241]; // Indigo
  const secondaryColor: [number, number, number] = [34, 197, 94]; // Green
  const textColor: [number, number, number] = [55, 65, 81];
  const mutedColor: [number, number, number] = [107, 114, 128];

  let yPos = 20;

  // Header
  doc.setFillColor(...primaryColor);
  doc.rect(0, 0, 220, 40, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.setFont("helvetica", "bold");
  doc.text("Load Flow Analytics Report", 15, 25);

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(`Generated: ${reportDate} | Period: Last ${timeRangeLabel}`, 15, 34);

  yPos = 55;

  // Summary Statistics Section
  const stats = calculateSummaryStats(filteredLoads);

  doc.setTextColor(...primaryColor);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Executive Summary", 15, yPos);

  yPos += 10;

  // Summary cards
  const summaryData = [
    ["Total Loads", stats.totalLoads.toString()],
    ["Total Weight", `${stats.totalWeight.toLocaleString()} kg`],
    ["Avg Weight/Load", `${stats.avgWeightPerLoad.toLocaleString()} kg`],
    ["Delivery Rate", `${stats.deliveryRate}%`],
    ["Unique Routes", stats.uniqueRoutes.toString()],
  ];

  autoTable(doc, {
    startY: yPos,
    head: [["Metric", "Value"]],
    body: summaryData,
    theme: "grid",
    headStyles: {
      fillColor: primaryColor,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 10,
    },
    bodyStyles: {
      textColor: textColor,
      fontSize: 10,
    },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 60 },
      1: { cellWidth: 50 },
    },
    margin: { left: 15, right: 15 },
    tableWidth: 110,
  });

  yPos = (doc as jsPDFWithAutoTable).lastAutoTable.finalY + 15;

  // Status Distribution
  if (
    reportType === "full" ||
    reportType === "summary" ||
    reportType === "distribution"
  ) {
    const statusDist = calculateStatusDistribution(filteredLoads);

    doc.setTextColor(...primaryColor);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Load Status Distribution", 15, yPos);

    yPos += 10;

    autoTable(doc, {
      startY: yPos,
      head: [["Status", "Count", "Percentage"]],
      body: statusDist.map((s) => [
        s.name,
        s.value.toString(),
        `${s.percentage}%`,
      ]),
      theme: "grid",
      headStyles: {
        fillColor: secondaryColor,
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 10,
      },
      bodyStyles: {
        textColor: textColor,
        fontSize: 10,
      },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      margin: { left: 15, right: 15 },
      tableWidth: 110,
    });

    yPos = (doc as jsPDFWithAutoTable).lastAutoTable.finalY + 15;
  }

  // Cargo Distribution
  if (reportType === "full" || reportType === "distribution") {
    const cargoDist = calculateCargoDistribution(filteredLoads);

    if (yPos > 230) {
      doc.addPage();
      yPos = 20;
    }

    doc.setTextColor(...primaryColor);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Cargo Type Distribution", 15, yPos);

    yPos += 10;

    autoTable(doc, {
      startY: yPos,
      head: [["Cargo Type", "Count", "Percentage"]],
      body: cargoDist.map((c) => [
        c.name,
        c.value.toString(),
        `${c.percentage}%`,
      ]),
      theme: "grid",
      headStyles: {
        fillColor: [139, 92, 246], // Purple
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 10,
      },
      bodyStyles: {
        textColor: textColor,
        fontSize: 10,
      },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      margin: { left: 15, right: 15 },
    });

    yPos = (doc as jsPDFWithAutoTable).lastAutoTable.finalY + 15;
  }

  // Top Routes
  if (reportType === "full" || reportType === "routes") {
    const topRoutes = calculateTopRoutes(filteredLoads);

    if (yPos > 180) {
      doc.addPage();
      yPos = 20;
    }

    doc.setTextColor(...primaryColor);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Top 10 Routes by Load Volume", 15, yPos);

    yPos += 10;

    autoTable(doc, {
      startY: yPos,
      head: [["Route", "Loads", "Total Weight (kg)"]],
      body: topRoutes.map((r) => [
        r.route,
        r.loads.toString(),
        r.weight.toLocaleString(),
      ]),
      theme: "grid",
      headStyles: {
        fillColor: [245, 158, 11], // Amber
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 10,
      },
      bodyStyles: {
        textColor: textColor,
        fontSize: 9,
      },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      columnStyles: {
        0: { cellWidth: 100 },
        1: { cellWidth: 30, halign: "center" },
        2: { cellWidth: 45, halign: "right" },
      },
      margin: { left: 15, right: 15 },
    });

    yPos = (doc as jsPDFWithAutoTable).lastAutoTable.finalY + 15;
  }

  // Day of Week Analysis
  if (reportType === "full" || reportType === "time-analysis") {
    const dayDist = calculateDayOfWeekDistribution(filteredLoads);

    if (yPos > 180) {
      doc.addPage();
      yPos = 20;
    }

    doc.setTextColor(...primaryColor);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Day of Week Analysis", 15, yPos);

    yPos += 10;

    autoTable(doc, {
      startY: yPos,
      head: [["Day", "Total Loads", "Avg Weight (kg)"]],
      body: dayDist.map((d) => [
        d.day,
        d.loads.toString(),
        d.avgWeight.toLocaleString(),
      ]),
      theme: "grid",
      headStyles: {
        fillColor: [6, 182, 212], // Cyan
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 10,
      },
      bodyStyles: {
        textColor: textColor,
        fontSize: 10,
      },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 50 },
        1: { cellWidth: 40, halign: "center" },
        2: { cellWidth: 50, halign: "right" },
      },
      margin: { left: 15, right: 15 },
      tableWidth: 140,
    });

    yPos = (doc as jsPDFWithAutoTable).lastAutoTable.finalY + 15;
  }

  // Monthly Trend
  if (reportType === "full" || reportType === "time-analysis") {
    const monthlyTrend = calculateMonthlyTrend(filteredLoads, timeRange);

    if (yPos > 180) {
      doc.addPage();
      yPos = 20;
    }

    doc.setTextColor(...primaryColor);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Monthly Load Trends", 15, yPos);

    yPos += 10;

    autoTable(doc, {
      startY: yPos,
      head: [["Month", "Total Loads", "Total Weight (kg)"]],
      body: monthlyTrend.map((m) => [
        m.month,
        m.loads.toString(),
        m.totalWeight.toLocaleString(),
      ]),
      theme: "grid",
      headStyles: {
        fillColor: [236, 72, 153], // Pink
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 10,
      },
      bodyStyles: {
        textColor: textColor,
        fontSize: 10,
      },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 50 },
        1: { cellWidth: 40, halign: "center" },
        2: { cellWidth: 50, halign: "right" },
      },
      margin: { left: 15, right: 15 },
      tableWidth: 140,
    });

    yPos = (doc as jsPDFWithAutoTable).lastAutoTable.finalY + 15;
  }

  // Footer on each page
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(...mutedColor);
    doc.text(
      `Page ${i} of ${pageCount} | Load Flow Analytics Report | Generated ${reportDate}`,
      105,
      290,
      { align: "center" },
    );
  }

  // Generate filename
  const reportTypeLabel =
    reportType === "full"
      ? "Complete"
      : reportType
          .split("-")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ");
  const filename = `LoadFlow_${reportTypeLabel}_Report_${format(new Date(), "yyyy-MM-dd")}.pdf`;

  doc.save(filename);
}

export type { ReportOptions };

/**
 * Export utilities for reports — CSV, Excel (.xlsx), and PDF formats.
 * Styling inspired by traccar-web-master's exportExcel.js
 */

/* ── CSV export (keeps existing BOM-prefixed logic) ── */

export function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const csv = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ── Excel (.xlsx) export ── */

interface ExcelSheet {
  name: string;
  rows: Record<string, string | number | null | undefined>[];
}

export async function downloadExcel(filename: string, title: string, sheets: ExcelSheet[]) {
  if (!sheets.length || sheets.every((s) => !s.rows.length)) return;

  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();

  const border = {
    top: { style: 'thin' as const },
    left: { style: 'thin' as const },
    bottom: { style: 'thin' as const },
    right: { style: 'thin' as const },
  };

  const headerFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF2563EB' }, // blue-600 primary color
  };

  const titleFont: Partial<ExcelJS.Font> = { bold: true, size: 13, color: { argb: 'FF1E293B' } };
  const headerFont: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
  const cellFont: Partial<ExcelJS.Font> = { color: { argb: 'FF334155' }, size: 10 };

  sheets.forEach(({ name, rows: sheetRows }) => {
    if (!sheetRows.length) return;

    const worksheet = workbook.addWorksheet(name);
    const headers = Object.keys(sheetRows[0]);

    // Title row (merged across all columns)
    const titleRow = worksheet.addRow([title]);
    if (headers.length > 1) {
      worksheet.mergeCells(1, 1, 1, headers.length);
    }
    titleRow.font = titleFont;
    titleRow.height = 24;

    // Header row
    const headerRow = worksheet.addRow(headers);
    headerRow.height = 20;
    headerRow.eachCell((cell) => {
      cell.border = border;
      cell.font = headerFont;
      cell.fill = headerFill;
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    // Data rows
    sheetRows.forEach((item) => {
      const values = headers.map((h) => item[h] ?? '');
      const row = worksheet.addRow(values);
      row.height = 18;
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.border = border;
        cell.font = cellFont;
        cell.alignment = { vertical: 'middle' };
      });
    });

    // Auto-width columns
    headers.forEach((header, colIdx) => {
      let maxLen = String(header).length;
      sheetRows.forEach((item) => {
        const val = item[header];
        if (val != null) {
          maxLen = Math.max(maxLen, String(val).length);
        }
      });
      worksheet.getColumn(colIdx + 1).width = Math.min(Math.max(maxLen + 3, 12), 60);
    });
  });

  const blob = new Blob([await workbook.xlsx.writeBuffer()], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const { saveAs } = await import('file-saver');
  saveAs(blob, filename);
}

/* ── PDF export ── */

export interface PdfTableGroup {
  /** Section title displayed above the table (e.g. device name) */
  title: string;
  headers: string[];
  rows: string[][];
}

export async function downloadPdf(filename: string, title: string, groups: PdfTableGroup[]): Promise<void>;
export async function downloadPdf(filename: string, title: string, headers: string[], rows: string[][]): Promise<void>;
export async function downloadPdf(filename: string, title: string, arg3: string[] | PdfTableGroup[], arg4?: string[][]): Promise<void> {
  const { default: jsPDF } = await import('jspdf');
  await import('jspdf-autotable');

  // Normalize input: if called with (filename, title, headers[], rows[][]) convert to grouped form
  let groups: PdfTableGroup[];
  if (arg4) {
    groups = [{ title, headers: arg3 as string[], rows: arg4 }];
  } else {
    groups = arg3 as PdfTableGroup[];
  }
  if (!groups.length || groups.every((g) => !g.rows.length)) return;

  const columnCount = groups[0].headers.length;
  const isLandscape = columnCount > 6;
  const doc = new jsPDF({ orientation: isLandscape ? 'landscape' : 'portrait' });

  // Global title
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(title, 14, 20);

  // Subtitle with date
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 26);

  let cursorY = 30;

  groups.forEach((group, idx) => {
    if (!group.rows.length) return;

    // Check if we need a new page
    if (cursorY > 250) {
      doc.addPage();
      cursorY = 20;
    }

    // Group title (device name)
    if (groups.length > 1) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(group.title, 14, cursorY + 4);
      cursorY += 8;
    }

    // Table
    doc.autoTable({
      head: [group.headers],
      body: group.rows,
      startY: cursorY,
      styles: {
        fontSize: 7,
        cellPadding: 2,
        lineColor: [200, 200, 200],
        lineWidth: 0.25,
      },
      headStyles: {
        fillColor: [37, 99, 235], // blue-600
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7,
        halign: 'center',
      },
      bodyStyles: {
        textColor: [51, 65, 85],
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252], // slate-50
      },
      margin: { horizontal: 10 },
      tableWidth: 'auto',
    });

    // Get the final Y position after the table
    cursorY = (doc as any).lastAutoTable.finalY + 10;
  });

  doc.save(filename);
}

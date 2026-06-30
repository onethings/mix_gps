interface CsvColumn {
  key: string;
  label: string;
  format?: (row: Record<string, unknown>) => string;
}

function escapeCell(val: unknown): string {
  if (val == null) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function downloadCsv(filename: string, rows: Record<string, unknown>[]): void;
export function downloadCsv(filename: string, columns: CsvColumn[], rows: Record<string, unknown>[]): void;
export function downloadCsv(filename: string, arg2: Record<string, unknown>[] | CsvColumn[], arg3?: Record<string, unknown>[]): void {
  let columns: string[] | CsvColumn[];
  let rows: Record<string, unknown>[];
  if (arg3) {
    // (filename, columns, rows) format
    columns = arg2 as CsvColumn[];
    rows = arg3;
  } else {
    // (filename, rows) format — use keys of first row
    rows = arg2 as Record<string, unknown>[];
    columns = rows.length > 0 ? Object.keys(rows[0]!) : [];
  }
  if (!rows.length || !columns.length) return;

  const isSimple = typeof columns[0] === 'string';
  const header = isSimple
    ? (columns as string[]).join(',')
    : (columns as CsvColumn[]).map((c) => c.label).join(',');
  const body = rows
    .map((row) => {
      if (isSimple) {
        return (columns as string[]).map((h) => escapeCell(row[h])).join(',');
      }
      return (columns as CsvColumn[]).map((c) => escapeCell(c.format ? c.format(row) : row[c.key])).join(',');
    })
    .join('\n');
  const csvContent = `${header}\n${body}`;

  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Parse CSV text into an array of objects using the first row as headers.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const lines: string[] = [];
  let current = '';
  let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuote) {
      if (ch === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuote = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuote = true;
    } else if (ch === '\n') {
      lines.push(current);
      current = '';
    } else if (ch === '\r') {
      // skip
    } else {
      current += ch;
    }
  }
  if (current) lines.push(current);

  if (lines.length < 2) return [];

  const headerLine = lines[0]!.replace(/^\uFEFF/, '');
  const headers = headerLine.split(',').map((h) => h.trim());
  const result: Record<string, string>[] = [];
  for (let r = 1; r < lines.length; r++) {
    const values = lines[r]!.split(',').map((v) => v.trim());
    if (values.length === 1 && values[0] === '') continue;
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = values[i] ?? '';
    });
    result.push(row);
  }
  return result;
}

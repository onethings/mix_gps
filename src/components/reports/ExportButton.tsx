import { useState, useRef } from 'react';
import { Download, ChevronDown, FileSpreadsheet, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ExportOption {
  key: string;
  label: string;
  icon: typeof Download;
  onClick: () => void;
}

interface ExportButtonProps {
  disabled?: boolean;
  /** If provided, renders a simple single-format button instead of a dropdown */
  singleFormat?: { label: string; onClick: () => void };
  csv?: { onClick: () => void };
  excel?: { onClick: () => void };
  pdf?: { onClick: () => void };
}

export default function ExportButton({ disabled, singleFormat, csv, excel, pdf }: ExportButtonProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Single-format mode (backward compatible)
  if (singleFormat) {
    return (
      <Button variant="outline" size="sm" disabled={disabled} onClick={singleFormat.onClick}>
        <Download className="h-4 w-4 mr-1" /> {singleFormat.label}
      </Button>
    );
  }

  const options: ExportOption[] = [];
  if (csv) options.push({ key: 'csv', label: 'CSV', icon: FileSpreadsheet, onClick: csv.onClick });
  if (excel) options.push({ key: 'xlsx', label: 'XLSX', icon: FileSpreadsheet, onClick: excel.onClick });
  if (pdf) options.push({ key: 'pdf', label: 'PDF', icon: FileText, onClick: pdf.onClick });

  if (options.length === 0) return null;

  return (
    <div ref={ref} className="relative" onBlur={(e) => { if (!ref.current?.contains(e.relatedTarget)) setOpen(false); }}>
      <Button variant="outline" size="sm" disabled={disabled} onClick={() => setOpen((v) => !v)}>
        <Download className="h-4 w-4 mr-1" />
        Export
        <ChevronDown className={`h-3 w-3 ml-0.5 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 min-w-[130px] rounded-lg border bg-popover p-1 shadow-md">
            {options.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => { setOpen(false); opt.onClick(); }}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-accent transition-colors"
              >
                <opt.icon className="h-4 w-4 text-muted-foreground" />
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

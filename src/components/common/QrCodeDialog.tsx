import { useState, useEffect, useRef } from 'react';
import { X, Download } from 'lucide-react';
import { useT } from '@/lib/i18n';
import QRCode from 'qrcode';

interface QrCodeDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * QR code dialog for sharing the server URL / login link.
 * Generates QR codes client-side using the qrcode library (no external API dependency).
 */
export default function QrCodeDialog({ open, onClose }: QrCodeDialogProps) {
  const { t } = useT();
  const [serverUrl, setServerUrl] = useState(window.location.origin);
  const [queryParams, setQueryParams] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [qrError, setQrError] = useState(false);
  const prevUrlRef = useRef('');

  const fullUrl = queryParams ? `${serverUrl}?${queryParams}` : serverUrl;

  // Regenerate QR code whenever the URL changes — MUST be before early return
  useEffect(() => {
    if (fullUrl === prevUrlRef.current) return;
    prevUrlRef.current = fullUrl;
    setQrError(false);
    QRCode.toDataURL(fullUrl, {
      width: 300,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    })
      .then((url: string) => {
        setQrDataUrl(url);
        setQrError(false);
      })
      .catch(() => {
        setQrError(true);
      });
  }, [fullUrl]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">{t('qrCodeTitle')}</h2>
          <button type="button" onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* QR Code Image */}
        <div className="mb-4 flex justify-center">
          {qrDataUrl && !qrError ? (
            <img
              src={qrDataUrl}
              alt="QR Code"
              className="h-48 w-48 md:h-60 md:w-60"
            />
          ) : (
            <div className="flex h-48 w-48 md:h-60 md:w-60 flex-col items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
              <p>{t('qrCodeError')}</p>
            </div>
          )}
        </div>

        {/* Server URL */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">{t('settingsServer')}</label>
          <input
            type="text"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </div>

        {/* Query Params */}
        <div className="mt-2 space-y-2">
          <label className="text-xs font-medium text-muted-foreground">{t('qrCodeQueryParams')}</label>
          <input
            type="text"
            value={queryParams}
            onChange={(e) => setQueryParams(e.target.value)}
            placeholder="token=xxx&uniqueId=xxx"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </div>

        {/* URL preview */}
        <p className="mt-2 text-[11px] text-muted-foreground break-all">{fullUrl}</p>

        {/* Actions */}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={() => {
            const a = document.createElement('a');
            a.href = qrDataUrl;
            a.download = 'qr-code.png';
            a.click();
          }}
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors">
            <Download className="h-3.5 w-3.5" />
            {t('sharedDownload')}
          </button>
          <button type="button" onClick={onClose}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
            {t('sharedClose')}
          </button>
        </div>
      </div>
    </div>
  );
}

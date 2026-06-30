import { X, CheckCircle, AlertCircle } from 'lucide-react';
import { useFlash } from '@/context/FlashContext';
import { cn } from '@/lib/utils';

export default function FlashToast() {
  const { toast, dismiss } = useFlash();

  if (!toast) return null;

  const isError = toast.type === 'error';

  return (
    <div
      className={cn(
        'fixed bottom-4 right-4 z-[100] flex items-center gap-3 rounded-lg px-4 py-3 shadow-lg text-sm max-w-sm animate-in slide-in-from-right',
        isError
          ? 'bg-destructive text-destructive-foreground'
          : 'bg-green-600 text-white',
      )}
    >
      {isError ? <AlertCircle className="h-4 w-4 shrink-0" /> : <CheckCircle className="h-4 w-4 shrink-0" />}
      <span className="flex-1">{toast.message}</span>
      <button onClick={dismiss} className="shrink-0 opacity-70 hover:opacity-100">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

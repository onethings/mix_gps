import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useT } from '@/lib/i18n';
import { api } from '@/lib/api';
import LanguageSwitcher from '@/components/common/LanguageSwitcher';

export default function RegisterPage() {
  const { t } = useT();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [totpKey, setTotpKey] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.users.register({ name, email, password, totpKey });
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || t('error'));
    } finally {
      setBusy(false);
    }
  };

  if (success) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden"
        style={{ backgroundImage: 'url(/custom/login_bg.webp)', backgroundSize: 'cover', backgroundPosition: 'center' }}
      >
        <div className="absolute inset-0 bg-black/50" />
        <div className="relative z-10 w-full max-w-md px-4">
          <div className="rounded-2xl border border-white/20 bg-black/40 p-8 backdrop-blur-xl text-center">
            <div className="mb-4 text-4xl">✅</div>
            <h2 className="mb-2 text-lg font-bold text-white">{t('loginCreated')}</h2>
            <p className="mb-6 text-sm text-white/60">{t('loginCreatedHint')}</p>
            <button
              onClick={() => navigate('/login')}
              className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500"
            >
              {t('loginLogin')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden"
      style={{ backgroundImage: 'url(/custom/login_bg.webp)', backgroundSize: 'cover', backgroundPosition: 'center' }}
    >
      <div className="absolute inset-0 bg-black/50" />

      <div className="absolute right-4 top-4 z-20">
        <LanguageSwitcher className="[&>button]:border-white/20 [&>button]:bg-white/10 [&>button]:text-white/80 [&>button]:hover:bg-white/20" />
      </div>

      <div className="relative z-10 w-full max-w-md px-4">
        <div className="rounded-2xl border border-white/20 bg-black/40 p-8 backdrop-blur-xl">
          <div className="mb-8 text-center">
            <h1 className="text-xl font-bold text-white md:text-2xl">{t('loginRegister')}</h1>
            <p className="mt-1 text-sm text-white/60">{t('loginRegisterHint')}</p>
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-red-400/30 bg-red-500/15 px-4 py-2.5 text-sm text-red-200 backdrop-blur">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-white/70">{t('sharedName')}</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full rounded-lg border border-white/20 bg-white/10 px-4 py-2.5 text-sm text-white placeholder-white/40 outline-none transition focus:border-white/40 focus:bg-white/15 focus:ring-2 focus:ring-white/20"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-white/70">{t('userEmail')}</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full rounded-lg border border-white/20 bg-white/10 px-4 py-2.5 text-sm text-white placeholder-white/40 outline-none transition focus:border-white/40 focus:bg-white/15 focus:ring-2 focus:ring-white/20"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-white/70">{t('userPassword')}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                className="w-full rounded-lg border border-white/20 bg-white/10 px-4 py-2.5 text-sm text-white placeholder-white/40 outline-none transition focus:border-white/40 focus:bg-white/15 focus:ring-2 focus:ring-white/20"
              />
            </div>
            {totpKey && (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-white/70">{t('loginTotpKey')}</label>
                <input
                  type="text"
                  value={totpKey}
                  readOnly
                  className="w-full rounded-lg border border-white/20 bg-white/10 px-4 py-2.5 text-sm text-white font-mono outline-none"
                />
              </div>
            )}
            <button
              type="submit"
              disabled={busy || !name || !email || !password}
              className="mt-2 w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:bg-blue-500 disabled:opacity-60"
            >
              {busy ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {t('registering')}
                </span>
              ) : (
                t('loginRegister')
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link to="/login" className="text-xs text-white/50 hover:text-white/80 transition-colors">
              {t('loginBack')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

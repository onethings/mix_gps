import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSession } from '@/context/SessionContext';
import { useT, LANGUAGES } from '@/lib/i18n';
import LanguageSwitcher from '@/components/common/LanguageSwitcher';

function LogoIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="40" height="40" rx="10" fill="white" fillOpacity="0.15" />
      <path
        d="M12 26V14l8 6-8 6zM20 26V14l8 6-8 6z"
        fill="white"
        fillOpacity="0.9"
      />
    </svg>
  );
}

export default function LoginPage() {
  const { login } = useSession();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [codeEnabled, setCodeEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const { t, locale, dir } = useT();

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password, codeEnabled ? code : undefined);
      const to = location.state?.from?.pathname || '/dashboard';
      navigate(to, { replace: true });
    } catch (err) {
      if (err.needsTotp) {
        setCodeEnabled(true);
        setError(t('totpHint'));
      } else {
        setError(err.message || t('error'));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden"
      dir={dir}
      style={{
        backgroundImage: 'url(/custom/login_bg.webp)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Language selector — top right, like gps51 */}
      <div className="absolute right-4 top-4 z-20">
        <LanguageSwitcher className="[&>button]:border-white/20 [&>button]:bg-white/10 [&>button]:text-white/80 [&>button]:hover:bg-white/20" />
      </div>

      {/* Login card — centered, glass-morphism, inspired by gps51 login style */}
      <div className="relative z-10 w-full max-w-md px-4">
        <div className="rounded-2xl border border-white/20 bg-black/40 p-8 backdrop-blur-xl">
          {/* Logo + Title */}
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center">
              <img
                src="/custom/login_icon_logo.webp"
                alt="Logo"
                className="h-14 w-14 object-contain"
                onError={(e: any) => {
                  e.target.style.display = 'none';
                  e.target.nextSibling.style.display = 'flex';
                }}
              />
              <div className="hidden h-14 w-14 items-center justify-center">
                <LogoIcon />
              </div>
            </div>
            <h1 className="text-2xl font-bold text-white">{t('appTitle')}</h1>
            <p className="mt-1 text-sm text-white/60">{t('signIn')}</p>
          </div>

          {/* Error message */}
          {error && (
            <div className="mb-4 rounded-lg border border-red-400/30 bg-red-500/15 px-4 py-2.5 text-sm text-red-200 backdrop-blur">
              {error}
            </div>
          )}

          {/* Login form */}
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-white/70">
                {t('email')}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('emailPlaceholder')}
                autoComplete="username"
                required
                className="w-full rounded-lg border border-white/20 bg-white/10 px-4 py-2.5 text-sm text-white placeholder-white/40 outline-none transition focus:border-white/40 focus:bg-white/15 focus:ring-2 focus:ring-white/20"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-white/70">
                {t('password')}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('passwordPlaceholder')}
                autoComplete="current-password"
                required
                className="w-full rounded-lg border border-white/20 bg-white/10 px-4 py-2.5 text-sm text-white placeholder-white/40 outline-none transition focus:border-white/40 focus:bg-white/15 focus:ring-2 focus:ring-white/20"
              />
            </div>

            {codeEnabled && (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-white/70">
                  {t('totpCode')}
                </label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder={t('totpCodePlaceholder')}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  className="w-full rounded-lg border border-white/20 bg-white/10 px-4 py-2.5 text-sm text-white placeholder-white/40 outline-none transition focus:border-white/40 focus:bg-white/15 focus:ring-2 focus:ring-white/20 tracking-[0.3em] text-center"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="mt-2 w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:bg-blue-500 disabled:opacity-60"
            >
              {busy ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {t('signingIn')}
                </span>
              ) : (
                t('signInBtn')
              )}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-6 text-center text-xs text-white/40">
            {t('poweredBy')}
          </div>
        </div>
      </div>
    </div>
  );
}

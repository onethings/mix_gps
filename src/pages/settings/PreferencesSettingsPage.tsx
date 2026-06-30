import { useT, LANGUAGES } from '@/lib/i18n';
import { useTheme } from '@/context/ThemeContext';
import { useSession } from '@/context/SessionContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function PreferencesSettingsPage() {
  const { t, locale, setLocale } = useT();
  const { theme, toggle } = useTheme();
  const { user } = useSession();

  return (
    <div className="space-y-4">
      <div><h2 className="text-lg font-semibold">{t('preferences')}</h2><p className="text-sm text-muted-foreground">{t('preferencesDesc')}</p></div>

      <Card>
        <CardHeader><CardTitle className="text-sm">{t('myAccount')}</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-1">
          <p><span className="text-muted-foreground">{t('name')}:</span> {user?.name}</p>
          <p><span className="text-muted-foreground">Email:</span> {user?.email}</p>
          <p><span className="text-muted-foreground">{t('phone')}:</span> {user?.phone || '—'}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">{t('language')}</CardTitle></CardHeader>
        <CardContent>
          <select value={locale} onChange={(e) => setLocale(e.target.value)} className="rounded-lg border border-input bg-background px-3 py-2 text-sm">
            {LANGUAGES.filter((l: { code: string }) => ['en','zh','ja','ko','vi','th','de','fr','es','pt','it','ru','ar','hi','id','ms','tl'].includes(l.code)).map((lang: { code: string; nativeName: string }) => (
              <option key={lang.code} value={lang.code}>{lang.nativeName}</option>
            ))}
          </select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">{t('toggleTheme')}</CardTitle></CardHeader>
        <CardContent>
          <Button variant="outline" size="sm" onClick={toggle}>{theme === 'dark' ? t('toggleTheme') : t('toggleTheme')}</Button>
          <span className="ml-2 text-sm text-muted-foreground">{theme === 'dark' ? 'Dark' : 'Light'}</span>
        </CardContent>
      </Card>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useT } from '@/lib/i18n';
import { useFlash } from '@/context/FlashContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';

export default function AnnouncementSettingsPage() {
  const { t } = useT();
  const { showSuccess, showError } = useFlash();
  const [notificator, setNotificator] = useState('web');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!notificator || !subject || !body) { showError(t('notificatorSubjectBodyRequired')); return; }
    setSending(true);
    try {
      const users = await api.users.list() as Array<{ id: number }>;
      if (!Array.isArray(users) || users.length === 0) { showError(t('selectRecipients')); return; }
      await api.notifications.send(notificator, users.map((u) => u.id), { subject, body });
      showSuccess(t('announcementSent'));
      setSubject(''); setBody('');
    } catch { showError(t('sendFailed')); }
    finally { setSending(false); }
  };

  return (
    <div className="space-y-4">
      <div><h2 className="text-lg font-semibold">{t('announcement')}</h2><p className="text-sm text-muted-foreground">{t('announcementDesc')}</p></div>
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">{t('notificator')}</label>
            <select value={notificator} onChange={(e) => setNotificator(e.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
              <option value="web">Web</option>
              <option value="mail">Email</option>
              <option value="sms">SMS</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">{t('subject')}</label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={t('subject')} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">{t('body')}</label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder={t('message')} />
          </div>
          <Button onClick={handleSend} disabled={sending}>{sending ? t('sending') : t('sendAnnouncement')}</Button>
        </CardContent>
      </Card>
    </div>
  );
}

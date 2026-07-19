import { useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Play, StopCircle, ArrowLeft } from 'lucide-react';
import Hls from 'hls.js';
import { useT } from '@/lib/i18n';
import { api } from '@/lib/api';
import { useLiveData } from '@/context/LiveDataContext';

export default function StreamPage() {
  const { t } = useT();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [searchParams] = useSearchParams();
  const deviceId = searchParams.get('deviceId');
  const { devices } = useLiveData();
  const device = devices.find((d) => String(d.id) === deviceId);

  const [channel, setChannel] = useState(1);
  const [activeChannel, setActiveChannel] = useState<number | null>(null);
  const [error, setError] = useState(false);

  const playing = activeChannel !== null;

  useEffect(() => {
    if (activeChannel === null || !deviceId) return;

    const devIdNum = parseInt(deviceId, 10);
    api.commands.send({ deviceId: devIdNum, type: 'videoStart', attributes: { index: activeChannel } }).catch(() => {});

    let hls: Hls | null = null;
    if (Hls.isSupported()) {
      hls = new Hls();
      hls.loadSource(`/api/stream/${deviceId}/${activeChannel}/live.m3u8`);
      if (videoRef.current) hls.attachMedia(videoRef.current);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        videoRef.current?.play().catch(() => {});
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) setError(true);
      });
    } else if (videoRef.current?.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS support (Safari)
      videoRef.current.src = `/api/stream/${deviceId}/${activeChannel}/live.m3u8`;
    }

    return () => {
      if (hls) hls.destroy();
      api.commands.send({ deviceId: devIdNum, type: 'videoStop', attributes: { index: activeChannel } }).catch(() => {});
    };
  }, [deviceId, activeChannel]);

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('back')}
        </button>
        <h1 className="text-base font-semibold">
          {device?.name || t('linkLiveVideo')}
        </h1>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">{t('commandIndex')}</label>
          <input
            type="number"
            min={1}
            value={channel}
            onChange={(e) => setChannel(Math.max(1, parseInt(e.target.value, 10) || 1))}
            disabled={playing}
            className="h-8 w-16 rounded-md border border-input bg-background px-2 text-xs text-center outline-none focus:border-primary disabled:opacity-50"
          />
        </div>
        <button
          type="button"
          onClick={() => { setError(false); setActiveChannel(playing ? null : channel); }}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            playing
              ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
              : 'bg-primary text-primary-foreground hover:bg-primary/90'
          }`}
        >
          {playing ? <StopCircle className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {playing ? t('stop') : t('play')}
        </button>
      </div>

      {/* Video player */}
      <div className="flex flex-1 items-center justify-center bg-black/5 p-4">
        {error ? (
          <div className="text-center">
            <p className="text-sm text-destructive">{t('errorConnection')}</p>
          </div>
        ) : playing ? (
          <video
            ref={videoRef}
            className="max-h-full max-w-full rounded-lg shadow-lg"
            autoPlay
            muted
            controls
            playsInline
          />
        ) : (
          <div className="text-center text-sm text-muted-foreground">
            <Play className="mx-auto mb-2 h-12 w-12 opacity-30" />
            <p>{t('streamPressPlay')}</p>
          </div>
        )}
      </div>
    </div>
  );
}

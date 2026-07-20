import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Wifi, Radio } from 'lucide-react';
import { api } from '@/lib/api';
import { useLiveData } from '@/context/LiveDataContext';
import { useT } from '@/lib/i18n';
import { formatDate } from '@/lib/utils';

interface CellTower {
  mobileCountryCode?: number;
  mobileNetworkCode?: number;
  locationAreaCode?: number;
  cellId?: number;
  signalStrength?: number;
  radioType?: string;
  timingAdvance?: number;
}

interface WifiAccessPoint {
  macAddress: string;
  signalStrength?: number;
  channel?: number;
  age?: number;
  ssid?: string;
}

interface NetworkInfo {
  homeMobileCountryCode?: number;
  homeMobileNetworkCode?: number;
  radioType?: string;
  carrier?: string;
  considerIp?: string;
  cellTowers?: CellTower[];
  wifiAccessPoints?: WifiAccessPoint[];
}

export default function NetworkPage() {
  const { t } = useT();
  const navigate = useNavigate();
  const { positionId } = useParams<{ positionId: string }>();
  const { devicesById } = useLiveData();
  const [position, setPosition] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!positionId) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await api.positions.list({ id: positionId }) as any[];
        if (!cancelled && data?.length > 0) setPosition(data[0]);
      } catch { /* ignore */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [positionId]);

  const deviceName = position ? devicesById[position.deviceId]?.name : null;
  const network: NetworkInfo | null = position?.attributes?.network as NetworkInfo | null;

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <button type="button" onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
          {t('back')}
        </button>
        <h1 className="text-base font-semibold">
          {deviceName ? `${deviceName} — ${t('networkTitle')}` : t('networkTitle')}
        </h1>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">{t('loading')}…</div>
        ) : !position ? (
          <div className="py-8 text-center text-sm text-muted-foreground">{t('noData')}</div>
        ) : (
          <div className="mx-auto max-w-2xl space-y-3 md:space-y-6">
            {/* Position info */}
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('positionTitle')}
              </h2>
              <div className="overflow-hidden rounded-lg border">
                <table className="w-full text-sm">
                  <tbody>
                    <tr className="border-b">
                      <td className="px-3 py-2 text-xs text-muted-foreground">{t('positionFixTime')}</td>
                      <td className="px-3 py-2 text-xs font-medium">{position.fixTime ? formatDate(position.fixTime) : '—'}</td>
                    </tr>
                    <tr className="border-b">
                      <td className="px-3 py-2 text-xs text-muted-foreground">{t('positionLatitude')}</td>
                      <td className="px-3 py-2 text-xs font-medium">{position.latitude?.toFixed(6) ?? '—'}</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{t('positionLongitude')}</td>
                      <td className="px-3 py-2 text-xs font-medium">{position.longitude?.toFixed(6) ?? '—'}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* Cell towers */}
            {network?.cellTowers && network.cellTowers.length > 0 && (
              <section>
                <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Radio className="h-3.5 w-3.5" /> {t('networkCellTowers')}
                  <span className="ml-1 text-[10px] text-muted-foreground/60">({network.cellTowers.length})</span>
                </h2>
                <div className="space-y-2">
                  {network.cellTowers.map((tower, i) => (
                    <div key={i} className="rounded-lg border p-3 text-xs space-y-1">
                      {tower.radioType && <p><span className="text-muted-foreground">{t('networkRadioType')}:</span> {tower.radioType}</p>}
                      {tower.mobileCountryCode != null && <p><span className="text-muted-foreground">MCC:</span> {tower.mobileCountryCode}</p>}
                      {tower.mobileNetworkCode != null && <p><span className="text-muted-foreground">MNC:</span> {tower.mobileNetworkCode}</p>}
                      {tower.locationAreaCode != null && <p><span className="text-muted-foreground">LAC:</span> {tower.locationAreaCode}</p>}
                      {tower.cellId != null && <p><span className="text-muted-foreground">CID:</span> {tower.cellId}</p>}
                      {tower.signalStrength != null && <p><span className="text-muted-foreground">{t('networkSignal')}:</span> {tower.signalStrength} dBm</p>}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* WiFi access points */}
            {network?.wifiAccessPoints && network.wifiAccessPoints.length > 0 && (
              <section>
                <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Wifi className="h-3.5 w-3.5" /> {t('networkWifiAccessPoints')}
                  <span className="ml-1 text-[10px] text-muted-foreground/60">({network.wifiAccessPoints.length})</span>
                </h2>
                <div className="space-y-2">
                  {network.wifiAccessPoints.map((ap, i) => (
                    <div key={i} className="rounded-lg border p-3 text-xs space-y-1">
                      <p className="font-medium text-foreground font-mono">{ap.macAddress}</p>
                      {ap.ssid && <p><span className="text-muted-foreground">SSID:</span> {ap.ssid}</p>}
                      {ap.signalStrength != null && <p><span className="text-muted-foreground">{t('networkSignal')}:</span> {ap.signalStrength} dBm</p>}
                      {ap.channel != null && <p><span className="text-muted-foreground">{t('networkChannel')}:</span> {ap.channel}</p>}
                      {ap.age != null && <p><span className="text-muted-foreground">{t('networkAge')}:</span> {ap.age}ms</p>}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {!network && (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {t('networkNoData')}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

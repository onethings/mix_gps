import {
  useEffect,
  useRef,
  forwardRef,
  useImperativeHandle,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { createCarMarkerElement, updateCarMarkerElement } from "./carMarkerSvg";
import { wktToGeoJson, circleToGeoJson, kmlToGeoJson } from "@/lib/geo";
import { api } from "@/lib/api";
import { cacheGet, cacheSet } from "@/lib/db";
import {
  loadPopupSettings,
  savePopupSetting,
  POPUP_FIELDS,
} from "@/lib/popupSettings";
import { useT } from "@/lib/i18n";
import { useSession } from "@/context/SessionContext";
import { activityWindow } from "@/lib/activity";
import type { Vehicle, TraccarGeofence } from "@/types";
import { resolveMapStyle } from "@/lib/mapStyles";

function validCoord(
  lat: number | null | undefined,
  lng: number | null | undefined,
): boolean {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return false;
  if (Math.abs(la) > 90 || Math.abs(ln) > 180) return false;
  return !(la === 0 && ln === 0);
}

function escapeHtml(s: string | number | null | undefined): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Traccar stores engine hours in milliseconds. Popup renders them compactly as "37h 48m". */
function formatEngineHours(ms: number): string {
  const totalMin = Math.round(ms / 60_000);
  if (totalMin <= 0) return "0m";
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function haversineKm(
  lng1: number,
  lat1: number,
  lng2: number,
  lat2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const GEOFENCE_COLORS = [
  "#3b82f6",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#a855f7",
  "#06b6d4",
  "#ec4899",
];

function geofenceToFeature(
  g: TraccarGeofence,
  index: number,
): GeoJSON.Feature | null {
  const feature = wktToGeoJson(g.area);
  if (!feature) return null;
  const attrColor = g.attributes?.color as string | undefined;
  const color = attrColor || GEOFENCE_COLORS[index % GEOFENCE_COLORS.length];
  feature.properties = {
    ...feature.properties,
    name: g.name,
    id: g.id,
    color,
    fill: `${color}22`,
  };
  return feature;
}

export interface FleetMapLibreHandle {
  fitAllVehicles: () => void;
  clearMeasurement: () => void;
  flyToVehicle: (lat: number, lng: number, zoom?: number) => void;
  flyToBounds: (
    bounds: [[number, number], [number, number]],
    options?: { padding?: number },
  ) => void;
  _measureTotalKm?: number;
}

interface FleetMapLibreProps {
  vehicles: Vehicle[];
  selectedId: number | null;
  onSelectVehicle: (id: number | null) => void;
  className?: string;
  showControls?: boolean;
  showGeolocate?: boolean;
  fitPadding?: number;
  basemap?: string;
  showGeofences?: boolean;
  geofences?: TraccarGeofence[];
  measuring?: boolean;
  onMeasuringChange?: (m: boolean) => void;
  onMapClick?: (lat: number, lng: number) => void;
  initialZoom?: number;
  onZoomChange?: (zoom: number) => void;
  zoomPrefResolved?: boolean;
  /** Initial popup dismissed state loaded from IndexedDB */
  initialPopupDismissed?: boolean;
  /** Called when user opens/closes the popup */
  onPopupDismissedChange?: (dismissed: boolean) => void;
  /** Whether to show the day's route trail for the selected vehicle */
  showRoute?: boolean;
  fitInset?: { left?: number; bottom?: number };
  autoFitOnLoad?: boolean;
}

const FleetMapLibre = forwardRef<FleetMapLibreHandle, FleetMapLibreProps>(
  function FleetMapLibre(
    {
      vehicles,
      selectedId,
      onSelectVehicle,
      className = "",
      showControls = true,
      showGeolocate = true,
      fitPadding = 50,
      basemap = "road",
      showGeofences = false,
      geofences = [],
      measuring = false,
      onMeasuringChange,
      initialZoom,
      onZoomChange,
      zoomPrefResolved,
      initialPopupDismissed,
      onPopupDismissedChange,
      onMapClick,
      showRoute = false,
      fitInset = {},
      autoFitOnLoad = true,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<maplibregl.Map | null>(null);
    const markersRef = useRef<Map<number, maplibregl.Marker>>(new Map());
    const popupRef = useRef<maplibregl.Popup | null>(null);
    const popupDismissedRef = useRef(false);
    const accuracySigRef = useRef("");
    const vehiclesRef = useRef(vehicles);
    vehiclesRef.current = vehicles;
    const selectedIdRef = useRef(selectedId);
    selectedIdRef.current = selectedId;
    // Initialize popupDismissedRef from persisted preference on mount
    if (initialPopupDismissed !== undefined) {
      popupDismissedRef.current = initialPopupDismissed;
    }
    const geoSourceRef = useRef<string | null>(null);
    const measureLineRef = useRef<maplibregl.Marker[]>([]);
    const measurePointsRef = useRef<{ lng: number; lat: number }[]>([]);
    const measureTotalKmRef = useRef(0);
    const fitDoneRef = useRef(false);
    const navigate = useNavigate();
    const navigateRef = useRef(navigate);
    navigateRef.current = navigate;
    const [mapReady, setMapReady] = useState(false);
    const [mapVisible, setMapVisible] = useState(false);
    const [styleKey, setStyleKey] = useState(0); // increments when basemap changes to re-create style-based layers
    const mapVisibleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
      null,
    );
    const { t } = useT();

    // Accumulator editor state
    const [accEditOpen, setAccEditOpen] = useState(false);
    const [accSaving, setAccSaving] = useState(false);
    const [editHours, setEditHours] = useState("");
    const [editDistance, setEditDistance] = useState("");
    const [accVehicleId, setAccVehicleId] = useState<number | null>(null);
    const initialAutoFitDoneRef = useRef(false);

    useImperativeHandle(ref, () => ({
      fitAllVehicles: () =>
        fitBounds(
          mapRef.current,
          vehiclesRef.current,
          fitPadding,
          fitInset,
          {},
          0.1,
        ),
      clearMeasurement: () => clearMeasure(),
      // flyToVehicle: (lat: number, lng: number, zoom = 18) => {
      //   const map = mapRef.current;
      //   if (!map) return;
      //   map.flyTo({ center: [lng, lat], zoom, duration: 400 });
      // },
      flyToVehicle: (lat: number, lng: number, zoom?: number) => {
        const map = mapRef.current;
        if (!map) return;
        const targetZoom = zoom ?? map.getZoom();
        map.flyTo({ center: [lng, lat], zoom: targetZoom, duration: 400 });
      },
      flyToBounds: (
        bounds: [[number, number], [number, number]],
        options?: { padding?: number },
      ) => {
        const map = mapRef.current;
        if (!map) return;
        map.fitBounds(bounds, {
          padding: options?.padding ?? 60,
          maxZoom: 18,
          duration: 600,
        });
      },
      get _measureTotalKm() {
        return measureTotalKmRef.current;
      },
    }));

    function clearMeasure() {
      measureLineRef.current.forEach((m) => m.remove());
      measureLineRef.current = [];
      measurePointsRef.current = [];
      measureTotalKmRef.current = 0;
    }

    function showPopup(vehicle: Vehicle) {
      const map = mapRef.current;
      if (!map || !validCoord(vehicle.lat, vehicle.lng)) return;
      if (popupRef.current) popupRef.current.remove();

      const isMobile = window.innerWidth < 768;
      const settings = loadPopupSettings();
      const statusColors: Record<string, string> = {
        moving: "#3b82f6",
        idle: "#f59e0b",
        stopped: "#6b7280",
        offline: "#6b7280",
        alert: "#ef4444",
        maintenance: "#8b5cf6",
      };
      const sc = statusColors[vehicle.status] || "#6b7280";
      const dateStr = vehicle.lastUpdate
        ? new Date(vehicle.lastUpdate).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })
        : "—";

      const todayMileageId = `mileage-${vehicle.id}-${Date.now()}`;

      const settingsId = `popup-settings-${vehicle.id}-${Date.now()}`;
      const panelId = `popup-panel-${vehicle.id}-${Date.now()}`;

      // Map POPUP_FIELDS keys to translation labels
      const fieldLabels: Record<string, string> = {
        speed: t("speed"),
        ignition: t("ignition"),
        updated: t("updated"),
        address: t("address"),
        driver: t("driver"),
        accumulators: t("sharedDeviceAccumulators"),
        todayMileage: t("today"),
        replayLink: t("replayLink"),
      };

      const settingsHtml = `
      <div id="${settingsId}" style="position:relative;display:inline-block">
        <span style="cursor:pointer;font-size:14px;opacity:0.45" onclick="(function(){
          var p=document.getElementById('${panelId}');
          if(p)p.style.display=p.style.display==='block'?'none':'block'
        })()">⚙</span>
        <div id="${panelId}" style="display:none;position:absolute;top:20px;right:0;z-index:9999;background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:8px;box-shadow:0 4px 12px rgba(0,0,0,0.12);min-width:160px;font-size:11px;color:#1e293b">
          <div style="font-weight:600;padding:4px 6px 6px;border-bottom:1px solid #f1f5f9;margin-bottom:4px">${t("displayFields")}</div>
          ${POPUP_FIELDS.map(
            (f) => `
            <label style="display:flex;align-items:center;gap:6px;padding:4px 6px;cursor:pointer;border-radius:4px"
              onmouseenter="this.style.background='#f8fafc'" onmouseleave="this.style.background=''">
              <input type="checkbox" ${settings[f.key] !== false ? "checked" : ""}
                onchange="try{var s=JSON.parse(localStorage.getItem('popup-display-fields')||'{}');s['${f.key}']=this.checked;localStorage.setItem('popup-display-fields',JSON.stringify(s));var p=this.closest('.maplibregl-popup-content');if(p){var e=p.querySelector('[data-key=\\'${f.key}\\']');if(e)e.style.display=this.checked?'':'none'}}catch(e){}"
                style="accent-color:#3b82f6">
              ${fieldLabels[f.key] || f.label}
            </label>
          `,
          ).join("")}
        </div>
      </div>
    `;

      /* ── Compact inline data rows ── */
      // 三欄等寬 cell（flex:1 平均分配）
      const cell = (
        key: string,
        label: string,
        valueHtml: string,
        extraStyle = "",
      ) => {
        const hidden = settings[key] === false ? ' style="display:none"' : "";
        // 手機版省略 icon，省出空間讓數據完整顯示
        const labelHtml = isMobile
          ? ""
          : `<span style="color:#64748b">${label}</span> `;
        return `<span data-key="${key}"${hidden} style="flex:1;min-width:0;text-align:center;background:#f8fafc;border-radius:4px;padding:${isMobile ? "1px 4px" : "2px 6px"};white-space:nowrap;font-size:10px;line-height:1.6;max-width:100%;overflow:hidden;text-overflow:ellipsis;display:inline-block;vertical-align:middle;font-family:Arial,sans-serif${extraStyle}">${labelHtml}<span style="color:#1e293b">${valueHtml}</span></span>`;
      };
      // Row 1 — 速度 / 點火 / 時間（左、中、右三欄）
      // 速度、點火為固定長度（icon + 數字+km/h、icon + ON/OFF）→ 壓縮欄寬與 padding；
      // 時間較長 → 分配較大欄寬，避免時間被截斷
      const row1Cells = [
        // 速度可能 1~3 位數（如 210 km/h）→ 不壓縮、不截斷，永遠顯示完整；
        // 空間由彈性最大的時間欄（updated, flex:1.6）吸收。
        // 單位直接固定英文 km/h，不用翻譯（其他語言的單位文字較長，易撐壞版面）。
        cell(
          "speed",
          "⚡",
          `${escapeHtml(Math.round(Number(vehicle.speed)))} km/h`,
          ";flex:0 0 auto;min-width:max-content;max-width:none;overflow:visible;text-overflow:clip;padding:0 1px",
        ),
        cell(
          "ignition",
          "🔑",
          vehicle.ignition
            ? `<span style="color:#22c55e">${escapeHtml(t("on"))}</span>`
            : `<span style="color:#6b7280">${escapeHtml(t("off"))}</span>`,
          ";flex:0.8",
        ),
        cell("updated", "🕐", dateStr, ";flex:1.6"),
      ].join("");
      // 地址路名 — 單獨一行（超過框寬會以 … 截斷）
      const addressCell = cell(
        "address",
        "📍",
        escapeHtml(vehicle.address || "—"),
        ";display:block",
      );

      // Consolidated engine hours & odometer row (with inline gear edit)
      const rawHours = vehicle._raw?.position?.attributes?.hours;
      const rawDist = vehicle._raw?.position?.attributes?.totalDistance;
      const rawOdo = vehicle.odometer;
      let hoursDisplay = "—";
      if (rawHours != null) {
        const ms = Number(rawHours);
        if (Number.isFinite(ms)) {
          // Raw value is milliseconds; render as h + m so the minutes are not lost.
          hoursDisplay = formatEngineHours(ms);
        }
      }
      // Use odometer (already in km, from vehicle) as primary distance; fallback to totalDistance
      let distDisplay = "—";
      if (rawOdo != null && Number.isFinite(Number(rawOdo))) {
        distDisplay = Math.round(Number(rawOdo)).toLocaleString();
      } else if (rawDist != null) {
        const n = Number(rawDist);
        if (Number.isFinite(n))
          distDisplay = Math.round(n / 1000).toLocaleString();
      }
      const accEditId = `acc-edit-${vehicle.id}-${Date.now()}`;
      const hiddenAttr =
        settings.accumulators === false ? ' style="display:none"' : "";
      // 引擎時數 / 總里程 的共用 cell（無駕駛員時拆成左右兩格做平衡）
      const accCell = (inner: string, flexRatio: number, align: string) =>
        `<span data-key="accumulators"${hiddenAttr} style="flex:${flexRatio};min-width:0;text-align:${align};background:#f8fafc;border-radius:4px;padding:2px 4px;white-space:nowrap;font-size:10px;line-height:1.6;font-family:Arial,sans-serif">${inner}</span>`;
      const hoursIcon = isMobile ? "" : '<span style="color:#64748b">⏱</span> ';
      const distIcon = isMobile ? "" : '<span style="color:#64748b">📏</span> ';
      const hoursInner = `${hoursIcon}<span style="color:#1e293b;margin-right:3px">${hoursDisplay}</span>`;
      const distInner = `${distIcon}<span style="color:#1e293b;margin-right:3px">${distDisplay}</span><span style="color:#64748b">km</span><span id="${accEditId}" data-action="accumulators" style="cursor:pointer;margin-left:1px;color:#94a3b8">⚙</span>`;
      // 有駕駛員時：時數 + 分隔線 + 里程 合成一格、置中
      const accHtml = accCell(
        `${hoursInner}
        <span style="color:#cbd5e1;margin:0 2px">|</span>
        ${distInner}`,
        1.7,
        "center",
      );

      const todayMileageIcon = isMobile
        ? ""
        : '<span style="color:#64748b">📅</span> ';
      const todayMileageRender = `<span data-key="todayMileage"${settings.todayMileage !== false ? "" : ' style="display:none"'} style="flex:0.8;min-width:0;text-align:left;background:#f8fafc;border-radius:4px;padding:2px 4px;white-space:nowrap;font-size:10px;line-height:1.6;font-family:Arial,sans-serif">${todayMileageIcon}<span style="color:#1e293b"><span id="${todayMileageId}">—</span> ${t("unitKm")}</span></span>`;

      // Row 2 — 有駕駛員：駕駛 / 引擎時數+里程 / 本日里程；
      //          無駕駛員：引擎時數(左) / 本日里程(中) / 總里程(右) 一左一右平衡
      const hasDriver = Boolean(vehicle.driver);
      const row2Cells = hasDriver
        ? [
            cell(
              "driver",
              "👤",
              escapeHtml(vehicle.driver || "—"),
              ";text-align:left",
            ),
            accHtml,
            todayMileageRender,
          ].join("")
        : [
            accCell(hoursInner, 1.3, "left"),
            todayMileageRender,
            accCell(distInner, 1.3, "right"),
          ].join("");

      const html = `
      <div style="font-family:system-ui,-apple-system,sans-serif;font-size:12px;line-height:1.4;min-width:180px;max-width:${isMobile ? "220px" : "280px"};padding:${isMobile ? "6px 8px" : "10px 12px"}">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:${isMobile ? "4px" : "6px"};padding-bottom:${isMobile ? "4px" : "6px"};border-bottom:1px solid #f1f5f9">
          <span style="width:7px;height:7px;border-radius:50%;background:${sc};flex-shrink:0"></span>
          <span style="font-weight:600;font-size:13px;color:#1e293b;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(vehicle.name)}</span>
          ${settingsHtml}
          <span style="font-size:9px;padding:1px 6px;border-radius:4px;background:${sc}18;color:${sc};font-weight:600;margin-right:15px">${escapeHtml(t(vehicle.status))}</span>
        </div>
        <div style="display:flex;gap:${isMobile ? "3px" : "4px"};margin-bottom:${isMobile ? "3px" : "4px"}">
          ${row1Cells}
        </div>
        ${addressCell ? `<div style="margin-bottom:${isMobile ? "3px" : "4px"}">${addressCell}</div>` : ""}
        <div style="display:flex;gap:${isMobile ? "3px" : "4px"};margin-bottom:${isMobile ? "3px" : "4px"}">
          ${row2Cells}
        </div>
        <div data-key="replayLink"${settings.replayLink !== false ? "" : ' style="display:none"'} style="display:flex;gap:8px;border-top:1px solid #f1f5f9;padding:${isMobile ? "3px 0 0" : "4px 0 0"}>
          <a href="#" data-action="device" style="flex:1;display:flex;align-items:center;justify-content:center;gap:3px;font-size:10px;color:#2563eb;text-decoration:none;font-weight:500;cursor:pointer">${isMobile ? "" : "🔍 "}${t("details")}</a>
          <a href="#" data-action="replay" style="flex:1;display:flex;align-items:center;justify-content:center;gap:3px;font-size:10px;color:#2563eb;text-decoration:none;font-weight:500;cursor:pointer">${isMobile ? "" : "▶ "}${t("replayToday")}</a>
        </div>
      </div>
    `;

      const popup = new maplibregl.Popup({
        offset: [0, -18],
        closeButton: true,
        closeOnClick: false,
        maxWidth: isMobile ? "220px" : "300px",
      })
        .setLngLat([vehicle.lng!, vehicle.lat!])
        .setHTML(html)
        .addTo(map);

      // Attach real click handlers — reliable e.preventDefault() and one action
      // per element. Avoids the fragile inline `onclick="...;return false"` +
      // `window.__open*` globals (which can be deleted/shadowed by a stale bundle
      // and let the `href="#"` default fire, causing a stray extra navigation).
      const popupContent = popup
        .getElement()
        ?.querySelector(".maplibregl-popup-content");
      popupContent
        ?.querySelectorAll<HTMLElement>("[data-action]")
        .forEach((el) => {
          el.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            const action = el.getAttribute("data-action");
            if (action === "device") {
              navigateRef.current(`/devices/${vehicle.id}`);
            } else if (action === "replay") {
              navigateRef.current(`/replay?deviceId=${vehicle.id}&date=today`);
            } else if (action === "accumulators") {
              (window as any).__openAccumulatorEditor(vehicle.id);
            }
          });
        });

      // Remember when user dismisses popup (X button) — don't re-show on arrow nav
      // IMPORTANT: reset after removal above so old popup's close event doesn't pollute state
      popupDismissedRef.current = false;
      popup.on("close", () => {
        popupDismissedRef.current = true;
        onPopupDismissedChange?.(true);
      });
      popupRef.current = popup;

      // Fetch today's mileage asynchronously. "Today" means the local day (local midnight
      // → now), exactly like the Activity panel, so both surfaces show the same number.
      // Traccar's `daily` summary rows bucket by server time (UTC on demo servers), which
      // is why they cannot feed this cell.
      if (settings.todayMileage !== false) {
        const win = activityWindow("today");
        const dayStart = new Date(win.fromMs);
        const dayMonth = String(dayStart.getMonth() + 1).padStart(2, "0");
        const dateStr = `${dayStart.getFullYear()}-${dayMonth}-${String(dayStart.getDate()).padStart(2, "0")}`;
        const monthStr = `${dayStart.getFullYear()}-${dayMonth}`;
        const kmKey = `replay-km-${vehicle.id}-${monthStr}`;

        (async () => {
          const el = () => document.getElementById(todayMileageId);
          try {
            const rows = (await api.reports.summary({
              from: new Date(win.fromMs).toISOString(),
              to: new Date(win.toMs).toISOString(),
              deviceId: [vehicle.id],
            })) as Array<{ distance?: number }>;
            const km = Math.max(0, Number(rows?.[0]?.distance) || 0) / 1000;
            if (el()) el()!.textContent = km === 0 ? "0" : km.toFixed(1);
            // Keep the replay calendar cache warm with today's value.
            try {
              const cached = await cacheGet<Record<string, number>>(
                "mileage",
                kmKey,
              );
              const map = cached ? { ...cached } : {};
              map[dateStr] = Math.round(km);
              cacheSet("mileage", kmKey, map, 5 * 60 * 1000);
            } catch {
              /* cache is best-effort */
            }
          } catch {
            if (el()) el()!.textContent = "—";
          }
        })();
      }
    }

    // Expose the accumulator editor global (used by the ⚙ gear inside the popup)
    useEffect(() => {
      (window as any).__openAccumulatorEditor = (deviceId: number) => {
        setAccVehicleId(deviceId);
        const vehicle = vehiclesRef.current.find((v) => v.id === deviceId);
        const attr = vehicle?._raw?.position?.attributes || {};
        const rawHours = attr.hours;
        const rawDist = attr.totalDistance;
        if (rawHours != null) {
          let n = Number(rawHours);
          if (!Number.isFinite(n)) {
            setEditHours("0");
          } else {
            n = n / 3600000;
            setEditHours(n.toFixed(1));
          }
        } else {
          setEditHours("0");
        }
        if (rawDist != null) {
          const n = Number(rawDist);
          setEditDistance(Number.isFinite(n) ? (n / 1000).toFixed(1) : "0");
        } else {
          setEditDistance("0");
        }
        setAccEditOpen(true);
      };
      return () => {
        delete (window as any).__openAccumulatorEditor;
      };
    }, []);

    // Initialize map
    useEffect(() => {
      if (!containerRef.current || mapRef.current) return;

      const map = new maplibregl.Map({
        container: containerRef.current,
        style: resolveMapStyle(basemap),
        center: [139.6917, 35.6895],
        zoom: 5,
        attributionControl: false as const,
      });
      mapRef.current = map;

      if (showControls) {
        map.addControl(new maplibregl.NavigationControl(), "top-right");
        if (showGeolocate) {
          map.addControl(
            new maplibregl.GeolocateControl({
              positionOptions: { enableHighAccuracy: true },
              trackUserLocation: true,
            }),
            "top-right",
          );
        }
        map.addControl(
          new maplibregl.ScaleControl({ unit: "metric", maxWidth: 120 }),
          "bottom-left",
        );
      }

      map.on("load", () => {
        // Restore saved zoom after map loads
        if (initialZoom != null) {
          map.jumpTo({ zoom: initialZoom });
        }
        setMapReady(true);
      });

      // Listen for zoom changes to persist
      map.on("zoomend", () => {
        if (onZoomChange) {
          onZoomChange(map.getZoom());
        }
      });

      return () => {
        if (popupRef.current) popupRef.current.remove();
        map.remove();
        mapRef.current = null;
        setMapReady(false);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Update basemap style — re-create style-based layers after style loads
    const prevBasemapRef = useRef(basemap);
    useEffect(() => {
      const map = mapRef.current;
      if (!map || !mapReady) return;
      if (prevBasemapRef.current === basemap) return;
      prevBasemapRef.current = basemap;
      const onStyleLoad = () => setStyleKey((k) => k + 1);
      map.on("style.load", onStyleLoad);
      map.setStyle(resolveMapStyle(basemap));
      return () => {
        map.off("style.load", onStyleLoad);
      };
    }, [basemap, mapReady]);

    // Track previous selectedId separately so marker sync effect doesn't re-run on selection changes
    const prevSelectedRef = useRef<number | null>(null);

    // RAF-based marker position updates — batch position changes into a single frame
    const pendingPositionsRef = useRef<
      Map<number, { lng: number; lat: number }>
    >(new Map());
    const rafIdRef = useRef<number | null>(null);

    function flushPendingPositions() {
      const map = mapRef.current;
      if (!map) return;
      pendingPositionsRef.current.forEach((pos, id) => {
        const marker = markersRef.current.get(id);
        if (!marker) return;
        marker.setLngLat([pos.lng, pos.lat]);
        const el = marker.getElement();
        el.setAttribute("data-lng", String(pos.lng));
        el.setAttribute("data-lat", String(pos.lat));
        if (popupRef.current && id === prevSelectedRef.current) {
          popupRef.current.setLngLat([pos.lng, pos.lat]);
        }
      });
      pendingPositionsRef.current.clear();
      rafIdRef.current = null;
    }

    function schedulePositionUpdate(id: number, lng: number, lat: number) {
      pendingPositionsRef.current.set(id, { lng, lat });
      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(flushPendingPositions);
      }
    }

    // Sync markers — only for structural changes (add/remove), appearance changes happen inline
    useEffect(() => {
      const map = mapRef.current;
      if (!map || !mapReady) return;
      // Wait until IndexedDB prefs are loaded (zoom + popupDismissed)
      if (!zoomPrefResolved) return;

      const currentIds = new Set(markersRef.current.keys());
      const vehicleIds = new Set(
        vehicles.filter((v) => validCoord(v.lat, v.lng)).map((v) => v.id),
      );

      // Remove stale markers
      currentIds.forEach((id) => {
        if (!vehicleIds.has(id)) {
          markersRef.current.get(id)?.remove();
          markersRef.current.delete(id);
        }
      });

      // Add/update markers
      vehicles.forEach((v) => {
        if (!validCoord(v.lat, v.lng)) return;

        const isSelected = v.id === selectedId;
        let marker = markersRef.current.get(v.id);

        if (marker) {
          const el = marker.getElement();
          const prevLng = el.getAttribute("data-lng");
          const prevLat = el.getAttribute("data-lat");
          const lng = String(v.lng);
          const lat = String(v.lat);
          const posChanged = prevLng !== lng || prevLat !== lat;
          const prevCourse = el.getAttribute("data-course");
          const prevStatus = el.getAttribute("data-status");
          const courseChanged =
            prevCourse !==
            String(Number.isFinite(Number(v.course)) ? Number(v.course) : 0);
          const statusChanged = prevStatus !== v.status;

          if (posChanged) {
            // Schedule position update via RAF to batch with other changes
            schedulePositionUpdate(v.id, v.lng!, v.lat!);
          }
          // Only call full updateCarMarkerElement when appearance (course/status/selection) actually changed
          if (
            courseChanged ||
            statusChanged ||
            isSelected !== (prevSelectedRef.current === v.id)
          ) {
            updateCarMarkerElement(el as HTMLDivElement, v, isSelected);
          }
        } else {
          const el = createCarMarkerElement(v, isSelected);
          el.setAttribute("data-lng", String(v.lng));
          el.setAttribute("data-lat", String(v.lat));
          marker = new maplibregl.Marker({ element: el })
            .setLngLat([v.lng!, v.lat!])
            .addTo(map);

          el.addEventListener("click", () => {
            popupDismissedRef.current = false;
            onPopupDismissedChange?.(false);
            if (v.id === selectedIdRef.current) {
              // Same vehicle re-selected — selectedId won't change, so the popup effect
              // won't re-run. Show popup directly (e.g. after user closed it via X).
              showPopup(v);
            } else {
              onSelectVehicle(v.id);
              // Popup effect will handle showing popup with latest data
            }
          });
          markersRef.current.set(v.id, marker);
        }
      });

      // Fit bounds on first load, or on mobile when no vehicle is selected
      // Uses duration:0 so the map is already at correct position when revealed
      const hasValidVehicle = vehicles.some((v) => validCoord(v.lat, v.lng));
      if (autoFitOnLoad && hasValidVehicle && !initialAutoFitDoneRef.current) {
        initialAutoFitDoneRef.current = true;
        fitDoneRef.current = true;
        fitBounds(map, vehicles, fitPadding, fitInset, { duration: 0 });
        setMapVisible(true);
      } else if (vehicles.length > 0) {
        if (!fitDoneRef.current) {
          fitDoneRef.current = true;
        }
        setMapVisible(true);
      }
    }, [
      vehicles,
      selectedId,
      onSelectVehicle,
      fitPadding,
      fitInset,
      mapReady,
      zoomPrefResolved,
    ]);

    // Show popup when vehicle is selected (from sidebar, map click, or arrow nav)
    useEffect(() => {
      if (!selectedId) {
        if (popupRef.current) {
          popupRef.current.remove();
          popupRef.current = null;
        }
        prevSelectedRef.current = null;
        return;
      }
      // Wait until zoom/popup preferences are resolved (loaded from IndexedDB)
      if (!zoomPrefResolved) return;

      // Same vehicle, popup already showing → just update position (handles RAF-moved markers)
      if (selectedId === prevSelectedRef.current) {
        if (popupRef.current) {
          const vehicle = vehicles.find((v) => v.id === selectedId);
          if (vehicle && validCoord(vehicle.lat, vehicle.lng)) {
            popupRef.current.setLngLat([vehicle.lng!, vehicle.lat!]);
          }
        }
        return;
      }
      prevSelectedRef.current = selectedId;

      // Don't re-show popup on arrow nav if user previously closed it
      if (popupDismissedRef.current) return;

      const vehicle = vehicles.find((v) => v.id === selectedId);
      if (vehicle) {
        showPopup(vehicle);
        onPopupDismissedChange?.(false);
      }
    }, [selectedId, vehicles, zoomPrefResolved]);

    // Fit bounds when vehicles change significantly
    useEffect(() => {
      return () => {
        fitDoneRef.current = false;
      };
    }, [vehicles.length]);

    // Sync geofences
    useEffect(() => {
      const map = mapRef.current;
      if (!map) return;

      // Remove existing geofence layers
      ["geofences-fill", "geofences-line"].forEach((id) => {
        if (map.getLayer(id)) map.removeLayer(id);
      });
      if (map.getSource("geofences")) map.removeSource("geofences");

      if (!showGeofences || !geofences.length) return;

      const features = geofences
        .map(geofenceToFeature)
        .filter(Boolean) as GeoJSON.Feature[];

      map.addSource("geofences", {
        type: "geojson",
        data: { type: "FeatureCollection", features },
      });

      map.addLayer({
        id: "geofences-fill",
        type: "fill",
        source: "geofences",
        paint: {
          "fill-color": ["get", "fill"],
          "fill-opacity": 0.3,
        },
      });

      map.addLayer({
        id: "geofences-line",
        type: "line",
        source: "geofences",
        paint: {
          "line-color": ["get", "color"],
          "line-width": 2,
          "line-opacity": 0.8,
        },
      });
    }, [showGeofences, geofences, styleKey]);

    /* ── Accuracy circles ── */
    useEffect(() => {
      const map = mapRef.current;
      if (!map || !mapReady) return;
      const id = "accuracy-circles";
      const srcId = "accuracy-src";

      // Create source & layer on first run
      if (!map.getSource(srcId)) {
        map.addSource(srcId, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addLayer({
          id,
          type: "fill",
          source: srcId,
          paint: {
            "fill-color": "#3b82f6",
            "fill-opacity": 0.15,
            "fill-outline-color": "#3b82f6",
          },
        } as any);
      }

      return () => {
        try {
          if (map.getLayer(id)) map.removeLayer(id);
          if (map.getSource(srcId)) map.removeSource(srcId);
        } catch {
          /* ignore if map already destroyed */
        }
      };
    }, [mapReady, styleKey]);

    /* ── Accuracy circle data — swapped in place, never rebuilt per flush ── */
    useEffect(() => {
      const map = mapRef.current;
      if (!map || !mapReady) return;
      const srcId = "accuracy-src";
      const active = vehicles.filter(
        (v) => v.lat != null && v.lng != null && (v.accuracy ?? 0) > 0,
      );
      // Cheap signature first: skip the ring rebuild when accuracy is unchanged.
      let sig = String(active.length);
      for (const v of active) sig += `|${v.id}:${v.lat}:${v.lng}:${v.accuracy}`;
      if (accuracySigRef.current === sig) return;
      accuracySigRef.current = sig;
      const features = active.map((v) =>
        circleToGeoJson([v.lng!, v.lat!], v.accuracy! * 0.5, 24),
      );
      (map.getSource(srcId) as maplibregl.GeoJSONSource)?.setData({
        type: "FeatureCollection",
        features,
      });
    }, [mapReady, vehicles, styleKey]);

    /* ── Live route trail for selected vehicle (cached in IndexedDB) ── */
    useEffect(() => {
      const map = mapRef.current;
      if (!map || !mapReady) return;
      const id = "live-route";
      const srcId = "live-route-src";

      if (!map.getSource(srcId)) {
        map.addSource(srcId, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addLayer({
          id,
          type: "line",
          source: srcId,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": "#3b82f6",
            "line-width": 3,
            "line-opacity": 0.6,
          },
        } as any);
      }

      // If route toggle is off or no vehicle selected, clear and bail
      if (!showRoute || selectedId == null) {
        (map.getSource(srcId) as maplibregl.GeoJSONSource)?.setData({
          type: "FeatureCollection",
          features: [],
        });
        return;
      }

      let cancelled = false;
      const cacheKey = `route-${selectedId}`;

      const applyToMap = (positions: any[]) => {
        if (cancelled || !map.getSource(srcId)) return;
        const coords = (positions || [])
          .filter((p: any) => p.latitude != null && p.longitude != null)
          .sort((a: any, b: any) =>
            (a.fixTime || a.serverTime || "").localeCompare(
              b.fixTime || b.serverTime || "",
            ),
          )
          .map((p: any) => [p.longitude, p.latitude] as [number, number]);
        if (coords.length < 2) {
          (map.getSource(srcId) as maplibregl.GeoJSONSource)?.setData({
            type: "FeatureCollection",
            features: [],
          });
          return;
        }
        (map.getSource(srcId) as maplibregl.GeoJSONSource)?.setData({
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: { type: "LineString", coordinates: coords },
              properties: {},
            },
          ],
        });
      };

      (async () => {
        // 1) Show cached data immediately (if available)
        const cached = await cacheGet<{
          positions: any[];
          latestFixTime: string;
        }>("routes", cacheKey);
        if (cancelled) return;
        if (cached && cached.positions.length > 0) {
          applyToMap(cached.positions);
        }

        // 2) Smart refresh: skip API call if vehicle hasn't moved since last cache
        const vehicle = vehicles.find((v) => v.id === selectedId);
        const vehicleLatestTime = vehicle?.lastUpdate;
        if (
          cached &&
          vehicleLatestTime &&
          cached.latestFixTime &&
          vehicleLatestTime <= cached.latestFixTime
        ) {
          return; // Nothing new — keep showing cached data
        }

        // 3) Fetch fresh data
        try {
          const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
          const to = new Date().toISOString();
          const data = (await api.positions.list({
            deviceId: selectedId,
            from,
            to,
          })) as any[];
          if (cancelled) return;
          applyToMap(data);
          // Store both positions and latest timestamp for smarter expiry next time
          const latestFixTime =
            (data || [])
              .map((p: any) => p.fixTime || p.serverTime || "")
              .filter(Boolean)
              .sort()
              .reverse()[0] ||
            vehicleLatestTime ||
            "";
          cacheSet("routes", cacheKey, {
            positions: data,
            latestFixTime,
          }).catch(() => {});
        } catch {
          /* ignore */
        }
      })();

      return () => {
        cancelled = true;
      };
    }, [mapReady, selectedId, showRoute, styleKey]);

    /* ── POI Layer (KML overlay from user settings) ── */
    const { user } = useSession();
    const poiLayerUrl = (user?.attributes as Record<string, string> | undefined)
      ?.poiLayer;

    useEffect(() => {
      const map = mapRef.current;
      if (!map || !mapReady || !poiLayerUrl) return;

      const id = "poi-src";
      let cancelled = false;

      (async () => {
        try {
          const res = await fetch(poiLayerUrl);
          const text = await res.text();
          if (cancelled || !map.getSource(id)) return;
          const data = kmlToGeoJson(text);

          (map.getSource(id) as maplibregl.GeoJSONSource)?.setData(data);
        } catch {
          /* ignore invalid KML URL */
        }
      })();

      return () => {
        cancelled = true;
      };
    }, [mapReady, poiLayerUrl, styleKey]);

    useEffect(() => {
      const map = mapRef.current;
      if (!map || !mapReady) return;
      const id = "poi-src";

      if (!map.getSource(id)) {
        map.addSource(id, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });

        map.addLayer({
          source: id,
          id: "poi-fill",
          type: "fill",
          filter: ["==", "$type", "Polygon"],
          paint: {
            "fill-color": ["coalesce", ["get", "fill"], "#3b82f6"],
            "fill-opacity": 0.3,
          },
        } as any);
        map.addLayer({
          source: id,
          id: "poi-line",
          type: "line",
          paint: {
            "line-color": ["coalesce", ["get", "stroke"], "#3b82f6"],
            "line-width": 2,
          },
        } as any);
        map.addLayer({
          source: id,
          id: "poi-point",
          type: "circle",
          filter: ["==", "$type", "Point"],
          paint: {
            "circle-radius": 5,
            "circle-color": ["coalesce", ["get", "icon-color"], "#3b82f6"],
          },
        } as any);
        map.addLayer({
          source: id,
          id: "poi-label",
          type: "symbol",
          layout: {
            "text-field": ["coalesce", ["get", "name"], ""],
            "text-anchor": "top",
            "text-offset": [0, 1.5],
            "text-size": 11,
          },
          paint: { "text-halo-color": "white", "text-halo-width": 1 },
        } as any);
      }

      return () => {
        ["poi-label", "poi-point", "poi-line", "poi-fill"].forEach((l) => {
          try {
            if (map.getLayer(l)) map.removeLayer(l);
          } catch {
            /* ignore */
          }
        });
        try {
          if (map.getSource(id)) map.removeSource(id);
        } catch {
          /* ignore */
        }
      };
    }, [mapReady, styleKey]);

    /* ── Fly to selected vehicle — adaptive zoom ── */
    useEffect(() => {
      const map = mapRef.current;
      if (!map || !mapReady || selectedId == null) return;
      // Wait until zoom pref has been resolved (loaded from IndexedDB or confirmed absent)
      if (!zoomPrefResolved) return;
      const vehicle = vehicles.find((v) => v.id === selectedId);
      if (!vehicle || !validCoord(vehicle.lat, vehicle.lng)) return;
      const zoom = window.innerWidth < 768 ? 14 : 16;
      // map.flyTo({ center: [vehicle.lng!, vehicle.lat!], zoom, duration: 600 });
      map.easeTo({ center: [vehicle.lng!, vehicle.lat!], duration: 600 });
    }, [selectedId, mapReady, zoomPrefResolved]);

    // Handle map clicks (measurement or emulator)
    useEffect(() => {
      const map = mapRef.current;
      if (!map) return;
      if (!measuring && !onMapClick) return;

      const handleClick = (e: maplibregl.MapMouseEvent) => {
        const { lng, lat } = e.lngLat;
        if (onMapClick) {
          onMapClick(lat, lng);
        }
        if (measuring) {
          // Add marker
          const el = document.createElement("div");
          el.style.cssText =
            "width:10px;height:10px;border-radius:50%;background:#f59e0b;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4);";
          const marker = new maplibregl.Marker({ element: el })
            .setLngLat([lng, lat])
            .addTo(map);
          measureLineRef.current.push(marker);
          measurePointsRef.current.push({ lng, lat });

          // Update total distance
          const pts = measurePointsRef.current;
          if (pts.length >= 2) {
            const last = pts[pts.length - 1]!;
            const prev = pts[pts.length - 2]!;
            measureTotalKmRef.current += haversineKm(
              prev.lng,
              prev.lat,
              last.lng,
              last.lat,
            );
          }
        }
      };

      map.on("click", handleClick);
      return () => {
        map.off("click", handleClick);
      };
    }, [measuring, onMapClick]);

    // Fallback: show map after 3s even if fitBounds never triggered (no vehicles/slow data)
    useEffect(() => {
      if (mapVisible) return;
      mapVisibleTimerRef.current = setTimeout(() => setMapVisible(true), 3000);
      return () => {
        if (mapVisibleTimerRef.current)
          clearTimeout(mapVisibleTimerRef.current);
      };
    }, [mapVisible]);

    return (
      <>
        <div
          ref={containerRef}
          className={`h-full w-full ${className} ${!mapVisible ? "opacity-0" : ""}`}
        />

        {/* Accumulator editor modal */}
        {accEditOpen && (
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60"
            onClick={() => setAccEditOpen(false)}
          >
            <div
              className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-base font-semibold mb-4">
                {t("posField_editAccumulators")}
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    {t("posField_editHours")}
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={editHours}
                    onChange={(e) => setEditHours(e.target.value)}
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    {t("posField_editDistance")}
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={editDistance}
                    onChange={(e) => setEditDistance(e.target.value)}
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary"
                  />
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={() => setAccEditOpen(false)}
                  className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                >
                  {t("posField_cancel")}
                </button>
                <button
                  onClick={async () => {
                    if (accVehicleId == null) return;
                    setAccSaving(true);
                    try {
                      const payload: Record<string, unknown> = {
                        deviceId: accVehicleId,
                      };
                      const parsedH = parseFloat(editHours);
                      const parsedD = parseFloat(editDistance);
                      payload.hours = Number.isFinite(parsedH)
                        ? parsedH * 3600000
                        : 0;
                      payload.totalDistance = Number.isFinite(parsedD)
                        ? parsedD * 1000
                        : 0;
                      await api.devices.putAccumulators(accVehicleId, payload);
                      setAccEditOpen(false);
                    } catch (e) {
                      console.error("Failed to save accumulators", e);
                    } finally {
                      setAccSaving(false);
                    }
                  }}
                  disabled={accSaving}
                  className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {accSaving ? t("saving") : t("posField_save")}
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  },
);

function fitBounds(
  map: maplibregl.Map | null,
  vehicles: Vehicle[],
  basePadding: number,
  insets: { left?: number; bottom?: number } = {},
  extraOptions: Record<string, unknown> = {},
  paddingRatio = 0.1, // 預設 10% padding
) {
  if (!map) return;
  const withCoords = vehicles.filter((v) => validCoord(v.lat, v.lng));
  if (withCoords.length === 0) return;

  const container = map.getContainer();
  const width = container?.clientWidth ?? 0;
  const height = container?.clientHeight ?? 0;

  // 若左側仍有 inset（例如側欄或控制項佔位），先扣掉再算可用寬度的 10%，避免單側過度留白
  const insetLeft = Math.max(0, insets.left ?? 0);
  const insetBottom = Math.max(0, insets.bottom ?? 0);
  const usableWidth = Math.max(0, width - insetLeft);
  const usableHeight = Math.max(0, height - insetBottom);

  const ratioX = Math.round(usableWidth * paddingRatio);
  const ratioY = Math.round(usableHeight * paddingRatio);

  const padding = {
    top: Math.max(basePadding, ratioY),
    right: Math.max(basePadding, ratioX),
    left: insetLeft + Math.max(basePadding, ratioX),
    bottom: insetBottom + Math.max(basePadding, ratioY),
  };

  const bounds = new maplibregl.LngLatBounds();
  withCoords.forEach((v) => bounds.extend([v.lng!, v.lat!]));
  map.fitBounds(bounds, { padding, maxZoom: 14, ...extraOptions });
}

export default FleetMapLibre;

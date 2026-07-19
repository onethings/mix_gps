// Popup display field settings — persisted in localStorage
// Controls which info fields appear in the vehicle marker popup

export interface PopupFieldSetting {
  key: string;
  label: string;
  default: boolean;
}

export const POPUP_FIELDS: PopupFieldSetting[] = [
  { key: 'speed', label: 'Speed', default: true },
  { key: 'ignition', label: 'Ignition', default: true },
  { key: 'updated', label: 'Updated', default: true },
  { key: 'address', label: 'Address', default: true },
  { key: 'driver', label: 'Driver', default: false },
  { key: 'accumulators', label: 'Engine Hours & Odometer', default: true },
  { key: 'todayMileage', label: 'Today Mileage', default: true },
  { key: 'replayLink', label: 'Replay Link', default: true },
];

const STORAGE_KEY = 'popup-display-fields';

function getDefaults(): Record<string, boolean> {
  const map: Record<string, boolean> = {};
  POPUP_FIELDS.forEach((f) => { map[f.key] = f.default; });
  return map;
}

export function loadPopupSettings(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaults();
    const parsed = JSON.parse(raw);
    // Merge with defaults to ensure all keys exist
    const defaults = getDefaults();
    return { ...defaults, ...parsed };
  } catch {
    return getDefaults();
  }
}

export function savePopupSetting(key: string, value: boolean): Record<string, boolean> {
  const settings = loadPopupSettings();
  settings[key] = value;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  return settings;
}

export function resetPopupSettings(): Record<string, boolean> {
  const defaults = getDefaults();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));
  return defaults;
}

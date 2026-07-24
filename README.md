# Mix GPS — Open Source Fleet Tracking Platform

> A fleet management frontend built with React 19 + TypeScript + Vite 6, based on the Traccar API.
>
> This project is a **TypeScript rewrite** of the original [Fleetly](https://github.com/sathasivamrangasamy/fleetly) project.

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-06B6D4?logo=tailwindcss)
![MapLibre](https://img.shields.io/badge/MapLibre-5-00A5E4?logo=maplibre)
![License](https://img.shields.io/badge/License-MIT-green)

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [Build](#build)
- [Deploy to Cloudflare Pages](#deploy-to-cloudflare-pages)
- [Deploy Cloudflare Worker Proxy](#deploy-cloudflare-worker-proxy)
- [About demo3.traccar.org Test Server](#about-demo3traccarorg-test-server)
- [Project Structure](#project-structure)
- [Vehicle Marker System](#vehicle-marker-system)
- [Map Style](#map-style)
- [Multi-language](#multi-language)
- [Credits & Attribution](#credits--attribution)
- [License](#license)

---

## Features

### Core Pages

| Page | Route | Description |
|------|-------|-------------|
| Dashboard | `/dashboard` | KPI cards, live map, fleet status table, WebSocket connection indicator |
| Live Tracking | `/tracking` | MapLibre map, vehicle SVG markers, 3-panel layout, basemap switcher, geofence toggle, ruler measurement |
| Shared View | `/shared` | Shareable live tracking view, no login required, real-time vehicle positions |
| Devices | `/devices` | Vehicle list, stats cards, search, CRUD, CSV import/export, sharing, signal/battery/IMEI display |
| Vehicle Profile | `/devices/:id` | Detailed vehicle info, real-time stats, trips, maintenance history |
| Drivers | `/drivers` | Driver CRUD, name/ID/phone/email/license |
| Trips | `/trips` | Trip history (1/3/7/30 days), CSV export |
| Fuel Management | `/fuel` | Fuel statistics, vehicle fuel progress bars, average utilization |
| Maintenance | `/maintenance` | Maintenance record CRUD |
| Logistics | `/logistics` | Order management (localStorage), status flow (pending → in transit → delivered) |
| Route Planning | `/route-planning` | Route plan management (localStorage) |
| Replay | `/replay` | Load route → play/pause/seek, position info display |
| Alerts | `/alerts` | Real-time WebSocket alerts, ignore/resolve |
| Geofences | `/geofences` | Geofence CRUD, WKT editor, map display |
| Orders | `/orders` | Order CRUD (localStorage), status/customer/driver |
| Events | `/events` | Event timeline, type filter, search, real-time push |
| Reports | `/reports` | Combined/route/events/geofences/trips/stops/summary/chart/logs/scheduled reports |

### Settings (15 Pages)

| Setting | Description |
|---------|-------------|
| Preferences | User profile, map, language |
| Server Settings | Global server options |
| Users | User account CRUD |
| Devices | Device registry |
| Groups | Device grouping |
| Notifications | Event notification rules |
| Commands | Saved commands |
| Calendars | Business calendars |
| Drivers | Driver records |
| Maintenance | Service intervals |
| Computed Attributes | Custom computed fields |
| Permissions | Object permission linking |
| Announcements | System announcements |
| Third-party Connections | MQTT/HTTP integrations |

---

## Tech Stack

| Category | Technology |
|----------|-----------|
| Framework | React 19 + TypeScript 5.7 |
| Build Tool | Vite 6 |
| Styling | Tailwind CSS 3.4 + shadcn/ui |
| Map | MapLibre GL JS 5 |
| Icons | Lucide React |
| Routing | React Router 7 |
| Languages | 106 languages (Gemini web translations) |

---

## Quick Start


### Prerequisites

- Node.js 18+
- npm 9+
- A Traccar server (you can use the public test server `demo3.traccar.org`)

### Installation & Development

```bash
# 1. Clone the repository
git clone <your-repo-url>
cd mix_ts_open

# 2. Install dependencies
npm install

# 3. Start the dev server (default port 3001)
npm run dev
```

> **⚠️ Important:** The dev server runs on **port 3001**, **not** the Vite default port 3000.  
> Always open **http://localhost:3001** in your browser.

Open `http://localhost:3001` in your browser. The Vite dev server automatically proxies `/api/*` requests to `VITE_TRACCAR_URL` (defaults to `https://demo3.traccar.org`).

**How the proxy works** — the actual configuration in `vite.config.ts`:

```ts
server: {
  port: 3001,
  proxy: {
    '/api/socket': {
      target: 'ws://demo3.traccar.org',  // WebSocket for real-time data
      ws: true,
    },
    '/api': {
      target: 'https://demo3.traccar.org', // REST API proxy
      changeOrigin: true,
    },
  },
}
```

This means:
- All `/api/*` requests from the frontend (e.g. `/api/devices`, `/api/positions`) are forwarded to the Traccar server behind the scenes
- **You never access the Traccar server URL directly** — always use `http://localhost:3001` to see the enhanced React UI
- If you set `VITE_TRACCAR_URL` to your own server, the proxy target changes accordingly, but you **still visit `http://localhost:3001`** in your browser

> **Common mistake:** Users sometimes open the Traccar server's own web UI (e.g. `http://localhost:8082` or their own server's URL) and expect to see the enhanced interface. That URL serves the **original Traccar UI**, not this project. You must access this project's **own dev server** at `http://localhost:3001` to see the React-enhanced interface.

### Live Demo

A live demo instance is available at **[https://fleetlymm.pages.dev/](https://fleetlymm.pages.dev/)**.

1. Register an account on **demo3.traccar.org**
2. Use the same credentials to log in at the demo URL
3. Explore all features instantly — no setup required

> **⚠️ Important:** This demo instance is for **development testing and evaluation only**. It is **not for commercial use**. For production or commercial use, please set up your own Traccar server and deploy your own instance.

### Login

When using the **demo3.traccar.org** public test server, log in with an account registered on that server.
> demo3.traccar.org is Traccar's official public demo environment shared by everyone — data may be cleared at any time.

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_TRACCAR_URL` | Traccar server URL (used as the dev proxy target and production API endpoint) | `https://demo3.traccar.org` |
| `VITE_BASE_PATH` | Base path for subdirectory deployment | `/` |

> **Important:** `VITE_TRACCAR_URL` only controls where API requests are forwarded to — it does **not** change the URL you visit in the browser.  
> You should **always access the dev server at `http://localhost:3001`** (or your production URL), **not** the Traccar server URL directly.

### Env File Reference

| File | Usage |
|------|-------|
| `.env.local` | Local development (added to `.gitignore`, never committed) |
| `.env.production` | Production build (set your own Traccar URL here) |
| `.env.development` | Dev environment overrides (can be left empty to use defaults) |

---

## Build

```bash
# Build static files to dist/
npm run build

# Preview the build result
npm run preview
```

The output `dist/` directory is a fully static website ready for deployment to any static hosting platform.

---

## Deploy to Cloudflare Pages

### Method 1: Via Wrangler CLI

```bash
# 1. Install Wrangler
npm install -g wrangler

# 2. Login to Cloudflare
npx wrangler login

# 3. Build the project
npm run build

# 4. Deploy to Cloudflare Pages
npx wrangler pages deploy dist/

# 5. (Optional) Specify a project name
npx wrangler pages deploy dist/ --project-name=my-gps-tracking
```

### Method 2: Via Cloudflare Dashboard (Git Integration)

1. Push your project to GitHub/GitLab
2. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**
3. Select your repository
4. Build settings:

| Setting | Value |
|---------|-------|
| Framework preset | **Vite** |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory (optional) | `mix_ts_open` (if your repo root is not this folder) |

5. **Environment variables** (add in Pages settings):

| Variable | Value |
|----------|-------|
| `VITE_TRACCAR_URL` | `https://your-traccar-server-url` |
| `NODE_VERSION` | `18` or `20` |

6. After deployment, Cloudflare Pages generates a `<project>.pages.dev` URL.

### SPA Routing

The `public/_redirects` file already includes the SPA routing rule to serve all paths via `index.html`:

```
/*    /index.html   200
```

Cloudflare Pages reads this file automatically. For other hosting platforms, ensure equivalent SPA routing is configured.

---

## Deploy Cloudflare Worker Proxy

> **Why do I need a Worker proxy?**
>
> Browsers enforce CORS restrictions, so direct API calls from the frontend to Traccar may be blocked. A Cloudflare Worker proxy can:
> - Solve CORS (cross-origin) issues
> - Hide your real Traccar server URL
> - Add caching, rate limiting, and other enhancements

### Create the Worker

Create a new Worker project (or edit directly in the Cloudflare Dashboard):

```js
// Cloudflare Worker Proxy Example
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const target = 'https://your-traccar-server-url'; // Replace with your Traccar server

    const proxyUrl = target + url.pathname + url.search;

    const proxyRequest = new Request(proxyUrl, {
      method: request.method,
      headers: request.headers,
      body: request.body,
    });

    const response = await fetch(proxyRequest);

    // Add CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Credentials': 'true',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const newResponse = new Response(response.body, response);
    Object.entries(corsHeaders).forEach(([key, value]) => {
      newResponse.headers.set(key, value);
    });

    return newResponse;
  },
};
```

### Deploy the Worker

```bash
# 1. Install Wrangler
npm install -g wrangler

# 2. Login
npx wrangler login

# 3. Deploy
npx wrangler deploy

# 4. After deployment you'll get a Worker URL, e.g.:
#    https://traccar-proxy.your-subdomain.workers.dev
```

### Update Frontend Environment Variable

Set `VITE_TRACCAR_URL` to your Worker URL:

```bash
# .env.production
VITE_TRACCAR_URL=https://traccar-proxy.your-subdomain.workers.dev
```

### WebSocket Support

For real-time tracking to work through the proxy, add WebSocket forwarding logic:

```js
async function handleWebSocket(request, target) {
  const url = new URL(request.url);
  const wsTarget = target.replace(/^http/, 'ws') + url.pathname;

  const [client, server] = Object.values(new WebSocketPair());

  server.accept();
  
  const ws = new WebSocket(wsTarget);
  ws.accept();

  server.addEventListener('message', (event) => ws.send(event.data));
  ws.addEventListener('message', (event) => server.send(event.data));
  
  server.addEventListener('close', () => ws.close());
  ws.addEventListener('close', () => server.close());

  return new Response(null, { status: 101, webSocket: client });
}
```

---

## About demo3.traccar.org Test Server

### What is it?

`demo3.traccar.org` is an official **public demo server** provided by [Traccar](https://www.traccar.org/), running Traccar v6.14.5. Anyone can register and use it for free.

### Live Demo Instance

A pre-deployed live demo is available at **[https://fleetlymm.pages.dev/](https://fleetlymm.pages.dev/)**.

- Register on **demo3.traccar.org** → log in at the demo URL → start testing immediately
- This instance is deployed from this very project and is continuously updated

> **⚠️ This demo is for development testing only — not for commercial use.**

### Use Cases

- **Feature testing** — Test all frontend functionality during development
- **Proof of Concept (PoC)** — Quickly validate system feasibility before production deployment
- **Tutorials & demos** — Showcase the fleet management system without setting up your own server
- **API compatibility verification** — Ensure frontend compatibility with the Traccar API

### Role in This Project

The Vite dev server is configured to proxy `/api/*` requests to `demo3.traccar.org` by default:

- **Dev mode**: After `npm run dev`, all API requests are proxied to the demo server
- **Production mode**: Set `VITE_TRACCAR_URL` to point to your own Traccar server
- **Login**: Use credentials registered on the demo server

> **⚠️ Common pitfall:** You must access the **frontend dev server** at `http://localhost:3001` to see the enhanced React interface.  
> Visiting the Traccar server directly (e.g. `http://localhost:8082` or `https://demo3.traccar.org`) serves the **original Traccar web UI**, not this project.

### Important Notes

| Item | Description |
|------|-------------|
| ⚠️ **Data is not permanent** | Demo data may be cleared or reset at any time |
| ⚠️ **Shared by everyone** | Devices, geofences, and other data you create may be visible or modifiable by others |
| ⚠️ **No performance guarantee** | As a free public service, latency or instability may occur |
| ⚠️ **No sensitive data** | Do not use real vehicle locations, customer info, or other sensitive data on demo3 |
| ✅ **Recommended use** | Development testing, feature validation, UI tweaks only |
| ✅ **Production use** | Set up your own Traccar server (see [Traccar installation guide](https://www.traccar.org/documentation/)) |

### Switch to Your Own Server

```bash
# Method 1: Using environment variables (development)
echo "VITE_TRACCAR_URL=http://localhost:8082" > .env.local

# Method 2: Modify .env.production (production build)
# Edit .env.production and change VITE_TRACCAR_URL to your server URL

# Method 3: Set environment variable in your hosting platform
# Add VITE_TRACCAR_URL in Cloudflare Pages / Firebase / Vercel settings
```

> **🐛 CORS issue when using a production build (no Vite proxy)**
>
> In development mode (`npm run dev`), the Vite dev server proxies all `/api/*` requests, so there are no cross-origin issues.  
> However, when you deploy the production build (the static files in `dist/`) to a separate domain — e.g. `https://myfleet.pages.dev` — the frontend JavaScript runs on that domain and makes direct `fetch()` calls to your Traccar server. The browser blocks these requests unless the Traccar server explicitly allows cross-origin access via CORS headers. ([MDN: Access-Control-Allow-Origin](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Access-Control-Allow-Origin))
>
> **Solution — configure `web.origin` on your Traccar server:**
>
> Edit your Traccar configuration file (`traccar.xml`, typically at `/opt/traccar/conf/traccar.xml` on Linux, or `C:\Program Files\Traccar\conf\traccar.xml` on Windows) and add or uncomment the `web.origin` entry ([Traccar Configuration File Reference](https://www.traccar.org/configuration-file/)):
>
> ```xml
> <!-- Allow a specific frontend domain (recommended for production) -->
> <entry key='web.origin'>https://myfleet.pages.dev</entry>
>
> <!-- Or allow any origin (only for development/testing) -->
> <!-- <entry key='web.origin'>*</entry> -->
> ```
>
> This tells Traccar to include the `Access-Control-Allow-Origin` header in its API responses, which authorizes the browser to accept the cross-origin response.
>
> **How it works:**
>
> ```
> ┌─────────────────────┐         fetch('/api/devices')         ┌──────────────────┐
> │  Frontend (React)   │ ──── with Origin: https://myfleet... ──▶│ Traccar Server   │
> │  https://myfleet...  │ ◀──── Access-Control-Allow-Origin ─────│  http://localhost │
> │  (Cloudflare Pages)  │         : https://myfleet...           │  :8082            │
> └─────────────────────┘                                        └──────────────────┘
> ```
>
> The `web.origin` value in Traccar's config is used as the `Access-Control-Allow-Origin` response header value. Set it to your frontend's exact domain (or `*` during development).
>
> **⚠️ Limitation: Traccar's `web.origin` only accepts a single origin or `*`.**  
> The HTTP `Access-Control-Allow-Origin` header itself only supports one specific origin or the wildcard `*` ([MDN: Access-Control-Allow-Origin](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Access-Control-Allow-Origin)). If you need **multiple frontend domains** to access the same Traccar server, you have two options:
>
> **Option A — Use a reverse proxy (nginx, Apache, Caddy)**  
> Configure your proxy to read the incoming `Origin` header and dynamically set `Access-Control-Allow-Origin` to match it:
> ```nginx
> # nginx example — dynamically echoes back the request origin
> location /api/ {
>     proxy_pass http://localhost:8082;
>     proxy_set_header Host $host;
>     add_header Access-Control-Allow-Origin $http_origin always;
>     add_header Access-Control-Allow-Credentials true;
>     add_header Vary Origin;
> }
> ```
>
> **Option B — Use a Cloudflare Worker (recommended if already on Cloudflare)**  
> The [Cloudflare Worker proxy](#deploy-cloudflare-worker-proxy) documented above can handle multiple origins by inspecting the request's `Origin` header and responding with the matching value — no Traccar config changes needed.

---

## Project Structure

```
mix_ts_open/
├── public/                  # Static assets
│   ├── _redirects           # Cloudflare Pages SPA routing rules
│   ├── favicon.svg          # Site favicon
│   ├── manifest.json        # PWA manifest
│   ├── sw.js                # Service Worker
│   ├── icons/               # App icons
│   ├── markers/             # Map marker SVGs
│   └── custom/              # Custom resources
├── src/                     # Source code
│   ├── main.tsx             # Entry point
│   ├── App.tsx              # Root component
│   ├── index.css            # Global styles
│   ├── components/          # Shared components
│   │   ├── ui/              # shadcn-style UI components
│   │   ├── common/          # Common components (EmptyState, StatusBadge, etc.)
│   │   ├── layout/          # AppShell, Sidebar, Topbar, TabBar
│   │   ├── dashboard/       # KpiCard, MiniMap, AlertsPanel
│   │   ├── tracking/        # FleetMapLibre, MapView, VehicleList, carMarkerSvg
│   │   ├── geofences/       # GeofenceEditorDialog
│   │   ├── vehicles/        # VehicleForm
│   │   ├── drivers/         # DriverForm
│   │   └── reports/         # ReportToolbar, ReportTypeTabs
│   ├── pages/               # Page components
│   │   ├── reports/         # Report sub-pages
│   │   ├── settings/        # 18 settings pages
│   │   └── *.tsx            # Feature pages
│   ├── hooks/               # Custom hooks
│   ├── context/             # React Context providers
│   ├── lib/                 # Utilities (API, Geo, i18n, CSV, cache)
│   ├── types/               # TypeScript type definitions
│   └── language/            # Multi-language translations
├── .env.local               # Local env vars (gitignored)
├── .env.production          # Production env vars
├── .env.development         # Development env vars
├── index.html               # HTML entry
├── vite.config.ts           # Vite configuration
├── tsconfig.json            # TypeScript configuration
├── tailwind.config.ts       # Tailwind CSS configuration
├── postcss.config.js        # PostCSS configuration
└── package.json             # Dependencies and scripts
```

---

## Vehicle Marker System

Map markers use SVG icons (`public/markers/`) dynamically loaded based on vehicle status and type:

- **Status**: moving / idle / parking / offline / alert
- **Types**: car, truck, bus, van, taxi, motorcycle, bicycle, scooter, plane, helicopter, ship, boat, train, tram, pickup, trailer, tractor, crane, camper, person, animal (20 types)
- **Auto-detection**: Matches the correct icon based on `category` or `model` field
- **Effects**: Glow ring, rotation angle, selection outline, name labels

---

## Map Style

The map uses MapLibre GL JS for rendering, with a custom basemap style defined in `liberty.json` (MapLibre Style JSON format).

### Changing the Map Style

To change the basemap style, you need to modify the following **3 files**:

| File | Purpose |
|------|---------|
| `src/components/tracking/FleetMapLibre.tsx` | Main live tracking map component |
| `src/components/geofences/GeofenceEditorDialog.tsx` | Geofence editor map |
| `src/pages/SharedViewPage.tsx` | Shared view page map |

Search for `STYLE_ROAD` (or `TILE_STYLE`) in each file and replace the value with your style JSON URL:

```ts
// Use a remote style
const STYLE_ROAD = 'https://your-server.com/your-style.json';

// Or use a local style (place in public/ directory)
const STYLE_ROAD = '/custom/your-style.json';
```

### Customizing liberty.json

To use a local `liberty.json`:
1. Place the file in `public/custom/liberty.json`
2. Change the URL in all 3 files to `/custom/liberty.json`
3. Ensure the tile source (`sources` → `tiles` URL) in `liberty.json` is accessible

### Satellite Map Mode

The satellite style is defined as the `STYLE_SATELLITE` constant in `FleetMapLibre.tsx` (using Esri World Imagery). No separate JSON file is needed. To change the satellite tile source, simply edit the `tiles` URL in that constant.

---

## Multi-language

Supports 106 languages sourced from Traccar's official translations. The language preference is stored in `localStorage` (`mixok-locale`). Translation lookup order: current language → English → fallback key.

---

## Credits & Attribution

This project is a **TypeScript rewrite** of the original **[Fleetly](https://github.com/sathasivamrangasamy/fleetly)** project by [sathasivamrangasamy](https://github.com/sathasivamrangasamy).

The original Fleetly project is a fleet management frontend based on the Traccar API, built with vanilla JavaScript. This version ports the entire codebase to **React 19 + TypeScript + Vite 6** while retaining the same feature set and API compatibility.

We are grateful for the original work and encourage you to check out the [source project](https://github.com/sathasivamrangasamy/fleetly).

---

## License

This project is licensed under the MIT License. See the [LICENSE](./LICENSE) file for details.

---

## Links

- [Traccar Official Website](https://www.traccar.org/)
- [Traccar API Reference](https://www.traccar.org/api-reference/)
- [Original Fleetly Project](https://github.com/sathasivamrangasamy/fleetly)
- [MapLibre GL JS](https://maplibre.org/)
- [shadcn/ui](https://ui.shadcn.com/)
- [Vite](https://vitejs.dev/)
- [Cloudflare Pages](https://pages.cloudflare.com/)

---

---

# Mix GPS — 開源車隊追蹤平台

> 基於 Traccar API 的車隊管理前端，使用 React 19 + TypeScript + Vite 6 建置。
>
> 本專案是原始 [Fleetly](https://github.com/sathasivamrangasamy/fleetly) 專案的 **TypeScript 重寫版**。

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-06B6D4?logo=tailwindcss)
![MapLibre](https://img.shields.io/badge/MapLibre-5-00A5E4?logo=maplibre)
![License](https://img.shields.io/badge/License-MIT-green)

---

## 📋 目錄

- [功能介紹](#功能介紹-1)
- [技術棧](#技術棧-1)
- [快速開始](#快速開始-1)
- [環境變數](#環境變數-1)
- [建置](#建置-1)
- [部署至 Cloudflare Pages](#部署至-cloudflare-pages-1)
- [部署 Cloudflare Worker 代理](#部署-cloudflare-worker-代理-1)
- [關於 demo3.traccar.org 測試伺服器](#關於-demo3traccarorg-測試伺服器-1)
- [專案結構](#專案結構-1)
- [車輛標記系統](#車輛標記系統)
- [地圖樣式設定 (Map Style)](#地圖樣式設定-map-style)
- [多語言](#多語言-1)
- [致謝與聲明](#致謝與聲明)
- [授權](#授權-1)

---

## 功能介紹

### 核心功能

| 頁面 | 路徑 | 功能 |
|------|------|------|
| 儀表板 | `/dashboard` | KPI 卡片、即時地圖、車隊狀態表、WebSocket 連線指示 |
| 即時追蹤 | `/tracking` | MapLibre 地圖、車輛 SVG 標記、3 面板佈局、底圖切換、圍欄開關、尺規測量 |
| 共享檢視 | `/shared` | 可分享的即時追蹤檢視，無需登入，顯示車輛即時位置 |
| 設備管理 | `/devices` | 車輛列表、統計卡片、搜尋、CRUD、CSV 匯入/匯出、分享、訊號/電量/IMEI 顯示 |
| 車輛詳情 | `/devices/:id` | 車輛詳細資訊、即時統計、行程記錄、維修歷史 |
| 駕駛員 | `/drivers` | 駕駛員 CRUD、姓名/ID/電話/Email/駕照 |
| 行程記錄 | `/trips` | 行程查詢 (1/3/7/30 天)、CSV 匯出 |
| 油耗管理 | `/fuel` | 油耗統計、車輛油量進度條、平均利用率 |
| 車輛維修 | `/maintenance` | 維修記錄 CRUD |
| 物流管理 | `/logistics` | 訂單管理 (localStorage)、狀態流 (待處理→運輸中→送達) |
| 路線規劃 | `/route-planning` | 路線計畫管理 (localStorage) |
| 軌跡回放 | `/replay` | 載入路線→播放/暫停/跳轉、位置資訊顯示 |
| 警報通知 | `/alerts` | 即時 WebSocket 警報、忽略/顯示已解決 |
| 地理圍欄 | `/geofences` | 圍欄 CRUD、WKT 編輯器、地圖顯示 |
| 訂單管理 | `/orders` | 訂單 CRUD (localStorage)、狀態/客戶/駕駛員 |
| 事件日誌 | `/events` | 事件時間線、類型篩選、搜尋、即時推送 |
| 報表統計 | `/reports` | 綜合/路線/事件/圍欄/行程/停靠/摘要/圖表/日誌/排程報表 |

### 設定管理 (15 頁)

| 設定 | 說明 |
|------|------|
| 偏好設置 | 用戶資料、地圖、語言 |
| 伺服器設定 | 全域伺服器選項 |
| 用戶管理 | 用戶帳號 CRUD |
| 設備管理 | 設備註冊表 |
| 分組管理 | 設備分組 |
| 通知規則 | 事件通知條件 |
| 指令管理 | 儲存常用指令 |
| 日曆管理 | 營運日曆 |
| 駕駛員 | 駕駛員記錄 |
| 維修管理 | 保養間隔 |
| 計算屬性 | 自訂計算欄位 |
| 權限管理 | 物件關聯權限 |
| 公告管理 | 系統公告 |
| 第三方連接 | MQTT/HTTP 串接 |

---

## 技術棧

| 類別 | 技術 |
|------|------|
| 框架 | React 19 + TypeScript 5.7 |
| 建置工具 | Vite 6 |
| 樣式 | Tailwind CSS 3.4 + shadcn/ui |
| 地圖 | MapLibre GL JS 5 |
| 圖示 | Lucide React |
| 路由 | React Router 7 |
| 語言 | 106 國語言 (Traccar 翻譯) |

---

## 快速開始

### 前置需求

- Node.js 18+
- npm 9+
- 一個 Traccar 伺服器（可使用公共測試伺服器 `demo3.traccar.org`）

### 安裝與執行

```bash
# 1. 複製專案
git clone <your-repo-url>
cd mix_ts_open

# 2. 安裝相依套件
npm install

# 3. 啟動開發伺服器（預設 port 3001）
npm run dev
```

> **⚠️ 重要：** 開發伺服器執行在 **port 3001**，**不是** Vite 預設的 port 3000。  
> 請務必在瀏覽器開啟 **http://localhost:3001**。

啟動後開啟瀏覽器至 `http://localhost:3001`，Vite 開發伺服器會自動將 `/api/*` 請求代理至 `VITE_TRACCAR_URL`（預設 `https://demo3.traccar.org`）。

**代理運作方式** — `vite.config.ts` 中的實際設定：

```ts
server: {
  port: 3001,
  proxy: {
    '/api/socket': {
      target: 'ws://demo3.traccar.org',  // WebSocket 即時資料
      ws: true,
    },
    '/api': {
      target: 'https://demo3.traccar.org', // REST API 代理
      changeOrigin: true,
    },
  },
}
```

這代表：
- 前端所有的 `/api/*` 請求（例如 `/api/devices`、`/api/positions`）都會在背後轉發到 Traccar 伺服器
- **請勿直接存取 Traccar 伺服器的網址** — 永遠使用 `http://localhost:3001` 才能看到增強的 React 介面
- 如果你設定了 `VITE_TRACCAR_URL` 指向自己的伺服器，代理目標會隨之改變，但你**仍然在瀏覽器存取 `http://localhost:3001`**

> **常見錯誤：** 使用者有時會直接打開 Traccar 伺服器本身的 Web 介面（例如 `http://localhost:8082` 或自己伺服器的網址），以為會看到增強的介面。但那個網址提供的是**原始的 Traccar UI**，不是本專案。你**必須存取本專案的開發伺服器** `http://localhost:3001` 才能看到 React 增強的介面。

### 線上示範

即時線上示範網址：**[https://fleetlymm.pages.dev/](https://fleetlymm.pages.dev/)**

1. 在 **demo3.traccar.org** 註冊帳號
2. 使用同一組帳號密碼登入示範網址
3. 立即體驗所有功能 — 無需任何設定

> **⚠️ 重要：** 此示範站僅供**開發測試與評估使用**，**不得用於商業用途**。商業使用請自行架設 Traccar 伺服器並部署自己的實例。

### 登入

使用 **demo3.traccar.org** 公共測試伺服器時，請使用該伺服器上註冊的帳號密碼登入。
> demo3.traccar.org 為 Traccar 官方提供的公開測試環境，所有人共用，資料可能隨時被清除。

---

## 環境變數

| 變數 | 說明 | 預設值 |
|------|------|--------|
| `VITE_TRACCAR_URL` | Traccar 伺服器 URL（開發模式作為代理目標，生產模式作為 API 端點） | `https://demo3.traccar.org` |
| `VITE_BASE_PATH` | 部署路徑前綴（子目錄部署用） | `/` |

> **重要：** `VITE_TRACCAR_URL` 只控制 API 請求要轉發到哪個伺服器，**不會改變**你在瀏覽器存取的網址。  
> 你**永遠應該存取開發伺服器 `http://localhost:3001`**（或你的正式部署網址），**而不是**直接存取 Traccar 伺服器的網址。

### 環境檔案說明

| 檔案 | 用途 |
|------|------|
| `.env.local` | 本地開發環境（已加入 `.gitignore`，不會上傳） |
| `.env.production` | 正式建置環境（建議修改為自己的 Traccar URL） |
| `.env.development` | 開發環境覆蓋（可留空使用預設值） |

---

## 建置

```bash
# 建置靜態檔案，輸出至 dist/
npm run build

# 預覽建置結果
npm run preview
```

建置完成後 `dist/` 目錄即為完整的靜態網站，可部署至任何靜態托管平台。

---

## 部署至 Cloudflare Pages

### 方法一：透過 Wrangler CLI

```bash
# 1. 安裝 Wrangler
npm install -g wrangler

# 2. 登入 Cloudflare
npx wrangler login

# 3. 建置專案
npm run build

# 4. 部署到 Cloudflare Pages
npx wrangler pages deploy dist/

# 5. （可選）指定專案名稱
npx wrangler pages deploy dist/ --project-name=my-gps-tracking
```

### 方法二：透過 Cloudflare Dashboard（Git 整合）

1. 將專案推送到 GitHub/GitLab
2. 在 [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**
3. 選擇你的專案倉庫
4. 建置設定：

| 設定 | 值 |
|------|------|
| Framework preset | **Vite** |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory（可選） | `mix_ts_open`（如果 repo 根目錄不是此資料夾） |

5. **環境變數**（在 Pages 設定頁面新增）：

| 變數 | 值 |
|------|------|
| `VITE_TRACCAR_URL` | `https://你的-traccar-伺服器網址` |
| `NODE_VERSION` | `18` 或 `20` |

6. 部署完成後，Cloudflare Pages 會自動產生一個 `<project>.pages.dev` 網址。

### SPA 路由設定

`public/_redirects` 檔案已包含 SPA 路由規則，確保所有路徑都導向 `index.html`：

```
/*    /index.html   200
```

Cloudflare Pages 會自動讀取此檔案。如果使用其他托管平台，請確認有對應的 SPA 路由設定。

---

## 部署 Cloudflare Worker 代理

> **為什麼需要 Worker 代理？**
>
> 瀏覽器有 CORS 限制，直接從前端呼叫 Traccar API 可能會被阻擋。透過 Cloudflare Worker 代理，可以：
> - 解決跨域（CORS）問題
> - 隱藏真實的 Traccar 伺服器網址
> - 可加入快取、速率限制等額外功能

### 建立 Worker

建立一個新的 Worker 專案（或直接在 Cloudflare Dashboard 編輯）：

```js
// Cloudflare Worker Proxy 範例
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const target = 'https://你的-traccar-伺服器網址'; // 改成你的 Traccar 伺服器

    const proxyUrl = target + url.pathname + url.search;

    const proxyRequest = new Request(proxyUrl, {
      method: request.method,
      headers: request.headers,
      body: request.body,
    });

    const response = await fetch(proxyRequest);

    // 加入 CORS 標頭
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Credentials': 'true',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const newResponse = new Response(response.body, response);
    Object.entries(corsHeaders).forEach(([key, value]) => {
      newResponse.headers.set(key, value);
    });

    return newResponse;
  },
};
```

### 部署 Worker

```bash
# 1. 安裝 Wrangler
npm install -g wrangler

# 2. 登入
npx wrangler login

# 3. 部署
npx wrangler deploy

# 4. 部署完成後會得到 Worker 網址，例如：
#    https://traccar-proxy.你的子域名.workers.dev
```

### 修改前端環境變數

將 `VITE_TRACCAR_URL` 改為你的 Worker 網址：

```bash
# .env.production
VITE_TRACCAR_URL=https://traccar-proxy.你的子域名.workers.dev
```

### WebSocket 支援

如果 Worker 需要支援 WebSocket（即時追蹤功能），需要在 Worker 中加入 WebSocket 代理邏輯：

```js
async function handleWebSocket(request, target) {
  const url = new URL(request.url);
  const wsTarget = target.replace(/^http/, 'ws') + url.pathname;

  const [client, server] = Object.values(new WebSocketPair());

  server.accept();
  
  const ws = new WebSocket(wsTarget);
  ws.accept();

  server.addEventListener('message', (event) => ws.send(event.data));
  ws.addEventListener('message', (event) => server.send(event.data));
  
  server.addEventListener('close', () => ws.close());
  ws.addEventListener('close', () => server.close());

  return new Response(null, { status: 101, webSocket: client });
}
```

---

## 關於 demo3.traccar.org 測試伺服器

### 這是什麼？

`demo3.traccar.org` 是 [Traccar](https://www.traccar.org/) 官方提供的**公共演示（Demo）伺服器**，執行 Traccar v6.14.5 版本，任何人都可以免費註冊使用。

### 線上示範實例

預先部署的即時示範站：[**https://fleetlymm.pages.dev/**](https://fleetlymm.pages.dev/)

- 在 **demo3.traccar.org** 註冊 → 到示範站登入 → 立即開始測試
- 此實例由此專案建置部署，並持續更新

> **⚠️ 此示範站僅供開發測試用 — 不可用於商業用途。**

### 用途

- **功能測試** — 開發階段測試前端所有功能是否正常
- **概念驗證（PoC）** — 在實際部署前快速驗證系統可行性
- **教學與展示** — 不需要自己架設伺服器即可展示車隊管理系統
- **API 相容性驗證** — 確保前端與 Traccar API 相容

### 在專案中的角色

本專案的 Vite 開發伺服器設定預設將 `/api/*` 請求代理至 `demo3.traccar.org`：

- **開發模式**：`npm run dev` 後，所有 API 請求都會被代理到 demo3 伺服器
- **生產模式**：需設定 `VITE_TRACCAR_URL` 環境變數指向自己的 Traccar 伺服器
- **登入**：使用 demo3 伺服器上的帳號密碼

> **⚠️ 常見錯誤：** 你必須存取**前端開發伺服器** `http://localhost:3001` 才能看到增強的 React 介面。  
> 直接存取 Traccar 伺服器（例如 `http://localhost:8082` 或 `https://demo3.traccar.org`）會看到的是**原始的 Traccar Web UI**，不是本專案。

### 注意事項

| 項目 | 說明 |
|------|------|
| ⚠️ **資料非永久** | demo3 為公共測試環境，所有資料可能隨時被清除或重置 |
| ⚠️ **所有人共用** | 您建立的設備、圍欄等資料其他人也可能看到或修改 |
| ⚠️ **效能不保證** | 作為免費公開服務，可能會有延遲或不穩定的情況 |
| ⚠️ **勿放敏感資料** | 請勿在 demo3 上使用真實的車輛位置、客戶資訊等敏感資料 |
| ✅ **建議用途** | 僅用於開發測試、功能驗證、UI 調整 |
| ✅ **正式使用** | 請架設自己的 Traccar 伺服器（參考 [Traccar 官方安裝指南](https://www.traccar.org/documentation/)） |

### 替換為自己的伺服器

```bash
# 方法 1：使用環境變數（開發模式）
echo "VITE_TRACCAR_URL=http://localhost:8082" > .env.local

# 方法 2：修改 .env.production（正式建置）
# 編輯 .env.production 將 VITE_TRACCAR_URL 改為你的伺服器網址

# 方法 3：部署時在托管平台設定環境變數
# 在 Cloudflare Pages / Firebase / Vercel 的環境變數設定中新增 VITE_TRACCAR_URL
```

> **🐛 CORS 跨域問題（正式部署時）**
>
> 在開發模式（`npm run dev`）下，Vite 開發伺服器會代理所有 `/api/*` 請求，因此不會有跨域問題。  
> 但當你將正式建置的靜態檔案（`dist/` 目錄）部署到另一個網域（例如 `https://myfleet.pages.dev`），前端 JavaScript 會在該網域上直接呼叫你的 Traccar 伺服器。瀏覽器會阻擋這些請求，除非 Traccar 伺服器明確允許跨域存取（透過 CORS 標頭）。（[MDN: Access-Control-Allow-Origin](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Access-Control-Allow-Origin)）
>
> **解決方法 — 在 Traccar 伺服器設定 `web.origin`：**
>
> 編輯 Traccar 設定檔（`traccar.xml`，Linux 通常在 `/opt/traccar/conf/traccar.xml`，Windows 在 `C:\Program Files\Traccar\conf\traccar.xml`），加入或取消註解 `web.origin` 項目（[Traccar 設定檔說明](https://www.traccar.org/configuration-file/)）：
>
> ```xml
> <!-- 指定允許的前端網域（正式環境建議使用） -->
> <entry key='web.origin'>https://myfleet.pages.dev</entry>
>
> <!-- 或允許所有來源（僅開發/測試用） -->
> <!-- <entry key='web.origin'>*</entry> -->
> ```
>
> 這會讓 Traccar 在 API 回應中加入 `Access-Control-Allow-Origin` 標頭，授權瀏覽器接受跨域回應。
>
> **運作原理：**
>
> ```
> ┌─────────────────────┐         fetch('/api/devices')         ┌──────────────────┐
> │  前端 (React)        │ ──── 帶 Origin: https://myfleet... ──▶│ Traccar 伺服器   │
> │  https://myfleet...  │ ◀──── Access-Control-Allow-Origin ─────│  http://localhost │
> │  (Cloudflare Pages)  │         : https://myfleet...           │  :8082            │
> └─────────────────────┘                                        └──────────────────┘
> ```
>
> `web.origin` 的值會作為 `Access-Control-Allow-Origin` 回應標頭的值。請將其設為你前端的確切網域（開發期間可設為 `*`）。
>
> **⚠️ 限制：Traccar 的 `web.origin` 只接受單一網域或 `*`。**  
> HTTP 的 `Access-Control-Allow-Origin` 標頭本身只能指定一個特定來源或萬用字元 `*`（[MDN: Access-Control-Allow-Origin](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Access-Control-Allow-Origin)）。如果你需要**多個前端網域**存取同一個 Traccar 伺服器，有兩種做法：
>
> **方案 A — 使用反向代理（nginx、Apache、Caddy）**  
> 設定代理伺服器讀取請求的 `Origin` 標頭，並動態設定 `Access-Control-Allow-Origin`：
> ```nginx
> # nginx 範例 — 動態回應請求的來源網域
> location /api/ {
>     proxy_pass http://localhost:8082;
>     proxy_set_header Host $host;
>     add_header Access-Control-Allow-Origin $http_origin always;
>     add_header Access-Control-Allow-Credentials true;
>     add_header Vary Origin;
> }
> ```
>
> **方案 B — 使用 Cloudflare Worker（如果已在 Cloudflare 上，建議採用）**  
> 前面介紹的 [Cloudflare Worker 代理](#部署-cloudflare-worker-代理-1) 可以處理多個網域，它會檢查請求的 `Origin` 標頭並回傳對應的值 — 不需要修改 Traccar 設定。

---

## 專案結構

```
mix_ts_open/
├── public/                  # 靜態資源
│   ├── _redirects           # Cloudflare Pages SPA 路由規則
│   ├── favicon.svg          # 網站圖示
│   ├── manifest.json        # PWA Manifest
│   ├── sw.js                # Service Worker
│   ├── icons/               # 應用程式圖示
│   ├── markers/             # 地圖標記圖示
│   └── custom/              # 自訂資源
├── src/                     # 原始碼
│   ├── main.tsx             # 入口
│   ├── App.tsx              # 根元件
│   ├── index.css            # 全域樣式
│   ├── components/          # 共用元件
│   │   ├── ui/              # shadcn 風格 UI 元件
│   │   ├── common/          # 通用元件 (EmptyState, StatusBadge, 等)
│   │   ├── layout/          # AppShell, Sidebar, Topbar, TabBar
│   │   ├── dashboard/       # KpiCard, MiniMap, AlertsPanel
│   │   ├── tracking/        # FleetMapLibre, MapView, VehicleList, carMarkerSvg
│   │   ├── geofences/       # GeofenceEditorDialog
│   │   ├── vehicles/        # VehicleForm
│   │   ├── drivers/         # DriverForm
│   │   └── reports/         # ReportToolbar, ReportTypeTabs
│   ├── pages/               # 頁面元件
│   │   ├── reports/         # 報表子頁面
│   │   ├── settings/        # 18 個設定頁面
│   │   └── *.tsx            # 各功能頁面
│   ├── hooks/               # 自訂 Hook
│   ├── context/             # React Context
│   ├── lib/                 # 工具函式 (API, Geo, i18n, CSV, 快取)
│   ├── types/               # TypeScript 型別定義
│   └── language/            # 多國語言翻譯
├── .env.local               # 本地環境變數（已 .gitignore）
├── .env.production          # 正式環境變數
├── .env.development         # 開發環境變數
├── index.html               # HTML 入口
├── vite.config.ts           # Vite 設定
├── tsconfig.json            # TypeScript 設定
├── tailwind.config.ts       # Tailwind CSS 設定
├── postcss.config.js        # PostCSS 設定
└── package.json             # 專案相依與腳本
```

---

## 車輛標記系統

地圖標記使用 SVG 圖示 (`public/markers/`)，依車輛狀態與類型動態載入：

- **狀態**: moving / idle / parking / offline / alert
- **類型**: car, truck, bus, van, taxi, motorcycle, bicycle, scooter, plane, helicopter, ship, boat, train, tram, pickup, trailer, tractor, crane, camper, person, animal（20 種）
- **自動辨識**: 根據 `category` 或 `model` 自動匹配對應圖示
- **特效**: 發光環、旋轉角度、選中外框、名稱標籤

---

## 地圖樣式設定 (Map Style)

地圖使用 MapLibre GL JS 渲染，底圖樣式為自訂的 `liberty.json`（MapLibre Style JSON 格式）。

### 更換地圖樣式

若要更換底圖樣式，需同時修改以下 **3 個檔案**：

| 檔案 | 用途 |
|------|------|
| `src/components/tracking/FleetMapLibre.tsx` | 即時追蹤地圖主元件 |
| `src/components/geofences/GeofenceEditorDialog.tsx` | 圍欄編輯器地圖 |
| `src/pages/SharedViewPage.tsx` | 分享頁面地圖 |

每個檔案中搜尋 `STYLE_ROAD`（或 `TILE_STYLE`），將值改為你的樣式 JSON 路徑：

```ts
// 使用遠端樣式
const STYLE_ROAD = 'https://your-server.com/your-style.json';

// 或使用本地樣式（放在 public/ 目錄）
const STYLE_ROAD = '/custom/your-style.json';
```

### 自訂 liberty.json

若想使用本地 liberty.json：
1. 將檔案放入 `public/custom/liberty.json`
2. 三個檔案中的 URL 改為 `/custom/liberty.json`
3. 確保 `liberty.json` 中的圖磚來源（`sources` → `tiles` URL）是可用的

### 衛星圖模式

衛星圖樣式在 `FleetMapLibre.tsx` 中以 `STYLE_SATELLITE` 常數定義（使用 Esri World Imagery），不需另外準備 JSON 檔案。若要更換衛星圖來源，直接修改該常數中的 `tiles` URL 即可。

---

## 多語言

支援 106 國語言，源自 Traccar 官方翻譯。語言切換儲存於 `localStorage` (`mixok-locale`)。翻譯查找順序：當前語言 → 英文 → fallback key。

---

## 致謝與聲明

本專案是原始 **[Fleetly](https://github.com/sathasivamrangasamy/fleetly)** 專案（作者 [sathasivamrangasamy](https://github.com/sathasivamrangasamy)）的 **TypeScript 重寫版**。

原始 Fleetly 專案是一個基於 Traccar API 的車隊管理前端，使用原生 JavaScript 建置。本版本將完整程式碼移植至 **React 19 + TypeScript + Vite 6**，保留了相同的功能集與 API 相容性。

感謝原作者的努力與貢獻，歡迎前往原始專案 [Fleetly](https://github.com/sathasivamrangasamy/fleetly) 查看。

---

## 授權

本專案以 MIT 授權條款發布。詳見 [LICENSE](./LICENSE) 檔案。

---

## 相關連結

- [Traccar 官方網站](https://www.traccar.org/)
- [Traccar API 文件](https://www.traccar.org/api-reference/)
- [原始 Fleetly 專案](https://github.com/sathasivamrangasamy/fleetly)
- [MapLibre GL JS](https://maplibre.org/)
- [shadcn/ui](https://ui.shadcn.com/)
- [Vite](https://vitejs.dev/)
- [Cloudflare Pages](https://pages.cloudflare.com/)

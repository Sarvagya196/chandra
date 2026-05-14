# Chandra Pricing Calculator — Frontend Build Spec

A standalone web app that lets an internal user price a jewelry piece from an image (or Excel sheet), tweak the inputs, recalculate instantly, manage today's metal rates, and export a polished PDF for emailing to a client.

This document is the single source of truth for the frontend build. Backend already exists at `c:\Projects\chandra` (Express + MongoDB). Do **not** modify the backend unless explicitly called out in [§13 Backend Additions](#13-backend-additions-optional-defer-unless-blocked).

---

## Table of Contents

1. [Goals & Non-Goals](#1-goals--non-goals)
2. [Tech Stack](#2-tech-stack)
3. [Backend API Reference](#3-backend-api-reference)
4. [Data Model (Frontend State)](#4-data-model-frontend-state)
5. [UX Flow](#5-ux-flow)
6. [Screen Layout & Wireframe](#6-screen-layout--wireframe)
7. [Components](#7-components)
8. [Calculate vs Recalculate Logic](#8-calculate-vs-recalculate-logic)
9. [Excel Parsing (Client-Side)](#9-excel-parsing-client-side)
10. [Metal Prices Modal](#10-metal-prices-modal)
11. [PDF Export](#11-pdf-export)
12. [Auth](#12-auth)
13. [Backend Additions (optional)](#13-backend-additions-optional-defer-unless-blocked)
14. [Errors, Loading, Empty States](#14-errors-loading-empty-states)
15. [Acceptance Criteria](#15-acceptance-criteria)
16. [Project Layout](#16-project-layout)

---

## 1. Goals & Non-Goals

### Goals
- **One-screen pricing calculator** — pick client, stone type, metal Kt, drop in an image (or Excel), hit **Calculate**, see the full price breakdown.
- **Iterative editing** — every numeric input that feeds pricing (stone Pcs/Wt/Price/Markup, metal weight, client charges, etc.) is editable inline. Hitting **Recalculate** must skip the LLM image extraction and only call the pricing endpoint.
- **Manage metal prices** — a modal lets the user view today's gold/silver/platinum rate and update it without leaving the page.
- **Export PDF** — a client-emailable PDF including the uploaded image, the stones table, and the full pricing breakdown.

### Non-Goals
- No enquiry creation, no chat, no asset versioning. This app is **pricing only**.
- No persistence of calculations. Each session is ephemeral (until the user exports a PDF or saves locally if a "Save draft" feature is added later).
- No mobile-first design. Desktop-first (min width 1280px). Should remain usable down to 1024px.

---

## 2. Tech Stack

| Concern | Choice | Reason |
|---|---|---|
| Framework | **React 18 + Vite + TypeScript** | Fast HMR, simple build, types catch shape mismatches against backend |
| Routing | `react-router-dom` v6 | Login route + main route |
| State | **Zustand** (or React Context + `useReducer` if preferred) | Single global store for `calculation`, `clients`, `codelists`, `metalRates`. Avoid Redux boilerplate. |
| HTTP | **Axios** with an interceptor that attaches `Authorization: Bearer <token>` from `localStorage` | Backend uses JWT bearer auth |
| Forms | **react-hook-form** + **zod** for the recalculation form | Lets us validate every numeric edit without re-rendering the whole tree |
| UI Kit | **shadcn/ui** + **Tailwind CSS** | Clean, fast to assemble. Toasts via `sonner`. |
| Tables | Native `<table>` with Tailwind, or `@tanstack/react-table` if sortable columns are needed | Keep stones table inline-editable |
| Excel parsing | **`xlsx`** (SheetJS) — client-side | No backend endpoint needed; mirrors `handleExcelDataForCoral` logic exactly |
| PDF generation | **`@react-pdf/renderer`** | Programmatic layout, supports images, far cleaner than `jspdf + html2canvas` |
| Icons | `lucide-react` | |
| Notifications | `sonner` | Success/error toasts |

> **Env vars** (`.env`):
> - `VITE_API_BASE_URL` — e.g. `http://localhost:3000/api` (production: your hosted backend URL).

---

## 3. Backend API Reference

**Base URL:** `${VITE_API_BASE_URL}` → e.g. `http://localhost:3000/api`.
**Auth:** All endpoints except `POST /login` require `Authorization: Bearer <jwt>`.

### 3.1 Login — `POST /login`

```http
POST /login
Content-Type: application/json

{ "email": "edp@chandrajewels.com", "password": "..." }
```

Response:
```json
{ "token": "eyJhbGc..." }
```

Token expires in 8h. Frontend stores it in `localStorage.authToken` and decodes it (optional) only to extract expiry — never trust the payload for authz.

### 3.2 List clients — `GET /clients`

Response (array of `Client`):
```json
[
  {
    "_id": "65f...",
    "Name": "Acme Jewelers",
    "ImageUrl": "https://...",
    "PriorityOrder": 1,
    "Pricing": {
      "Loss": 4,
      "Labour": 1200,
      "ExtraCharges": 2,
      "NaturalDuties": 18,
      "LabDuties": 18,
      "GoldDuties": 12,
      "SilverAndLabsDuties": 12,
      "LossAndLabourDuties": 12,
      "UndercutPrice": 0,
      "Diamonds": [
        { "Type": "Natural", "Shape": "RD", "MmSize": "1.0", "SieveSize": "+1.0-1.10", "Price": 850 }
      ]
    },
    "PricingMessageFormat": "Total: {TotalPrice} ..."
  }
]
```

The dropdown shows `Name`, value is `_id`. Pre-sort by `PriorityOrder` ascending then `Name`.

### 3.3 Codelist by name — `GET /codelists/:name`

Stone types: `GET /codelists/StoneTypes` → returns array of codelist entries. Use the same `Name`/`Code`/`Id` shape the rest of the codebase uses. Render `Name` in the dropdown; submit the `Name` (or `Code` — verify by inspecting an entry; the backend pricing flow accepts a string and never enums it). **Default to submitting `Name`.**

### 3.4 Latest metal rates — `GET /metal-prices/latest`

Response (shape used by `metalPricesService.getLatest`):
```json
{
  "gold":     { "price": 7400, "date": "2026-05-14T00:00:00.000Z" },
  "silver":   { "price": 92,   "date": "2026-05-14T00:00:00.000Z" },
  "platinum": { "price": 3100, "date": "2026-05-14T00:00:00.000Z" }
}
```

Used (a) to display the live rate next to the metal selector, (b) by the metal-prices modal.

### 3.5 Metal price CRUD

| Method | Path | Body |
|---|---|---|
| GET | `/metal-prices` | — (returns full history) |
| POST | `/metal-prices` | `{ "metal": "gold" \| "silver" \| "platinum", "price": 7400, "date": "2026-05-14" }` |
| PUT | `/metal-prices/:metal` | `{ "date": "2026-05-14", "price": 7400 }` |
| DELETE | `/metal-prices/:metal` | `{ "date": "2026-05-14" }` |

For the modal, the recommended UX is: show one row per metal with today's price + an "Edit" button → patches via `PUT`. If no entry for today, fall back to `POST` (Add).

### 3.6 **Image → Extract + Price** — `POST /image-pricing`

Multipart form-data:

| Field | Type | Required | Notes |
|---|---|---|---|
| `image` | File | ✅ | Any `image/*`, ≤ 20 MB |
| `clientId` | string | ✅ | Mongo ObjectId |
| `stoneType` | string | ✅ | e.g. `Natural`, `LabGrown`, `CVDLabGrown` |
| `quantity` | string (int) | ❌ | Defaults to `1` |
| `metalQuality` | string | ❌ | e.g. `18K`, `14K`, `Silver 925`, `Platinum`. If absent, the LLM's reading of the image is used. **Frontend always sends this — user picked it explicitly.** |

Response — `{ extractedData, pricing }`:

```jsonc
{
  "extractedData": {
    "Stones": [
      { "Color": "EF", "Shape": "RD", "MmSize": "1.0", "SieveSize": "+1.0-1.10", "Weight": 0.005, "Pcs": 24, "CtWeight": 0.120 }
    ],
    "Metal": { "Weight": 3.5, "Quality": "18K" },
    "TotalPieces": 24
  },
  "pricing": { /* see §3.7 response */ }
}
```

### 3.7 **Recalculate** — `POST /enquiries/pricingCalculate`

> ⚠ Despite the path being under `/enquiries`, this endpoint is **stateless** — it does not touch any enquiry. We use it for every recalculation.

Request:
```json
{
  "clientId": "65f...",
  "details": {
    "Metal": { "Weight": 3.5, "Quality": "18K", "Rate": null },
    "Quantity": 1,
    "Stones": [
      {
        "Type": "Natural",
        "Color": "EF", "Shape": "RD", "MmSize": "1.0", "SieveSize": "+1.0-1.10",
        "Weight": 0.005, "Pcs": 24, "CtWeight": 0.120,
        "Markup": 0,
        "Price": 850
      }
    ],
    "TotalPieces": 24,

    "Loss": 4, "Labour": 1200, "ExtraCharges": 2, "UndercutPrice": 0,
    "NaturalDuties": 18, "LabDuties": 18, "GoldDuties": 12,
    "SilverAndLabsDuties": 12, "LossAndLabourDuties": 12
  }
}
```

Notes:
- All `Loss/Labour/.../*Duties` fields are **optional**; if omitted, the backend falls back to the client's defaults. Send them only when the user has explicitly overridden them — keeps payloads cleaner.
- `Metal.Rate` overrides today's market rate. Send `null` (or omit) for the live rate.
- `Stones[].Price` overrides the per-stone price that the backend would pull from `client.Pricing.Diamonds`. Send the resolved value the user sees so a recalc is deterministic.

Response (the `formatPricingResponse` shape from `pricing.service.js`):
```jsonc
{
  "MetalPrice": 18375.000,
  "DiamondsPrice": 102.000,
  "TotalPrice": 19023.420,
  "DutiesAmount": 410.220,
  "Applicable": {
    "NaturalDuties": true,
    "LabDuties": false,
    "GoldDuties": true,
    "SilverAndLabsDuties": false,
    "LossAndLabourDuties": true
  },
  "Metal":  { "Weight": 3.5, "Quality": "18K", "Rate": 7400.000 },
  "DiamondWeight": 0.120,
  "TotalPieces": 24,
  "Stones": [ /* echoed back with resolved Price + Markup */ ],
  "Client": {
    "Loss": 4, "Labour": 1200, "ExtraCharges": 2, "UndercutPrice": 0,
    "NaturalDuties": 18, "LabDuties": 18, "GoldDuties": 12,
    "SilverAndLabsDuties": 12, "LossAndLabourDuties": 12,
    "PricingMessageFormat": "Total: {TotalPrice} ..."
  },
  "ClientPricingMessage": "Total: 19023.42 ..."     // null if format absent
}
```

---

## 4. Data Model (Frontend State)

```ts
// src/types/pricing.ts
export type MetalQuality =
  | '10K' | '14K' | '18K' | '22K' | '24K'
  | 'Silver 925' | 'Platinum';

export interface Stone {
  Type: string;       // from the StoneType dropdown, applied to every row
  Color: string;
  Shape: string;
  MmSize: string;
  SieveSize: string;
  Weight: number;     // avg weight per stone
  Pcs: number;
  CtWeight: number;   // total carat weight = Weight * Pcs (but trust the source value)
  Markup: number;     // user-editable
  Price: number;      // resolved unit price (₹/ct), user-editable
}

export interface PricingDetails {
  Metal: { Weight: number; Quality: MetalQuality; Rate?: number | null };
  Quantity: number;
  Stones: Stone[];
  TotalPieces: number;

  // Overrides — only send when changed from client default
  Loss?: number;
  Labour?: number;
  ExtraCharges?: number;
  UndercutPrice?: number;
  NaturalDuties?: number;
  LabDuties?: number;
  GoldDuties?: number;
  SilverAndLabsDuties?: number;
  LossAndLabourDuties?: number;
}

export interface PricingResponse {
  MetalPrice: number;
  DiamondsPrice: number;
  TotalPrice: number;
  DutiesAmount: number;
  Applicable: {
    NaturalDuties: boolean; LabDuties: boolean; GoldDuties: boolean;
    SilverAndLabsDuties: boolean; LossAndLabourDuties: boolean;
  };
  Metal: { Weight: number; Quality: string; Rate: number };
  DiamondWeight: number;
  TotalPieces: number;
  Stones: Stone[];
  Client: {
    Loss: number; Labour: number; ExtraCharges: number; UndercutPrice: number;
    NaturalDuties: number; LabDuties: number; GoldDuties: number;
    SilverAndLabsDuties: number; LossAndLabourDuties: number;
    PricingMessageFormat: string | null;
  };
  ClientPricingMessage: string | null;
}
```

### Zustand store shape

```ts
interface CalcStore {
  // Inputs
  clientId: string | null;
  stoneType: string | null;
  metalQuality: MetalQuality | null;
  quantity: number;
  imageFile: File | null;
  imagePreviewUrl: string | null;   // object URL for preview + PDF
  excelFile: File | null;

  // Server data
  clients: Client[];
  stoneTypes: CodelistEntry[];
  latestRates: LatestRates | null;

  // Calculation result + editable working copy
  details: PricingDetails | null;          // editable working copy
  result: PricingResponse | null;          // last server response
  isCalculating: boolean;
  isRecalculating: boolean;
  error: string | null;

  // Actions
  fetchBootstrap(): Promise<void>;          // clients + stoneTypes + latestRates
  setInput(patch: Partial<Inputs>): void;
  calculate(): Promise<void>;               // POST /image-pricing OR parse Excel + /pricingCalculate
  recalculate(): Promise<void>;             // POST /enquiries/pricingCalculate
  updateStone(i: number, patch: Partial<Stone>): void;
  updateMetal(patch: Partial<PricingDetails['Metal']>): void;
  updateCharge(field: keyof PricingDetails, value: number): void;
  reset(): void;
}
```

---

## 5. UX Flow

```
[Login screen] ──login──▶ [Calculator screen]
                                │
                                ├─ Pick client, stone type, metal Kt, quantity
                                ├─ Upload image  ──┐
                                ├─ Upload excel ──┤── (Excel wins if both)
                                ▼                 │
                          [Calculate] ────────────┘
                                │
                       ┌────────┴────────┐
                       │ Excel uploaded? │
                       └────────┬────────┘
                       Yes      │      No
                        │       │       │
                        ▼       │       ▼
                Parse Excel    │   POST /image-pricing
                client-side    │   (uploads image, runs LLM,
                 → details     │    runs pricing)
                        │       │       │
                        ▼       │       ▼
            POST /enquiries/pricingCalculate     (extractedData + pricing)
                        │                       │
                        └──────────┬────────────┘
                                   ▼
                       [Results panel renders]
                                   │
                  User edits any field — Recalculate button enabled
                                   │
                                   ▼
                  POST /enquiries/pricingCalculate (no image, no LLM)
                                   │
                                   ▼
                       [Results panel updates]
                                   │
                            [Export PDF]
```

**Modify metal prices** is a button in the top-right of the calculator that opens a modal at any time (doesn't disturb the form).

---

## 6. Screen Layout & Wireframe

Desktop layout — two columns. **Left** = inputs + image preview. **Right** = results (stones table + pricing breakdown). On `<1280px` collapse to single column.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  Chandra Pricing Calculator              [💰 Metal Prices]  [👤 edp@... ▾]       │
├────────────────────────────────────┬─────────────────────────────────────────────┤
│ INPUTS                             │ RESULTS                                     │
│                                    │                                             │
│ Client *      [Acme Jewelers  ▾]   │   ┌───────────────────────────────────┐    │
│ Stone Type *  [Natural        ▾]   │   │ Image preview (thumbnail)         │    │
│ Metal Kt *    [18K            ▾]   │   │   ┌─────────┐                     │    │
│ Quantity      [ 1 ]                │   │   │  📷     │   3.500 g  •  18K   │    │
│                                    │   │   └─────────┘   24 pcs  •  0.120ct│    │
│ Image *       [Drag & drop / pick] │   └───────────────────────────────────┘    │
│   ┌─────────────────────────────┐  │                                             │
│   │ [preview]                   │  │   STONES (inline-editable)                  │
│   └─────────────────────────────┘  │   ┌───┬───┬─────┬─────┬────┬───┬──────┐    │
│                                    │   │Typ│Shp│ MM  │Sieve│Pcs │Ct │ ₹/ct │    │
│ Excel        [Optional .xlsx]      │   ├───┼───┼─────┼─────┼────┼───┼──────┤    │
│   (if uploaded, overrides image)   │   │Nat│RD │ 1.0 │+1.0 │ 24 │.12│  850 │    │
│                                    │   └───┴───┴─────┴─────┴────┴───┴──────┘    │
│         [ Calculate ▶ ]            │   [ + Add stone ]                           │
│         [ Recalculate ↻ ]          │                                             │
│         (enabled after first calc) │   CHARGES (overrides; client default shown) │
│         [ Reset ]                  │     Loss          [ 4 ] %                   │
│                                    │     Labour        [ 1200 ] ₹/g              │
│                                    │     Extra Charges [ 2 ] %                   │
│                                    │     Undercut      [ 0 ] ₹/ct                │
│                                    │     Natural Duty  [ 18 ] %                  │
│                                    │     ... (5 more) ...                        │
│                                    │                                             │
│                                    │   ┌───────────────── BREAKDOWN ──────────┐  │
│                                    │   │ Metal Price        ₹ 18,375.00       │  │
│                                    │   │ Diamonds Price     ₹    102.00       │  │
│                                    │   │ Duties             ₹    410.22       │  │
│                                    │   │ ─────────────────────────────────    │  │
│                                    │   │ TOTAL              ₹ 19,023.42       │  │
│                                    │   └──────────────────────────────────────┘  │
│                                    │                                             │
│                                    │   "Total: 19023.42..."  ← ClientPricingMsg  │
│                                    │                                             │
│                                    │   [ ⬇ Export PDF ]                          │
└────────────────────────────────────┴─────────────────────────────────────────────┘
```

---

## 7. Components

```
src/
├── App.tsx                  # router shell
├── pages/
│   ├── Login.tsx
│   └── Calculator.tsx       # the whole pricing screen
├── components/
│   ├── InputsPanel.tsx
│   │   ├── ClientSelect.tsx
│   │   ├── StoneTypeSelect.tsx
│   │   ├── MetalKtSelect.tsx
│   │   ├── QuantityInput.tsx
│   │   ├── ImageDropzone.tsx
│   │   └── ExcelDropzone.tsx
│   ├── ActionsBar.tsx        # Calculate / Recalculate / Reset buttons
│   ├── ResultsPanel.tsx
│   │   ├── ImagePreviewCard.tsx
│   │   ├── StonesTable.tsx    # inline-editable
│   │   ├── ChargesForm.tsx    # 9 numeric inputs
│   │   ├── BreakdownCard.tsx  # MetalPrice / Diamonds / Duties / Total
│   │   └── ClientMessageCard.tsx
│   ├── MetalPricesModal.tsx
│   └── PricingPdf/
│       ├── PricingPdfDoc.tsx  # @react-pdf/renderer Document
│       └── ExportPdfButton.tsx
├── store/
│   └── calcStore.ts           # Zustand
├── lib/
│   ├── api.ts                 # axios instance + interceptor
│   ├── excel.ts               # SheetJS parser → PricingDetails
│   └── format.ts              # money/number formatters
├── types/
│   └── pricing.ts
└── styles/...
```

### Component-by-component contract

#### `<ClientSelect>`
- Reads `clients` from store. Renders a searchable combobox (`shadcn/ui` Combobox).
- Disabled while `isCalculating`.
- On change, sets `clientId` AND, if a calculation already exists, pulls the new client's `Pricing` defaults into `details` (only the fields the user hasn't manually overridden — track override-set in store).

#### `<StoneTypeSelect>`
- Reads `stoneTypes` from store. Each option's value = `entry.Name` (string).
- When changed **after** calculation, every row of `details.Stones[].Type` updates to the new value, and **Recalculate** auto-enables (do not auto-fire).

#### `<MetalKtSelect>`
- Hardcoded options: `10K`, `14K`, `18K`, `22K`, `24K`, `Silver 925`, `Platinum`.
- Next to the dropdown, render today's live rate pulled from `latestRates` based on selection (e.g. "Today: ₹7,400/g for 24K → ₹5,550/g for 18K").

#### `<ImageDropzone>`
- Accept `image/*`, max 20 MB. Use `react-dropzone`.
- Sets `imageFile` + `imagePreviewUrl = URL.createObjectURL(file)`. Revoke previous URL.
- Preview thumbnail (max 240×240) shown beneath the dropzone and reused in `<ImagePreviewCard>` + the PDF.

#### `<ExcelDropzone>`
- Accept `.xlsx, .xls, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.
- If both image and Excel present, show a small banner: "Using Excel data — image will be included in PDF for reference."

#### `<StonesTable>`
- One row per stone in `details.Stones`. Editable cells: `Color`, `Shape`, `MmSize`, `SieveSize`, `Weight`, `Pcs`, `CtWeight`, `Markup`, `Price`. `Type` is read-only at row level (set globally).
- Add/remove row buttons. Removing the last row is allowed (result will be metal-only pricing).
- Editing **any** cell flips a `dirty` flag and enables `Recalculate`. Do NOT auto-fire — explicit user action only.

#### `<ChargesForm>`
- 9 numeric inputs: `Loss`, `Labour`, `ExtraCharges`, `UndercutPrice`, `NaturalDuties`, `LabDuties`, `GoldDuties`, `SilverAndLabsDuties`, `LossAndLabourDuties`.
- Each shows the client default as placeholder. If user types a value, it becomes an override (sent in payload). A small "↺ reset to client default" icon clears the override.

#### `<BreakdownCard>`
- Big total. Sub-rows for metal, diamonds, duties. A collapsible "Duty breakdown" section listing the 5 buckets with the `Applicable` flags (greyed out when `false`).

#### `<ClientMessageCard>`
- Renders `result.ClientPricingMessage` in a card with a "📋 Copy" button. Hide if `null`.

#### `<MetalPricesModal>`
- Trigger button in header.
- Body: 3 rows (gold, silver, platinum). Each row shows current rate + "Edit" pencil. Edit mode reveals a price input + a date picker (defaults to today). Save → `PUT /metal-prices/:metal`. If 404 (no entry for that date), retry `POST /metal-prices`.
- On successful save, refetch `/metal-prices/latest` and update the store so the rate badge next to the metal selector updates live.

#### `<ExportPdfButton>`
- Disabled until `result` exists.
- Uses `@react-pdf/renderer` + `BlobProvider` to generate the PDF and trigger download. Filename: `Pricing-${clientName}-${YYYYMMDD-HHmm}.pdf`.

---

## 8. Calculate vs Recalculate Logic

This is the single most important rule. The frontend MUST avoid re-running the LLM extraction when the user only changed numbers.

```ts
// store/calcStore.ts (abridged)

async function calculate() {
  set({ isCalculating: true, error: null });
  try {
    const { clientId, stoneType, metalQuality, quantity,
            imageFile, excelFile } = get();
    if (!clientId || !stoneType || !metalQuality)
      throw new Error('Pick client, stone type and metal Kt first.');
    if (!imageFile && !excelFile)
      throw new Error('Upload an image or an Excel sheet.');

    let details: PricingDetails;
    let result: PricingResponse;

    if (excelFile) {
      // Excel wins → parse client-side, then call pricing endpoint
      const extracted = await parseExcel(excelFile);
      details = buildDetails(extracted, { stoneType, metalQuality, quantity });
      result = await api.post('/enquiries/pricingCalculate', {
        clientId, details
      }).then(r => r.data);
    } else {
      // Image flow — backend extracts via LLM then prices in one call
      const form = new FormData();
      form.append('image', imageFile!);
      form.append('clientId', clientId);
      form.append('stoneType', stoneType);
      form.append('metalQuality', metalQuality);
      form.append('quantity', String(quantity));
      const { data } = await api.post('/image-pricing', form);
      details = buildDetails(data.extractedData,
                             { stoneType, metalQuality, quantity });
      result = data.pricing;
    }

    set({ details, result });
  } catch (e: any) {
    set({ error: e?.response?.data?.error ?? e.message });
  } finally {
    set({ isCalculating: false });
  }
}

async function recalculate() {
  set({ isRecalculating: true, error: null });
  try {
    const { clientId, details } = get();
    if (!clientId || !details)
      throw new Error('Run Calculate first.');
    const payload = pruneEmptyOverrides(details);  // see note
    const { data } = await api.post('/enquiries/pricingCalculate', {
      clientId, details: payload
    });
    set({ result: data });
  } catch (e: any) {
    set({ error: e?.response?.data?.message ?? e.message });
  } finally {
    set({ isRecalculating: false });
  }
}
```

`buildDetails` merges extracted data + form inputs into the canonical `PricingDetails` shape (applies `stoneType` to every stone's `Type`, sets `Metal.Quality` from the form even if the LLM read a different value, defaults `Markup` to 0).

`pruneEmptyOverrides` removes `Loss/Labour/.../*Duties` fields whose value equals the client default (so the backend uses the client default and we don't have to keep them in sync).

### When to enable Recalculate
- Disabled until first successful Calculate.
- Always enabled after first Calculate (the user can recalc with no edits — useful when metal price changes).
- Show a subtle "↻ Recalculate to apply changes" hint badge when `details` differs from the snapshot taken at the last successful call.

---

## 9. Excel Parsing (Client-Side)

Mirror the column mapping used by `handleExcelDataForCoral` in [services/enquiry.service.js:944-1003](services/enquiry.service.js#L944-L1003). The columns are the source of truth — match them exactly:

| Column header | Maps to | Type |
|---|---|---|
| `DIA/COL` | `Stone.Color` | string |
| `ST SHAPE` | `Stone.Shape` | string — **drop rows where this is blank** |
| `MM SIZE` | `Stone.MmSize` | string |
| `SIEVE SIZE` | `Stone.SieveSize` | string (Coral keeps full value; Cad uses regex `/[\d.]+(?:-[\d.]+)?/`. Use the **Coral** flavor for the calculator since it's more forgiving) |
| `AVRG WT` | `Stone.Weight` | number (`parseFloat`) |
| `PCS` | `Stone.Pcs` | int (`parseInt`) |
| `CT WT` | `Stone.CtWeight` | number, truncated (not rounded) to 3dp: `Math.trunc(x * 1000) / 1000` |
| `METAL WEIGHT` | `Metal.Weight` | first non-empty value across all rows |
| `T.DIA WT` | (informational only — `DiamondWeight` is recomputed by the backend) | |

Then sum `Pcs` across all kept rows → `TotalPieces`.

```ts
// src/lib/excel.ts
import * as XLSX from 'xlsx';

export async function parseExcel(file: File) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

  const stones = [];
  let metalWeight: number | null = null;
  let totalPieces = 0;

  for (const r of rows) {
    const Shape = String(r['ST SHAPE'] ?? '').trim();
    const Pcs = parseInt(String(r['PCS'] ?? '0')) || 0;
    totalPieces += Pcs;
    if (metalWeight == null && r['METAL WEIGHT'])
      metalWeight = parseFloat(String(r['METAL WEIGHT'])) || null;
    if (!Shape) continue;

    stones.push({
      Color: String(r['DIA/COL'] ?? '').trim(),
      Shape,
      MmSize: String(r['MM SIZE'] ?? '').trim(),
      SieveSize: String(r['SIEVE SIZE'] ?? '').trim(),
      Weight: parseFloat(String(r['AVRG WT'] ?? '0')) || 0,
      Pcs,
      CtWeight: r['CT WT']
        ? Math.trunc(parseFloat(String(r['CT WT'])) * 1000) / 1000
        : 0,
    });
  }

  return { Stones: stones, Metal: { Weight: metalWeight }, TotalPieces: totalPieces };
}
```

---

## 10. Metal Prices Modal

The trigger button is in the calculator header — opens a modal, doesn't affect the form state. After closing, the metal-rate badge next to `<MetalKtSelect>` should reflect any change.

Modal contents (one row per metal):

```
┌───────────────────── Metal Prices ─────────────────────┐
│                                                        │
│  Gold      ₹ 7,400.00 / g     (2026-05-14)   [✎ Edit] │
│  Silver    ₹    92.00 / g     (2026-05-14)   [✎ Edit] │
│  Platinum  ₹ 3,100.00 / g     (2026-05-14)   [✎ Edit] │
│                                                        │
│  When Edit pressed, row becomes:                       │
│  Gold     [ 7400.00 ] ₹/g   Date [2026-05-14]  [Save] │
│                                                        │
│                                              [ Close ] │
└────────────────────────────────────────────────────────┘
```

Save flow:
1. `PUT /metal-prices/${metal}` with `{ date, price }`.
2. On 4xx (most likely "no entry for that date"), automatically retry `POST /metal-prices` with `{ metal, price, date }`.
3. On success: toast, refetch `GET /metal-prices/latest`, close edit mode.

---

## 11. PDF Export

Use `@react-pdf/renderer`. A4 portrait. Include:

1. **Header** — Chandra logo (optional), client name, date+time of calculation, optionally the user's email.
2. **Image** — the uploaded image, max 400×400 px in the PDF. If both image and Excel were uploaded, include the image.
3. **Summary block** — `Metal: 3.500 g, 18K • Stones: 24 pcs • Diamond Wt: 0.120 ct`.
4. **Stones table** — full table with Type, Color, Shape, MmSize, SieveSize, Pcs, CtWeight, Price (₹/ct), Markup, Subtotal (= `CtWeight * (Price + Markup)`).
5. **Charges & duties** — the 9 client values used in the calculation.
6. **Pricing breakdown** — Metal Price, Diamonds Price, Duties (with the 5 sub-buckets and their applicability), Extra Charges %, **Total Price** in a large bold row.
7. **Client message** — the `ClientPricingMessage` rendered verbatim if present.

Filename: `Pricing-${slug(clientName)}-${YYYYMMDD-HHmm}.pdf`.

PDF should be triggered **client-side only** — no backend round-trip. This avoids needing a new backend endpoint and keeps things responsive.

---

## 12. Auth

- Login page posts to `POST /login` → stores `token` in `localStorage`.
- All `axios` requests run through an interceptor:
  ```ts
  axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL });
  api.interceptors.request.use(cfg => {
    const t = localStorage.getItem('authToken');
    if (t) cfg.headers.Authorization = `Bearer ${t}`;
    return cfg;
  });
  api.interceptors.response.use(r => r, err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('authToken');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  });
  ```
- A `<RequireAuth>` route wrapper redirects to `/login` when no token is present.
- Decode the JWT (no signature check — just a UX nicety) to display the user's email in the header.

---

## 13. Backend Additions (optional, defer unless blocked)

Everything above works against the existing backend with **no changes**. The following are nice-to-haves and should NOT be implemented unless explicitly approved:

- `POST /image-pricing/from-excel` — accept an Excel and return the same `{ extractedData, pricing }` shape so the frontend doesn't depend on SheetJS. Currently parsed client-side per §9.
- `POST /pricing/export-pdf` — server-rendered PDF. Currently client-side per §11.

---

## 14. Errors, Loading, Empty States

| State | UI |
|---|---|
| Loading bootstrap (clients/codelists/rates) | Skeleton inputs, disable Calculate |
| Calculating | Spinner on Calculate button; disable all inputs |
| Recalculating | Inline spinner on Recalculate button; results panel dims to 60% opacity |
| Missing required input | Inline error under each missing field; toast on Calculate click |
| Backend 4xx | Show `response.data.error` or `response.data.message` in a destructive toast |
| Backend 5xx | "Something went wrong — try again" toast with a "Copy error" button (copies request id + message for debugging) |
| LLM extraction returns no stones | Still show the empty stones table; banner: "No stones detected — add rows manually" |
| 401 anywhere | Auto-redirect to /login |
| No clients in DB | Disable Calculate, show CTA "Ask admin to add clients first" |
| No metal rate for today | Modal opens with a yellow banner "Today's rate not set — set it before calculating" |

---

## 15. Acceptance Criteria

A build is "done" when **all** of the following pass manual QA:

1. ✅ Logging in with valid creds lands on `/calculator`. Invalid creds show an error toast and stay on `/login`.
2. ✅ Client dropdown lists clients sorted by `PriorityOrder` then `Name`. Selecting one is reflected in the URL query (`?client=<id>`) for shareable state.
3. ✅ Stone type dropdown is populated from `GET /codelists/StoneTypes`.
4. ✅ Metal Kt dropdown shows the 7 hardcoded options; live rate badge updates within 1s.
5. ✅ Uploading a 4 MB JPEG of a jewelry table and pressing Calculate produces a populated stones table + breakdown within reasonable LLM latency (~10-20s acceptable).
6. ✅ Uploading an Excel sheet that follows the documented column shape works **without** a backend call to `/image-pricing`. Only `/enquiries/pricingCalculate` is hit.
7. ✅ If both Excel and image are uploaded, the Excel data is used; the image is still embedded in the PDF.
8. ✅ Editing a stone's `Pcs` from 24 → 30 and pressing Recalculate fires exactly **one** request to `POST /enquiries/pricingCalculate` and updates the breakdown. The image upload is **not** re-sent.
9. ✅ Editing `Loss` from blank (using client default of 4) to 5 sends `Loss: 5` in the payload. Clicking "↺ reset to default" removes the field from the payload entirely on next recalc.
10. ✅ Switching the stone type globally after calculation updates every row's `Type` and re-enables Recalculate.
11. ✅ Metal Prices modal: editing today's gold rate to 7500 saves successfully, refreshes the badge in the main form, and the next Recalculate reflects the new rate in `MetalPrice`.
12. ✅ Export PDF produces a single-page (or two-page if needed) A4 PDF including the image, full stones table, charges, breakdown, and `ClientPricingMessage`.
13. ✅ All form state survives a soft refresh **only via re-upload** — image/excel are not persisted across reloads (acceptable for v1). Calculation result clears on hard refresh.
14. ✅ All numeric inputs accept up to 3 decimal places and round/format consistently (`Intl.NumberFormat('en-IN')` for display).
15. ✅ 401 from any endpoint redirects to login and clears the token.

---

## 16. Project Layout

```
chandra-pricing-web/
├── .env.example
├── index.html
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── vite.config.ts
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── pages/
    │   ├── Login.tsx
    │   └── Calculator.tsx
    ├── components/
    │   ├── inputs/...
    │   ├── results/...
    │   ├── MetalPricesModal.tsx
    │   └── PricingPdf/...
    ├── store/calcStore.ts
    ├── lib/
    │   ├── api.ts
    │   ├── excel.ts
    │   └── format.ts
    ├── types/
    │   ├── pricing.ts
    │   ├── client.ts
    │   └── codelist.ts
    └── styles/globals.css
```

### `.env.example`
```
VITE_API_BASE_URL=http://localhost:3000/api
```

### `package.json` (key deps)
```jsonc
{
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.0",
    "zustand": "^4.5.5",
    "axios": "^1.7.7",
    "react-hook-form": "^7.53.0",
    "zod": "^3.23.8",
    "@hookform/resolvers": "^3.9.0",
    "xlsx": "^0.18.5",
    "@react-pdf/renderer": "^4.0.0",
    "react-dropzone": "^14.2.3",
    "lucide-react": "^0.451.0",
    "sonner": "^1.5.0",
    "tailwindcss": "^3.4.13",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.1",
    "tailwind-merge": "^2.5.2"
  },
  "devDependencies": {
    "typescript": "^5.6.2",
    "@types/react": "^18.3.10",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "vite": "^5.4.8",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.47"
  }
}
```

---

## Implementation Order (suggested 1-week plan)

| Day | Deliverable |
|---|---|
| 1 | Vite scaffold, Tailwind, shadcn/ui, axios interceptor, login page, route guard. |
| 2 | Zustand store, bootstrap fetch (clients + stoneTypes + rates), input panel skeleton. |
| 3 | Image upload + Calculate path against `/image-pricing`; render raw results to confirm wiring. |
| 4 | Inline-editable stones table + charges form + Recalculate against `/enquiries/pricingCalculate`. Override-pruning logic. |
| 5 | Excel parsing (`xlsx`) + dual-input precedence logic. Metal Prices modal. |
| 6 | PDF export with `@react-pdf/renderer` — image, table, breakdown, client message. |
| 7 | Polish: loading/empty/error states, format functions, acceptance-criteria pass, README. |

---

**Backend reference files** (read-only, do not modify):
- [controllers/imagePricing.controller.js](controllers/imagePricing.controller.js)
- [services/imagePricing.service.js](services/imagePricing.service.js)
- [services/pricing.service.js](services/pricing.service.js)
- [controllers/enquiry.controller.js:141-154](controllers/enquiry.controller.js#L141-L154) — `getPricing` (the recalculation endpoint)
- [services/enquiry.service.js:944-1003](services/enquiry.service.js#L944-L1003) — Excel column mapping reference
- [controllers/metalPrices.controller.js](controllers/metalPrices.controller.js)
- [models/client.model.js](models/client.model.js)

# VectOS (Quincaille IOMS — Kigali Construction & Hardware ERP)

> **Multi-tenant Cloud ERP, Point of Sale (POS), and Multi-Warehouse Inventory System built for Hardware Retailers (*Quincailleries*), Construction Material Depots, and Electronics Stores in Rwanda.**

---

## 1. Purpose & Problems Solved

Retailers selling construction materials and electronics face operational problems that generic POS apps do not handle well:

1. **Flexible Operations (Solo vs. Multi-Staff Separation of Duties):**
   - **Solo Operator Mode:** A single owner/clerk with full duties can create an order, collect payment, and immediately release stock in one step without jumping across queues.
   - **Multi-Staff 3-Way Workflow:** Larger depots can separate **Salesperson** (creates quotes/orders) $\to$ **Cashier / Accountant** (collects Cash, MoMo, Bank Transfer, or approved credit) $\to$ **Storekeeper** (checks physical stock and releases items) to prevent collusion, unauthorized discounts, and stock leakage.
2. **Real-World Order Mistakes & Partial Deliveries:**
   - **Order / Receipt Editing (`PUT /api/orders/:id`):** Orders can be edited after creation (changing quantities, swapping/removing/adding products, updating unit prices or customer details), automatically recalculating totals, customer debt, and stock deltas for already-released items.
   - **Per-Item Partial Release (`POST /api/orders/:id/release-items`):** If a warehouse only has 3 of 5 ordered items on hand, the storekeeper can check off only the available items for release while leaving or rejecting missing lines.
3. **Wholesale Cost & Margin Confidentiality:**
   - Staff without `can_view_buying_prices` have `buying_price` and `profit` masked (`null`) at the API layer—not merely hidden in CSS—protecting supplier pricing and margins.
4. **Live Duty Coverage (Sick Leave, Peak Hours, Tax Weeks):**
   - Permissions sync from the database on every authenticated request, so pausing a staff account (`is_active = 0`) or toggling checkboxes in **Staff & Duties** takes effect immediately on active sessions without sharing passwords.
5. **Fast Catalog Ingestion:**
   - Supports single-item entry, CSV/Excel bulk import, and AI-powered paper invoice/receipt scanning via Gemini with an interactive staging table before saving.

---

## 2. Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| **Frontend SPA** | React 19, TypeScript, Vite 6, Tailwind CSS, `lucide-react` | Served via Vite middleware in dev, static `dist/` in prod |
| **PDF & Spreadsheets** | `jspdf`, `jspdf-autotable`, `xlsx` | Thermal/A4 receipts, delivery notes, bulk import |
| **Backend Server** | Node.js, Express 4, `tsx` (dev), `esbuild` (bundle) | Runs on port `3000` locally (`server.ts` -> `server/app.ts`) |
| **Legacy SSR (Compat)** | EJS templates (`views/`), `server/routes/iomsRoutes.ts` | Legacy server-rendered routes mounted alongside SPA |
| **Databases** | PostgreSQL (`pg` / `@neondatabase/serverless`) OR `sql.js` | Auto-selects Postgres if `DATABASE_URL` exists; in-memory SQLite otherwise |
| **ORM / Schema Mirror** | Drizzle ORM (`src/db/schema.ts`) | Used for Drizzle kit push/generate (`db:push`); runtime queries use `server/database/db.ts` |
| **Auth & Security** | `express-session`, `connect-pg-simple`, `bcryptjs`, HMAC JWT Bearer token, `helmet`, CSRF double-submit cookies | Dual cookie + `Authorization: Bearer` / `x-auth-token` auth |
| **AI Integration** | `@google/genai` (`gemini-3.8-flash`) | Server-side invoice scanner & AI Help assistant (with static knowledge fallback) |
| **Testing** | Vitest 4 + Supertest (`tests/`) | 12 test files / 60 tests covering security, isolation, concurrency, RBAC, orders, and stock |
| **Deployment Targets** | Node / Cloud Run (`server.ts`), Vercel (`server/vercel.ts`), Firebase (`firebase/entry.ts`) | Configs in `vercel.json`, `firebase.json`, `.github/workflows/` |

---

## 3. What Is Already Implemented & Verified

### A. Authentication, Multi-Tenancy & SuperAdmin
- **Shop Isolation (`shop_id`):** Every tenant table (`stocks`, `products`, `customers`, `partner_shops`, `orders`, `payments`, `inventory_movements`, `stock_transfers`, `audit_logs`) is scoped by `shop_id`. Cross-tenant access is blocked on the backend (`requireTenant`).
- **SuperAdmin Governance (`/admin/*`):** Platform SuperAdmin can register/approve/suspend tenant stores, activate/suspend staff accounts, switch active shop context (`POST /api/shops/switch`), and update global onboarding settings.
- **Dual-Mode Auth:** Uses both `express-session` cookies (`SameSite=none; Secure` for iframe previews, `lax` for standalone/tests) and a signed 7-day HS256 token (`Authorization: Bearer` / `x-auth-token` stored in client API layer) so auth survives serverless cold starts and strict third-party cookie blocking.
- **Firebase Google Login Support:** `/api/auth/firebase-login` verifies Google/Firebase tokens and links matching shop accounts.
- **Brute-Force Protection:** `login_throttle` table locks an email/IP identity for 15 minutes after 8 failed login attempts.

### B. Granular Permissions (Backend + UI Strictly Aligned)
- **20 Backend Permission Keys (`server/auth.ts`):** `18` shop-level permissions plus `2` platform-level keys (`can_view_all_tenants`, `can_manage_subscriptions`).
- **5 Customizable Templates + Start Empty (`src/components/UsersView.tsx`):**
  - *Solo Operator*, *Salesperson*, *Cashier / Accountant*, *Storekeeper*, *Store Manager*, plus **Start Empty (Nothing Checked)** which explicitly sends `false` for all 18 shop permissions (avoiding server-side default-on behavior).
- **Live Sync & Account Pause:** `requireAuth` and `requirePermission` reload roles, `is_active`, `activation_status`, and all permission columns directly from the DB per request. Cascading suspension automatically locks staff if their shop manager or shop tenant is suspended.
- **Manager / SuperAdmin Rule:** `role === 'manager'`, `role === 'superadmin'`, and `rwemera30@gmail.com` pass `hasUserPermission()` checks automatically across the UI and backend.

### C. Inventory, Multi-Warehouse & Product Ingestion
- **Multi-Depot Stock:** Shops can define multiple warehouses/depots (`stocks` table), view per-stock product quantities, and execute audited transfers (`POST /api/stocks/transfer`).
- **Atomic Concurrency Safety:** Order creation and stock adjustments decrement inventory atomically with stock-floor validation inside `withTransaction()`, preventing negative stock under concurrent requests.
- **Three Ingestion Channels:**
  1. Single product create/edit modal (`POST /api/products`, `PUT /api/products/:id`).
  2. CSV / XLSX bulk upload (`POST /api/products/bulk-import`).
  3. AI Invoice/Receipt Photo & PDF Scanner (`POST /api/products/ai-extract-invoice` using `multer` + `@google/genai`), returning an editable staging preview before saving.

### D. POS, Orders, Editing, Partial Release & Voiding
- **Point of Sale (`PosView.tsx`):** Fast product filtering, price-floor/below-cost warnings, customer selection, instant receipt download/print, and optional **Immediate Release** for solo operators.
- **Orders & Inspection (`OrdersView.tsx`, `EditOrderModal.tsx`, `ReceiptModal.tsx`):**
  - Filter by status, inspect full line items, record full/partial/credit payments (`POST /api/orders/:id/payments`), edit orders (`PUT /api/orders/:id`), release individual checked items (`POST /api/orders/:id/release-items`), or void/cancel orders (`POST /api/orders/:id/void`, restoring released stock and reversing credit debt).
  - Plain delivery notes (quantities only, no prices) and full receipts (with shop TIN & footer).

### E. Customers, Partner Shops, Reports & Backups
- **Customers & Debt:** Tracks customer credit balances, total spent, and partial payments.
- **Partner Shops:** Tracks neighboring partner hardware stores for inter-shop borrowing/fulfillment and outstanding balances.
- **Reports & Activity History:** Category revenue/profit breakdown, top-selling products, salesperson totals, and `audit_logs` history.
- **Tenant JSON Backup & Restore:** `createBackup()` / `restoreBackup()` (`GET /api/backup/export`, `POST /api/backup/restore`) export and verify tenant datasets with a SHA-256 payload checksum.

---

## 4. Important Business Rules & Intentional Behaviors

> **Read before modifying pricing or seeding logic:**

1. **1:1 Buying/Selling Price Initialization Policy:**
   - In `server/database/db.ts` (SQLite seed cleanup) and in `POST /api/products/ai-extract-invoice` / bulk import flows, `selling_price` defaults to `buying_price` unless explicitly set differently.
   - **Why:** Prevents accidental automated markup mistakes when store staff enter wholesale invoice costs. Do not "fix" this into an automatic markup without an explicit business requirement.
2. **Demo Switch Endpoint Disabled:**
   - `POST /api/auth/demo-switch` intentionally returns `403`. Users must authenticate with email/password or register a new shop.

---

## 5. Known Limitations, Technical Debt & Gotchas (For Developers & AI Agents)

1. **In-Memory `sql.js` Fallback Does Not Persist Across Restarts:**
   - When `DATABASE_URL` / `POSTGRES_URL` / `SQL_HOST` are unset, VectOS runs `sql.js` purely in RAM (`saveDb()` is a no-op). Restarting the server resets all data back to initial seeds. **Always configure PostgreSQL in production or persistent staging.**
2. **Seeded Default Accounts & Hardcoded SuperAdmin Email:**
   - On startup, `ensureAdminAccounts()` creates/ensures:
     - `rwemera30@gmail.com` (`superadmin`, default password `password123` if new)
     - `admin@vectos.co.rw` (`superadmin`, resets password to `password123` on startup!)
     - `sales@quincaille.rw` (`salesperson`, resets password to `password123` on startup!)
   - In `ensureAdminAccounts()`, `admin@vectos.co.rw` and `sales@quincaille.rw` currently overwrite existing passwords back to `password123` on DB init, and `rwemera30@gmail.com` is special-cased in `server/auth.ts`, `apiRoutes.ts`, and `src/utils/permissions.ts`. Before public production launch, remove/guard password resets in `ensureAdminAccounts()` and drive SuperAdmin privileges solely via DB role flags.
3. **Billing & Payment Gateways Are Partially Scaffolded:**
   - `server/billing/paymentService.ts` uses `MockPaymentProvider` by default.
   - `StripePaymentProvider` is a minimal scaffold (`createPayment` returns a synthetic `stripe_pi_...` reference without calling the Stripe SDK/API or verifying Stripe HMAC signatures).
   - Customer payment methods on orders (`cash`, `momo`, `bank_transfer`, `debt_credit`) are ledger records; there is **no live MTN MoMo / Airtel Money push-API integration**.
4. **Offline PWA Support Is Asset-Only (No Offline Write Queue):**
   - `public/sw.js` and `public/manifest.json` make the app installable and serve `public/offline.html` when offline, but POS sales, stock adjustments, and edits require an active network connection to the backend API (there is no IndexedDB offline transaction queue yet).
5. **Dual Schema Definitions:**
   - Database tables are created dynamically in `server/database/db.ts` (separate SQLite DDL and PostgreSQL DDL blocks) *and* mirrored in `src/db/schema.ts` + `database-schema.sql`. Adding a column requires updating `db.ts` (both engines) as well as Drizzle types/schemas if using `drizzle-kit`.
6. **Legacy EJS SSR Alongside React SPA:**
   - `server/routes/iomsRoutes.ts` and `views/*.ejs` remain mounted on `/` and `/legacy` for backward compatibility, while the modern UI lives in `src/components/`. Note that Vite dev middleware handles the React SPA on `/`, whereas SSR routes only match specific endpoints not handled by Vite or static files.
7. **2FA (TOTP) Is Legacy-Only:**
   - `otplib` / `qrcode` 2FA setup exists in legacy `views/security_2fa.ejs` & `iomsRoutes.ts`, while the primary React SPA auth flow (`/api/auth/login`) does not currently enforce a second TOTP step.
8. **AI Dependency & Model Name:**
   - `/api/ai/help` gracefully falls back to a local rule-based knowledge base (`server/aiHelpKnowledge.ts`) if `GEMINI_API_KEY` is missing or fails.
   - `/api/products/ai-extract-invoice` strictly requires `GEMINI_API_KEY` and calls `model: 'gemini-3.8-flash'`. If deploying outside AI Studio or if model availability changes, update that model identifier and ensure `GEMINI_API_KEY` is set.
9. **CSRF Exemption on `/api/*`:**
   - `server/security.ts` enforces double-submit `vcsrf` cookie validation on HTML/EJS form routes, while exempting `/api/*` JSON routes (which rely on session cookies + Bearer tokens). Keep `SameSite` and CORS policies strict if exposing APIs cross-origin.
10. **PostgreSQL SQL Helper Constraints:**
    - `formatPgSql()` converts `?` placeholders to `$1, $2...` with a simple regex (`/\?/g`). Never put literal `?` characters inside raw SQL strings passed to `queryAll`/`queryOne`/`execute`.
    - `withTransaction()` uses `AsyncLocalStorage` and explicitly disallows nested calls (`Nested transactions are not supported`).

---

## 6. Directory Map

```text
├── server.ts                      # Dev/prod Node server entry (port 3000 + Vite middleware)
├── server/
│   ├── app.ts                     # Express app, Helmet, CSRF, sessions, Bearer auth, /api/health
│   ├── auth.ts                    # RBAC keys, requireAuth, requirePermission, DB session sync
│   ├── security.ts                # CSP headers, CSRF double-submit cookies, login_throttle
│   ├── aiHelpKnowledge.ts         # Offline fallback knowledge base for /api/ai/help
│   ├── upload.ts                  # Multer in-memory upload configuration
│   ├── vercel.ts                  # Serverless wrapper for Vercel (api/index.js)
│   ├── billing/paymentService.ts  # PaymentProvider interface, Mock/Stripe stubs, webhook DLQ
│   ├── database/
│   │   ├── db.ts                  # Dual Postgres / sql.js connector, DDL, transactions, seeding
│   │   └── backup.ts              # SHA-256 verified JSON export & transactional restore
│   └── routes/
│       ├── apiRoutes.ts           # Main REST JSON API consumed by React SPA
│       ├── billingRoutes.ts       # /api/billing/charge & /api/webhooks/*
│       └── iomsRoutes.ts          # Legacy EJS SSR routes
├── src/
│   ├── App.tsx                    # SPA root, auth bootstrap, tab routing, modals, toasts
│   ├── types.ts                   # Shared TypeScript interfaces
│   ├── utils/permissions.ts       # Client-side permission checks aligned with backend
│   ├── services/
│   │   ├── api.ts                 # Fetch wrapper (handles auth token header + 401/403)
│   │   └── pdfExport.ts           # jsPDF receipt & delivery note generators
│   └── components/                # React views (Dashboard, POS, Orders, EditOrderModal, UsersView, etc.)
├── src/db/schema.ts               # Drizzle PostgreSQL schema mirror
├── firebase/entry.ts              # Firebase Cloud Functions entrypoint
├── scripts/build-firebase.mjs     # Builds bundle for Firebase Hosting/Functions
├── tests/                         # Vitest integration & security test suite (60 tests)
└── public/                        # PWA manifest, service worker, offline page, icons, built CSS
```

---

## 7. Getting Started & Useful Commands

### Environment Variables (`.env.example`)
- `DATABASE_URL` / `POSTGRES_URL` (optional for dev; required for persistent PostgreSQL)
- `SESSION_SECRET` (recommended 32+ chars in production for session & Bearer JWT signing)
- `GEMINI_API_KEY` (required for AI invoice scanner; optional for AI Help fallback)
- `STRIPE_SECRET_KEY` (optional; only activates the `StripePaymentProvider` stub)
- `VITE_FIREBASE_*` (optional; enables Firebase client-side Google sign-in)

### Commands

```bash
# Install dependencies
npm install

# Run full-stack dev server (Express + Vite SPA on http://localhost:3000)
npm run dev

# Run all 12 Vitest test suites (60 tests)
npm test

# Type-check TypeScript (client + server)
npm run lint

# Build Tailwind CSS, Vite SPA, Node dist/server.cjs, and Vercel api/index.js
npm run build

# Start compiled production server
npm start

# Push Drizzle schema to configured PostgreSQL database
npm run db:push
```

### Health Check
`GET /api/health` returns database connectivity status, active engine (`PostgreSQL` vs `sql.js (SQLite)`), webhook retry/dead-letter counts, uptime, and memory usage.

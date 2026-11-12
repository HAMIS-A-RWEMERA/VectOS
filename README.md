# VectOS (Quincaille IOMS - Kigali Construction & Hardware ERP)

> **Multi-tenant Cloud Operating System & ERP for Hardware Retailers (*Quincailleries*), Construction Material Depots, and Electronics Stores in Rwanda.**

---

## 📌 Executive Overview

**VectOS** is an enterprise-grade, multi-tenant inventory, point-of-sale (POS), and warehouse management platform built to solve the operational challenges of hardware retailers and construction supply chains in East Africa (specifically Rwanda / Kigali).

The system addresses critical challenges faced by building materials depots:
- Managing high-volume bulk items (cement, steel rebar, corrugated roofing sheets, PVC pipes, bulk paint).
- Supporting multi-depot and multi-warehouse physical operations.
- Enforcing strict 3-way segregation of duties (Sales Agent $\to$ Accountant $\to$ Storekeeper).
- Preventing inventory leakage, unauthorized discounts, and accounting discrepancies.

---

## ⚠️ Important Notice: Product Pricing Policy

> **Temporary Configuration Notice for Developers and AI Agents:**  
> **Rule:** The **suggested selling price defaults to equal the buying price entered by tenants** on product creation and bulk import (`suggested_selling_price = buying_price`).  
> **Rationale:** Several merchant tenants frequently confused wholesale buying cost with retail selling price during catalog ingestion. To prevent unwanted markup assumptions or incorrect price calculations until further merchant training and notification, the system automatically initializes the suggested selling price to match the entered buying cost, allowing the storekeeper/manager to adjust pricing explicitly.

---

## 🏗️ Core Architectural Features & Modules

### 1. Multi-Tenant Architecture & Store Context Isolation
- Every record (`products`, `stocks`, `orders`, `customers`, `payments`, `audit_logs`) is bound to a `shop_id`.
- Support for multiple physical stocks/depots per tenant (e.g., Main Storefront, Downtown Warehouse, Secondary Depot).
- Inter-store stock transfers with approval trails.
- Store switching for authorized administrative staff and SuperAdmins.

### 2. Strict 3-Way Order Dispatch Lifecycle
To prevent employee collusion and inventory theft, orders adhere to a verifiable three-phase workflow:
1. **Sales Creation (`pending_payment` / `pending_store`):** Sales agents create orders, select items from catalog, specify delivery instructions, and record client references.
2. **Payment Verification (`paid` / `partial` / `debt`):** Cashiers or Accountants approve and record received funds (Cash, MTN Mobile Money, Airtel Money, Bank Transfer, or Approved Credit).
3. **Physical Stock Release (`dispatched`):** Storekeepers verify payment confirmation before physically releasing items from warehouse stock, deducting quantity and logging inventory movement.

### 3. Point of Sale (POS) & Negotiated Counter Sales
- Quick-search by SKU, barcode, or product name.
- Real-time stock availability verification with out-of-stock lockout.
- Below-cost alert indicator when counter salespeople negotiate prices near or below supplier cost.
- Instant thermal receipt and standard invoice printing (PDF generation via jsPDF & AutoTable).

### 4. Inventory, Valuation & Stock Movements
- Complete inventory audit trail (`inventory_movements`) tracking:
  - Initial inventory setup
  - Supplier restocks
  - Customer order deductions
  - Stock transfers between warehouses
  - Damaged / scrap adjustments
- Bulk product CSV/Excel importation with auto-generated SKUs and validation.
- Low-stock threshold alerts with color-coded dashboard indicators.

### 5. Role-Based Access Control (RBAC) & Capabilities
Granular permission matrix supporting five primary operational roles:
- **Platform SuperAdmin:** Multi-tenant billing, tenant provisioning, system health, and cross-store metrics.
- **Store Manager:** Full operational control over inventory, orders, customer credits, and store employees.
- **Accountant:** Payment reconciliation, rejected item resolutions, daily cashflow, and gross profit reporting.
- **Storekeeper:** Stock release verification, restock receiving, physical stock counting, and depot transfers.
- **Salesperson / Cashier:** Front-counter order creation, customer lookup, and receipt generation.

Individual capability flags include: `can_view_buying_prices`, `can_give_discounts`, `can_release_stock`, `can_manage_stock`, `can_view_reports`, `can_manage_users`, and more.

### 6. Dual-Engine Database Architecture
- **Zero-Config Development (SQLite / sql.js):** Runs instantly in WebAssembly without external server dependencies, seeded with realistic Rwandan hardware catalog presets (Twiga 32.5R, Cimerwa 42.5N, Fer à Béton 10mm/12mm, Tôles Bac 28G, Plascon paint).
- **Production PostgreSQL:** Seamless pooling using `pg` or `@neondatabase/serverless` over WebSockets/SSL for Cloud SQL, Neon, Supabase, or Vercel Postgres with automated table migrations and sequences.

### 7. Security & Resilience
- **Dual-Mode Authentication:** Express session authentication paired with stateless Bearer tokens (`x-auth-token` / `Authorization`) to ensure resilience against cross-origin iframe cookie restrictions and serverless cold starts.
- **CSRF Protection:** Double-submit cookie pattern with secure headers.
- **Brute-Force Protection:** IP and identity login throttling table.
- **Audit Logging:** System-wide immutable audit trail of logins, product price alterations, order voids, and manual stock overrides.

---

## 📂 Project Directory Structure

```text
├── api/                   # Serverless function builds (Vercel API entrypoints)
├── docs/                  # Employee Onboarding Handbook and documentation
├── public/                # Static assets, PWA manifest, offline cache, icons
├── server/
│   ├── app.ts             # Express application setup, security middleware, and session store
│   ├── auth.ts            # RBAC permissions, password hashing, and token verification
│   ├── database/
│   │   ├── db.ts          # Dual PostgreSQL/sql.js abstraction layer & schema seeding
│   │   └── backup.ts      # Automated JSON/SQL database snapshot utility
│   ├── routes/
│   │   ├── apiRoutes.ts   # Core JSON REST API (products, orders, stocks, users, POS)
│   │   ├── billingRoutes.ts # SuperAdmin billing, subscriptions, and tenant provisioning
│   │   └── iomsRoutes.ts  # Legacy SSR routes and server-rendered templates
│   ├── security.ts        # Helmet CSP headers and CSRF validators
│   └── upload.ts          # Multipart file upload handler for imports and receipts
├── src/                   # Modern React 19 Frontend SPA
│   ├── components/        # View modules (Dashboard, POS, Products, Stocks, Orders, etc.)
│   ├── db/                # Drizzle schema definitions (PostgreSQL schema mapping)
│   ├── services/          # Client API proxy (`api.ts`) and PDF exporter (`pdfExport.ts`)
│   ├── types.ts           # Shared TypeScript interfaces (Product, Order, User, Shop)
│   ├── App.tsx            # Main application shell, state management, and tab routing
│   └── main.tsx           # React DOM initialization
├── views/                 # EJS views for legacy SSR and printable invoice receipts
├── server.ts              # Local & development entrypoint with Vite middleware
├── package.json           # Dependencies and build scripts
└── vite.config.ts         # Vite build configuration
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: `v20.x` or `v22.x` (LTS recommended)
- **npm**: `v10.x` or higher

### Local Development Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/HAMIS-A-RWEMERA/VectOS.git
   cd VectOS
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
   *Note: In local development, leaving `DATABASE_URL` empty automatically defaults to the in-memory SQLite engine (`sql.js`), creating all tables and default demo accounts automatically.*

4. **Start the Development Server:**
   ```bash
   npm run dev
   ```
   The application will be available at `http://localhost:3000`.

### Default Demo Credentials (Pre-seeded)
- **SuperAdmin:** `rwemera30@gmail.com` / `password123`
- **Store Admin:** `admin@vectos.co.rw` / `password123`
- **Sales Agent:** `sales@quincaille.rw` / `password123`

---

## 🛠️ Build & Verification Commands

```bash
# Compile and bundle React frontend, server, and CSS:
npm run build

# Run TypeScript typechecks:
npm run lint

# Run automated test suites:
npm run test
```

---

## 📄 License & Ownership
Copyright © 2026 VectOS / Kigali Construction ERP. Built and maintained by Hamis A. Rwemera.

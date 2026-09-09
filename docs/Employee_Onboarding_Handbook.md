# VectOS Employee Onboarding Handbook

*Welcome aboard. This handbook is your practical guide to VectOS — the software that runs our hardware & electronics operations. It has been written so that the Operations Manager and the PR & Customer Relations Officer can each start productively from day one. Read it once fully, then keep it as a reference.*

---

## 1. What VectOS Is

VectOS is a web-based ERP (Enterprise Resource Planning) system built for Rwandan hardware and electronics businesses. It manages:

- **Sales at the counter (POS)** and credit/debt sales
- **Products & inventory** — what we sell, what we paid for it, how much stock we have
- **Warehouses & stocks** — multiple storage locations per store, transfers between them
- **Orders & fulfilment** — from "customer wants it" to "customer got it"
- **Customers & credit** — profiles, credit balances, and what they owe
- **Partner shops (B2B borrowing)** — sourcing stock from partner businesses and settling those accounts
- **Reports & analytics** — sales, profit, best sellers, staff performance
- **Staff & roles** — who is allowed to do what, controlled by the manager

Everything is **tenant-isolated**: every store (depot) only ever sees its own data — products, orders, customers, money. What happens in one shop is invisible to another.

The app has one modern interface (what you will use daily) and a set of administrative screens behind it. You will not need to know anything technical to do your job — but you *do* need to know what each screen means and what you are allowed to do there.

---

## 2. Logging In and Your First Session

1. Open the VectOS web address you were given (it runs over HTTPS — always check the padlock).
2. Sign in with the email and password provided to you by your manager.
3. Your session lasts 24 hours; you will be asked to sign in again after that.
4. The sidebar shows who you are logged in as, your **job title**, and the store you belong to. Always confirm you are in the correct store.

If you cannot log in, the message explains why. The common blockers are:

| Message / situation | Meaning | What to do |
|---|---|---|
| "Store subscription suspended" | The company's subscription is inactive or past due | Contact the VectOS administration / your MD |
| "Depot awaiting approval" | Store registration is still pending verification | Platform owner must approve and set up billing |
| "Account deactivated" | Your individual account was switched off | Ask your store manager |
| "Awaiting superadmin activation" | New account not yet activated for billing | Ask your store manager to complete activation |
| "Manager deactivated" | If the manager account is off, all staff are temporarily locked | Platform owner must reactivate the manager |

---

## 3. Roles and Permissions (The Checklist)

VectOS uses **roles** plus a **permission checklist**. A role is a label; the checklist decides exactly what that person can click. SuperAdmin (the platform owner) and Store Manager can do everything inside a store. Everyone else only does what their checklist allows.

**Roles used in the system:** SuperAdmin · Manager · Accountant · Storekeeper · Salesperson · Cashier · Employee.

**The 16 capabilities** (this is the list your manager ticks when creating staff accounts):

| Capability | What it lets you do |
|---|---|
| `can_create_orders` | Create orders and negotiate selling prices |
| `can_process_payments` | Confirm cash / MoMo / bank payments and receivables |
| `can_release_stock` | Storekeeper dispatch and stock release |
| `can_manage_stock` | Manage inventory and stock movements |
| `can_import_export_stock` | Bulk Excel/CSV import and stock export |
| `can_partner_borrow` | Resolve rejected items and partner-shop sourcing |
| `can_view_reports` | See financial reports and profit analytics |
| `can_view_buying_prices` | See what we paid (purchase costs, wholesale margins) |
| `can_give_discounts` | Authorize special client discounts and custom rates |
| `can_manage_users` | Manage staff roles and security checklists |
| `can_print_full_receipt` | Print financial receipts (with prices) |
| `can_print_delivery_note` | Print stock delivery notes (quantities only) |
| `can_manage_customers` | Manage customer profiles and credit balances |
| `can_manage_partners` | Manage partner shops and sourcing accounts |
| `can_void_orders` | Void / cancel sales orders and invoices |
| `can_edit_company_settings` | Edit company profile and TIN configuration |

**By default**, a new staff account starts with only a few capabilities pre-ticked (create orders, print receipts, print delivery notes, manage customers). If your job needs more, your manager adds them — you can never grant a capability to yourself.

**Rule of thumb:** if a button is missing, a permission is missing. Ask your manager to tick the relevant capability; the error message tells you exactly which one.

> **Recommended setups for the two of you:**
>
> **Operations Manager** — run at **Store Manager** role (full store authority), or an operational account with: create orders, process payments, give discounts, view buying prices, manage stock, import/export stock, release stock, view reports, manage customers, manage partners, void orders, print receipts & delivery notes, edit company settings.
>
> **PR & Customer Relations Officer** — **Employee** role with: manage customers, create orders, process payments, print full receipts, print delivery notes, give discounts (if you negotiate corporate deals). You should **not** need buying prices, stock management, voiding orders, or staff management — that stays with the Operations Manager to protect margins and audit trails.

---

## 4. The Main Screens

These are the screens in the sidebar. Each row includes what the screen is for.

| Screen | Purpose |
|---|---|
| **Dashboard** | Your morning glance. Today's sales, today's order count, total sales, total paid, total debt, products & customers counts, inventory value, low-stock count, recent orders, and the payment breakdown (cash / MoMo / bank / credit). |
| **POS & Counter Sales** | Create a sale at the counter quickly — search a product, add quantity, choose the customer (or "Walk-in"), take payment, print the receipt. |
| **Products & Inventory** | Every product: name, SKU/barcode, category, unit, buying price (if permitted), quantity, low-stock threshold. Add, edit, adjust stock, and bulk-import from Excel. |
| **Warehouses & Stocks** | Storage locations (depots) and the units in each. Set up locations, view counts, and move stock between locations (transfer). |
| **Orders & Dispatch** | All sales orders, their payment status (paid / partial / unpaid) and fulfilment status (pending → approved → dispatched → completed, or rejected). Print receipts and delivery notes here. |
| **Customers & Credit** | Customer profiles (name, phone, address, ID), their credit balance, order history and what they have spent with us. |
| **Partner Borrowing** | Partner shops we source from. Current balance with each partner, and resolution of items that were rejected or unavailable at our stores. |
| **Reports & Analytics** | Sales per category, top-selling products, and salesperson performance, plus the full audit log. |
| **Staff & Roles** | The staff checklist — who has which capabilities. Only managers / superadmin. |
| **SuperAdmin Stores** | Platform owner only. Approve new store registrations, manage billing (billed accounts, stocks, monthly fee), switch into a store to help. |

---

## 5. How an Order Actually Flows (Know This Cold)

1. **Create** — a salesperson (or you) builds the order at the POS/Orders screen and prints a receipt or delivery note. Payment can be cash, MoMo, bank transfer, or credit (debt).
2. **Approve** — items sit as *pending store* until the storekeeper approves them as available.
3. **Dispatch** — approved items move to *dispatched* and leave the store.
4. **Complete** — customer receives the goods; order is *completed*.
5. **Reject / source** — if we do not have or cannot supply an item, it can be marked *rejected* or *unavailable*. Rejected items can be resolved via **partner shops** (partner fulfils instead of us) — this is the `can_partner_borrow` flow.

Stock is deducted atomically at order time and **never goes negative** — the system refuses to sell more than it holds. If a multi-item order fails part-way, everything rolls back; nothing is half-deducted.

---

## 6. Operations Manager — Your Day-to-Day

**Morning (Dashboard):** check today's sales so far, yesterday's trend, total debt and receivables, and the **low-stock alert** in the sidebar. The low-stock list is your ordering trigger.

**Stock & reordering:**
- Products below `low_stock_threshold` appear with an amber badge. Decide what to reorder or transfer between warehouses.
- Use **Warehouses & Stocks** to review unit counts per location and **transfer** stock between locations when one depot runs low.
- Adjust stock only with a documented reason; the audit log records every change and by whom.
- Use **import/export (Excel)** for bulk catalog updates; there is a sample-template download so the format is never wrong.

**Fulfilment & dispatch:** use the storekeeper flow (or your own release permission) to move *pending store* orders to *approved / dispatched*. Only release exactly what was ordered — the delivery note prints quantities only.

**People:** create/edit staff in **Staff & Roles**, tick their capabilities against the table in Section 3. Remember: new accounts are only active once they pass activation — walk new hires through Section 2.

**Money:** confirm payments (cash/MoMo/bank) in **Orders & Dispatch → record payment**, reconcile the payment breakdown on the Dashboard against the register daily. Handle customer debts through **Customers & Credit**.

**Reports:** review **Reports & Analytics** — category sales, top sellers, salesperson performance — and read the **audit log** weekly; it is the paper trail for every sensitive action (voids, discount overrides, user changes, settings changes).

**Company setup:** keep **Settings → company profile** including TIN up to date; it appears on receipts and invoices.

**Backups:** the manager can export a full backup of store data and restore it. Keep a periodic export somewhere safe. Routine restores are rare but knowing how to do them is your job.

**Voids & discounts:** you (and only you as manager, or staff you ticked) may void orders and give discounts. Never void a completed, dispatched order without noting why — the system logs it.

---

## 7. PR & Customer Relations Officer — Your Day-to-Day

Your job is the customer's experience from first hello to after-sales. VectOS gives you the facts to do it well.

**Customer profiles (your home screen):**
- Keep names, phone numbers, addresses, and ID numbers accurate and complete. A customer who owes money must be reachable.
- Credit customers are tracked with a running **credit balance**. Before a sale on credit, check the balance; flag repeat non-payers to the Operations Manager rather than quietly extending more credit.
- Register a **Walk-in client** correctly when someone buys without an account, so sales are never lost or misattributed.

**Counter sales & receipts:** you can create orders, process cash/MoMo/bank payments, and print **full receipts** (prices) or **delivery notes** (quantities only). For corporate/institutional customers you may negotiate discounts if you have been given `can_give_discounts` — agree the rate *before* the sale and confirm the final figure with the customer.

**Handling complaints is where you shine:**
- If a customer says an item was wrong, check the **order** and its **fulfilment state** in Orders & Dispatch. Know whether it was approved, dispatched, completed or rejected.
- If we supplied something through a **partner shop** (after a rejection), explain the sourcing decision confidently — the order shows it was *partner fulfilled*.
- For disputes about invoicing, pull the receipt; every payment is recorded against the order with method, reference, and the person who recorded it.

**Partners (B2B relationships):** partner shops are suppliers we borrow from. Understand balances and sourcing so you can explain to customers where goods come from and why delivery sometimes takes a day. You may manage partner accounts only if ticked.

**Reports for communications:** with `can_view_reports` you can quote accurate numbers (e.g., "X deliveries completed this week", "our top-selling brands") for announcements and customer newsletters. Your reports view shows the totals — the Operations Manager owns the margin/commercial analysis.

**What stays outside your hands:** buying prices and wholesale margins (`can_view_buying_prices`), stock adjustments and transfers, voiding orders, and staff management. If a customer pushes on "what does it cost you?", the answer is *that is commercial information* — never guess or show figures you cannot see.

---

## 8. Security Rules That Apply to Everyone

1. **Never share your password or your session** — your name is in the audit trail for everything you do.
2. **Only do what your checklist allows.** If something is missing, ask the manager. Self-granting is impossible, and going around a control is a disciplinary matter.
3. **Stores are isolated.** Never share one customer's or one store's information with another store's staff.
4. **Never record a payment or release stock without seeing the order.** Money and stock moves are logged with your name and the exact time.
5. **Voids and discounts are the most-audited actions.** Keep the reason on record; a voided receipt without a reason looks like fraud to an auditor.
6. **Sessions and security:** the platform uses secure HTTPS-only cookies, CSRF protection, and two-factor authentication for the platform owner. If you ever see anything unusual (a wrong store appears, an odd order), report it immediately instead of working around it.
7. **Data lives in a managed PostgreSQL database** (Supabase) with versioned back-ups. You never touch the database — you work only through the screens.

---

## 9. Quick Problem-Solver

| I want to... | Where |
|---|---|
| Sell something at the counter | POS & Counter Sales |
| Check what a customer owes | Customers & Credit |
| Find out when an order was shipped | Orders & Dispatch → fulfilment status |
| Print a price receipt | Orders → Print receipt (needs `can_print_full_receipt`) |
| Print a delivery note (no prices) | Orders → Delivery note (needs `can_print_delivery_note`) |
| See what needs reordering | Sidebar low-stock badge / Products |
| Move stock to another warehouse | Warehouses & Stocks → transfer |
| Record a payment | Orders & Dispatch → record payment (needs `can_process_payments`) |
| See which products make the most money | Reports & Analytics (needs `can_view_reports`) |
| Explain a delay | Order shows rejected/unavailable → partner fulfilment; reassure with the delivery status |
| Grant a colleague a permission | Staff & Roles (manager only) |

---

*If a screen, button, or permission behaves differently from this handbook, tell your manager — VectOS is under continuous improvement, and the handbook is updated as the system grows.*
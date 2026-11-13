/**
 * VectOS AI Customer Care Knowledge Engine
 * Provides domain-scoped system instructions, live session context formatting,
 * and an intelligent fallback response engine for VectOS Hardware & Electronics ERP.
 */

export const VECTOS_SYSTEM_INSTRUCTION = `You are the **VectOS AI Assistant**, a warm, intelligent, conversational customer-care and product specialist strictly dedicated to **VectOS** (the Cloud Retail & Depot Operating System / ERP for Hardware, Construction Materials, Quincailleries, and Electronics stores in Rwanda).

================================================================================
1. CONVERSATIONAL STYLE & DOMAIN BOUNDARY (CRITICAL)
================================================================================
- **Conversational & Direct (Like ChatGPT / Gemini):**
  Respond naturally, directly, and helpfully to the user's exact question or follow-up. Keep answers clear, well-structured, and tailored to what they asked—do NOT dump the entire user manual unless they ask for a full overview. Remember earlier messages in the conversation and build on them naturally.
- **Strictly Scoped to VectOS Only:**
  Your knowledge and answers MUST stay strictly within **VectOS** and running a store/depot inside VectOS (its screens, workflows, POS & bargaining, inventory/CSV/AI Invoice Scanner, multi-warehouse stock, 3-way dispatch, "Client's Order" receipts & Delivery Notices, customer debts, partner borrowing, staff roles/permissions, reports, store registration/settings/passwords, and compatible hardware).
  If a user asks about anything unrelated to VectOS (e.g., general trivia, world news, politics, recipes, coding tutorials outside VectOS, math homework, medical/legal advice, or unrelated apps), **politely decline** in the user's language and explain that you can only assist with questions about the VectOS platform and their store operations.
- **Multilingual Fluency:**
  Match the language the user writes in:
  - Kinyarwanda -> reply fluently and warmly in Kinyarwanda.
  - English -> reply clearly and professionally in English.
  - French -> reply clearly and professionally in French.
  - Mixed (e.g., Kinyarwanda + English terms like "Client's Order", "POS", "Storekeeper") -> reply naturally in their dominant language while keeping the exact VectOS UI labels clear.
- **Never Invent Features:**
  Only describe features that actually exist in VectOS (listed below). If something is a known limitation (e.g., requires internet for live stock sync, no GPS truck tracking, not a public consumer e-commerce site like Jumia), state it honestly.
- **Support Contact:**
  You are the primary support assistant—solve the question completely yourself first. Only mention WhatsApp Support (**+250 781 549 993**) optionally at the end if the user needs human account approval, billing help, or hands-on onboarding.

================================================================================
2. COMPLETE VECTOS APPLICATION KNOWLEDGE BASE
================================================================================

1. WHAT VECTOS IS & PROBLEMS IT SOLVES:
- Multi-tenant Cloud ERP & POS built for Rwandan hardware stores (quincailleries), construction depots (cement, steel/rebar, roofing sheets, plumbing, paint), and electronics/tech retailers.
- Solves:
  * Employee theft & unauthorized stock release (via 3-way segregation of duties).
  * Cash vs MTN MoMo vs Airtel Money vs Bank reconciliation.
  * Forgotten/disputed customer debts (Amadeni ledger).
  * Multi-warehouse / shopfront stock discrepancies.
  * Below-cost selling losses during price bargaining.

2. THREE WAYS TO ADD / RESTOCK INVENTORY ("Products & Stock" tab):
- Option 1 — **Add New Product**: Single manual form (Name, SKU, Category, Unit, Quantity, Low Stock Threshold, Buying Cost, Selling Price).
- Option 2 — **Bulk Stock Import (CSV / Excel)**: Upload spreadsheets (.csv / .xlsx) to insert or restock hundreds of items at once; missing SKUs are auto-generated and existing items updated.
- Option 3 — **AI Invoice & Receipt Scanner**: Snap a photo or upload a PDF/document of a supplier invoice or delivery note (e.g., Cimerwa, Twiga, steel mills, wholesale suppliers). VectOS AI extracts product names, categories, packaging units, quantities, and unit prices into an **editable Staging Review Table** so the merchant can verify or edit every row before clicking "Confirm & Add Products". Default suggested selling price follows 1:1 parity with buying price until adjusted.

3. STRICT 3-WAY ORDER & WAREHOUSE DISPATCH LIFECYCLE:
- Step 1 (**Salesperson / Sales Agent**): Creates the customer order in POS with items, negotiated prices, and customer/driver notes.
- Step 2 (**Cashier / Accountant**): Verifies and approves payment (Cash, MTN MoMo, Airtel Money, Bank Transfer, or approved Customer Credit/Debt).
- Step 3 (**Storekeeper**): Inspects the **Delivery Notice (Bon de Livraison)**—which shows quantities and units WITHOUT commercial prices—loads physical goods, and confirms stock release. Stock quantity is safely deducted only upon verified release (or immediate POS counter sale if permitted).

4. POS, PRICE BARGAINING & NON-EBM "CLIENT'S ORDER" RECEIPTS:
- **Search & Barcode**: Search by name, SKU, or scan with a USB/Bluetooth barcode scanner.
- **Per-Item Negotiated Pricing (Bargaining)**: Before completing a sale, staff with pricing permission can adjust the selling price of *each individual product* in the cart after bargaining with the buyer. If a negotiated price drops below the supplier buying cost, VectOS shows a red **Below-Cost Warning**.
- **Editing Orders / Receipts**: Authorized staff can edit an order's items, quantities, or prices via **Edit Receipt** if a customer changes items or an item is out of stock.
- **Receipts Titled "Client's Order" (No Taxes / Non-EBM)**:
  * To make sure internal slips are NEVER confused with official RRA EBM tax receipts, all receipts are prominently titled **"Client's Order"** in bold, and **taxes/VAT lines are omitted**.
  * Supports 3 print sizes: **58mm** mini thermal roll, **80mm** standard POS roll, and **A4** full sheet—plus **Save A4 PDF** and **Copy Text** (for WhatsApp/SMS).
  * Separate **Delivery Notice (Bon de Livraison)** prints in 58mm, 80mm, A4, or PDF with **quantities only** (prices hidden) for storekeepers and drivers.

5. MULTI-WAREHOUSE & STOCK TRANSFERS ("Stores & Warehouses" tab):
- Track separate locations (e.g., Main Shopfront, Downtown Depot, Gikondo Warehouse) and transfer stock between depots with quantity checks and audit logs.

6. CUSTOMER CREDIT & DEBT LEDGER ("Customers & Debt" tab / Amadeni):
- Register credit clients (name, phone, national ID, address), sell on partial payment or full credit, record subsequent repayments, and recalculate balances instantly.

7. PARTNER BORROWING ("Partner Shops" tab / Kuguriza & Gutira):
- Record items borrowed from or lent to neighboring hardware shops (e.g., borrowing 20 bags of cement or 12mm rebar) and settle balances when restocked.

8. FINANCIAL REPORTS & EXPORTS ("Sales & Profit Reports" tab):
- Daily/weekly/monthly turnover, gross profit margins, stock valuation (capital tied in inventory), dead stock alerts, audit logs, and one-click PDF/Excel exports. (Buying costs and profit margins are hidden from staff without viewing permission.)

9. USER ROLES, GRANULAR PERMISSIONS & ACCOUNT SECURITY:
- 8 roles with customizable granular checkboxes under **Staff & Duties**: SuperAdmin, Platform Ops, Store Manager/Owner, Accountant, Storekeeper, Salesperson, Cashier, and Employee.
- Examples of granular permissions:
  * \`can_create_orders\`: Make sales / orders in POS.
  * \`can_process_payments\`: Take Cash/MoMo/Bank payments.
  * \`can_print_full_receipt\`: Print priced "Client's Order" receipts (salespeople without this permission can create orders and print Delivery Notices only).
  * \`can_release_stock\`: Storekeeper stock release & Delivery Notice.
  * \`can_manage_stock\` / \`can_import_export_stock\`: Add/edit products, CSV import, AI Scanner.
  * \`can_edit_company_settings\`: Update shop name, phone, address, optional TIN, and receipt footer under **Business Info & TIN**.
- **Changing Password**: Click the **Key icon** button in the top-right corner of the header bar anytime to change your password.

10. STORE REGISTRATION, APPROVALS & HARDWARE/LIMITATIONS:
- New shops register via **"Register New Store"** on the login screen; they start as **Pending** until approved by SuperAdmin (or auto-approved if enabled).
- **Internet & PWA**: Requires active internet (3G/4G/WiFi) for real-time multi-counter/multi-warehouse sync; installs as a PWA with offline shell fallback.
- **Hardware**: Works on Android/iPhone phones, tablets, laptops/PCs, USB/Bluetooth barcode scanners, and 58mm/80mm thermal or A4 printers.
- **Not a Public B2C Storefront / No GPS**: Private B2B store ERP (not a public marketplace like Jumia), and does not track external delivery trucks via GPS.`;

export function buildUserContextNote(sessionUser?: any): string {
  if (!sessionUser) {
    return '\n[CURRENT VISITOR CONTEXT: Not logged in (viewing the login/welcome screen). Answer questions about VectOS features, registration, onboarding, or troubleshooting login.]';
  }
  const roleLabel = sessionUser.job_title || sessionUser.role || 'staff';
  const shopName = sessionUser.shop_name || 'Active Shop';
  const perms = sessionUser.permissions && typeof sessionUser.permissions === 'object'
    ? Object.entries(sessionUser.permissions)
        .filter(([, v]) => Boolean(v))
        .map(([k]) => k)
        .join(', ')
    : 'role defaults';
  return `\n[CURRENT LOGGED-IN USER CONTEXT: Name="${sessionUser.name || 'User'}", Role="${sessionUser.role || 'user'}", Title="${roleLabel}", Shop="${shopName}", EnabledPermissions="${perms}". Use this context when they ask what they can or cannot do in VectOS, without exposing raw internal field names unnecessarily.]`;
}

function detectLanguage(text: string): 'rw' | 'fr' | 'en' {
  const q = text.toLowerCase();
  const rwSignals = [
    'muraho', 'mwaramutse', 'mwiriwe', 'bite', 'amakuru', 'ese', 'uko', 'iki', 'ibiki',
    'ibicuruzwa', 'ububiko', 'amadeni', 'umukiriya', 'abakiriya', 'abakozi', 'umukozi',
    'inshingano', 'uburyo', 'kwinjiza', 'gucuruza', 'gusohora', 'gutira', 'kuguriza',
    'inyemezabuguzi', 'fagitire', 'amafaranga', 'inyungu', 'iduka', 'kuki', 'nshaka',
    'mfasha', 'sobanura', 'ndabaza', 'cyangwa', 'kubera', 'ryari', 'he'
  ];
  const frSignals = [
    'bonjour', 'salut', 'bonsoir', 'merci', 'comment', 'pourquoi', 'quand', 'est-ce',
    'produits', 'stock', 'facture', 'reçu', 'commande', 'dette', 'client', 'clients',
    'employé', 'mot de passe', 'imprimer', 'boutique', 'magasin', 'livraison', 'prix'
  ];
  if (rwSignals.some(w => new RegExp(`\\b${w}\\b`, 'i').test(q))) return 'rw';
  if (frSignals.some(w => new RegExp(`\\b${w}\\b`, 'i').test(q))) return 'fr';
  return 'en';
}

export function getVectOSKnowledgeResponse(question: string, history?: any[], sessionUser?: any): string {
  const q = question.toLowerCase().trim();
  const lang = detectLanguage(q);

  // Inspect recent user messages for follow-up context ("tell me more", "how", "explain", "yes")
  const isShortFollowUp = q.length < 28 && /^(more|explain|how|why|yes|yeah|ok|okay|details|continue|and|what about|sobanura|komeza|uko bikora|comment)/i.test(q);
  const lastTopicText = isShortFollowUp && Array.isArray(history)
    ? history
        .slice(-4)
        .map((h: any) => String(h?.text || ''))
        .join(' ')
        .toLowerCase()
    : '';
  const combined = `${q} ${lastTopicText}`.trim();

  // 1. GREETING
  if (/^(muraho|bite|mwaramutse|mwiriwe|hello|hi|hey|good morning|good afternoon|good evening|bonjour|salut)\b/i.test(q) && q.length < 30) {
    if (lang === 'rw') {
      return `Muraho neza! Murisanga muri **VectOS AI Guide**.

Nshobora kubafasha ikintu cyose cyerekeye ikoreshwa rya VectOS:
- Kwinjiza ibicuruzwa (Manual, Excel/CSV, cyangwa **AI Invoice Scanner**)
- Gucuruza kuri **POS**, gucoca ibiciro ku gicuruzwa kimwe kimwe, no kwakira MoMo / Cash
- Inyemezabuguzi za **"Client's Order"** (58mm, 80mm, A4 — nta musoro/VAT) na **Delivery Notice**
- Amadeni y'abakiriya, gutira hagati y'amaduka, ububiko burenze bumwe, n'inshingano z'abakozi

Mumbaze ikibazo cyose mwifuza!`;
    }
    if (lang === 'fr') {
      return `Bonjour ! Bienvenue sur **VectOS AI Guide**.

Je peux vous aider uniquement sur tout ce qui concerne **VectOS** :
- Ajout de stock (Manuel, CSV/Excel ou **AI Invoice Scanner**)
- Ventes **POS**, négociation des prix par article et paiements MoMo / Cash
- Impression **"Client's Order"** (58mm, 80mm, A4 — sans taxes) et **Bon de Livraison**
- Dettes clients, dépôts multiples, emprunts entre partenaires et rôles du personnel

Quelle est votre question ?`;
    }
    return `Hello${sessionUser?.name ? `, ${sessionUser.name}` : ''}! Welcome to **VectOS AI Guide**.

I'm here to help with anything inside **VectOS**—from counter sales and per-item price bargaining to **"Client's Order"** thermal/A4 printing, Delivery Notices, CSV or AI Invoice stock entry, customer debts, multi-warehouse transfers, and staff permissions.

What would you like help with?`;
  }

  // 2. RECEIPTS / CLIENT'S ORDER / PRINTING / EBM / TAXES / 58MM / 80MM
  if (
    combined.includes("client's order") || combined.includes('ebm') || combined.includes('tax') ||
    combined.includes('vat') || combined.includes('print') || combined.includes('58mm') ||
    combined.includes('80mm') || combined.includes('thermal') || combined.includes('delivery notice') ||
    combined.includes('bon de livraison') || combined.includes('receipt') || combined.includes('inyemezabuguzi') ||
    combined.includes('fagitire') || combined.includes('imprimer')
  ) {
    if (lang === 'rw') {
      return `### Gusohora "Client's Order" na Delivery Notice muri VectOS

1. **Umutwe wa "Client's Order" & Kutagira Imisoro (Non-EBM):**
   - Inyemezabuguzi zose muri VectOS zanditseho **"Client's Order"** mu nyuguti zikomeye kandi nta misoro (VAT/Taxes) igaragaraho, kugira ngo zititiranywa n'inyemezabuguzi zemewe za **EBM**.
2. **Ingano 3 zo gucapa (58mm, 80mm, A4):**
   - Fungura **Orders & Receipts**, ukande kuri komande, hanyuma uhitemo **58mm** (utugapapuro duto), **80mm**, cyangwa **A4** (cyangwa ukande **Save A4 PDF**).
3. **Delivery Notice (Bon de Livraison):**
   - Iyi garagaza gusa **ingano y'ibicuruzwa (Quantities)** nta biciro kugira ngo ushinzwe ububiko n'umushoferi basohore ibintu mu mutekano.
4. **Uburenganzira (Permissions):**
   - Niba umugurisha atemerewe gusohora inyemezabuguzi ziriho ibiciro (\`can_print_full_receipt\`), abasha gukora komande gusa no gucapa Delivery Notice.`;
    }
    return `### Printing **"Client's Order"** & Delivery Notices in VectOS

- **Why it's titled "Client's Order" (No Taxes/VAT):** Every financial slip is prominently titled **"Client's Order"** with all tax/VAT rows removed so customers never confuse it with an official RRA **EBM** tax receipt.
- **3 Print Sizes (58mm, 80mm, A4):** Open **Orders & Receipts** (or print right after checkout), choose **58mm**, **80mm** thermal roll, or **A4** at the top of the modal, then click **Print Receipt** (or **Save A4 PDF** / **Copy Text**).
- **Delivery Notice (Bon de Livraison):** Switches to a quantities-only dispatch slip (hiding prices) for your Storekeeper and driver.
- **Staff Permissions:** Staff without the *Print Official Receipts* permission can create orders or print Delivery Notices, while Cashiers/Managers handle full priced **Client's Order** prints.`;
  }

  // 3. PASSWORD / LOGIN / REGISTRATION / APPROVAL
  if (
    combined.includes('password') || combined.includes('mot de passe') || combined.includes('ijambo banga') ||
    combined.includes('login') || combined.includes('sign in') || combined.includes('register') ||
    combined.includes('pending') || combined.includes('approve') || combined.includes('key')
  ) {
    if (lang === 'rw') {
      return `### Guhindura Ijambo Banga (Password) & Kwinjira muri Konti

- **Guhindura Password:** Kanda ku **kamenu k'urufunguzo (Key icon)** kari mu nguni yo hejuru iburyo ku mutwe wa ekran (Header) igihe cyose uri muri VectOS.
- **Kwandikisha Iduka Rishya:** Kanda **"Register New Store"** aho binjirira (Login screen). Nyuma yo kwiyandikisha, iduka ribanza mu cyiciro cya *Pending* kugeza igihe SuperAdmin aryemeje.
- **Niba bakubwiye ngo "Login again":** Ongera ufungure urupapuro (refresh) winjiremo bundi bushya kugira ngo konti yawe ihabwe token nshya.`;
    }
    return `### Passwords, Login & Store Registration

- **Change Password:** Click the **Key icon** in the **top-right corner** of the header bar anytime you're signed in.
- **Register a New Store:** Click **Register New Store** on the login page. New stores start in **Pending** status until approved by the platform SuperAdmin.
- **Staff Accounts:** Store Managers create and manage staff logins and passwords under **Staff & Duties**.`;
  }

  // 4. POS / BARGAINING / NEGOTIATION / EDITING ITEMS
  if (
    combined.includes('bargain') || combined.includes('negotiat') || combined.includes('price') ||
    combined.includes('edit') || combined.includes('pos') || combined.includes('curuza') ||
    combined.includes('momo') || combined.includes('cash') || combined.includes('sell') ||
    combined.includes('igiciro')
  ) {
    if (lang === 'rw') {
      return `### Gucuruza ku Kounteri (POS) & Kumvikana Ibiciro

1. Ongera ibicuruzwa muri Cart ukoresheje izina, SKU, cyangwa **Barcode Scanner**.
2. **Kumvikana igiciro kuri buri gicuruzwa:** Ushobora guhindura igiciro cy'igicuruzwa kimwe kimwe mbere yo kwishyura; niba giciye munsi y'igiciro cyo kurangura, sisitemu ihita igaragaza integuza y'umutuku (**Below Cost Warning**).
3. **Kwakira Ubwishyu:** Hitamo **Cash**, **MTN MoMo**, **Airtel Money**, **Bank Transfer**, cyangwa **Customer Credit/Debt**.
4. **Gukosora Komande:** Kanda **Edit Receipt** muri Orders & Receipts niba hari ibyo umukiriya ahinduye.`;
    }
    return `### POS Sales, Per-Item Bargaining & Order Editing

1. **Add Items Fast:** Search by product name, SKU, or scan barcodes directly into the POS cart.
2. **Bargain / Adjust Price Per Item:** You can adjust the selling price of each individual product in the cart (or during checkout) after negotiating with the customer. VectOS flags a red **Below-Cost Warning** if a negotiated price falls below your buying cost.
3. **Payment Options:** Accept Cash, MTN MoMo, Airtel Money, Bank Transfer, or Customer Credit/Debt (split or full).
4. **Need to Fix an Order Later?** Authorized staff can click **Edit Receipt** inside the order modal to swap out-of-stock items or update quantities.`;
  }

  // 5. INVENTORY / CSV / AI SCANNER
  if (
    combined.includes('option') || combined.includes('scan') || combined.includes('invoice') ||
    combined.includes('injiza') || combined.includes('product') || combined.includes('inventory') ||
    combined.includes('excel') || combined.includes('csv') || combined.includes('upload') ||
    combined.includes('import') || combined.includes('stock')
  ) {
    if (lang === 'rw') {
      return `### Uburyo 3 bwo Kwinjiza Ibicuruzwa muri VectOS

Jya muri **Products & Stock**:
1. **Add New Product:** Kwinjiza igicuruzwa kimwe kimwe (izina, SKU, ikiciro, igipimo, ingano, igiciro).
2. **Bulk Stock Import (CSV/Excel):** Kwinjiza ibicuruzwa byinshi icyarimwe uvanye muri spreadsheet (CSV/Excel).
3. **AI Invoice Scanner:** Fata ifoto ya fagitire y'ikiranguzo cyangwa PDF; AI isoma amazina, ingano n'ibiciro ikabishyira mu kameza ko kugenzura (**Staging Table**) mbere y'uko ukanda **Confirm & Add Products**.`;
    }
    return `### 3 Ways to Add & Restock Inventory in VectOS

Open **Products & Stock**:
1. **Add New Product:** Enter a single item manually (name, SKU, category, unit, quantity, low-stock threshold, buying/selling price).
2. **Bulk Stock Import (CSV / Excel):** Upload a \`.csv\` or \`.xlsx\` file to add or restock hundreds of items at once (missing SKUs are auto-generated).
3. **AI Invoice Scanner:** Upload a photo or PDF of a supplier invoice. VectOS AI extracts items, units, quantities, and prices into an editable **Staging Review Table** so you can double-check every row before saving.`;
  }

  // 6. 3-WAY DISPATCH / WAREHOUSE / STOREKEEPER
  if (
    combined.includes('dispatch') || combined.includes('sohora') || combined.includes('storekeeper') ||
    combined.includes('ubujura') || combined.includes('theft') || combined.includes('release') ||
    combined.includes('warehouse') || combined.includes('depot') || combined.includes('transfer')
  ) {
    if (lang === 'rw') {
      return `### Umutekano w'Ububiko (3-Way Dispatch) & Ububiko Burenze Bumwe

- **3-Way Dispatch:** (1) Umugurisha akora komande $\\to$ (2) Cashier/Umubitsi yemeza ubwishyu $\\to$ (3) **Storekeeper** asohora ibicuruzwa akoresheje **Delivery Notice** (itagira ibiciro). Stock igabanuka ari uko Storekeeper yemeje ko bisohotse.
- **Multi-Warehouse Transfers:** Ushobora gushyiraho ububiko bwinshi muri **Stores & Warehouses** ukimuramo ibicuruzwa hagati yabwo bifite inyandiko z'ubugenzuzi (audit logs).`;
    }
    return `### 3-Way Warehouse Dispatch & Multi-Depot Transfers

- **3-Way Fraud Protection:** (1) **Salesperson** creates the order $\\to$ (2) **Cashier / Accountant** verifies payment $\\to$ (3) **Storekeeper** reviews the price-free **Delivery Notice** and confirms release. Inventory is deducted only upon release.
- **Multi-Warehouse Stock:** Under **Stores & Warehouses**, create separate shopfront/depot locations and record tracked transfers between them.`;
  }

  // 7. DEBTS / PARTNERS / ROLES / REPORTS / WHAT IS VECTOS
  if (combined.includes('deni') || combined.includes('debt') || combined.includes('credit') || combined.includes('amadeni')) {
    return lang === 'rw'
      ? `### Gucunga Amadeni y'Abakiriya (Customers & Debt)\n\nJya muri **Customers & Debt** wandike umukiriya, nimero ye ya telefone n'indangamuntu. Iyo aguriye ku ideni muri POS, igice asigaye kwishyura kibikwa kuri konti ye, kandi ushobora kwakira ubwishyu bw'igice cyangwa bwose ukoresheje **Record Payment**.`
      : `### Customer Credit & Debt Tracking\n\nUnder **Customers & Debt**, register credit clients with phone/ID details. When selling on partial or full credit in POS, VectOS tracks the balance automatically and lets you record partial or full **Record Payment** installments anytime.`;
  }

  if (combined.includes('tira') || combined.includes('borrow') || combined.includes('partner') || combined.includes('muguriza')) {
    return lang === 'rw'
      ? `### Gutira no Kuguriza Hagati y'Amaduka (Partner Shops)\n\nMuri tab ya **Partner Shops**, wandikamo iduka ry'umufatanyabikorwa, ibyo mwatiranyije (urugero: imifuka ya ciment cyangwa fer à béton), hanyuma mwabishyura ukakanda **Settle Balance**.`
      : `### Partner Shop Borrowing\n\nIn **Partner Shops**, register neighboring partner depots, log items borrowed or lent when out of stock, and settle balances once returned or restocked.`;
  }

  if (combined.includes('role') || combined.includes('inshingano') || combined.includes('umukozi') || combined.includes('staff') || combined.includes('permission')) {
    return lang === 'rw'
      ? `### Inshingano 8 z'Abakozi (Staff & Duties)\n\nVectOS ifite inshingano 8 (**SuperAdmin, Platform Ops, Manager, Accountant, Storekeeper, Salesperson, Cashier, Employee**) kandi Manager ashobora gukanda checkbox ku burenganzira bwihariye bwa buri mukozi (urugero: gukora komande, kwakira amafaranga, gusohora Receipt, cyangwa guhindura stock).`
      : `### 8 Staff Roles & Granular Permissions\n\nUnder **Staff & Duties**, Managers assign one of 8 roles (**SuperAdmin, Platform Ops, Manager, Accountant, Storekeeper, Salesperson, Cashier, Employee**) and customize checkboxes per staff member—such as creating orders, taking payments, printing priced **Client's Order** receipts, releasing warehouse stock, or managing inventory.`;
  }

  if (combined.includes('raporo') || combined.includes('report') || combined.includes('profit') || combined.includes('nyungu') || combined.includes('valuation')) {
    return lang === 'rw'
      ? `### Raporo z'Inyungu n'Ububiko (Sales & Profit Reports)\n\nMuri **Sales & Profit Reports**, ubona amafaranga yinjiye, inyungu nyakuri (Gross Profit), agaciro k'ibiri mu bubiko (Stock Valuation), ibicuruzwa bitinda kugurwa, hamwe na PDF/Excel exports.`
      : `### Sales, Profit & Valuation Reports\n\nUnder **Sales & Profit Reports**, track daily/weekly/monthly turnover, gross profit margins, stock valuation, dead-stock indicators, audit logs, and download PDF or Excel reports.`;
  }

  if (
    combined.includes('solve') || combined.includes('kora iki') || combined.includes('what is') ||
    combined.includes('about vectos') || combined.includes('limit') || combined.includes('offline') ||
    combined.includes('internet') || combined.includes('ecommerce')
  ) {
    return lang === 'rw'
      ? `### VectOS ni iki kandi ikemura iki?\n\n**VectOS** ni sisitemu yo gucunga iduka ry'ubwubatsi cyangwa electronics mu Rwanda (POS, ububiko bwinshi, 3-way dispatch ihagarika ubujura, amadeni, AI Invoice Scanner, na raporo).\n\n**Imbibi:** Ikeneye murandasi kugira ngo ububiko buhuze ako kanya, ntabwo ari isoko rusange nka Jumia, kandi ntikurikirana imodoka kuri GPS.`
      : `### What VectOS Does & System Scope\n\n**VectOS** is a Cloud ERP & POS built for Rwandan hardware/construction depots and tech shops—preventing stock theft via 3-way dispatch, tracking MoMo/Cash/Debts, syncing multi-warehouse stock, scanning supplier invoices with AI, and printing 58mm/80mm/A4 **"Client's Order"** slips.\n\n**Boundaries:** Requires internet for live multi-user sync, is a private B2B store system (not a public marketplace like Jumia), and does not include GPS truck tracking.`;
  }

  // 8. OUT-OF-SCOPE OR UNMATCHED GENERAL QUERY (Polite domain-scoped response in user's language)
  if (lang === 'rw') {
    return `Muraho! Ndi umufasha wa AI wihariye kuri **VectOS ERP** gusa.

Niba ikibazo cyawe cyerekeye VectOS, nshobora kugufasha kuri:
- **POS & Ibiciro:** Kugurisha, gucoca ibiciro ku gicuruzwa, no kwakira MoMo / Cash / Ideni
- **Inyemezabuguzi:** Gucapa **"Client's Order"** (58mm / 80mm / A4) cyangwa **Delivery Notice**
- **Ububiko:** Kwinjiza ibicuruzwa (Manual, CSV/Excel, **AI Invoice Scanner**), cyangwa kwimura stock
- **Abakozi & Konti:** Inshingano z'abakozi, uburenganzira, cyangwa guhindura password

Mumbwire neza icyo mushaka gusobanukirwa muri VectOS mbafashe ako kanya!`;
  }

  if (lang === 'fr') {
    return `Bonjour ! Je suis l'assistant IA dédié exclusivement à **VectOS ERP**.

Je peux répondre à toutes vos questions concernant **VectOS** : ventes POS et négociation des prix, impression **"Client's Order"** (58mm/80mm/A4 sans taxes) et **Bon de Livraison**, ajout de stock (Manuel, CSV/Excel, Scanner IA), dettes clients, multi-dépôts et permissions du personnel.

Comment puis-je vous aider dans VectOS ?`;
  }

  return `I'm the **VectOS AI Assistant**, and my expertise is focused strictly on helping you use **VectOS** for your store and depot operations.

I couldn't connect to the live conversational engine just now or your question fell outside the quick offline topics—try asking specifically about:
- **POS & Bargaining:** Adjusting per-item prices, MoMo/Cash payments, or editing orders
- **Receipts & Dispatch:** Printing **"Client's Order"** (58mm, 80mm, A4 — no taxes) or **Delivery Notices**
- **Inventory:** Single entry, CSV/Excel import, **AI Invoice Scanner**, or warehouse transfers
- **Accounts & Security:** Staff roles/permissions, changing your password (top-right Key icon), or customer debts

What part of **VectOS** can I walk you through?`;
}

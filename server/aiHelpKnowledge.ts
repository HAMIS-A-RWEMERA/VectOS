/**
 * VectOS AI Customer Care Knowledge Engine
 * Provides comprehensive domain knowledge, customer care instructions,
 * and reliable offline responses for VectOS Hardware & Electronics ERP.
 */

export const VECTOS_SYSTEM_INSTRUCTION = `You are the VectOS Customer Care & Product Specialist AI, an expert customer-support representative for VectOS (the premier Retail & Depot Operating System for Hardware, Construction Materials, and Electronics in Rwanda).

YOUR CUSTOMER CARE MISSION:
You are here to assist store owners, managers, accountants, storekeepers, cashiers, and prospective clients.
Your tone must ALWAYS be warm, patient, welcoming, respectful, and customer-care oriented ("Muraho neza!", "Welcome to VectOS Customer Care!").
You must explain everything thoroughly, clearly, and step-by-step.
Never give dismissive answers or tell users to "just contact WhatsApp". You are their primary customer support guide and must provide the full explanation and solution yourself. (You may only mention our live WhatsApp support +250 781 549 993 at the very end as an optional secondary contact for personalized on-site onboarding).

MULTILINGUAL CAPABILITY:
- If the customer writes in Kinyarwanda, answer warmly and fluently in KINYARWANDA!
- If the customer writes in English, answer warmly and professionally in ENGLISH!
- If the customer writes in French, answer warmly and professionally in FRENCH!

================================================================================
COMPLETE VECTOS KNOWLEDGE BASE
================================================================================

1. WHAT VECTOS IS & THE PROBLEMS IT SOLVES:
- VectOS is a multi-tenant cloud Retail ERP and Depot Operating System built specifically for Rwandan hardware stores (quincailleries), building materials depots (cement, steel, roofing, plumbing, paint), and electronics retailers.
- Key Problems it Solves:
  * Eliminates Employee Theft & Stock Discrepancies: In traditional hardware stores, counter staff often release goods without payment, or warehouse workers take cement/rebar. VectOS enforces strict 3-way segregation of duties.
  * Reconciles Cash vs Mobile Money (MoMo/Airtel): Daily cash drawer vs MTN MoMo vs Airtel Money vs Bank transfers are reconciled cleanly.
  * Prevents Lost Customer Debts: Keeps a permanent, dispute-free ledger of all contractors and clients who take goods on credit.
  * Resolves Multi-Depot Confusion: Synchronizes stock between a main street storefront and multiple downtown/remote warehouses.
  * Stops Bargaining Losses: POS alerts counter staff when negotiated prices fall below the supplier buying cost.

2. THREE (3) WAYS TO INGEST / ADD INVENTORY:
VectOS provides three flexible methods to add or restock products:
- Option 1 — Add New Product (Single Manual Entry):
  For typing a single item's name, SKU, category, packaging unit, safety stock alert threshold, buying price, and selling price.
- Option 2 — Bulk Stock Import (CSV / Excel Upload):
  Upload hundreds of items at once from an existing spreadsheet. System auto-generates missing SKUs and updates existing quantities.
- Option 3 — AI Invoice & Receipt Scanner (Option 3):
  * Designed specifically for store owners who receive paper invoices, truck delivery notes, or supplier PDFs (from Cimerwa, Twiga, steel mills, or Chinese importers).
  * The user simply takes a photo with their phone camera or uploads the PDF/document.
  * Gemini 3.8 Flash extracts product names, categories, packaging units (bags, bars, sheets, meters, cartons), quantities, and prices.
  * INTERACTIVE DOUBLE-CHECK STAGING TABLE: Nothing is saved automatically! The merchant is shown an editable review table where they can double-check and edit any quantity, unit, or price before clicking "Confirm & Add Products".
  * 1:1 PRICE PARITY RULE: Suggested selling price is set equal to the entered buying price by default to prevent confusion for non-technical tenants.

3. STRICT 3-WAY ORDER DISPATCH LIFECYCLE:
To protect store owners from employee fraud, customer orders follow a 3-step physical verification workflow:
- Step 1 (Sales Creation): Sales Agent enters the customer order at the counter with desired items, quantities, and delivery notes. Status: "Pending Payment".
- Step 2 (Accountant / Cashier Approval): The cashier or accountant checks that cash, MTN MoMo, Airtel Money, or approved credit has been received, then marks payment as approved. Status: "Pending Store Release".
- Step 3 (Storekeeper Stock Release): The warehouse storekeeper physically inspects the approved order slip, hands over the physical goods, and clicks "Confirm Release". Only then is stock deducted from inventory.

4. POINT OF SALE (POS) & COUNTER SALES:
- Quick lookup by typing name, SKU, or scanning barcodes with any USB/Bluetooth barcode reader.
- Negotiated Pricing: Counter agents can adjust prices for bulk buyers, but the POS displays a clear warning if the negotiated price is below supplier cost.
- Payment Methods: Cash, MTN Mobile Money (MoMo), Airtel Money, Bank Transfer, or Customer Credit/Debt.
- Instant Invoicing: Generates 80mm thermal receipts for portable printers or full A4 EBM-compliant PDF invoices.

5. MULTI-WAREHOUSE & DEPOT STOCK TRANSFERS:
- Support for multiple physical stocks (e.g. Main Shopfront, Downtown Depot, Gikondo Warehouse).
- Stock Transfers: Staff can transfer inventory from one warehouse to another with quantity checks, notes, and full audit logs.

6. CUSTOMER CREDIT & DEBT MANAGEMENT (AMADENI):
- Tracks every client who owes money, their phone number, national ID, and credit history.
- Partial and full debt payments can be recorded with instant balance recalculation.
- Prevents selling on credit to customers who have exceeded their credit threshold.

7. PARTNER BORROWING (KUGURIZA / GUTIRA HAGATI Y'ABACURUZI):
- Common in Kigali hardware centers (Quartier Commercial, Muhima, Nyabugogo, Kimironko): when a depot runs out of 12mm rebar or white paint, they borrow from a neighboring friendly store.
- VectOS tracks what was borrowed, from which partner store, current balance, and return settlements.

8. FINANCIAL REPORTS & VALUATION:
- Daily gross revenue, supplier costs, profit margins, and dead stock indicators.
- Total capital tied in warehouse inventory (Stock Valuation).
- Exportable to PDF and Excel for accountants and tax filing.

9. EIGHT (8) USER ROLES & GRANULAR PERMISSIONS:
- SuperAdmin ("Big Boss"): Platform creator with multi-tenant oversight, store activation, billing, and system health.
- Store Manager / Owner: Complete control over store catalog, users, reports, and settings.
- Accountant: Payment reconciliation, cashflow, gross profit analytics, and rejected order resolutions.
- Storekeeper: Warehouse stock releases, restock receiving, physical inventory audits, and depot transfers.
- Salesperson: Counter sales, customer orders, and catalog stock checks.
- Cashier: Payment collection and receipt printing.
- Platform Ops: Customer support, onboarding, and platform relations.
- Employee: Basic order taking.

10. SYSTEM LIMITATIONS & CLARIFICATIONS (WHAT VECTOS IS NOT):
- Requires Internet: Because stock must stay synchronized in real-time across multiple counters and warehouses, an active internet connection is required (supported on 3G/4G/5G/WiFi). A progressive web app (PWA) cache allows offline viewing.
- Not a Public B2C Marketplace: VectOS is a private B2B ERP and inventory management system for the store owner, NOT an open e-commerce platform like Amazon or Jumia where random consumers buy online.
- Hardware Compatibility: Works in any web browser on smartphones (Android/iPhone), tablets, laptops, desktop PCs, USB/Bluetooth barcode scanners, and ESC/POS thermal receipt printers.
- Physical Transport: Coordinates dispatch verification inside the warehouse, but does not track external delivery trucks via GPS.

11. STORE REGISTRATION & ACTIVATION:
- New tenants click "Register New Store" on the login screen.
- After registration, the store starts in "Pending" status for security verification.
- SuperAdmin ("Big Boss" - rwemera30@gmail.com) reviews and clicks "Accept & Activate", after which the store owner can log in immediately.`;

export function getVectOSKnowledgeResponse(question: string, history?: any[]): string {
  const q = question.toLowerCase().trim();

  // 1. GREETING
  if (/^(muraho|bite|mwaramutse|mwiriwe|hello|hi|hey|bonjour|salut)/i.test(q) && q.length < 25) {
    return `Muraho neza! Murisanga muri serivisi y'abakiriya ya VectOS (Kigali Construction & Hardware Depot ERP).

Niteguye kubafasha gusobanukirwa ibyerekeye sisitemu yacu:
1. Kwinjiza ibicuruzwa (Uburyo 3 burimo na AI Invoice Scanner)
2. Gucuruza ku kounteri (POS) no kwakira MTN MoMo / Cash / Amadeni
3. Gusohora ibicuruzwa mu bubiko nta bujura (3-Way Order Dispatch)
4. Gucunga ububiko burenze bumwe (Multi-Warehouse & Transfers)
5. Amadeni y'abakiriya (Customer Debt Recovery)
6. Gutira / kuguriza ibikoresho abandi bacuruzi (Partner Borrowing)
7. Inshingano z'abakozi 8 (User Roles & Permissions)

Ni iki mwifuza ko tubasobanurira birambuye uyu munsi?`;
  }

  // 2. WHAT IS VECTOS / WHAT PROBLEMS DOES IT SOLVE / WHY USE IT
  if (
    q.includes('solve') || q.includes('kora iki') || q.includes('what is') || q.includes('kugirango') || 
    q.includes('akamaro') || q.includes('why') || q.includes('solution') || q.includes('limits') || 
    q.includes('intego') || q.includes('problem') || q.includes('ibibazo') || q.includes('pourquoi')
  ) {
    return `### VectOS ni iki kandi ikemura ibihe bibazo? (What VectOS Solves)

**VectOS** ni sisitemu igezweho yo gucunga ububiko, ubucuruzi, n'amafaranga (Cloud ERP & POS) yakorewe by'umwihariko amaduka acuruza ibikoresho by'ubwubatsi (Quincaillerie / Hardware), ibikoresho by'amashanyarazi (Electronics), n'ububiko bunini (Depots) mu Rwanda.

#### 1. Ibibazo bikomeye VectOS ikemura:
- **Guhagarika ubujura n'inyerezwa ry'ibikoresho (Zero Inventory Leakage):** Sisitemu ikoresha amategeko 3 akomeye: Umugurisha yandika komande $\\to$ Umucungamari yemeza ko wishyuwe (Cash/MoMo) $\\to$ Ushinzwe ububiko akabona gusohora ibintu mu bubiko. Nta mukozi ushobora gusohora ciment cyangwa fer à béton atabifitiye uruhushya.
- **Kuringaniza amafaranga ya Cash na Mobile Money (MoMo/Airtel Reconciliation):** Ongeraho kwakira MoMo, Airtel Money, Bank Transfer, cyangwa Cash buri munsi uzi neza ayinjiye kuri buri buryo.
- **Kwirinda amadeni azimira (Customer Debt Tracking):** Amadeni yose y'abubatsi n'abakiriya yandikwa ku mazina yabo, nimero za telefoni, n'igihe bagomba kwishyurira.
- **Guhuza ububiko burenze bumwe (Multi-Stock Depots):** Niba ufite iduka ku muhanda n'ububiko bunini ahandi (urugero: Muhima na Gikondo), uhita umenya ibiri muri buri bubiko n'ibyimurwa.
- **Kwirinda guhomba mu gukata ibiciro (Below-cost Alert):** Iyo umugurisha agurishije ku giciro kiri munsi y'icyo mwaranguriyeho, sisitemu imuha integuza ihita imubuza guhomba.

#### 2. Imbibi n'ibyo VectOS itakora (System Limits):
- **Ikeneye murandasi (Internet Connection):** Kugira ngo ububiko buhuze neza kuri telefoni, mudasobwa, na POS zose icyarimwe, ikenera murandasi (4G/WiFi/3G).
- **Si isoko rusange ryo kuri interineti (Not a B2C public ecommerce):** Ntabwo ari urubuga rwo kwanikaho ibicuruzwa ngo abantu bo hanze baze gutumiza nka Jumia, ahubwo ni sisitemu y'ubuyobozi bw'iduka ryawe.
- **Ikorana n'ibikoresho byose:** Ikorana na telefone zose z'abakozi, mudasobwa, barcode scanners, na thermal printers zo gusohora inyemezabuguzi.`;
  }

  // 3. INVENTORY & THE 3 INGESTION METHODS (INCLUDING AI SCANNER)
  if (
    q.includes('option') || q.includes('scan') || q.includes('ai') || q.includes('invoice') || 
    q.includes('receipt') || q.includes('injiza') || q.includes('product') || q.includes('inventory') || 
    q.includes('excel') || q.includes('csv') || q.includes('uburyo 3') || q.includes('ajouter')
  ) {
    return `### Uburyo 3 bwo kwinjiza ibicuruzwa muri VectOS (3 Inventory Ingestion Options)

VectOS yabashyiriyeho uburyo butatu (3) bwuzuzanya bwo kongera ibicuruzwa mu bubiko:

---

#### 🔹 Option 1: Add New Product (Kwinjiza igicuruzwa kimwe kimwe)
- Ukanda ahanditse **"Add New Product"**.
- Wuzuza izina ry'igicuruzwa (urugero: *Ciment Twiga 32.5R*), ikiciro (Category), igipimo (Unit: sac, barre, tôle, pcs), umubare w'ibiri mu bubiko, n'igiciro.
- **Icyitonderwa cy'igiciro:** Igiciro cyo kugurisha (Selling Price) kigomba kungana n'icyo mwaranguriyeho (Buying Price) by'agateganyo nk'uko mwabisabye.

---

#### 🔹 Option 2: Bulk Stock Import (Gukoresha Excel cyangwa CSV)
- Ukanda ahanditse **"Bulk Stock Import (CSV/Excel)"**.
- Ushyiramo dosiye ya Excel cyangwa CSV irimo urutonde rw'ibicuruzwa byinshi icyarimwe (urugero: ibintu 500).
- Sisitemu ihita ibishyira mu bubiko ako kanya, ikanabitunganyiriza kode za SKU.

---

#### 🔹 Option 3: AI Invoice & Receipt Scanner (Gukoresha Ifoto ya Fagitire / PDF)
- **Uburyo butangaje ku bacuruzi badashaka kwandika:**
  1. Kanda kuri **"AI Invoice Scanner (Option 3)"**.
  2. Fata ifoto ya fagitire yakwandikiwe n'uruganda/ikiranguzo nka Twiga, Cimerwa, abashinwa, cyangwa ushyiremo PDF.
  3. AI (Gemini 3.8 Flash) ihita isoma amazina y'ibicuruzwa, ingano (quantities), n'ibiciro (prices).
  4. **Akameza ko kubanza kugenzura (Staging Review Table):** Nta kintu gihita kijya mu bubiko ako kanya! Ubanza kubona imbonerahamwe y'ibyasomwe byose ukagenzura ko umubare n'ibiciro ari ukuri, wanahinduramo icyo ushaka.
  5. Numara kwizera ko byose ari byo, ukanda **"Confirm & Add Products"** bigahita byinjira mu bubiko bw'iduka ryawe ku buntu (zero token cost)!`;
  }

  // 4. POS & COUNTER SALES / ACCEPTING MOMO & CASH
  if (
    q.includes('pos') || q.includes('curuza') || q.includes('sell') || q.includes('momo') || 
    q.includes('cash') || q.includes('counter') || q.includes('kounteri') || q.includes('vente')
  ) {
    return `### Uko bacuruza ku Kounteri (POS & Counter Sales Guide)

Gucururiza kuri kounteri muri VectOS byorohereza abakozi bawe gukora vuba no kwirinda amakosa:

1. **Gushakisha igicuruzwa:**
   - Koresha akuma gasoma barcode scanner cyangwa wandike inyuguti nke z'izina ry'igicuruzwa (urugero: "ciment", "fer", "toles").
2. **Kongera muri Cart:**
   - Kanda ku gicuruzwa ushyiremo ingano (quantity) umukiriya yifuza.
   - Niba ibicuruzwa bishize mu bubiko, sisitemu ihita ikubuza (Out of stock lockout).
3. **Kuvugana igiciro (Negotiated Pricing):**
   - Niba umukiriya aranguje ibintu byinshi, umukozi ashobora guhindura igiciro. Ariko niba akase igiciro kikagera munsi y'icyo mwakiranguyeho, sisitemu ihita imwereka **"Below Cost Warning"** y'umutuku.
4. **Uburyo bwo kwishyura (Payment Methods):**
   - **Cash:** Amafaranga y'inoti mu ntoki.
   - **MTN Mobile Money (MoMo) / Airtel Money:** Kwakira amafaranga kuri telefone y'ubucuruzi.
   - **Bank Transfer:** Kwishyurira kuri konti ya banki.
   - **Customer Debt (Ideni):** Niba ari umwubatsi wemerewe gufata ibintu ku ideni.
5. **Gusohora Inyemezabuguzi (Receipt Printing):**
   - Ushobora gusohora A4 official receipt ifite TIN number n'ibirango by'iduka, cyangwa agapapuro gato ka 80mm thermal receipt.`;
  }

  // 5. 3-WAY ORDER DISPATCH / WAREHOUSE SECURITY
  if (
    q.includes('dispatch') || q.includes('sohora') || q.includes('storekeeper') || q.includes('ubujura') || 
    q.includes('order') || q.includes('theft') || q.includes('kugenzura') || q.includes('release')
  ) {
    return `### Uburyo bwo Gusohora Ibintu mu Bubiko (Strict 3-Way Order Dispatch)

Iri ni ryo banga rikomeye rya VectOS rihagarika ubujura n'inyerezwa ry'ibikoresho mu bubiko bw'ubwubatsi:

1. **Intambwe ya 1: Umugurisha (Sales Agent)**
   - Yandika ibyo umukiriya asabye muri sisitemu, akandika n'izina rye cyangwa plaque y'imodoka itwara ibintu.
   - Komande iba iri muri leta ya: **"Pending Payment"** (Itegereje kwishyurwa).
2. **Intambwe ya 2: Umucungamari / Cashier (Accountant)**
   - Areba ko amafaranga yageze kuri MoMo, Banki, cyangwa Cash mu isanduku.
   - Yemeza ubwishyu: komande ihita igera kuri **"Pending Store Release"** (Yemejwe, itegereje gusohorwa).
3. **Intambwe ya 3: Ushinzwe Ububiko (Storekeeper)**
   - Areba fagitire kuri mudasobwa cyangwa telefone ye mu bubiko.
   - Apakirira imodoka ibintu byuzuye, maze agakanda **"Confirm Release"**.
   - Icyo gihe gusa ni bwo ibicuruzwa bigabanywa mu ibarura ry'ububiko!

*Ibi bituma umugurisha adashobora kwiba umukoresha, kandi ushinzwe ububiko ntasohore ibintu bitishyuwe.*`;
  }

  // 6. CUSTOMER DEBTS & CREDIT MANAGEMENT
  if (
    q.includes('deni') || q.includes('debt') || q.includes('credit') || q.includes('dette') || 
    q.includes('wishyura') || q.includes('balance') || q.includes('amadeni')
  ) {
    return `### Gucunga Amadeni y'Abakiriya (Customer Debt Management)

Muri VectOS, guha abubatsi ibikoresho ku ideni bikorwa mu mutekano usesuye:

1. **Kwandika Umukiriya w'Ideni:**
   - Jya muri tab yitwa **"Customers & Credit"**.
   - Shyiramo izina rye, nimero ya telefone, nimero y'indangamuntu, n'aho atuye.
2. **Gufata Ideni ku Kounteri (POS):**
   - Iyo mugurisha, muhitamo "Credit / Debt" nk'uburyo bwo kwishyura, mukandika izina ry'uwo mukiriya.
   - Sisitemu ihita yandika ayo madeni kuri konti ye, ikanerekana itariki n'ibikoresho yatwaye.
3. **Kwishyura Ideni (Debt Repayment):**
   - Iyo umukiriya aje kwishyura (yaba yose cyangwa igice), mukanda ahanditse **"Record Payment"**.
   - Ideni rye rihita rigabanuka mu buryo bw'ako kanya kandi mugahita muha inyemezabuguzi y'amafaranga amaze kwishyura.`;
  }

  // 7. ROLES & PERMISSIONS
  if (
    q.includes('role') || q.includes('inshingano') || q.includes('umukozi') || q.includes('staff') || 
    q.includes('permission') || q.includes('user') || q.includes('boss') || q.includes('ububasha')
  ) {
    return `### Inshingano 8 z'Abakozi muri VectOS (8 User Roles & Permissions)

Buri mukozi w'iduka ahabwa uruhushya ruhwanye n'akazi ke kugira ngo amabanga n'amafaranga by'iduka birindwe:

1. **SuperAdmin ("Big Boss" - rwemera30@gmail.com):**
   - Umuyobozi w'ikirenga wemeza amaduka mashya (Store approvals), agenzura seriveri, akanafatira imyanzuro sisitemu yose.
2. **Platform Operations (platform_ops):**
   - Abakozi bashinzwe gufasha abakiriya (customer support), kubafasha kumenyera sisitemu, no kubakemurira ibibazo bya tekiniki.
3. **Store Manager / Nyiriduka (manager):**
   - Afite ububasha bwose mu iduka rye: kureba ibiciro by'ibiranguzo, inyungu y'iduka, kongeramo abakozi, no guhindura amakuru y'ubucuruzi.
4. **Accountant / Umubitsi (accountant):**
   - Ashinzwe kureba raporo z'amafaranga, kwemeza ubwishyu bwa MoMo na Banki, no gukemura ibibazo by'amafaranga.
5. **Storekeeper / Ushinzwe Ububiko (storekeeper):**
   - Asinya ko yakiriye ibiranguzo bishya, asohora ibicuruzwa byishyuwe, akanafatanya n'abandi mu kubarura ibiri mu bubiko.
6. **Salesperson / Umugurisha (salesperson):**
   - Aciririkanya n'abakiriya ku kounteri, akora komande, akareba ibihari mu bubiko (ariko ntabona ibiciro by'ikiranguzo).
7. **Cashier / Umucungamari (cashier):**
   - Yakira amafaranga kuri kounteri agasohora inyemezabuguzi (thermal receipt).
8. **Employee / Umukozi usanzwe (employee):**
   - Afata komande z'ibanze atabanje guhindura ibiciro.`;
  }

  // 8. PARTNER BORROWING
  if (
    q.includes('tira') || q.includes('borrow') || q.includes('partner') || q.includes('muguriza') || 
    q.includes('iduka rindi') || q.includes('prêter')
  ) {
    return `### Gutira no Kuguriza hagati y'Abacuruzi (Partner Borrowing)

Ibi bikunze kubaho mu masoko y'ubwubatsi mu Rwanda (urugero: mu Mujyi rwagati, Muhima, Kimironko, Nyabugogo): iyo umukiriya asabye ibintu utagifite mu bubiko, utira mu iduka rya mugenzi wawe.

1. **Kwandika iduka ry'umufatanyabikorwa:**
   - Jya muri tab yitwa **"Partners"**.
   - Shyiramo izina ry'iduka mutirana n'aho rikorera.
2. **Kwandika ibyo mutiye:**
   - Iyo utiye ibikoresho (urugero: imifuka 20 ya ciment), ubyandika muri sisitemu.
3. **Gusubiza ibyo mwatiye (Settlement):**
   - Iyo wamaze kubona ibiranguzo bishya ukamusubiza ibye, ukanda **"Settle Balance"** muri sisitemu, bikabarurwa neza nta mwiryane.`;
  }

  // 9. REPORTS & VALUATION
  if (
    q.includes('raporo') || q.includes('report') || q.includes('profit') || q.includes('nyungu') || 
    q.includes('amafaranga') || q.includes('valuation') || q.includes('chiffre')
  ) {
    return `### Raporo z'Ubukungu n'Inyungu (Financial Reports & Analytics)

VectOS iguha ishusho nyakuri y'uburyo ubucuruzi bwawe buhagaze buri segonda:

- **Today's Gross Sales:** Amafaranga yose yinjiye uyu munsi muri rusange.
- **Gross Profit Margin:** Inyungu nyakuri ubonye uyu munsi ugereranyije n'ibiciro waranguriyeho.
- **Tied Stock Valuation:** Agaciro k'amafaranga yose afunze mu bubiko bwawe (ibicuruzwa byose bihari x ibiciro waguzeho).
- **Dead Stock Alert:** Ibikoresho bimaze igihe mu bubiko bitagurishwa ngo ubimenye ubihindurire uburyo bwo kubigurisha.
- **Export to PDF & Excel:** Ushobora gukuramo raporo z'ukwezi cyangwa z'umwaka ukaziha abacungamari bawe cyangwa ubuyobozi bw'imisoro.`;
  }

  // 10. DEFAULT COMPREHENSIVE CUSTOMER CARE WELCOME & OVERVIEW
  return `### Muraho neza! Murisanga muri serivisi y'abakiriya ya VectOS ERP

Niteguye kubaha ibisobanuro birambuye ku buryo VectOS ikora n'uko yafasha iduka ryanyu:

1. **Kwinjiza ibicuruzwa mu bubiko (Uburyo 3):**
   - *Option 1:* Add New Product (Kwandika kimwe kimwe n'amaboko).
   - *Option 2:* Bulk Stock Import (Kwinjiza byinshi icyarimwe ukoresheje Excel/CSV).
   - *Option 3:* AI Invoice Scanner (Gufata ifoto ya fagitire/PDF, AI ikabisoma, ukabanza kubigenzura ku kameza mbere yo kubyemeza).
2. **Gucururiza ku Kounteri (POS):**
   - Shakisha mu buryo bwihuse, koresha barcode scanner, akira MTN MoMo / Airtel Money / Cash / Amadeni.
3. **Umutekano w'Ububiko (3-Way Dispatch):**
   - Umugurisha arandika $\\to$ Umucungamari aremeza ko wishyuwe $\\to$ Ushinzwe ububiko akabona gusohora ibintu.
4. **Gucunga Amadeni (Customer Debt Ledger):**
   - Kwandika abakiriya bafashe ibikoresho ku ideni no kwakira ubwishyu bwabo igice ku kindi.
5. **Gucunga ububiko burenze bumwe (Multi-Warehouse Transfers).**

Mubajije ikibazo cyihariye ku kintu mushaka gusobanukirwa, mbafasha by'umwihariko mu Kinyarwanda cyangwa mu Cyongereza!`;
}

# Standard Operating Procedure (SOP): Accounts Payable Processing

## 1.0 Purpose & Scope

This SOP defines the mandatory steps for receiving, validating, coding, matching, approving, and archiving all corporate accounts payable invoices. It applies to all AP processors, accountants, and finance personnel executing transactions in the Oracle ERP system for Corporate Entities (including CLA). It is the single source of truth to eliminate transactional errors and enforce internal financial controls.

## 2.0 Standard Workflow Steps

Document Reception → Header & Identity Validation → PO / Non-PO Routing → 3-Way Matching → GL Coding & Distributions → Approvals & Archiving

### Step 2.1: Document Reception & Initial Validation

- **Verify Corporate Identity:** Company VAT number must be clearly stated on the invoice PDF (e.g., BE0464418182 for CLA).
- **Verify Supplier Identity:** Supplier VAT number on the document must match the verified supplier record in Oracle.
- **Cross-Check Core Metadata:** Invoice number, total amount, currency (EUR, USD, etc.), and invoice date must be consistent between the PDF and the Oracle entry screen.
- **Determine Document Type:** Confirm classification as Invoice, Credit Note, or Proforma Invoice.
- **Establish Accounting Date:** Accounting date must fall within the currently open posting month. Adjust manually in Oracle if required.

### Step 2.2: Purchase Order (PO) Status Verification

For all supplier types requiring a PO:

- Locate the PO number on the invoice and verify it matches a valid, active PO in Oracle.
- PO status must **not** be Canceled, Closed, Rejected, or Pending Approval.
- PO status 'CLOSED FOR RECEIVING or 'OPEN' is valid to be processing.
- Supplier name on the PO must match the supplier name on the invoice.
- Go to Lines → Match invoice Lines → Remove all wings → insert the PO number → Search.
- Select the lines that match the PDF.
- Check the PO Header Description for warehouse or project information. Compare it against the Distribution Codes Matrix for the corresponding supplier type, and post the invoice using the segment values specified in the "Segment" column.
- Check if there are any exceptions for this supplier in the Exception.json file.

### Step 2.3: 3-Way Matching & Quantity/Price Variance Rules

| Scenario | Action Required |
|---|---|
| Price/Quantity variance within tolerance (variance ≤ 3% AND total difference ≤ 3 EUR) | Accept and post per the PDF. |
| Quantity mismatch but Total Amount identical (e.g., PO: 1 × 200 = 200; Invoice: 200 × 1 = 200) | Do not adjust quantity or price. Post the line exactly as the PO is structured. |
| Invoice Qty & Amount greater than PO (e.g., PO: 10 × 20 = 200; Invoice: 15 × 25 = 375) | If buyer is located in **Moldova (MD)**: halt and instruct buyer to adjust the PO. All other buyer locations: process and post per invoice. |
| Invoice Qty & Amount less than PO (e.g., PO: 15 × 25 = 375; Invoice: 10 × 20 = 200) | Process and post exactly as presented on the PDF. |
| Qty = 1, Invoice Amount less than PO (e.g., PO: 1 × 200 = 200; Invoice: 1 × 180 = 180) | Calculate fractional quantity = Invoice Amount / PO Price (e.g., 180/200 = 0.90). Post using the original PO Price with the calculated quantity. Use more than 2 decimals if needed to exactly match the invoice total. |
| Qty = 1, Invoice Amount greater than PO (e.g., PO: 1 × 180 = 180; Invoice: 1 × 200 = 200) | Overwrite and post at Qty 1, Price 200, unless restricted by a specific profile rule (e.g. TrainingPersonnel_PO). |

### Step 2.4: General Ledger (GL) Coding & Segment Distributions

- **Standard Distribution Sets:** Assigned automatically from the validated supplier type or matched PO distribution data.
- **Temporary Accounts Rule:** For temporary accounts, keep default values on all segments except **Segment 1** and **Segment 3**.
- **APALLOC Allocation Logic:** If **Segment 6** = `APALLOC`, format **Segment 8** as `BE12` + the 3-character warehouse number from the "Real Estate Pool KTN Antwerpen" master reference file.

### Step 2.5: Final Invoice Finalization & Routing

- **Boerentoren Project Routing:** If the PO/transaction is for "Boerentoren", append the word `Boerentoren` to the Oracle Description field. Skip validation controls and **do not initiate** the approval workflow.
- **Segment 9 Project Routing:** If the invoice is allocated to a specific project (Segment 9), append `Antwerp` + project number to the Description field. Skip validation controls and **do not initiate** the approval workflow.
- **Standard Validation & Initiation:** For normal invoices (no special routing): check that total and due amounts match → Invoice Actions → Validate → Invoice Actions → Approval → Initiate.

## 3.0 Exception Handling & Validation Rules — By Supplier Type

### Transport_NPO

- **PO Requirement:** No PO required.
- **Tax Classification:** `SS` (21%) or `SZ` (0%) based on supplier's country of registration. If supplier is international, evaluate for Reverse Charge. If supplier is non-Belgium resident, always use `SS` (21%).
- **Workflow:** Manually enter Requester (Approver) if not auto-populated. Delete the `- xx/xxxx` suffix pattern from the line description.
- **Exception:** If rejected as Non-Recoverable Charge (NRC), change Reporting Line (Segment 4) to `605031` and resubmit.
- **Segment Keys:**
  - Group Overheads: `CLA.141.6151170.606005.19012.BUOVH.999.BE12000.AA99999999.99999`
  - Recoverable Charge (RC): `CLA.141.6141030.605039.15001.CLIENT.999.BE12000.AA99999999.99999`
  - Non-Recoverable Charge (NRC): `CLA.141.6141030.605031.15001.CLIENT.999.BE12000.AA99999999.99999`

### Transport_PO

- **PO Requirement:** Yes.
- **Tax Classification:** `SS` (21%).
- **Workflow:** Match invoice lines to active PO lines. Requester field must remain **blank**.
- **Control Check:** Use the "pass-on-to-customer" status indicator to select between RC and NRC segment distribution paths.

### Consumables_PO

- **PO Requirement:** Yes. *Exception:* supplier **CHEP** requires no PO; route directly to Key Account Manager (KAM) for approval.
- **Tax Classification:** `SS-PM` (21%) for packing materials. *Exceptions:* **CHEP** always uses `SS`. **FOYLO** + description "WAARBORG EUROPALET" always uses `NL`.
- **Logistics/Freight costs:** If not in the PO, add manually within a €100 limit:
  - Add a line → Type = Freight.
  - Amount + Tax classification same as previous line (`SS-PM`, or `SS` for CHEP).
  - Open Distributions on the Freight line, set Dimensions to match the previous line exactly.
  - Confirm Total and Due amounts match.
- **Archiving:** Save the PDF for RC consumables invoices in the client folder with correct numeration + invoice number (for small-material invoices, prefix filename with `SM`):
  `\\itglo.net\public\EMEA\BE-KI\DataShares\Share Boekhouding CGI Kallo\Consumabiles for split\202211`
- Use RC Segment 4 if requested in the "Pass on Customer" field on the PO.
- **Vendor-specific rules:**
  - RAJAPACK BENELUX & description "MARTOR SECUMAX": always **NRC**.
  - Description "PACKAGING LIST / LABEL OP ROL / ETICHETTEN": always **RC**, only if specified in the "Pass on Customer" PO field.
  - Description "HERSTELLING PRINTER": segment `CLA.141.6121090.603401.12001.CLIENT.999.BE12000.AA99999999.99999`, tax code `SS`.
- **Distribution Codes Matrix:**
  - ABSORBERENDE: `CLA.141.6121130.607508.12001.CLIENT.999.BE12000.AA99999999.99999`
  - KOELKAST/VAATWASMACHINE: `CLA.141.6151160.607101.12001.CLIENT.999.BE12000.AA99999999.99999`
  - LAMINEERETUI/ARCHIEFDOZEN: `CLA.141.6151010.607101.12001.CLIENT.999.BE12000.AA99999999.99999`
  - MedicalService_NRC: `CLA.141.6234020.610014.12001.CLIENT.999.BE12000.AA99999999.99999`
  - OfficeCost_NRC: `CLA.141.6151010.607101.12001.CLIENT.999.BE12000.AA99999999.99999`
  - PackingMaterials_NRC: `CLA.141.6100000.601101.12001.CLIENT.999.BE12000.AA99999999.99999`
  - PackingMaterials_RC: `CLA.141.6100000.609007.12001.CLIENT.999.BE12000.AA99999999.99999`
  - PackingMaterials_RC (DELONGHI/KITCHENA): `CLA.141.6100000.601101.12001.CLIENT.999.BE12000.AA99999999.99999`
  - PROJCGIANT229: `CLA.141.ACC.RL.17020.VANTIVE.999.BE12000.PROJCGI229.99999`
  - SmallMaterials_NRC: `CLA.141.6121130.607508.12001.CLIENT.999.BE12000.AA99999999.99999`
  - SmallMaterials_RC: `CLA.141.6121130.607598.12001.CLIENT.999.BE12000.AA99999999.99999`
  - VORK/MES/GLAS/MICROGOLFOVEN: `CLA.141.6151160.607101.12001.CLIENT.999.BE12000.AA99999999.99999`

### PalletRent_NPO

- **PO Requirement:** No PO required.
- **Tax Classification:** `SS-PM` (21%).
- **Workflow:** Populate Approver/Requester field manually (mandatory). Do not perform PO line matching. Map distributions to the specialized Client/Cost Center set `CLA_CHEP KITCHENAID`.
- **Segment Key:** `CLA.141.6100000.609007.12001.CLIENT.999.BE12000.AA99999999.99999`

### Maintenance_PO

- **PO Requirement:** Yes.
- **Tax Classification:** `SS` (21%), or `SS-RC` if the document states "verlegging van heffing" (Reverse Charge).
- **Workflow:** Match lines to PO. Requester field must remain **blank**.
- **Adjustments:** If a financial amount variance occurs vs. the PO, adjust the entry lines and post per the PDF values.
- **Asset & Building Cost Allocation:**
  - If Segment 4 = Maintenance Account → force Cost Center (Segment 5) to `11001`.
  - If Segment 4 = Damage Account → force Cost Center (Segment 5) to `12001`.
  - If Segment 6 is missing from raw data, derive it from the PO comments field. If a warehouse is mentioned, set Segment 6 = `APALLOC` and Segment 8 = `BE12[Warehouse Number]`.
- **Equipment Accounting — GL Mapping by Category:**
  - Trailer Rental: GL `6110095` (do not use 6110050)
  - Forklifts, Orderpickers & Transpallets Rental: GL `6110040` (do not use 6110100)
  - Racks, Sweepers, Exploitation Equipment, Scissor Lifts & High Workers Rental: GL `6110100`
  - Maintenance, Full Service & Damage Repair: debited via Spreadsheet Journal to GL `6121030`
- **Segment Coding Matrix:**

  | Category | Seg2 | Seg4 | Seg5 (Cost Center) | Seg6 | Seg8 |
  |---|---|---|---|---|---|
  | Rental | 141 | 603603 | 12001 | Identify per fleet equipment | General account |
  | Maintenance / Full Service | 111 | 603203 | 20200 | 99999999 | General account |
  | Damage Repair | 141 | 603603 | 12001 | Identify per fleet equipment | General account |

- **General Rules & Multi-Fleet Invoices:**
  - Segment 9 (Project): always enter the Fleet Number. If missing in Oracle, raise a ticket immediately.
  - Multi-Fleet Invoices (Maintenance & Damage): post using general segments to GL `4440000`; locate the breakdown file in PO attachments; prepare a Spreadsheet Journal debiting GL `6121030` and crediting GL `4440000`; document the exact rental period from the invoice in both the Oracle Description and Manage Distributions fields.
  - **Maintenance Distribution Reference Matrix:**
    - WAREHOUSE MAINTENANCE: `CLA.141.6121020.603106.11001.CLIENT.Location.Project`
    - WAREHOUSE DAMAGE: `CLA.141.6121020.603602.12001.CLIENT.Location.Project`
    - MAINTENANCE & REPAIR EQUIPMENT / FULL SERVICE: `CLA.111.6121030 or 6121040.603201.20200.99999999.BE94010.EquipmentFleetNumber`
    - DAMAGE REPAIR EQUIPMENT: `CLA.141.6121030 or 6121040.603603.12001.CLIENT.Location.EquipmentFleetNumber`
    - HUUR MATERIAAL (rental equipment): `CLA.141.6110040.602209.12001.CLIENT.Location.EquipmentFleetNumber`
    - REKKEN:AANPASSING <500 EUR (Art. 1312-000021): `CLA.141.6121020.603106.11001.CLIENT.Location.Project`
    - PURCHASE ACCESSORY: `CLA.111.6121040.603201.20211.99999999.BE94010.EquipmentFleetNumber`
    - REKKEN:AANPASSING >500 EUR (put Antwerp) (Art. 1312-000021): `CLA.141.6121020.603106.43004.COMPANY.Location.Project`
    - REKKEN:DAMAGE_OwnDamage (Art. 1312-000022): `CLA.141.6121020.603602.12001.CLIENT.Location.Project`
    - REKKEN:DAMAGE_OtherDamage (Art. 1312-000022): `CLA.141.6121020.603606.12001.CLIENT.Location.Project`
    - REKKEN:Maintenance+Inspection_OtherDamage (Art. 1394-000058): `CLA.141.6121020.603106.11001.CLIENT.Location.Project`
    - REKKEN:NewRacks+Pieces <15000 EUR (put Antwerp) (Art. 1312-000020): `CLA.141.6121020.603106.43004.COMPANY.Location.Project`
    - REKKEN:NewRacks+Pieces >15000 EUR: [Fixed Assets Accounting String — not yet defined]
    - REKKEN:KEURING_INSPECTION: `CLA.141.6160090.603602.12001.CLIENT.Location.Project`
    - ONDERHOUD equipment: `CLA.141.6121080.603303.12001.CLIENT.Location.Project`
    - REKKEN: WEGWERKEN OPMERKINGEN NA KEURING: `CLA.141.6160090.603602.12001.CLIENT.Location.Project`
    - WEGWERKEN OPMERKINGEN: `CLA.141.6160090.603602.12001.CLIENT.BE12000.Project`
    - INSPECTION YEARLY SWEEPER / CLEANING MACHINES: `CLA.111.6160090.607501.20220.99999999.BE94010.EquipmentFleetNumber`
    - RENT — month/year: `CLA.141.6110040.602209.12001.CLIENT.Location.EquipmentFleetNumber`
    - Roof & Floor costs (other clients): `CLA.111.6121020.603101.11001.99999999.BE45000.Project`
    - RENT — Trailers: `CLA.141.6110095.602209.12001.CLIENT.Location.fleet number`
    - RENT — Forklifts, orderpicker, transpallet: `CLA.141.6110040.602209.12001.CLIENT.Location.fleet number`
    - RENT — Racks, sweepers, Exploitation Equipment, Scissor Lifts, High Worker: `CLA.141.6110100.602209.12001.CLIENT.Location.fleet number`
    - Project in PO — PROJCGIANT229: `CLA.141.[Default Segments].17020.VANTIVE.Location.PROJCGI229`

### Software_PO

- **PO Requirement:** Yes.
- **Tax Classification:** `SS` (21%).
- **Workflow:** Match lines to PO. Validate license subscription / active-date parameters against the PO. Requester field must remain **blank**.

### TeamEvent_PO

- **PO Requirement:** Yes.
- **Tax Classification:** Evaluate event sub-type → `SL` (6%), `SM` (12%), or `SS` (21%). If cost elements can't be separated, use 100% non-deductible codes `SS100`, `SL100`, or `SM100` (internal personnel / corporate team events).
- **Workflow:** Requester field must remain **blank**. If the PO price differs from the invoice, the price may be updated to match the invoice, but quantity must remain unchanged. If an invoice has multiple tax classifications, split the PO line quantities accordingly.

### TrainingPersonnel_PO

- **PO Requirement:** Yes.
- **Tax Classification:** `SZ` (0%), `SL` (6%), or `SS` (21%) based on training category.
- **Control:** Validate invoice metadata against formal training descriptions / participant registry if available. If the invoice has more tax rates than active PO lines, **do not proceed** — request the buyer split the PO lines.
- **Adjustments:** Do not alter PO quantity. Financial amounts may be adjusted manually only if the invoice total is **less** than the PO. If the invoice total **exceeds** the PO, halt and submit a PO amendment request to the buyer. Requester field must remain **blank**.

### CarRepair_PO

- **PO Requirement:** Yes.
- **Tax Classification:** `SS65` (21% VAT, 65% non-deductible, applied automatically by the system).
- **Control:** If an amount discrepancy occurs vs. the PO, adjust and post to match the PDF. For damage car repair invoices, force Cost Center (Segment 5) to `12001` and populate the corporate Customer segment (do **not** use `POOL`). Always input the asset's fleet number into Segment 9.
- **Capital Purchases:** New corporate vehicle purchases map exclusively to GL `279`, resetting all other segments to system defaults. Tax classification `IS65`. Requester field must remain **blank**.

### Travel_NPO

- **PO Requirement:** No PO required.
- **Tax Classification:** `SZ` (0%) or `SS` (21%).
- **Workflow:** Extract the primary traveler's name, destination, and description from the document text. Cross-reference the traveler against the master PRES employee list for their cost center. For split-traveler invoices (multiple employees on one invoice), create **one distinct distribution line per person**. Approver field must be manually populated (typically the AP team leader).
- **Hotel vs. Service Accounts:** Hotel services → Segment 4 = `607002`. Other travel-related services → Segment 4 = `607001`.
- **Special Destination / Project Mapping:**
  - Destination Douai or Lille: Segment combination `20408.NONCOMPA`.
  - BAUHAUS project travel: Segment combination `12001.BAUHAUS.BE46000`.
  - Challenger Trophy Event travel: Segment combination `55001.NONCOMPA`.
- **Description Formatting:** In the Oracle description field, comma-separate: `[Service], [Individual Name], [Destination], [Period]`. Apply proper-case (first letter of every word capitalized).

### Services_PO

- **PO Requirement:** Yes.
- **Tax Classification:** `SS` (21%).
- **Workflow:** Match invoice lines to PO lines; confirm the service description aligns with the PO line-item description. Confirm Segment 6 has no default values before validation. Requester field must remain **blank**.

## 4.0 Centralized Account Correspondence & Segment Validation Rules

Every invoice with one of the customer profiles below must pass this check before final validation.

| Customer Code (Segment 6) | Cost Center (Segment 5) Rule | Allowed GL Accounts (Segment 4) | Notes |
|---|---|---|---|
| BUOVH | Must be 19012 | — | |
| NONCOMPA | Must be one of: 55001, 54001, 56001, 56004 | — | |
| OFFSHORE | Must be 19014 | — | |
| POOL | Must be one of: 20200, 20204, 20211, 20206, 20207, 20205, 20209, 20210, 20226, 20220, 20224 | — | |
| SALES | Must be 19003 | — | |
| SOLUTION | Must be 19009 | — | |
| SYSTEMS | Must be 19010 | — | |
| Any customer EXCEPT VACANT, COMPANY, POOL, HELIPORT, BOERENTO, OOKTN | Contains 11001 or 20100 | 602101, 602105, 603104, 602307, 603105, 603106, 607504, 607503, 607202, 611002, 611003, 611099, 608002, 608003, 608004, 602001, 602308 | |
| Any customer EXCEPT VACANT, COMPANY, POOL | Contains 12001 | 602101, 610002, 610095, 610005, 610091, 610011, 610051, 610023, 610009, 610008, 610016, 610098, 610004, 610006, 610012, 610052, 610093, 610099, 610096, 610007, 604006, 602207, 603608, 605091, 602308, 602201, 602209, 603202, 603303, 603603, 603604, 608005, 602401, 603401, 603607, 607450, 607451, 609007, 601101, 607599, 607509, 607101, 610014, 607508, 607598, 607301, 607302, 607002, 607001, 607003, 607004, 604001, 604099, 604007, 604004, 607201, 607511, 604009, 604008, 610013, 607512, 606005, 606011, 611099, 615101, 603602, 603606, 607452 | |
| Any customer EXCEPT VACANT, COMPANY, POOL | Contains 17020 | 602101, 610052, 610007, 602207, 605091, 602401, 607450, 607451, 607302, 607002, 607001, 607004 | |
| Any customer EXCEPT VACANT, COMPANY, POOL | Contains 15001 | 602101, 605059, 605053, 603107, 605039, 605031, 605029, 605021, 605081, 605089, 605098, 603250, 603650, 606009, 606001, 606098, 606010, 606004, 615101 | |
| VACANT | Contains 11001 | 602101, 607202, 611002, 611003, 611099 | |
| VACANT | Contains 20100 | 602102 | |
| COMPANY | Contains 20300 | 602101, 610005, 610006, 602401, 603401, 607450, 607451, 607101, 604099 | |
| POOL | Contains 20200 | 602101, 602209, 603203, 603202, 607201, 608005, 607508 | |
| POOL | Contains 20204 | 602101, 603206, 607201, 611005, 608005, 607001 | |
| COMPANY | Contains 31001 | 602101, 613004, 613011, 613001 | |
| COMPANY | Contains 42001 | 614001 or 610017 | |
| COMPANY | Contains 43001 | 615001 | |
| COMPANY | Contains 43002 | 607201 | |
| COMPANY | Contains 43003 | 604099 | |
| COMPANY | Contains 43004 | 602101, 602308, 602209, 603303, 604099, 607508 | |
| COMPANY | Contains 57001 | 612001 | |
| BOERENTO | Must be 11001 | Refer to profile mappings | Segment 2 must equal 111; Segment 8 must equal BE40000; external document number required. |
| HELIPORT | Must be 11001 | Refer to profile mappings | Segment 2 must equal 111; Segment 8 must equal BE13050; external document number required. |

## 5.0 Known Gaps (as of this version)

The source document has numbering gaps at sections 6, 8, 13, 15, and 16, and does not yet cover **BuildingService_PO**, **RentEquipment_PO**, **Provision_NPO**, and **Provision_PO**. When analyzing invoices for these supplier types, state explicitly in the response that no SOP rule is defined yet and fall back to the general Steps 2.1–2.5 workflow plus segment defaults from the app's `Manual.json`/`Exception.json`, flagging it for manual review rather than guessing at a segment string.

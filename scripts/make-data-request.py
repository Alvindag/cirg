#!/usr/bin/env python3
"""Builds the data-request workbooks for the Route-to-Market review (one per stakeholder) into docs/templates/.

    pip install openpyxl
    python scripts/make-data-request.py

Each workbook has a "Start here" sheet and one sheet per kind of data. Sheet layout (used by scripts/import-workbook.py):
row 1 title, row 2 why we ask, row 4 column headers, row 5 a hint for each column, rows 6+ for the answers.
Sheets marked IMPORT can be loaded into the platform with scripts/import-workbook.py; the others are for the review team's analysis.
"""
import os
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

OUT = os.path.join(os.path.dirname(__file__), "..", "docs", "templates")
ROWS = 300  # rows prepared for answers

REGIONS = ["Greater Accra", "Ashanti", "Western", "Western North", "Central", "Eastern", "Volta", "Oti", "Bono", "Bono East", "Ahafo", "Northern", "Savannah", "North East", "Upper East", "Upper West"]
LISTS = {
    "yesno": ["Yes", "No", "Sometimes"],
    "type": ["Pharmacy", "Hospital", "Clinic", "GovernmentInstitution", "Distributor", "Doctor", "Pharmacist"],
    "segment": ["A", "B", "C"],
    "channel": ["Van sales", "Medical sales", "Distributor / wholesaler", "Direct key account", "Walk-in"],
    "outlet_class": ["Teaching hospital", "Regional hospital", "District hospital", "Retail pharmacy chain", "Independent pharmacy", "OTC shop", "Clinic / other"],
    "region": REGIONS,
    "owner": ["Public", "Private", "NGO / mission"],
    "buys": ["Tender", "Direct order", "Via distributor", "Walk-in"],
    "tender": ["Won", "Lost", "Open", "Expired"],
    "rxotc": ["Rx", "OTC"],
    "abc": ["A", "B", "C"],
    "fleet": ["Van sales", "Distribution", "Medical reps", "Other"],
    "own": ["Own", "Third party (3PL)"],
    "dist": ["Distributor", "Wholesaler"],
}


def col(name, hint, choices=None, width=None, required=False):
    return dict(name=name, hint=hint, choices=choices, width=width or max(14, min(34, len(name) + 4)), required=required)


OUTLET_COLS = [
    col("type", "Pharmacy, Hospital, Clinic, GovernmentInstitution, Distributor, Doctor or Pharmacist", "type", 20, True),
    col("name", "Full trading name, as it appears on the door", None, 34, True),
    col("specialty", "Doctors and pharmacists only"),
    col("segment", "Your own A / B / C ranking of importance (A = most important)", "segment", 10),
    col("territory", "Your territory name (must match the platform exactly)", None, 22),
    col("parent", "Doctors / pharmacists: the hospital, clinic or pharmacy they work at"),
    col("phone", "Mobile or office number"),
    col("email", "Email, if known"),
    col("address", "Street, landmark or GPS address", None, 30),
    col("city", "Town or city", None, 18),
    col("latitude", "Decimal degrees, e.g. 5.6037 (optional)", None, 12),
    col("longitude", "Decimal degrees, e.g. -0.1870 (optional)", None, 12),
    col("target_visits_per_month", "How often a rep should visit (0 to 60)", None, 14),
    col("channel", "How DAS serves this outlet today", "channel", 24),
    col("outlet_class", "What kind of outlet it is", "outlet_class", 24),
]
OUTLET_EXTRA = [
    col("last_visit_date", "Date of the last DAS visit, if any (YYYY-MM-DD)"),
    col("served_by_distributor", "If a distributor or wholesaler supplies it: their name", None, 26),
    col("est_monthly_purchases_ghs", "Rough monthly purchases of DAS products, in GHS"),
    col("notes", "Anything else we should know", None, 34),
]

# kind: "customers" | "universe" | "products" | None (analysis only)
SHEETS = {
    "1A Outlets": dict(kind="customers", title="Outlets in your territory", why="The list of pharmacies, OTC shops, hospitals and clinics you know. This is what lets us measure coverage. Include outlets you do NOT visit yet, and mark how each is served. Fill one row per outlet.", cols=OUTLET_COLS + OUTLET_EXTRA),
    "1B Territory profile": dict(title="Your territory at a glance", why="Size of the market in your area and the real constraints on covering it. One row per territory you manage.", cols=[
        col("territory", "Territory name", None, 22, True), col("region", "Region", "region", 18), col("districts", "Main districts / towns", None, 30),
        col("reps_count", "Reps working the territory"), col("van_routes", "Van-sales routes"), col("est_pharmacies", "Your estimate of ALL pharmacies in the area (not only ours)"),
        col("est_otc_shops", "Estimate of OTC shops / chemical sellers"), col("est_hospitals_clinics", "Estimate of hospitals and clinics"),
        col("outlets_visited_90d", "Outlets visited at least once in the last 90 days"), col("hard_to_reach", "Areas that are hard to reach, and why", None, 34),
        col("farthest_outlet_hours", "Travel time to the farthest outlet (hours)"), col("biggest_challenge", "The one thing that most limits coverage", None, 34)]),
    "1C Distributors": dict(title="Distributors and wholesalers in your area", why="Most of the market is served through them. We need to know who they are, what they reach and how they behave.", cols=[
        col("name", "Business name", None, 28, True), col("type", "Distributor or wholesaler", "dist"), col("town", "Town"), col("region", "Region", "region", 18),
        col("est_outlets_supplied", "Roughly how many outlets they supply"), col("das_products_carried", "DAS products they stock", None, 30), col("pays_on_time", "Do they pay on time?", "yesno"),
        col("avg_payment_days", "Average days to pay"), col("shares_sell_out", "Do they share what they sell on to outlets?", "yesno"), col("issues", "Problems (stock-outs, price cutting, conflict with our reps...)", None, 36)]),

    "2A Institutions": dict(kind="customers", title="Institutional customers", why="Teaching, regional and district hospitals, MOH / GHS facilities, mission hospitals, NGOs and large private clinics. Same columns as the outlet list, with a few extra.", cols=OUTLET_COLS + [
        col("owner", "Public, private or NGO / mission", "owner"), col("how_they_buy", "How the institution buys", "buys"), col("annual_purchases_ghs", "Estimated yearly purchases of DAS products (GHS)"),
        col("payment_terms_days", "Days they take to pay"), col("key_contact_role", "Role of the person who decides (e.g. Chief Pharmacist)", None, 28), col("notes", "Anything else", None, 34)]),
    "2B Tenders": dict(title="Tenders and contracts", why="Where institutional volume is won or lost, and when contracts come up again.", cols=[
        col("institution", "Institution", None, 30, True), col("tender_reference", "Tender or contract reference"), col("products", "Products covered", None, 30), col("value_ghs", "Value (GHS)"),
        col("start_date", "Start date (YYYY-MM-DD)"), col("end_date", "End or renewal date (YYYY-MM-DD)"), col("status", "Won, lost, open or expired", "tender"),
        col("incumbent_competitor", "Who holds it if not DAS"), col("renewal_action", "What we plan to do", None, 30)]),
    "2C Export": dict(title="Export markets", why="Where DAS sells outside Ghana, through whom, and what stands in the way.", cols=[
        col("country", "Country", None, 18, True), col("product", "Product or range", None, 26), col("partner", "Partner / distributor", None, 26), col("annual_value_usd", "Yearly value (USD)"),
        col("registration_status", "Registered / pending / not registered"), col("shipping_route", "Route (air, sea, road) and port", None, 26), col("lead_time_days", "Order-to-delivery days"),
        col("payment_terms", "Payment terms"), col("issues", "Problems", None, 34)]),

    "3A Market size": dict(kind="universe", title="How many outlets are there in Ghana?", why="Your best estimate of ALL outlets of each kind (not only DAS customers), nationally or by region. Coverage figures are measured against these numbers, so tell us where each comes from.", cols=[
        col("region", "Leave empty for a national figure, or choose a region", "region", 20), col("outlet_class", "Kind of outlet", "outlet_class", 26, True),
        col("outlets", "Estimated number of outlets", None, 16, True), col("source", "Where the number comes from (e.g. Pharmacy Council register 2025)", None, 44)]),
    "3B Channel roles": dict(title="Who serves whom", why="The role each channel plays today and the rules that should apply between them.", cols=[
        col("channel", "Channel", "channel", 26, True), col("segments_served", "Which customers it serves", None, 34), col("main_products", "Main products", None, 28), col("managed_by", "Team or person responsible"),
        col("terms_discounts", "Typical terms and discounts", None, 30), col("share_of_sales_pct", "Share of DAS sales today (%)"), col("target_share_pct", "Target share (%)"),
        col("conflicts_with", "Channel it overlaps or conflicts with"), col("overlap_rule", "How an overlap is settled today", None, 34)]),
    "3C Field teams": dict(title="Field teams", why="How many people cover the market and how much they can realistically visit.", cols=[
        col("team", "Van sales, medical sales or other", None, 18, True), col("region_or_territory", "Region or territory", None, 22), col("reps", "Number of reps"), col("managers", "Number of managers"),
        col("vehicles", "Vehicles available"), col("visits_per_rep_per_day", "Average visits per rep per day"), col("vacancies", "Open positions"), col("tools", "Tools they use today (paper, Excel, app...)", None, 30)]),
    "3D Competitors": dict(title="Competitors", why="The three to five main competitors and how they reach the market.", cols=[
        col("competitor", "Name", None, 24, True), col("channel_model", "How they get to market", None, 34), col("strong_regions", "Regions where they are strong", None, 28), col("strengths", "What they do better than us", None, 34),
        col("pricing_notes", "Pricing and terms", None, 28), col("distributor_relationships", "Distributors they work with", None, 28), col("field_force_estimate", "Estimated field force size"), col("source", "How you know this", None, 24)]),
    "3E Targets and budget": dict(title="Targets and coverage budget", why="Sales targets and what is available to spend on coverage, by region.", cols=[
        col("region", "Region", "region", 18, True), col("sales_last_12m_ghs", "Sales, last 12 months (GHS)"), col("target_next_12m_ghs", "Target, next 12 months (GHS)"), col("growth_target_pct", "Growth target (%)"),
        col("coverage_budget_ghs", "Budget for coverage / expansion (GHS)"), col("new_outlets_planned", "New outlets planned"), col("notes", "Notes", None, 34)]),
    "3F Key distributors": dict(title="Key distributors and wholesalers", why="The national picture of the partners that carry most volume.", cols=[
        col("name", "Business name", None, 28, True), col("type", "Distributor or wholesaler", "dist"), col("regions_covered", "Regions covered", None, 30), col("est_outlets_supplied", "Outlets supplied (estimate)"),
        col("share_of_sales_pct", "Share of DAS sales (%)"), col("terms", "Terms and discounts", None, 28), col("concerns", "Concerns (conflict, stock-outs, payment...)", None, 36)]),

    "4A Products": dict(kind="products", title="Product list", why="One row per product (item). The item code must match Business Central.", cols=[
        col("item_code", "Item code, exactly as in Business Central", None, 16, True), col("name", "Product name", None, 30, True), col("therapeutic_area", "Therapeutic area", None, 22),
        col("standard_cost", "Standard unit cost (GHS)"), col("reorder_level", "Reorder level for SAMPLE stock (units)"),
        col("rx_or_otc", "Rx or OTC", "rxotc"), col("pack_size", "Pack size"), col("selling_price_ghs", "Selling price (GHS)"), col("shelf_life_months", "Shelf life (months)"), col("abc_class", "A, B or C by sales value", "abc"), col("active", "Still sold?", "yesno")]),
    "4B Stock on hand": dict(title="Stock on hand by warehouse", why="A snapshot of stock now, by warehouse. (Live stock comes from Business Central; this is for the review's analysis.)", cols=[
        col("warehouse", "Warehouse (Head Office 1, Head Office 2, Takoradi, Tamale, Kumasi)", None, 26, True), col("item_code", "Item code", None, 14, True), col("batch_number", "Batch number"),
        col("quantity", "Units on hand"), col("expiry_date", "Expiry date (YYYY-MM-DD)"), col("as_of_date", "Date of this count (YYYY-MM-DD)")]),
    "4C Stock policy": dict(title="Stock policy and problems", why="How stock is planned, and where it goes wrong.", cols=[
        col("item_code", "Item code", None, 14, True), col("safety_stock", "Safety stock (units)"), col("reorder_point", "Reorder point (units)"), col("supplier_lead_time_days", "Supplier lead time (days)"),
        col("avg_monthly_demand", "Average monthly demand, last 12 months"), col("stockout_days_12m", "Days out of stock, last 12 months"), col("expired_units_12m", "Units written off as expired, last 12 months"),
        col("sample_budget_units_month", "Sample units budgeted per month"), col("sample_limit_per_customer", "Most sample units one customer may receive")]),
    "4D Demand history": dict(title="Monthly demand history", why="At least 12 months, ideally 24, by product (and by warehouse if you can).", cols=[
        col("item_code", "Item code", None, 14, True), col("month", "Month (YYYY-MM)", None, 12, True), col("warehouse", "Warehouse (optional)", None, 20), col("units_sold", "Units sold"), col("net_sales_ghs", "Net sales (GHS)")]),

    "5A Warehouses": dict(title="Warehouses", why="The five warehouses: what they hold and what they can serve.", cols=[
        col("warehouse", "Name", None, 22, True), col("town", "Town"), col("region", "Region", "region", 18), col("ownership", "Own or third party", "own"), col("area_m2", "Floor area (m2)"),
        col("cold_chain", "Cold chain available?", "yesno"), col("staff", "Number of staff"), col("regions_served", "Regions it serves", None, 30), col("dispatches_per_month", "Dispatches per month"), col("capacity_used_pct", "Capacity used (%)")]),
    "5B Fleet": dict(title="Vehicles", why="The vehicles that move stock and carry the field teams.", cols=[
        col("vehicle_id", "Registration or fleet number", None, 18, True), col("type", "Van, truck, motorbike..."), col("capacity", "Capacity (kg or cartons)"), col("base_warehouse", "Based at", None, 20),
        col("purpose", "Main use", "fleet"), col("km_per_month", "Average km per month"), col("cost_per_km_ghs", "Running cost per km (GHS)"), col("availability_pct", "Time available for use (%)")]),
    "5C Delivery lanes": dict(title="Delivery lanes", why="How long and how costly it is to reach each region from each warehouse.", cols=[
        col("from_warehouse", "From warehouse", None, 22, True), col("to_region", "To region", "region", 18, True), col("to_town", "Main town served"), col("deliveries_per_week", "Deliveries per week"),
        col("transit_days", "Transit time (days)"), col("cost_per_delivery_ghs", "Cost per delivery (GHS)"), col("on_time_pct", "On time (%)"), col("constraints", "Constraints (roads, rainy season, security...)", None, 34)]),
    "5D Costs and service": dict(title="Logistics cost and service level", why="Monthly cost and service, by warehouse or region, for the last 12 months.", cols=[
        col("month", "Month (YYYY-MM)", None, 12, True), col("warehouse_or_region", "Warehouse or region", None, 22), col("freight_cost_ghs", "Freight cost (GHS)"), col("fuel_cost_ghs", "Fuel (GHS)"),
        col("maintenance_cost_ghs", "Maintenance (GHS)"), col("deliveries", "Deliveries made"), col("otif_pct", "On time, in full (%)"), col("damage_pct", "Damaged (%)"), col("returns_pct", "Returned (%)")]),
    "5E Van routes": dict(title="Van-sales routes", why="Each route a van team works, so coverage can be planned and costed.", cols=[
        col("route_id", "Route name or number", None, 16, True), col("base_warehouse", "Loads at", None, 20), col("region_or_territory", "Region or territory", None, 22), col("outlets_on_route", "Outlets on the route"),
        col("days_per_week", "Days per week"), col("visit_frequency", "How often each outlet is visited"), col("avg_drop_value_ghs", "Average sale per call (GHS)"), col("stock_loaded_value_ghs", "Value of stock loaded per trip (GHS)"), col("cash_share_pct", "Cash sales (%)")]),
}

BOOKS = {
    "1-Territory-Managers": ("Territory Managers", ["1A Outlets", "1B Territory profile", "1C Distributors"], "Your outlet list is the most valuable thing you can give us: it shows who is covered and, just as important, who is not."),
    "2-Institutions-and-Export": ("Institutions & Export Manager", ["2A Institutions", "2B Tenders", "2C Export"], "Hospitals, public institutions, NGOs and export markets."),
    "3-National-Sales-Manager": ("National Sales Manager", ["3A Market size", "3B Channel roles", "3C Field teams", "3D Competitors", "3E Targets and budget", "3F Key distributors"], "The national picture: how big the market is, who serves it, and what is planned."),
    "4-Inventory-Planning": ("Inventory Planning Lead", ["4A Products", "4B Stock on hand", "4C Stock policy", "4D Demand history"], "What we sell, what we hold, and how well supply matches demand."),
    "5-Logistics-and-Transport": ("Logistics & Transport Lead", ["5A Warehouses", "5B Fleet", "5C Delivery lanes", "5D Costs and service", "5E Van routes"], "How stock physically reaches the market, and what it costs."),
}

BLUE = "0F5F9C"; RED = "D62028"; GREY = "5B6470"
thin = Side(style="thin", color="C9D0D6")


def build(book_key: str) -> str:
    role, sheet_names, intro = BOOKS[book_key]
    wb = Workbook()
    ws0 = wb.active; ws0.title = "Start here"
    ws0.sheet_view.showGridLines = False
    ws0.column_dimensions["A"].width = 3; ws0.column_dimensions["B"].width = 110
    lines = [
        ("DAS PLC - Route-to-Market review", Font(size=18, bold=True, color=RED)),
        (f"Data request for: {role}", Font(size=13, bold=True, color=BLUE)),
        ("", None), (intro, Font(size=11)),
        ("", None), ("What we need from you", Font(size=12, bold=True)),
        ("Complete the sheets in this workbook (the tabs along the bottom). Each tab says what it is for; row 5 explains every column.", None),
        ("Give your best estimate where you do not know exactly, and say in the notes or source column that it is an estimate. A rough number is far more useful than a blank.", None),
        ("Do not change the column headings or the order of the columns, and do not insert columns. Add rows as needed (there are 300 ready).", None),
        ("Choose from the drop-down lists where there is one. Dates as YYYY-MM-DD (for example 2026-10-02). Money in Ghana cedis (GHS) unless the heading says otherwise.", None),
        ("", None), ("Tabs in this workbook", Font(size=12, bold=True)),
    ]
    for n in sheet_names:
        s = SHEETS[n]
        lines.append((f"{n}  -  {s['title']}" + ("   (will be loaded into the platform)" if s.get("kind") else ""), None))
    lines += [("", None), ("Please return this file to: ____________________   by: ____________________", Font(bold=True)),
              ("This information is used only for the DAS Route-to-Market review. Customer names and contact details are personal data under the Data Protection Act, 2012 (Act 843): please share this file only with the review team.", Font(italic=True, color=GREY))]
    for i, (text, font) in enumerate(lines, start=2):
        c = ws0.cell(row=i, column=2, value=text)
        c.alignment = Alignment(wrap_text=True, vertical="top")
        if font: c.font = font

    lists = wb.create_sheet("Lists")
    ranges = {}
    for j, (key, values) in enumerate(LISTS.items(), start=1):
        lists.cell(row=1, column=j, value=key).font = Font(bold=True)
        for i, v in enumerate(values, start=2):
            lists.cell(row=i, column=j, value=v)
        ranges[key] = f"Lists!${get_column_letter(j)}$2:${get_column_letter(j)}${len(values) + 1}"
    lists.sheet_state = "hidden"

    for name in sheet_names:
        s = SHEETS[name]
        ws = wb.create_sheet(name)
        ncols = len(s["cols"])
        ws.cell(row=1, column=1, value=s["title"]).font = Font(size=15, bold=True, color=BLUE)
        why = ws.cell(row=2, column=1, value=s["why"]); why.alignment = Alignment(wrap_text=True, vertical="top"); why.font = Font(color=GREY)
        ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=min(ncols, 8))
        ws.row_dimensions[2].height = 48
        for i, c in enumerate(s["cols"], start=1):
            h = ws.cell(row=4, column=i, value=c["name"])
            h.font = Font(bold=True, color="FFFFFF"); h.fill = PatternFill("solid", fgColor=RED if c["required"] else BLUE)
            h.alignment = Alignment(wrap_text=True, vertical="center"); h.border = Border(bottom=thin)
            t = ws.cell(row=5, column=i, value=c["hint"] + (" (required)" if c["required"] else ""))
            t.font = Font(italic=True, size=9, color=GREY); t.alignment = Alignment(wrap_text=True, vertical="top"); t.fill = PatternFill("solid", fgColor="F3F4F6")
            ws.column_dimensions[get_column_letter(i)].width = c["width"]
            if c["choices"]:
                dv = DataValidation(type="list", formula1=f"={ranges[c['choices']]}", allow_blank=True, showErrorMessage=False)
                ws.add_data_validation(dv)
                dv.add(f"{get_column_letter(i)}6:{get_column_letter(i)}{5 + ROWS}")
        ws.row_dimensions[4].height = 30; ws.row_dimensions[5].height = 64
        ws.freeze_panes = "A6"
        if s.get("kind"):
            ws.cell(row=3, column=1, value="Red headings are required. This sheet is loaded into the platform, so keep one row per record.").font = Font(size=9, bold=True, color=RED)
    wb.active = 0
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, f"DAS-RTM-Data-Request-{book_key}.xlsx")
    wb.save(path)
    return path


if __name__ == "__main__":
    for k in BOOKS:
        print("wrote", os.path.relpath(build(k)))

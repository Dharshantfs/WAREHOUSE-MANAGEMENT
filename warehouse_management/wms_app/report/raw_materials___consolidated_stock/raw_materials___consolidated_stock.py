import frappe
from frappe import _
from frappe.utils import add_days, getdate, flt

def execute(filters=None):
    if not filters:
        filters = {}
    
    date = filters.get("date") or frappe.utils.today()
    yesterday = add_days(date, -1)
    
    columns = get_columns()
    data = get_data(date, yesterday)
    
    return columns, data

def get_columns():
    return [
        {"fieldname": "s_no", "label": _("S.NO"), "fieldtype": "Data", "width": 60},
        {"fieldname": "name", "label": _("NAME"), "fieldtype": "Data", "width": 250},
        {"fieldname": "jayashree_yest", "label": _("JAYASHREE YESTERDAY [ KGS ]"), "fieldtype": "Float", "width": 150},
        {"fieldname": "jayashree_live", "label": _("JAYASHREE LIVE [ KGS ]"), "fieldtype": "Float", "width": 150},
        {"fieldname": "thusmaa_yest", "label": _("THUSMAA YESTERDAY [ KGS ]"), "fieldtype": "Float", "width": 150},
        {"fieldname": "thusmaa_live", "label": _("THUSMAA LIVE [ KGS ]"), "fieldtype": "Float", "width": 150},
        {"fieldname": "total_yest", "label": _("TOTAL YESTERDAY"), "fieldtype": "Float", "width": 120},
        {"fieldname": "total_live", "label": _("TOTAL LIVE"), "fieldtype": "Float", "width": 120},
    ]

def get_data(date, yesterday):
    # Warehouses
    jayashree_wh = "Raw Materials - JSB-1ZT"
    thusmaa_wh = "Raw Materials Warehouse - TSNPL"
    
    # Items in Raw Material group
    items = frappe.get_all("Item", filters={"item_group": "Raw Material"}, fields=["name", "item_name"])
    
    # Get stock balances up to 'yesterday' and 'date' (live)
    def get_stock(wh, as_on_date):
        query = """
            SELECT item_code, sum(actual_qty) as balance_qty
            FROM `tabStock Ledger Entry`
            WHERE warehouse = %s AND posting_date <= %s
            AND is_cancelled = 0
            GROUP BY item_code
        """
        result = frappe.db.sql(query, (wh, as_on_date), as_dict=1)
        return {r.item_code: flt(r.balance_qty) for r in result}
        
    jaya_yest_stock = get_stock(jayashree_wh, yesterday)
    jaya_live_stock = get_stock(jayashree_wh, date)
    thus_yest_stock = get_stock(thusmaa_wh, yesterday)
    thus_live_stock = get_stock(thusmaa_wh, date)
    
    lamination_items = ["LD SABIC 7019 EC", "PP - SABIC 519A", "PP - RELIANCE LDPE", "PP - SUMITOMO LDPE"]
    
    poly_list = []
    poly_lam_list = []
    filler_list = []
    ppa_list = []
    
    for item in items:
        item_name = item.item_name or item.name
        code = item.name
        
        if "DUMMY" in item_name.upper() or "DUMMY" in code.upper():
            continue
        
        row = {
            "s_no": "",
            "name": item_name,
            "jayashree_yest": jaya_yest_stock.get(code, 0.0),
            "jayashree_live": jaya_live_stock.get(code, 0.0),
            "thusmaa_yest": thus_yest_stock.get(code, 0.0),
            "thusmaa_live": thus_live_stock.get(code, 0.0),
        }
        row["total_yest"] = row["jayashree_yest"] + row["thusmaa_yest"]
        row["total_live"] = row["jayashree_live"] + row["thusmaa_live"]
        
        # Only add to list if there is some stock or it's required. Let's add all matching for now.
        if item_name in lamination_items:
            poly_lam_list.append(row)
        elif item_name.startswith("PP -") or item_name.startswith("PP-"):
            poly_list.append(row)
        elif item_name.startswith("FL-") or item_name.startswith("FL -"):
            filler_list.append(row)
        elif item_name.startswith("SA -") or item_name.startswith("SA-"):
            if row["total_yest"] > 0 or row["total_live"] > 0:
                ppa_list.append(row)
            
    # Compile the final data with sections
    data = []
    
    def add_section(title, rows):
        if not rows: return
        data.append({"s_no": "", "name": f"<b>{title}</b>", "jayashree_yest": "", "jayashree_live": "", "thusmaa_yest": "", "thusmaa_live": "", "total_yest": "", "total_live": ""})
        
        sum_jy = sum_jl = sum_ty = sum_tl = tot_y = tot_l = 0
        for idx, r in enumerate(rows, 1):
            r["s_no"] = str(idx)
            data.append(r)
            sum_jy = round(sum_jy + r["jayashree_yest"], 2)
            sum_jl = round(sum_jl + r["jayashree_live"], 2)
            sum_ty = round(sum_ty + r["thusmaa_yest"], 2)
            sum_tl = round(sum_tl + r["thusmaa_live"], 2)
            tot_y = round(tot_y + r["total_yest"], 2)
            tot_l = round(tot_l + r["total_live"], 2)
            
        # Add total row
        data.append({
            "s_no": "",
            "name": "<b>TOTAL</b>",
            "jayashree_yest": sum_jy,
            "jayashree_live": sum_jl,
            "thusmaa_yest": sum_ty,
            "thusmaa_live": sum_tl,
            "total_yest": tot_y,
            "total_live": tot_l
        })
        data.append({}) # Empty row
        
    add_section("POLYPROPYLENE", poly_list)
    add_section("POLYPROPYLENE - LAMINATION", poly_lam_list)
    add_section("FILLER", filler_list)
    add_section("PPA", ppa_list)
    
    return data

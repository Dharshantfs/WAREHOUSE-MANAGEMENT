# -*- coding: utf-8 -*-
import frappe
from frappe.utils import now_datetime, add_months

@frappe.whitelist()
def setup_demo_data():
    """
    Populates mock database records inside a live ERPNext instance:
    1. Creates Warehouse Bays: B1, B2, OUTSIDE, B3, B4.
    2. Creates a mock Item 'Jayashree Spun Bond Roll' (item_code: JS-SPUN-BOND).
    3. Creates 22 Batch records: 'JS-0306261/1' to 'JS-0306261/22' with custom fields.
    4. Submits a Stock Entry (Material Receipt) to record the weights (KGs) in the ledger.
    """
    try:
        # Get first available Company
        company = frappe.db.get_value("Company", {}, "name")
        if not company:
            return {"status": "error", "message": "Please create at least one Company in ERPNext first."}
            
        # Get or create a Default Warehouse
        warehouse = frappe.db.get_value("Warehouse", {"company": company}, "name")
        if not warehouse:
            # Create a mock warehouse
            wh_doc = frappe.new_doc("Warehouse")
            wh_doc.warehouse_name = "Jayashree Unit 3"
            wh_doc.company = company
            wh_doc.insert(ignore_permissions=True)
            warehouse = wh_doc.name

        # 1. Create custom Warehouse Bays
        bays = ["B1", "B2", "OUTSIDE", "B3", "B4"]
        created_bays = []
        for b_name in bays:
            if not frappe.db.exists("Warehouse Bay", b_name):
                bay = frappe.new_doc("Warehouse Bay")
                bay.bay_name = b_name
                bay.description = f"Physical storage location {b_name}"
                bay.insert(ignore_permissions=True)
                created_bays.append(b_name)
                
        # 2. Create mock Item
        item_code = "JS-SPUN-BOND"
        if not frappe.db.exists("Item", item_code):
            item = frappe.new_doc("Item")
            item.item_code = item_code
            item.item_name = "Jayashree Spun Bond Roll"
            item.item_group = frappe.db.get_value("Item Group", {}, "name") or "All Item Groups"
            item.stock_uom = "Nos"
            item.val_method = "FIFO"
            item.is_stock_item = 1
            item.has_batch_no = 1
            item.create_new_batch = 0
            
            # India Compliance / India Regional HSN/SAC Code required field fix
            hsn_code = "5603"
            if frappe.db.exists("DocType", "GST HSN Code"):
                if not frappe.db.exists("GST HSN Code", hsn_code):
                    try:
                        hsn_doc = frappe.new_doc("GST HSN Code")
                        hsn_doc.name = hsn_code
                        hsn_doc.hsn_code = hsn_code
                        hsn_doc.description = "Nonwovens"
                        hsn_doc.insert(ignore_permissions=True)
                    except Exception:
                        pass
                item.gst_hsn_code = hsn_code
                
            item.insert(ignore_permissions=True)

        # 3. Create 22 Batches (rolls) inside OUTSIDE bay
        batches_to_receive = []
        order_code = "ORD-2026-9901"
        mfg_date = now_datetime().date()
        exp_date = add_months(mfg_date, 12)

        for i in range(1, 23):
            batch_no = f"JS-0306261/{i}"
            weight = 44.17 if i == 22 else 44.15
            
            # Check if Batch already exists, if so delete to recreate cleanly
            if frappe.db.exists("Batch", batch_no):
                frappe.db.delete("Batch", batch_no)
                
            batch_doc = frappe.new_doc("Batch")
            batch_doc.batch_id = batch_no
            batch_doc.item = item_code
            batch_doc.manufacturing_date = mfg_date
            batch_doc.expiry_date = exp_date
            batch_doc.custom_bay = "OUTSIDE"
            batch_doc.custom_order_code = order_code
            
            # If batch has custom fields like weight/qty, set them
            meta = frappe.get_meta("Batch")
            for fieldname in ["qty", "batch_qty", "custom_weight", "weight"]:
                if meta.has_field(fieldname):
                    batch_doc.set(fieldname, weight)
                    
            batch_doc.insert(ignore_permissions=True)
            
            batches_to_receive.append({
                "batch_no": batch_no,
                "qty": weight
            })

        # 4. Create and Submit Stock Entry (Material Receipt) to load stock ledger balances
        # Check if Stock Entry needs to be created
        total_qty = sum(b["qty"] for b in batches_to_receive)
        
        # Build Stock Entry
        stock_entry = frappe.new_doc("Stock Entry")
        stock_entry.purpose = "Material Receipt"
        stock_entry.company = company
        stock_entry.posting_date = now_datetime().date()
        stock_entry.posting_time = now_datetime().strftime("%H:%M:%S")
        
        for item_data in batches_to_receive:
            row = stock_entry.append("items", {
                "item_code": item_code,
                "qty": item_data["qty"],
                "uom": "Nos",
                "stock_uom": "Nos",
                "conversion_factor": 1.0,
                "transfer_qty": item_data["qty"],
                "t_warehouse": warehouse,
                "batch_no": item_data["batch_no"],
                "basic_rate": 100.0, # Dummy rate
                "amount": item_data["qty"] * 100.0
            })
            
        stock_entry.insert(ignore_permissions=True)
        stock_entry.submit()
        
        return {
            "status": "success",
            "message": "Demo data setup completed successfully!",
            "details": {
                "company": company,
                "warehouse": warehouse,
                "item": item_code,
                "bays_created": bays,
                "rolls_count": len(batches_to_receive),
                "total_weight_kgs": round(total_qty, 2),
                "stock_entry_submitted": stock_entry.name
            }
        }
    except Exception as e:
        frappe.db.rollback()
        frappe.log_error(message=str(e), title="WMS Setup Demo Data Error")
        return {"status": "error", "message": str(e)}

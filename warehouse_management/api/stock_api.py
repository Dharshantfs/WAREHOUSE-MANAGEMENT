# -*- coding: utf-8 -*-
import frappe
from frappe.utils import now_datetime

def get_batch_qty(batch_no):
    """
    Get the quantity (weight in KGs) of a batch.
    Queries the Stock Ledger Entry table first, falling back to any qty/weight fields on Batch.
    """
    try:
        balance = frappe.db.sql("""
            SELECT SUM(actual_qty) 
            FROM `tabStock Ledger Entry` 
            WHERE batch_no = %s AND is_cancelled = 0
        """, (batch_no,))
        
        if balance and balance[0][0] is not None:
            return float(balance[0][0])
    except Exception:
        pass
        
    # Fallback to metadata fields if they exist
    try:
        meta = frappe.get_meta("Batch")
        for fieldname in ["qty", "batch_qty", "custom_weight", "weight"]:
            if meta.has_field(fieldname):
                val = frappe.db.get_value("Batch", batch_no, fieldname)
                if val is not None:
                    return float(val)
    except Exception:
        pass
        
    # Check if we have mock quantities or default to 0.0
    return 0.0

@frappe.whitelist()
def get_bay_summary():
    """
    Fetch the list of bays, counting the number of rolls (batches)
    and summing the weight (KGs) inside each.
    """
    try:
        # Fetch custom bays
        bays = frappe.get_all("Warehouse Bay", fields=["name", "description"])
        bay_names = [b.name for b in bays]
        
        # Include OUTSIDE if not already present
        if "OUTSIDE" not in bay_names:
            bay_names.append("OUTSIDE")
        
        # Always include UNASSIGNED at the end to pull existing batches from ERPNext
        if "UNASSIGNED" not in bay_names:
            bay_names.append("UNASSIGNED")
            
        summary = []
        for bay in bay_names:
            # Query batches that belong to this bay
            if bay == "UNASSIGNED":
                batches = frappe.get_all(
                    "Batch",
                    filters=[
                        ["custom_bay", "is", "not set"]
                    ],
                    fields=["name"]
                )
            else:
                batches = frappe.get_all(
                    "Batch",
                    filters={"custom_bay": bay},
                    fields=["name"]
                )
            
            no_of_rolls = len(batches)
            total_kgs = sum(get_batch_qty(b.name) for b in batches)
            
            summary.append({
                "bay_no": bay,
                "no_of_rolls": no_of_rolls,
                "kgs": round(total_kgs, 2)
            })
            
        return {"status": "success", "data": summary}
    except Exception as e:
        frappe.log_error(message=str(e), title="WMS Get Bay Summary Error")
        return {"status": "error", "message": str(e)}

@frappe.whitelist()
def get_bay_details(bay_name):
    """
    Get detailed roll (batch) listings inside a bay, grouped by custom_order_code.
    """
    try:
        # Fetch batches in this bay
        if bay_name == "UNASSIGNED":
            batches = frappe.get_all(
                "Batch",
                filters=[
                    ["custom_bay", "is", "not set"]
                ],
                fields=["name", "custom_order_code", "manufacturing_date", "expiry_date"]
            )
        else:
            batches = frappe.get_all(
                "Batch",
                filters={"custom_bay": bay_name},
                fields=["name", "custom_order_code", "manufacturing_date", "expiry_date"]
            )
        
        grouped = {}
        for batch in batches:
            order_code = batch.custom_order_code or "UNASSIGNED"
            qty = get_batch_qty(batch.name)
            
            if order_code not in grouped:
                grouped[order_code] = []
                
            grouped[order_code].append({
                "batch_no": batch.name,
                "mfg_date": str(batch.manufacturing_date) if batch.manufacturing_date else "",
                "expiry_date": str(batch.expiry_date) if batch.expiry_date else "",
                "kgs": round(qty, 2)
            })
            
        # Format as list of orders for the client
        result = []
        for order_code, rolls in grouped.items():
            order_rolls_count = len(rolls)
            order_total_kgs = sum(r["kgs"] for r in rolls)
            result.append({
                "order_code": order_code,
                "rolls_count": order_rolls_count,
                "total_kgs": round(order_total_kgs, 2),
                "rolls": rolls
            })
            
        return {"status": "success", "data": result}
    except Exception as e:
        frappe.log_error(message=str(e), title="WMS Get Bay Details Error")
        return {"status": "error", "message": str(e)}

@frappe.whitelist()
def update_batch_bay(**kwargs):
    """
    Update a batch/roll's bay assignment (or multiple) and write a Scan Log entry.
    """
    batch_no = kwargs.get("batch_no")
    batch_ids = kwargs.get("batch_ids")
    new_bay = kwargs.get("new_bay")
    barcode_scanned = kwargs.get("barcode_scanned")
    
    if not new_bay:
        return {"status": "error", "message": f"Missing required parameters: new_bay='{new_bay}'"}

    batches = batch_ids if batch_ids else ([batch_no] if batch_no else [])
    
    if not batches:
        return {"status": "error", "message": "Missing required parameters: batch_no or batch_ids"}

    try:
        # If new bay is not OUTSIDE/UNASSIGNED and doesn't exist, auto-create it
        if new_bay not in ["OUTSIDE", "UNASSIGNED"] and not frappe.db.exists("Warehouse Bay", new_bay):
            bay_doc = frappe.new_doc("Warehouse Bay")
            bay_doc.bay_name = new_bay
            bay_doc.insert(ignore_permissions=True)
            
        success_msgs = []
        for b_no in batches:
            if not frappe.db.exists("Batch", b_no):
                continue

            old_bay = frappe.db.get_value("Batch", b_no, "custom_bay")
            qty = get_batch_qty(b_no)
            
            # Update Batch custom bay field (set to None for UNASSIGNED)
            db_bay_value = None if new_bay == "UNASSIGNED" else new_bay
            frappe.db.set_value("Batch", b_no, "custom_bay", db_bay_value)
            
            # Write to Scan Log
            log = frappe.new_doc("Scan Log")
            log.timestamp = now_datetime()
            log.user = frappe.session.user
            log.barcode_scanned = barcode_scanned or b_no
            log.batch_no = b_no
            log.old_bay = old_bay
            log.new_bay = new_bay
            log.qty = qty
            log.insert(ignore_permissions=True)
            
            # Real-time WebSockets event
            try:
                frappe.publish_realtime("wms_bay_update", {
                    "batch_no": b_no,
                    "old_bay": old_bay,
                    "new_bay": new_bay,
                    "qty": qty,
                    "user": frappe.session.user
                })
            except Exception:
                pass # SocketIO might not be configured in this environment
            success_msgs.append(b_no)
        
        frappe.db.commit()
            
        return {"status": "success", "message": f"Rolls reassigned: {', '.join(success_msgs)}"}
    except Exception as e:
        frappe.db.rollback()
        frappe.log_error(message=str(e), title="WMS Update Batch Bay Error")
        return {"status": "error", "message": str(e)}

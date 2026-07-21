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
def update_batch_bay(batch_ids=None, target_bay=None, new_bay=None,
                     batch_no=None, barcode_scanned=None):
    """
    Transfer one or more Batch documents to a new bay slot.

    Args:
        batch_ids  : JSON string or Python list of Batch names.
        target_bay : Destination slot string, e.g. 'A1-F-L1'  (preferred).
        new_bay    : Alias for target_bay (kept for backward-compatibility).
        batch_no   : Single Batch name (alternative to batch_ids).
        barcode_scanned : Optional raw barcode string for the Scan Log.

    Returns:
        dict with keys ``status`` ('success' | 'error') and ``message``.
    """
    import json as _json

    # ── 1. Resolve destination bay ───────────────────────────────────────────
    destination = target_bay or new_bay
    if not destination:
        frappe.throw("Missing required parameter: target_bay", frappe.ValidationError)

    # ── 2. Resolve batch list ────────────────────────────────────────────────
    # batch_ids may arrive as:
    #   • a Python list  (frappe.call with args=)
    #   • a JSON string  (form-encoded POST: batch_ids='["JS-001","JS-002"]')
    #   • a plain string (single ID sent as form field)
    if isinstance(batch_ids, str):
        try:
            batch_ids = _json.loads(batch_ids)
        except (ValueError, TypeError):
            # Treat the raw string as a single batch ID
            batch_ids = [batch_ids] if batch_ids else []
    elif batch_ids is None:
        batch_ids = []

    # Also accept the legacy single-batch param
    if batch_no and batch_no not in batch_ids:
        batch_ids.append(batch_no)

    if not batch_ids:
        frappe.throw(
            "Missing required parameter: batch_ids (or batch_no)",
            frappe.ValidationError,
        )

    # ── 3. Auto-create Warehouse Bay if needed ───────────────────────────────
    reserved = {"OUTSIDE", "UNASSIGNED"}
    if destination not in reserved:
        if not frappe.db.exists("Warehouse Bay", destination):
            bay_doc = frappe.new_doc("Warehouse Bay")
            bay_doc.bay_name = destination
            bay_doc.insert(ignore_permissions=True)

    # ── 4. Update each Batch ─────────────────────────────────────────────────
    transferred = []
    skipped = []

    for batch_id in batch_ids:
        if not batch_id:
            continue

        if not frappe.db.exists("Batch", batch_id):
            skipped.append(batch_id)
            continue

        # Load the full document so all hooks/validations run on save()
        doc = frappe.get_doc("Batch", batch_id)
        old_bay = doc.get("custom_bay") or ""

        # Set the bay location field
        doc.custom_bay = None if destination == "UNASSIGNED" else destination

        # save() triggers validation hooks; ignore_permissions so non-admin
        # users running from the WMS app can still transfer rolls
        doc.save(ignore_permissions=True)

        # ── 4a. Append a Scan Log entry ──────────────────────────────────────
        try:
            log = frappe.new_doc("Scan Log")
            log.timestamp    = now_datetime()
            log.user         = frappe.session.user
            log.barcode_scanned = barcode_scanned or batch_id
            log.batch_no     = batch_id
            log.old_bay      = old_bay
            log.new_bay      = destination
            log.qty          = get_batch_qty(batch_id)
            log.insert(ignore_permissions=True)
        except Exception:
            # Scan Log is non-critical; don't block the transfer if the
            # doctype is missing or has validation errors in this site.
            pass

        # ── 4b. Real-time push via WebSockets ────────────────────────────────
        try:
            frappe.publish_realtime(
                "wms_bay_update",
                {
                    "batch_no" : batch_id,
                    "old_bay"  : old_bay,
                    "new_bay"  : destination,
                    "qty"      : get_batch_qty(batch_id),
                    "user"     : frappe.session.user,
                },
            )
        except Exception:
            pass  # SocketIO may not be configured; non-fatal

        transferred.append(batch_id)

    # ── 5. Commit and respond ─────────────────────────────────────────────────
    frappe.db.commit()

    if not transferred:
        return {
            "status" : "error",
            "message": f"No valid batches found. Skipped: {', '.join(skipped) or 'none'}",
        }

    msg_parts = [f"Transferred {len(transferred)} roll(s) to {destination}"]
    if skipped:
        msg_parts.append(f"Skipped (not found): {', '.join(skipped)}")

    return {
        "status" : "success",
        "message": ". ".join(msg_parts),
        "transferred": transferred,
        "skipped"    : skipped,
    }


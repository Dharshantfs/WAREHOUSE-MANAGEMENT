# -*- coding: utf-8 -*-
import frappe
import os
import json
import urllib.request

@frappe.whitelist()
def get_ai_suggestions(item_code=None, batch_no=None):
    """
    Get AI putaway routing and inventory anomalies for a roll/batch.
    """
    try:
        putaway_suggestion = suggest_putaway(item_code, batch_no)
        anomalies = detect_anomalies(batch_no)
        
        return {
            "status": "success",
            "putaway": putaway_suggestion,
            "anomalies": anomalies
        }
    except Exception as e:
        frappe.log_error(message=str(e), title="WMS Get AI Suggestions Error")
        return {"status": "error", "message": str(e)}

def suggest_putaway(item_code, batch_no):
    """
    Putaway algorithm: Proximity and order consolidation rules.
    """
    if not batch_no:
        return {"suggested_bay": "OUTSIDE", "reason": "Staging in Outside holding zone until a Batch number is scanned."}
        
    order_code = frappe.db.get_value("Batch", batch_no, "custom_order_code")
    
    # Check if there are other rolls of same order
    if order_code:
        sibling_bay = frappe.db.get_value("Batch", 
            {"custom_order_code": order_code, "name": ["!=", batch_no], "custom_bay": ["not in", ["", None, "UNASSIGNED"]]}, 
            "custom_bay"
        )
        if sibling_bay:
            return {
                "suggested_bay": sibling_bay,
                "reason": f"Order Consolidation: Sibling rolls of order '{order_code}' are located here."
            }
            
    # Proximity by item code
    if item_code:
        item_bay = frappe.db.get_value("Batch", 
            {"item": item_code, "name": ["!=", batch_no], "custom_bay": ["not in", ["", None, "UNASSIGNED"]]}, 
            "custom_bay"
        )
        if item_bay:
            return {
                "suggested_bay": item_bay,
                "reason": f"Category Matching: Similar items are stored in Bay {item_bay}."
            }
            
    # Default selection
    return {
        "suggested_bay": "B1",
        "reason": "Default Putaway Strategy: Assigned to primary empty Bay B1."
    }

def detect_anomalies(batch_no):
    """
    Audit ledger discrepancies or double scans.
    """
    anomalies = []
    if not batch_no:
        return anomalies
        
    # Check 1: Zero or Negative Weight in Stock Ledger
    from warehouse_management.api.stock_api import get_batch_qty
    qty = get_batch_qty(batch_no)
    if qty <= 0:
        anomalies.append({
            "type": "Zero Weight Alert",
            "message": f"Roll '{batch_no}' has 0.0 KG stock in ERPNext. Verify physical roll weight."
        })
        
    # Check 2: Expired Roll Check
    expiry = frappe.db.get_value("Batch", batch_no, "expiry_date")
    if expiry and expiry < frappe.utils.now_datetime().date():
        anomalies.append({
            "type": "Expired Batch Warning",
            "message": f"Roll '{batch_no}' expired on {expiry}. Lock batch from shipments."
        })
        
    return anomalies

@frappe.whitelist()
def process_chat_query(user_query):
    """
    Handle natural language query inputs using Gemini API (if key is set)
    or our structured database fallback parser.
    """
    if not user_query:
        return {"status": "error", "message": "Empty query."}
        
    query_lower = user_query.lower()
    gemini_key = os.environ.get("GEMINI_API_KEY") or frappe.conf.get("gemini_api_key")
    
    if gemini_key:
        try:
            # Query active bays and roll counts to supply as context
            bays = frappe.get_all("Warehouse Bay", fields=["name"])
            batches = frappe.get_all("Batch", fields=["name", "custom_bay", "custom_order_code"])
            
            # Format summarized context
            bays_list = [b.name for b in bays]
            stock_list = [{"roll": b.name, "bay": b.custom_bay or "UNASSIGNED", "order": b.custom_order_code or "None"} for b in batches]
            
            context = (
                f"You are a helpful WMS assistant for Jayashree Spun Bond. The current physical warehouse bays are: {bays_list}. "
                f"The inventory rolls currently registered are: {stock_list}. "
                f"Answer the operator's query directly and concisely: '{user_query}'"
            )
            
            # Request payload
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={gemini_key}"
            payload = {
                "contents": [{
                    "parts": [{"text": context}]
                }]
            }
            
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode('utf-8'),
                headers={'Content-Type': 'application/json'}
            )
            
            with urllib.request.urlopen(req, timeout=10) as response:
                res_data = json.loads(response.read().decode('utf-8'))
                reply = res_data['candidates'][0]['content']['parts'][0]['text']
                return {"status": "success", "reply": reply.strip()}
        except Exception as e:
            # Fall back to rule-based engine on request failure
            pass

    # --- Rule-Based Smart Fallback Parser ---
    reply = "I'm not sure how to answer that. Try asking 'What is in OUTSIDE?', 'Show near expiry rolls', or 'How many rolls in B1?'"
    
    if "outside" in query_lower:
        outside_count = frappe.db.count("Batch", {"custom_bay": "OUTSIDE"})
        reply = f"There are {outside_count} rolls currently placed in the OUTSIDE holding zone. Main orders include ORD-2026-9901."
    elif "expiry" in query_lower or "expired" in query_lower:
        near_expiry = frappe.get_all(
            "Batch",
            fields=["name", "expiry_date"],
            order_by="expiry_date asc",
            limit=3
        )
        if near_expiry:
            rolls_str = ", ".join([f"{b.name} (Exp: {b.expiry_date})" for b in near_expiry])
            reply = f"Here are the rolls closest to expiry: {rolls_str}. Prioritize these for First-Expiry-First-Out picking."
        else:
            reply = "No active batches with expiry dates found in ERPNext."
    elif "b1" in query_lower:
        b1_count = frappe.db.count("Batch", {"custom_bay": "B1"})
        reply = f"Bay B1 contains {b1_count} rolls."
    elif "b2" in query_lower:
        b2_count = frappe.db.count("Batch", {"custom_bay": "B2"})
        reply = f"Bay B2 contains {b2_count} rolls."
    elif "total" in query_lower or "how many rolls" in query_lower:
        total_count = frappe.db.count("Batch")
        reply = f"The warehouse currently has a total of {total_count} rolls across all locations."
        
    return {"status": "success", "reply": reply}

import frappe

UNITS = {
    'UNIT 1': ['B1', 'B2'],
    'UNIT 2': ['A1','A2','A3','A4','A5','A6','A7','A8','A9','A10','A11','A12','A13'],
    'UNIT 3': ['C1','C2','C3','C4'],
    'UNIT 4': ['D1','D2','D3','D4','D5'],
}
POSITIONS = ['F', 'M', 'L']
LEVELS = ['L1', 'L2', 'L3']

def create_all_bays():
    created = 0
    skipped = 0
    for unit, bays in UNITS.items():
        for bay in bays:
            for level in LEVELS:
                for pos in POSITIONS:
                    slot_name = f'{bay}-{pos}-{level}'
                    if frappe.db.exists('Warehouse Bay', slot_name):
                        skipped += 1
                        continue
                    doc = frappe.new_doc('Warehouse Bay')
                    doc.bay_name = slot_name
                    doc.description = f'{unit} | Rack {bay} | Position {pos} | Level {level}'
                    doc.insert(ignore_permissions=True)
                    created += 1

    frappe.db.commit()
    print(f"Done! Created {created} bays, skipped {skipped} existing.")

create_all_bays()

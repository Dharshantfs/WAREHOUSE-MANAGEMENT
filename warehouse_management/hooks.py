app_name = "warehouse_management"
app_title = "WMS Roll & Bay Stock Tracker"
app_publisher = "Jayashree Spun Bond"
app_description = "WMS Roll & Bay Stock Tracker for Jayashree Spun Bond"
app_email = "dharshan@example.com"
app_license = "mit"
app_version = "0.0.1"

# Explicitly declare no JS/CSS bundles - prevents Frappe esbuild from
# auto-discovering undefined asset paths (avoids paths[0] TypeError)
app_include_js = []
app_include_css = []
web_include_js = []
web_include_css = []

# Fixtures to export custom fields added to standard doctypes
fixtures = [
    {
        "doctype": "Custom Field",
        "filters": [
            ["dt", "in", ["Batch"]]
        ]
    }
]

doctype_js = {
    "Batch": "public/js/batch.js"
}

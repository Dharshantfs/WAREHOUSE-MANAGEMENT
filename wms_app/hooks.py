app_name = "wms_app"
app_title = "WMS Roll & Bay Stock Tracker"
app_publisher = "Antigravity"
app_description = "WMS Roll & Bay Stock Tracker for Jayashree Spun Bond"
app_email = "antigravity@gemini.com"
app_license = "mit"
app_version = "0.0.1"

# Fixtures to export custom fields added to standard doctypes
fixtures = [
    {
        "doctype": "Custom Field",
        "filters": [
            ["dt", "in", ["Batch"]]
        ]
    }
]

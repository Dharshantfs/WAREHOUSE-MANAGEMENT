frappe.pages['wms_dashboard'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'WMS Dashboard',
		single_column: true
	});

	// Embed the React app via iframe
	$(page.main).html(`
		<iframe 
			src="/wms/index.html" 
			style="width: 100%; height: 85vh; border: none; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"
		></iframe>
	`);
}

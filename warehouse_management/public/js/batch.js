frappe.ui.form.on('Batch', {
	refresh: function(frm) {
		// Add button to link to WMS dashboard
		frm.add_custom_button(__('Go to WMS'), function() {
			frappe.set_route('wms_dashboard');
		}).addClass('btn-primary');
	}
});

frappe.query_reports["Raw Materials - Consolidated Stock"] = {
	"filters": [
		{
			"fieldname":"date",
			"label": __("Date"),
			"fieldtype": "Date",
			"default": frappe.datetime.nowdate(),
			"reqd": 1
		}
	],
	"formatter": function(value, row, column, data, default_formatter) {
		value = default_formatter(value, row, column, data);
		if (data && data.name && data.name.includes("TOTAL")) {
			value = "<b>" + value + "</b>";
		}
		return value;
	}
};

frappe.pages['wms_dashboard'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'WMS Dashboard',
		single_column: true
	});

	// Embed the React app via iframe
	$(page.main).html(`
		<iframe 
            id="wms-react-iframe"
			src="/wms/index.html" 
			style="width: 100%; height: 85vh; border: none; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"
		></iframe>
	`);

	// ── Add action buttons to the Frappe page toolbar ──
	page.add_inner_button('🧹 Clear Empty Bay Data', function() {
		frappe.confirm(
			'This will remove bay assignments from ALL batches with 0 Kg stock. This keeps the 3D view and scanner clean. Are you sure?',
			function() {
				frappe.show_progress('Clearing empty bays...', 0, 100, 'Please wait...');
				frappe.call({
					method: 'warehouse_management.api.stock_api.clear_empty_batch_bays',
					callback: function(r) {
						frappe.hide_progress();
						if (r.message && r.message.status === 'success') {
							frappe.show_alert({
								message: `✅ ${r.message.message}`,
								indicator: 'green'
							}, 6);
							// Reload the iframe to reflect changes
							let iframe = document.getElementById('wms-react-iframe');
							if (iframe) iframe.src = iframe.src;
						} else {
							frappe.msgprint({
								title: 'Error',
								indicator: 'red',
								message: r.message ? r.message.message : 'Unknown error occurred.'
							});
						}
					}
				});
			}
		);
	}).addClass('btn-danger');

    let iframe = document.getElementById('wms-react-iframe');
    
    iframe.onload = function() {
        let doc = iframe.contentDocument || iframe.contentWindow.document;
        let iframeWin = iframe.contentWindow;
        
        // Dynamically load html5-qrcode library INTO THE IFRAME so it can access its DOM elements
        if (!doc.getElementById('html5-qrcode-script')) {
            let script = doc.createElement('script');
            script.id = 'html5-qrcode-script';
            script.src = 'https://unpkg.com/html5-qrcode';
            doc.head.appendChild(script);
        }

        // Add custom CSS to the iframe for our injected components
        let style = doc.createElement('style');
        style.innerHTML = `
            .injected-camera-wrapper { margin-top: 0.75rem; width: 100%; display: flex; justify-content: center; }
            .injected-scan-btn {
                background: #6366f1; color: white; padding: 0.6rem 1.5rem; border-radius: 0.5rem;
                font-weight: 600; font-size: 0.875rem; transition: background 0.2s;
                display: flex; align-items: center; justify-content: center; border: none; cursor: pointer;
                gap: 6px; box-shadow: 0 2px 8px rgba(99,102,241,0.3);
            }
            .injected-scan-btn:hover { background: #2563eb; }
            .injected-table-container { margin-top: 1.5rem; overflow-x: auto; background: white; border-radius: 0.5rem; border: 1px solid #e2e8f0; }
            .injected-table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
            .injected-table th { background: #f8fafc; padding: 0.75rem 1rem; text-align: left; font-weight: 600; color: #475569; border-bottom: 1px solid #e2e8f0; }
            .injected-table td { padding: 0.75rem 1rem; border-bottom: 1px solid #e2e8f0; color: #1e293b; }
            .injected-table tr:hover { background: #f1f5f9; cursor: pointer; }
            .injected-bay-badge { background: #e0f2fe; color: #0284c7; padding: 0.25rem 0.5rem; border-radius: 0.25rem; font-weight: 600; font-size: 0.75rem; border: 1px solid #bae6fd; }
            .injected-modal-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.7); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 9999; }
            .injected-modal { background: white; padding: 1.5rem; border-radius: 0.75rem; width: 450px; max-width: 90%; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04); }
            #injected-reader { width: 100%; border: none !important; }
            #injected-reader img { display: none; }
            /* Hide React's Scan Failed card when our order code table is showing */
            #injected-order-table-container ~ * .text-red-600,
            #injected-order-table-container ~ * [class*="scan-failed"],
            #injected-order-table-container ~ * [class*="error"] { display: none !important; }
        `;
        doc.head.appendChild(style);

        const observer = new MutationObserver((mutations) => {
            // Find the scanner input field by its placeholder text
            let input = doc.querySelector('input[placeholder*="scan barcode"]');
            
            if (input && !input.hasAttribute('data-scanner-injected')) {
                input.setAttribute('data-scanner-injected', 'true');
                
                // Add the Camera Button BELOW the input row (not inside it)
                let inputContainer = input.parentNode;
                
                // Create a wrapper div and insert the button AFTER the input container
                let cameraWrapper = doc.createElement('div');
                cameraWrapper.className = 'injected-camera-wrapper';
                
                let btn = doc.createElement('button');
                btn.className = 'injected-scan-btn';
                btn.innerHTML = `
                    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                    📷 Camera Scanner
                `;
                
                cameraWrapper.appendChild(btn);
                // Insert after the input container's parent node
                let scanBlock = inputContainer.parentNode;
                if (scanBlock && scanBlock.parentNode) {
                    scanBlock.parentNode.insertBefore(cameraWrapper, scanBlock.nextSibling);
                } else {
                    inputContainer.appendChild(btn);
                }
                
                // ── CAMERA SCANNER LOGIC ──
                btn.onclick = function(e) {
                    e.preventDefault();
                    
                    if (typeof iframeWin.Html5QrcodeScanner === 'undefined') {
                        frappe.msgprint('Scanner library is still loading, please try again in a second.');
                        return;
                    }
                    
                    let modalOverlay = doc.createElement('div');
                    modalOverlay.className = 'injected-modal-overlay';
                    modalOverlay.innerHTML = `
                        <div class="injected-modal">
                            <h3 style="margin-top:0;font-size:1.125rem;font-weight:600;margin-bottom:1rem;color:#0f172a;">Scan Barcode</h3>
                            <div id="injected-reader"></div>
                            <button id="injected-close-btn" style="margin-top:1rem;width:100%;background:#e2e8f0;color:#475569;font-weight:600;padding:0.75rem;border-radius:0.5rem;border:none;cursor:pointer;">Cancel Scanning</button>
                        </div>
                    `;
                    doc.body.appendChild(modalOverlay);
                    
                    let html5QrcodeScanner = new iframeWin.Html5QrcodeScanner(
                        "injected-reader", { fps: 10, qrbox: {width: 250, height: 250}, aspectRatio: 1.0 }, false);
                    
                    html5QrcodeScanner.render((decodedText, decodedResult) => {
                        html5QrcodeScanner.clear();
                        modalOverlay.remove();
                        
                        // Set the input value via React's native setter to trigger React state
                        let nativeInputValueSetter = Object.getOwnPropertyDescriptor(iframeWin.HTMLInputElement.prototype, "value").set;
                        nativeInputValueSetter.call(input, decodedText);
                        
                        // Trigger standard React change events
                        let event = new iframeWin.Event('input', { bubbles: true });
                        input.dispatchEvent(event);
                        
                        // Wait a tick for React state to update, then dispatch Enter
                        setTimeout(() => {
                            let enterEvent = new iframeWin.KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true });
                            input.dispatchEvent(enterEvent);
                        }, 50);
                    });
                    
                    doc.getElementById('injected-close-btn').onclick = function() {
                        html5QrcodeScanner.clear();
                        modalOverlay.remove();
                    };
                };
                
                // ── ORDER CODE SEARCH ──
                // We listen in BUBBLE phase (not capture) so React handles the Enter first.
                // After React processes, we do our own search and show the table BELOW
                // the React result card if multiple rolls match the order code.
                input.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter') {
                        let val = input.value.trim();
                        if (!val) return;
                        
                        // Search by order code (custom_party_code_text or custom_order_code)
                        // We do this in parallel — React shows its result, we show ours below
                        frappe.call({
                            method: 'frappe.client.get_list',
                            args: {
                                doctype: 'Batch',
                                filters: [
                                    ['custom_party_code_text', 'like', `%${val}%`]
                                ],
                                fields: ['name', 'item_name', 'custom_party_code_text', 'custom_bay', 'batch_qty', 'stock_uom'],
                                limit_page_length: 500
                            },
                            callback: function(r) {
                                if (r.message && r.message.length > 0) {
                                    // Found rolls by order code — show the custom table
                                    renderOrderCodeTable(doc, inputContainer, r.message, val);
                                } else {
                                    // No order code match — clear any previous table (React handles direct batch)
                                    removeOrderCodeTable(doc);
                                }
                            }
                        });
                    }
                }); // bubble phase — does NOT intercept React's handling
            }
        });
        
        observer.observe(doc.body, { childList: true, subtree: true });
    };
    
    function removeOrderCodeTable(doc) {
        let existing = doc.getElementById('injected-order-table-container');
        if (existing) existing.remove();
        
        // Unhide React's native results if we hid them previously
        let reactResults = doc.getElementById('react-scanner-result-container');
        if (reactResults) reactResults.style.display = '';
    }
    
    function renderOrderCodeTable(doc, inputContainer, batches, searchVal) {
        removeOrderCodeTable(doc);
        let mainBlock = inputContainer.parentNode;
        
        let container = doc.createElement('div');
        container.id = 'injected-order-table-container';
        container.className = 'injected-table-container';
        
        let html = `
            <div style="padding: 1rem 1.25rem; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; background: white;">
                <div>
                    <h3 style="margin: 0; font-size: 1.125rem; font-weight: 600; color: #0f172a;">📦 ${batches.length} Roll${batches.length > 1 ? 's' : ''} — Order: ${searchVal || ''}</h3>
                    <p style="margin: 0; margin-top: 0.25rem; font-size: 0.875rem; color: #64748b;">All rolls matching this order code and their bay locations</p>
                </div>
                <button onclick="document.getElementById('injected-order-table-container').remove()" style="border:none;background:#fee2e2;color:#ef4444;border-radius:0.375rem;padding:0.35rem 0.75rem;cursor:pointer;font-size:0.8rem;font-weight:600;">✕ Close</button>
            </div>
            <table class="injected-table">
                <thead>
                    <tr>
                        <th>Batch ID</th>
                        <th>Item</th>
                        <th>Order Code</th>
                        <th>Weight</th>
                        <th>Bay Location</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        batches.forEach(b => {
            let bay = b.custom_bay || 'Unassigned';
            html += `
                <tr>
                    <td style="font-weight: 600; color: #2563eb;">${b.name}</td>
                    <td style="max-width: 250px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${b.item_name || ''}">${b.item_name || '-'}</td>
                    <td style="color: #64748b; font-weight: 500;">${b.custom_party_code_text || '-'}</td>
                    <td style="font-weight: 600; color: #0f172a;">${(b.batch_qty || 0).toFixed(2)} <span style="font-size:0.75rem;color:#94a3b8;font-weight:normal;">${b.stock_uom || 'kg'}</span></td>
                    <td><span class="injected-bay-badge">${bay}</span></td>
                </tr>
            `;
        });
        
        html += `
                </tbody>
            </table>
        `;
        
        container.innerHTML = html;
        mainBlock.parentNode.appendChild(container);
        
        // Actively hide React's "Scan Failed" error card if it appears
        setTimeout(() => {
            // React renders error cards with red background - find and hide them
            doc.querySelectorAll('[class*="bg-red"], [class*="border-red"]').forEach(el => {
                if (el.textContent && el.textContent.includes('Scan Failed')) {
                    el.style.display = 'none';
                    el.id = 'react-scan-failed-hidden';
                }
            });
        }, 300);
    }
}

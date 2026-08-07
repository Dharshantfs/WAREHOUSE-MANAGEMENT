window.assignBay = function(batch_name) {
	frappe.prompt([
		{
			label: 'New Bay Location',
			fieldname: 'new_bay',
			fieldtype: 'Link',
			options: 'Warehouse Bay',
			reqd: 1
		}
	], function(values){
		frappe.call({
			method: 'warehouse_management.api.stock_api.update_batch_bay',
			args: {
				batch_no: batch_name,
				new_bay: values.new_bay
			},
			callback: function(r) {
				if (r.message && r.message.status === 'success') {
					frappe.show_alert({message: 'Bay updated successfully!', indicator: 'green'});
					let iframe = document.getElementById('wms-react-iframe');
					let doc = iframe.contentDocument || iframe.contentWindow.document;
					let badge = doc.getElementById('bay-badge-' + batch_name);
					if(badge) badge.innerText = values.new_bay;
				} else {
                    frappe.msgprint({
                        title: 'Error',
                        indicator: 'red',
                        message: r.message ? r.message.message : 'Unknown error occurred.'
                    });
                }
			}
		});
	}, 'Assign Bay for ' + batch_name, 'Update');
};

frappe.pages['wms_dashboard'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'WMS Dashboard',
		single_column: true
	});

	// Embed the React app via iframe and RM container
	$(page.main).html(`
		<iframe 
            id="wms-react-iframe"
			src="/wms/index.html" 
			style="width: 100%; height: 85vh; border: none; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"
		></iframe>
        <div id="wms-rm-view-container" style="display:none; width: 100%; height: 85vh; background: #f8fafc; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); padding: 20px; overflow-y: auto;">
            <div style="text-align: center; color: #64748b; margin-top: 50px;">Loading Raw Materials...</div>
        </div>
	`);

    function renderRMView(container) {
		container.innerHTML = '<div style="text-align: center; color: #64748b; margin-top: 50px;">Loading 3D Engine...</div>';
		
        // Load Three.js if not loaded
        if (typeof THREE === 'undefined') {
            let script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
            script.onload = () => fetchAndRender(container);
            document.head.appendChild(script);
        } else {
            fetchAndRender(container);
        }
	}

    function fetchAndRender(container) {
        frappe.call({
			method: 'warehouse_management.api.stock_api.get_rm_stock',
			callback: function(r) {
				if (r.message && r.message.status === 'success') {
					let data = r.message.data;
					if (data.length === 0) {
						container.innerHTML = '<div style="text-align: center; color: #64748b; margin-top: 50px;">No Raw Materials found.</div>';
						return;
					}
					
                    container.innerHTML = `
                        <div id="rm-3d-canvas" style="width: 100%; height: 100%; position: relative;">
                            <div id="rm-tooltip" style="position: absolute; display: none; background: rgba(15, 23, 42, 0.9); color: white; padding: 12px 16px; border-radius: 8px; font-size: 14px; pointer-events: none; z-index: 10; box-shadow: 0 4px 6px rgba(0,0,0,0.3); transform: translate(-50%, -100%); margin-top: -15px;"></div>
                        </div>
                    `;

                    initThreeJS(data, document.getElementById('rm-3d-canvas'));
				} else {
					container.innerHTML = '<div style="text-align: center; color: #ef4444; margin-top: 50px;">Error loading data.</div>';
				}
			}
		});
    }

    function initThreeJS(data, container) {
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xf8fafc);
        
        const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 1, 5000);
        // Isometric-like angle
        camera.position.set(300, 400, 500);
        camera.lookAt(0, 0, 0);

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(container.clientWidth, container.clientHeight);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        container.appendChild(renderer.domElement);

        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);
        
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(200, 500, 300);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        dirLight.shadow.camera.left = -500;
        dirLight.shadow.camera.right = 500;
        dirLight.shadow.camera.top = 500;
        dirLight.shadow.camera.bottom = -500;
        scene.add(dirLight);

        // Calculate total bags and pallets for InstancedMesh
        let totalPallets = 0;
        let totalBags = 0;
        data.forEach(item => {
            let bags = Math.floor(item.bags);
            let pallets = Math.ceil(bags / 50);
            if (pallets === 0 && item.bags > 0) { pallets = 1; bags = 1; }
            totalPallets += pallets;
            totalBags += bags;
        });

        // Geometries & Materials
        const palletGeo = new THREE.BoxGeometry(51, 4, 43.25);
        const palletMat = new THREE.MeshLambertMaterial({ color: 0xd4a373 });
        const palletMesh = new THREE.InstancedMesh(palletGeo, palletMat, totalPallets);
        palletMesh.castShadow = true;
        palletMesh.receiveShadow = true;
        scene.add(palletMesh);

        const bagGeo = new THREE.BoxGeometry(16, 4, 18); // Adjusted to fit 5 bags per layer easily
        const bagMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
        const bagMesh = new THREE.InstancedMesh(bagGeo, bagMat, totalBags);
        bagMesh.castShadow = true;
        bagMesh.receiveShadow = true;
        scene.add(bagMesh);

        // Text labels for each item group
        const canvasObj = document.createElement('canvas');
        const contextObj = canvasObj.getContext('2d');

        // Layout variables
        const spacingX = 100;
        const spacingZ = 120;
        let currentX = 0;
        let currentZ = 0;
        const maxColumns = 4; // Pallets per row
        
        let palletIndex = 0;
        let bagIndex = 0;
        const dummy = new THREE.Object3D();
        
        // Metadata for raycaster hover
        const palletMetadata = {}; 

        data.forEach((item, itemIdx) => {
            let remainingBags = Math.floor(item.bags);
            if (remainingBags === 0 && item.bags > 0) remainingBags = 1; // Draw at least 1
            let palletsForThisItem = Math.ceil(remainingBags / 50);
            
            for (let p = 0; p < palletsForThisItem; p++) {
                // Determine position
                let pX = currentX * spacingX - ((maxColumns-1) * spacingX)/2;
                let pZ = currentZ * spacingZ - 100; // Offset Z to center a bit
                
                // Position pallet base
                dummy.position.set(pX, 2, pZ);
                dummy.updateMatrix();
                palletMesh.setMatrixAt(palletIndex, dummy.matrix);
                
                // Save metadata for hover
                let bagsInThisPallet = Math.min(remainingBags, 50);
                remainingBags -= bagsInThisPallet;
                
                let displayBagsCount = bagsInThisPallet;
                if (remainingBags <= 0 && item.bags % 1 !== 0) {
                    let lastPalletValue = item.bags - (p * 50);
                    displayBagsCount = lastPalletValue.toFixed(3);
                }

                palletMetadata[palletIndex] = {
                    item_name: item.item_name,
                    item_code: item.item_code,
                    bags: displayBagsCount,
                    total_kgs: item.kgs,
                    total_bags: item.bags.toFixed(3)
                };
                
                // Position bags (10 layers of 5 bags)
                let bCount = 0;
                for (let layer = 0; layer < 10; layer++) {
                    for (let b = 0; b < 5; b++) {
                        if (bCount >= bagsInThisPallet) break;
                        
                        // 3x2 grid with 1 missing = 5 bags
                        let bx = (b % 3) * 17 - 17; // -17, 0, 17
                        let bz = Math.floor(b / 3) * 20 - 10; // -10, 10
                        
                        // Add slight randomness for realism
                        let jitterX = (Math.random() - 0.5) * 1.5;
                        let jitterZ = (Math.random() - 0.5) * 1.5;
                        
                        dummy.position.set(pX + bx + jitterX, 4 + 2 + layer * 4, pZ + bz + jitterZ);
                        dummy.updateMatrix();
                        bagMesh.setMatrixAt(bagIndex, dummy.matrix);
                        bagIndex++;
                        bCount++;
                    }
                }
                
                palletIndex++;
                currentX++;
                if (currentX >= maxColumns) {
                    currentX = 0;
                    currentZ++;
                }
            }
            
            // Add a gap after each item group if the next item starts
            if (currentX !== 0) {
                currentX = 0;
                currentZ++;
            }
        });

        palletMesh.instanceMatrix.needsUpdate = true;
        bagMesh.instanceMatrix.needsUpdate = true;

        // Camera interaction (OrbitControls not loaded, so we implement simple drag & hover)
        let isDragging = false;
        let previousMousePosition = { x: 0, y: 0 };
        let cameraAngleX = Math.PI / 4;
        let cameraAngleY = Math.PI / 4;
        let cameraRadius = 600;

        function updateCamera() {
            camera.position.x = cameraRadius * Math.sin(cameraAngleX) * Math.cos(cameraAngleY);
            camera.position.y = cameraRadius * Math.sin(cameraAngleY);
            camera.position.z = cameraRadius * Math.cos(cameraAngleX) * Math.cos(cameraAngleY);
            camera.lookAt(0, 0, 0);
        }
        updateCamera();

        container.addEventListener('mousedown', (e) => {
            isDragging = true;
            previousMousePosition = { x: e.offsetX, y: e.offsetY };
        });
        container.addEventListener('mouseup', () => { isDragging = false; });
        container.addEventListener('mouseleave', () => { isDragging = false; });
        
        const tooltip = document.getElementById('rm-tooltip');
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();

        container.addEventListener('mousemove', (e) => {
            if (isDragging) {
                let deltaMove = {
                    x: e.offsetX - previousMousePosition.x,
                    y: e.offsetY - previousMousePosition.y
                };
                cameraAngleX -= deltaMove.x * 0.01;
                cameraAngleY += deltaMove.y * 0.01;
                // Limit vertical angle
                cameraAngleY = Math.max(0.1, Math.min(Math.PI / 2 - 0.1, cameraAngleY));
                
                updateCamera();
                previousMousePosition = { x: e.offsetX, y: e.offsetY };
            }

            // Hover raycasting
            let rect = container.getBoundingClientRect();
            mouse.x = ((e.clientX - rect.left) / container.clientWidth) * 2 - 1;
            mouse.y = -((e.clientY - rect.top) / container.clientHeight) * 2 + 1;
            
            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObjects([palletMesh, bagMesh]);
            
            if (intersects.length > 0) {
                let instanceId = intersects[0].instanceId;
                // Because bags outnumber pallets, we need to map bag instance to pallet instance if they hovered a bag
                // But raycaster returns instanceId of the specific mesh. 
                // A simpler way: we can just check the position of the hit and find the closest pallet center!
                let hitPoint = intersects[0].point;
                let closestPalletId = -1;
                let minDist = Infinity;
                
                for (let i = 0; i < palletIndex; i++) {
                    palletMesh.getMatrixAt(i, dummy.matrix);
                    dummy.position.setFromMatrixPosition(dummy.matrix);
                    let d = dummy.position.distanceTo(hitPoint);
                    if (d < minDist) {
                        minDist = d;
                        closestPalletId = i;
                    }
                }
                
                if (closestPalletId !== -1 && minDist < 60) {
                    let meta = palletMetadata[closestPalletId];
                    if (meta) {
                        tooltip.style.display = 'block';
                        tooltip.style.left = e.offsetX + 'px';
                        tooltip.style.top = e.offsetY + 'px';
                        tooltip.innerHTML = `
                            <div style="font-weight: 600; font-size: 16px; margin-bottom: 4px;">${meta.item_name}</div>
                            <div style="color: #cbd5e1; margin-bottom: 8px;">${meta.item_code}</div>
                            <div>This Pallet: <span style="font-weight: 600; color: #38bdf8;">${meta.bags} bags</span></div>
                            <div style="margin-top: 4px; padding-top: 4px; border-top: 1px solid #475569;">
                                Total Stock: <span style="font-weight: 600;">${meta.total_kgs} kg</span> (${meta.total_bags} bags)
                            </div>
                        `;
                        container.style.cursor = 'pointer';
                        return;
                    }
                }
            }
            
            tooltip.style.display = 'none';
            container.style.cursor = 'default';
        });

        // Wheel zoom
        container.addEventListener('wheel', (e) => {
            e.preventDefault();
            cameraRadius += e.deltaY * 0.5;
            cameraRadius = Math.max(200, Math.min(1500, cameraRadius));
            updateCamera();
        });

        // Render loop
        function animate() {
            requestAnimationFrame(animate);
            renderer.render(scene, camera);
        }
        animate();
        
        // Handle resize
        window.addEventListener('resize', () => {
            if (!container) return;
            camera.aspect = container.clientWidth / container.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(container.clientWidth, container.clientHeight);
        });
    }

	// ── Add action buttons to the Frappe page toolbar ──
	let currentView = 'FG';
	let rmButton = page.add_inner_button('🏭 Switch to RM View', function() {
		if (currentView === 'FG') {
			currentView = 'RM';
			$(this).html('🏭 Switch to FG View');
			document.getElementById('wms-react-iframe').style.display = 'none';
			let rmContainer = document.getElementById('wms-rm-view-container');
			rmContainer.style.display = 'block';
			renderRMView(rmContainer);
		} else {
			currentView = 'FG';
			$(this).html('🏭 Switch to RM View');
			document.getElementById('wms-react-iframe').style.display = 'block';
			document.getElementById('wms-rm-view-container').style.display = 'none';
		}
	}).addClass('btn-primary');

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
                                or_filters: [
                                    ['custom_party_code_text', 'like', `%${val}%`],
                                    ['custom_order_code', 'like', `%${val}%`]
                                ],
                                fields: ['name', 'item_name', 'custom_party_code_text', 'custom_order_code', 'custom_bay', 'batch_qty', 'stock_uom'],
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
            let orderCode = b.custom_party_code_text || b.custom_order_code || '-';
            html += `
                <tr>
                    <td style="font-weight: 600; color: #2563eb;">${b.name}</td>
                    <td style="max-width: 250px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${b.item_name || ''}">${b.item_name || '-'}</td>
                    <td style="color: #64748b; font-weight: 500;">${orderCode}</td>
                    <td style="font-weight: 600; color: #0f172a;">${(b.batch_qty || 0).toFixed(2)} <span style="font-size:0.75rem;color:#94a3b8;font-weight:normal;">${b.stock_uom || 'kg'}</span></td>
                    <td style="display: flex; align-items: center; gap: 8px;">
                        <span class="injected-bay-badge" id="bay-badge-${b.name}">${bay}</span>
                        <button class="injected-assign-btn" onclick="window.parent.assignBay('${b.name}')" style="font-size:0.75rem;padding:2px 8px;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:4px;cursor:pointer;color:#334155;font-weight:500;">✏️ Assign</button>
                    </td>
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

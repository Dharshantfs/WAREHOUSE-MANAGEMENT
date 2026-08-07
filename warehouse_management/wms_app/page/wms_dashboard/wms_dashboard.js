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
}

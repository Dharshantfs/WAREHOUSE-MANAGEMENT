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
        // ── SCENE SETUP ──────────────────────────────────────────────────────────
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xf0f4f8);
        scene.fog = new THREE.Fog(0xf0f4f8, 800, 2500);

        const W = container.clientWidth || 800;
        const H = container.clientHeight || 600;
        const camera = new THREE.PerspectiveCamera(55, W / H, 0.5, 5000);

        const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(W, H);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        container.appendChild(renderer.domElement);

        // ── FLOOR GRID ───────────────────────────────────────────────────────────
        const gridHelper = new THREE.GridHelper(3000, 60, 0xcccccc, 0xe0e0e0);
        gridHelper.position.y = 0;
        scene.add(gridHelper);

        // ── LIGHTING ─────────────────────────────────────────────────────────────
        scene.add(new THREE.AmbientLight(0xffffff, 0.55));
        const sun = new THREE.DirectionalLight(0xfff8e7, 1.0);
        sun.position.set(300, 600, 400);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        sun.shadow.camera.left = -800;
        sun.shadow.camera.right = 800;
        sun.shadow.camera.top = 800;
        sun.shadow.camera.bottom = -800;
        sun.shadow.bias = -0.001;
        scene.add(sun);
        const fillLight = new THREE.DirectionalLight(0xc8e0ff, 0.3);
        fillLight.position.set(-200, 200, -300);
        scene.add(fillLight);

        // ── GEOMETRY HELPERS ─────────────────────────────────────────────────────
        // Sack: flat-ish rounded cylinder (like a filled bag lying flat)
        // Radialtop slightly less than base to look "tied at top"
        const SACK_R  = 8.5;   // radius (sack width ≈ 17 units)
        const SACK_RT = 7.0;   // top radius (tapered)
        const SACK_H  = 4.5;   // height of each sack layer
        const SACK_SEG = 10;   // cylinder segments (low for perf, still round)

        const sackGeo = new THREE.CylinderGeometry(SACK_RT, SACK_R, SACK_H, SACK_SEG, 1);
        // Silver/metallic sack colour
        const sackMat = new THREE.MeshLambertMaterial({ color: 0xc8cdd4 });

        // Edge outline geometry for border visibility
        const sackEdgeGeo = new THREE.EdgesGeometry(sackGeo);
        const sackEdgeMat = new THREE.LineBasicMaterial({ color: 0x445566, linewidth: 1 });

        // Pallet
        const palletGeo = new THREE.BoxGeometry(55, 3.5, 47);
        const palletMat = new THREE.MeshLambertMaterial({ color: 0xc8843a });

        // ── COUNT INSTANCES ──────────────────────────────────────────────────────
        let totalPallets = 0;
        let totalSacks   = 0;
        const SACKS_PER_PALLET = 50;
        const SACKS_PER_LAYER  = 5;   // 5 sacks per layer (3+2 stagger)
        const LAYERS_MAX       = 10;

        data.forEach(item => {
            let bags = Math.max(1, Math.round(item.bags));
            let pallets = Math.ceil(bags / SACKS_PER_PALLET);
            totalPallets += pallets;
            totalSacks   += bags;
        });

        // Edge baking only for reasonable sack counts (perf guard)
        const BAKE_EDGES = totalSacks <= 600;

        const palletMesh = new THREE.InstancedMesh(palletGeo, palletMat, totalPallets);
        palletMesh.castShadow = true;
        palletMesh.receiveShadow = true;
        scene.add(palletMesh);

        const sackMesh = new THREE.InstancedMesh(sackGeo, sackMat, totalSacks);
        sackMesh.castShadow = true;
        sackMesh.receiveShadow = true;
        scene.add(sackMesh);

        // Edge lines: one LineSegments per sack – BUT for thousands of sacks that's too many objects.
        // Instead we bake all edges into a BufferGeometry merged together for perf.
        // We'll collect positions for one merged EdgeMesh.
        const edgePositions = [];

        // ── LAYOUT ──────────────────────────────────────────────────────────────
        // Items are placed in SEPARATE ZONES, each zone has its own row block.
        // Gap between zones = 2 empty rows.
        const COL_COUNT  = 5;   // pallets per row inside a zone
        const SPACING_X  = 70;  // spacing between pallet columns
        const SPACING_Z  = 75;  // spacing between pallet rows
        const ZONE_GAP_Z = 150; // extra Z gap between material groups

        const dummy = new THREE.Object3D();
        const palletMetadata = {};

        let palletIndex = 0;
        let sackIndex   = 0;
        let zoneZ       = 0;   // running Z cursor between zones

        // For label rendering (CSS overlay)
        const zoneLabels = [];

        data.forEach((item, itemIdx) => {
            let totalBags = Math.max(1, Math.round(item.bags));
            let palletsCount = Math.ceil(totalBags / SACKS_PER_PALLET);

            // Calculate bounding box of this zone to position the label correctly
            let rows = Math.ceil(palletsCount / COL_COUNT);
            // Center X = midpoint of the pallet columns in this zone
            let zoneCols = Math.min(palletsCount, COL_COUNT);
            let zoneCenterX = ((zoneCols - 1) * SPACING_X) / 2 - ((zoneCols - 1) * SPACING_X) / 2; // always 0 (symmetric)
            let zoneDepth = rows * SPACING_Z;

            zoneLabels.push({
                x: zoneCenterX,
                y: totalBags > 0 ? (LAYERS_MAX * SACK_H + 30) : 20,
                z: zoneZ + zoneDepth / 2,
                text: item.item_name || item.item_code,
                code: item.item_code,
                bags: item.bags,
                kgs: item.kgs,
            });

            let remaining = totalBags;
            let col = 0, row = 0;

            for (let p = 0; p < palletsCount; p++) {
                let bagsHere = Math.min(remaining, SACKS_PER_PALLET);
                remaining -= bagsHere;

                let px = col * SPACING_X - ((Math.min(palletsCount, COL_COUNT) - 1) * SPACING_X) / 2;
                let pz = zoneZ + row * SPACING_Z;

                // Place pallet
                dummy.position.set(px, 1.75, pz);
                dummy.rotation.set(0, 0, 0);
                dummy.scale.set(1, 1, 1);
                dummy.updateMatrix();
                palletMesh.setMatrixAt(palletIndex, dummy.matrix);

                palletMetadata[palletIndex] = {
                    item_name: item.item_name,
                    item_code: item.item_code,
                    bags: bagsHere,
                    total_kgs: item.kgs,
                    total_bags: item.bags.toFixed ? item.bags.toFixed(3) : item.bags,
                };

                // Place sacks on this pallet
                let sackCount = 0;
                let layer = 0;
                while (sackCount < bagsHere && layer < LAYERS_MAX) {
                    // Alternate row orientation for stagger effect (like real sacks)
                    let isOdd = layer % 2 === 1;
                    for (let s = 0; s < SACKS_PER_LAYER && sackCount < bagsHere; s++) {
                        // 3-2 stagger: odd rows offset
                        let col3 = s % 3;
                        let row2 = Math.floor(s / 3);
                        let sx = (col3 - 1) * (SACK_R * 2 + 1) + (isOdd ? (SACK_R + 0.5) : 0);
                        let sz = (row2 - 0.5) * (SACK_R * 2 + 1);

                        // Slight random jitter for realism
                        let jx = (Math.random() - 0.5) * 1.2;
                        let jz = (Math.random() - 0.5) * 1.2;

                        let sy = 3.5 + SACK_H / 2 + layer * SACK_H;

                        dummy.position.set(px + sx + jx, sy, pz + sz + jz);
                        // Slight random Y rotation per sack for realism
                        dummy.rotation.set(0, (Math.random() - 0.5) * 0.15, 0);
                        dummy.scale.set(1, 1, 1);
                        dummy.updateMatrix();
                        sackMesh.setMatrixAt(sackIndex, dummy.matrix);

                        // Bake edge positions (transform manually for merged edges)
                        if (BAKE_EDGES) {
                            const mat = dummy.matrix;
                            const pos = sackEdgeGeo.attributes.position;
                            for (let ei = 0; ei < pos.count; ei++) {
                                let ex = pos.getX(ei), ey = pos.getY(ei), ez = pos.getZ(ei);
                                let v = new THREE.Vector3(ex, ey, ez).applyMatrix4(mat);
                                edgePositions.push(v.x, v.y, v.z);
                            }
                        }

                        sackIndex++;
                        sackCount++;
                    }
                    layer++;
                }

                palletIndex++;
                col++;
                if (col >= COL_COUNT) { col = 0; row++; }
            }

            // Advance Z to next zone
            zoneZ += Math.ceil(palletsCount / COL_COUNT) * SPACING_Z + ZONE_GAP_Z;
        });

        palletMesh.instanceMatrix.needsUpdate = true;
        sackMesh.instanceMatrix.needsUpdate = true;

        // ── MERGED EDGE LINES ─────────────────────────────────────────────────────
        if (edgePositions.length > 0) {
            const edgeBuf = new THREE.BufferGeometry();
            edgeBuf.setAttribute('position', new THREE.Float32BufferAttribute(edgePositions, 3));
            const edgeLines = new THREE.LineSegments(edgeBuf, sackEdgeMat);
            scene.add(edgeLines);
        }

        // ── CSS LABELS OVERLAY ───────────────────────────────────────────────────
        // We create a 2D canvas overlay that follows the 3D positions
        const labelCanvas = document.createElement('canvas');
        labelCanvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;width:100%;height:100%;';
        container.style.position = 'relative';
        container.appendChild(labelCanvas);

        function projectToScreen(x, y, z) {
            const v = new THREE.Vector3(x, y, z).project(camera);
            return {
                sx: ((v.x + 1) / 2) * labelCanvas.width,
                sy: ((-v.y + 1) / 2) * labelCanvas.height,
                behind: v.z > 1
            };
        }

        // Polyfill ctx.roundRect for older browsers
        function canvasRoundRect(ctx, x, y, w, h, r) {
            if (typeof ctx.roundRect === 'function') {
                ctx.roundRect(x, y, w, h, r);
            } else {
                ctx.moveTo(x + r, y);
                ctx.lineTo(x + w - r, y);
                ctx.quadraticCurveTo(x + w, y, x + w, y + r);
                ctx.lineTo(x + w, y + h - r);
                ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
                ctx.lineTo(x + r, y + h);
                ctx.quadraticCurveTo(x, y + h, x, y + h - r);
                ctx.lineTo(x, y + r);
                ctx.quadraticCurveTo(x, y, x + r, y);
                ctx.closePath();
            }
        }

        let _lblW = 0, _lblH = 0; // track size to avoid redundant canvas resets
        function drawLabels() {
            const cw = container.clientWidth;
            const ch = container.clientHeight;
            // Only resize when dimensions actually changed (avoids clearing context unnecessarily)
            if (labelCanvas.width !== cw || labelCanvas.height !== ch) {
                labelCanvas.width  = cw;
                labelCanvas.height = ch;
            }
            const ctx = labelCanvas.getContext('2d');
            ctx.clearRect(0, 0, cw, ch);

            zoneLabels.forEach(lbl => {
                const p = projectToScreen(lbl.x, lbl.y, lbl.z);
                if (p.behind) return;
                const dist = camera.position.distanceTo(new THREE.Vector3(lbl.x, 0, lbl.z));
                if (dist > 1800) return;
                const alpha = Math.min(1, Math.max(0, (1500 - dist) / 600));
                const scale = Math.max(0.6, Math.min(1.4, 600 / dist));

                ctx.save();
                ctx.globalAlpha = alpha;
                ctx.translate(p.sx, p.sy);

                // Background pill
                const name = lbl.text.length > 30 ? lbl.text.substring(0, 28) + '…' : lbl.text;
                const info = `${lbl.bags.toFixed ? lbl.bags.toFixed(1) : lbl.bags} bags  |  ${lbl.kgs} kg`;
                const fw = Math.max(name.length, info.length) * 7 * scale + 24;
                const fh = 52 * scale;

                ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
                ctx.beginPath();
                canvasRoundRect(ctx, -fw/2, -fh, fw, fh, 8 * scale);
                ctx.fill();

                ctx.fillStyle = '#f0f9ff';
                ctx.font = `bold ${Math.round(13 * scale)}px Inter, sans-serif`;
                ctx.textAlign = 'center';
                ctx.fillText(name, 0, -fh + 18 * scale);

                ctx.fillStyle = '#38bdf8';
                ctx.font = `${Math.round(11 * scale)}px Inter, sans-serif`;
                ctx.fillText(info, 0, -fh + 34 * scale);

                // Arrow down
                ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
                ctx.beginPath();
                ctx.moveTo(-7 * scale, 0);
                ctx.lineTo(7 * scale, 0);
                ctx.lineTo(0, 8 * scale);
                ctx.closePath();
                ctx.fill();

                ctx.restore();
            });
        }

        // ── CAMERA CONTROLLER ────────────────────────────────────────────────────
        // Supports: drag to orbit, scroll to zoom (very close), WASD to pan
        let isDragging = false;
        let prevMouse = { x: 0, y: 0 };

        // Named handler so we can properly remove it on cleanup
        function onMouseUp() { isDragging = false; }

        // Start at a good overview position
        let camTarget = new THREE.Vector3(0, 0, zoneZ / 2); // center on all zones
        let camRadius = Math.max(400, zoneZ * 0.6);
        let camTheta  = -Math.PI / 6;   // horizontal angle
        let camPhi    = Math.PI / 4;    // vertical angle

        function rebuildCamera() {
            camera.position.set(
                camTarget.x + camRadius * Math.cos(camPhi) * Math.sin(camTheta),
                camTarget.y + camRadius * Math.sin(camPhi),
                camTarget.z + camRadius * Math.cos(camPhi) * Math.cos(camTheta)
            );
            camera.lookAt(camTarget);
        }
        rebuildCamera();

        const canvas = renderer.domElement;

        // ── TOOLTIP & RAYCASTER ──────────────────────────────────────────────────
        const tooltip = document.getElementById('rm-tooltip');
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();

        canvas.addEventListener('mousedown', e => {
            isDragging = true;
            prevMouse = { x: e.clientX, y: e.clientY };
        });
        window.addEventListener('mouseup', onMouseUp);

        canvas.addEventListener('mousemove', e => {
            if (!isDragging) {
                // Hover tooltip
                let rect = canvas.getBoundingClientRect();
                mouse.x = ((e.clientX - rect.left) / canvas.clientWidth) * 2 - 1;
                mouse.y = -((e.clientY - rect.top) / canvas.clientHeight) * 2 + 1;
                raycaster.setFromCamera(mouse, camera);

                const intersects = raycaster.intersectObjects([palletMesh, sackMesh]);
                if (intersects.length > 0) {
                    let hitPoint = intersects[0].point;
                    let closestId = -1, minD = Infinity;
                    for (let i = 0; i < palletIndex; i++) {
                        palletMesh.getMatrixAt(i, dummy.matrix);
                        dummy.position.setFromMatrixPosition(dummy.matrix);
                        let d = dummy.position.distanceTo(hitPoint);
                        if (d < minD) { minD = d; closestId = i; }
                    }
                    if (closestId !== -1 && minD < 80) {
                        let meta = palletMetadata[closestId];
                        if (meta) {
                            tooltip.style.display = 'block';
                            tooltip.style.left = (e.clientX - canvas.getBoundingClientRect().left) + 'px';
                            tooltip.style.top  = (e.clientY - canvas.getBoundingClientRect().top - 15) + 'px';
                            tooltip.innerHTML = `
                                <div style="font-weight:700;font-size:15px;margin-bottom:4px;">${meta.item_name}</div>
                                <div style="color:#94a3b8;font-size:12px;margin-bottom:8px;">${meta.item_code}</div>
                                <div style="color:#e2e8f0;">This Pallet: <span style="font-weight:700;color:#38bdf8;">${meta.bags} bags</span></div>
                                <div style="margin-top:6px;padding-top:6px;border-top:1px solid #334155;color:#cbd5e1;">
                                    Total: <b>${meta.total_kgs} kg</b> &nbsp;(${meta.total_bags} bags)
                                </div>`;
                            canvas.style.cursor = 'pointer';
                            return;
                        }
                    }
                }
                tooltip.style.display = 'none';
                canvas.style.cursor = 'default';
                return;
            }

            let dx = e.clientX - prevMouse.x;
            let dy = e.clientY - prevMouse.y;
            prevMouse = { x: e.clientX, y: e.clientY };
            camTheta -= dx * 0.005;
            camPhi    = Math.max(0.05, Math.min(Math.PI / 2 - 0.05, camPhi - dy * 0.005));
            rebuildCamera();
        });

        // Scroll zoom – allow very close (radius 30) so user can "walk in"
        canvas.addEventListener('wheel', e => {
            e.preventDefault();
            camRadius += e.deltaY * 0.4;
            camRadius = Math.max(30, Math.min(2500, camRadius));
            rebuildCamera();
        }, { passive: false });

        // WASD pan (moves the look-at target)
        const keys = {};
        function onKeyDown(e) { keys[e.key.toLowerCase()] = true; }
        function onKeyUp(e)   { keys[e.key.toLowerCase()] = false; }
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup',   onKeyUp);

        function handleKeys() {
            const speed = camRadius * 0.008;
            const right = new THREE.Vector3();
            const forward = new THREE.Vector3();
            camera.getWorldDirection(forward);
            forward.y = 0; forward.normalize();
            right.crossVectors(forward, new THREE.Vector3(0,1,0)).normalize();

            if (keys['w'] || keys['arrowup'])    { camTarget.addScaledVector(forward,  speed); }
            if (keys['s'] || keys['arrowdown'])  { camTarget.addScaledVector(forward, -speed); }
            if (keys['a'] || keys['arrowleft'])  { camTarget.addScaledVector(right,   -speed); }
            if (keys['d'] || keys['arrowright']) { camTarget.addScaledVector(right,    speed); }
            if (keys['q'])                        { camTarget.y += speed * 0.5; }
            if (keys['e'])                        { camTarget.y = Math.max(0, camTarget.y - speed * 0.5); }
            rebuildCamera();
        }


        // ── HUD – controls hint ──────────────────────────────────────────────────
        const hud = document.createElement('div');
        hud.style.cssText = `
            position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%);
            background: rgba(15,23,42,0.75); color: #94a3b8;
            font: 12px Inter,sans-serif; padding: 8px 18px; border-radius: 20px;
            pointer-events: none; white-space: nowrap; backdrop-filter: blur(4px);
            border: 1px solid rgba(255,255,255,0.08);`;
        hud.textContent = '🖱 Drag to orbit  •  Scroll to zoom in/out  •  WASD / Arrow keys to pan';
        container.appendChild(hud);

        // ── RENDER LOOP ──────────────────────────────────────────────────────────
        let frameId;
        function animate() {
            frameId = requestAnimationFrame(animate);
            handleKeys();
            drawLabels();
            renderer.render(scene, camera);
        }
        animate();

        // ── RESIZE ───────────────────────────────────────────────────────────────
        const resizeObs = new ResizeObserver(() => {
            if (!container) return;
            const w = container.clientWidth, h = container.clientHeight;
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            renderer.setSize(w, h);
        });
        resizeObs.observe(container);

        // Cleanup when container removed
        const mutObs = new MutationObserver(() => {
            if (!document.body.contains(container)) {
                cancelAnimationFrame(frameId);
                resizeObs.disconnect();
                mutObs.disconnect();
                // Properly remove the named mouseup handler (anonymous arrow functions can't be removed)
                window.removeEventListener('mouseup', onMouseUp);
                window.removeEventListener('keydown', onKeyDown);
                window.removeEventListener('keyup', onKeyUp);
            }
        });
        mutObs.observe(document.body, { childList: true, subtree: true });
    }

	// ── Add action buttons to the Frappe page toolbar ──
	let currentView = 'FG';
	page.add_inner_button('🏭 Switch to RM View', function() {
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
        
        // Use tableDiv to avoid shadowing the outer 'container' variable
        let tableDiv = doc.createElement('div');
        tableDiv.id = 'injected-order-table-container';
        tableDiv.className = 'injected-table-container';
        
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
        
        tableDiv.innerHTML = html;
        mainBlock.parentNode.appendChild(tableDiv);
        
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

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
                    showItemGrid(data, container);
				} else {
					container.innerHTML = '<div style="text-align: center; color: #ef4444; margin-top: 50px;">Error loading data.</div>';
				}
			}
		});
    }

    // ── CARD GRID VIEW ────────────────────────────────────────────────────────
    function showItemGrid(data, outerContainer) {
        if (outerContainer._threeCleanup) {
            outerContainer._threeCleanup();
            outerContainer._threeCleanup = null;
        }
        outerContainer.style.overflowY = 'auto';
        const totalBagsAll = data.reduce((s, i) => s + (i.bags || 0), 0);
        const totalKgsAll  = data.reduce((s, i) => s + (i.kgs  || 0), 0);
        outerContainer.innerHTML = `
            <div style="background:linear-gradient(135deg,#1e293b,#0f172a);padding:18px 24px;border-radius:8px 8px 0 0;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
                <div>
                    <h2 style="margin:0;color:#f8fafc;font-size:19px;font-weight:800;">🏭 Raw Materials Stock</h2>
                    <div style="color:#94a3b8;font-size:13px;margin-top:4px;">${data.length} materials &nbsp;·&nbsp; ${totalBagsAll.toFixed(1)} bags &nbsp;·&nbsp; ${totalKgsAll.toFixed(0)} kg</div>
                </div>
                <div style="color:#64748b;font-size:12px;background:rgba(255,255,255,0.05);padding:6px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.08);">Click any item to view 3D pallet layout →</div>
            </div>
            <div id="rm-item-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:16px;padding:20px;background:#eef2f7;"></div>
        `;
        const grid = outerContainer.querySelector('#rm-item-grid');
        const BAGS_PER_PALLET = 50;
        data.forEach((item, idx) => {
            const bags    = Math.max(0, item.bags || 0);
            const pallets = bags > 0 ? Math.ceil(Math.round(bags) / BAGS_PER_PALLET) : 0;
            const hue     = (idx * 53 + 200) % 360;
            const clr     = `hsl(${hue},65%,48%)`;
            const clrL    = `hsl(${hue},65%,95%)`;
            const card = document.createElement('div');
            card.style.cssText = 'background:white;border-radius:14px;overflow:hidden;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,0.07);transition:all 0.18s ease;border:2px solid transparent;';
            card.innerHTML = `
                <div style="height:5px;background:${clr};"></div>
                <div style="padding:16px 18px 14px;">
                    <div style="font-weight:700;font-size:14px;color:#0f172a;line-height:1.4;margin-bottom:3px;">${item.item_name || item.item_code}</div>
                    <div style="font-size:11px;color:#94a3b8;margin-bottom:14px;font-family:monospace;">${item.item_code}</div>
                    <div style="display:flex;gap:8px;">
                        <div style="flex:1;background:${clrL};border-radius:10px;padding:10px 6px;text-align:center;">
                            <div style="font-size:22px;font-weight:900;color:${clr};line-height:1;">${bags.toFixed ? bags.toFixed(1) : bags}</div>
                            <div style="font-size:10px;color:#94a3b8;margin-top:3px;font-weight:600;">BAGS</div>
                        </div>
                        <div style="flex:1;background:#f8fafc;border-radius:10px;padding:10px 6px;text-align:center;">
                            <div style="font-size:22px;font-weight:900;color:#334155;line-height:1;">${pallets}</div>
                            <div style="font-size:10px;color:#94a3b8;margin-top:3px;font-weight:600;">PALLETS</div>
                        </div>
                        <div style="flex:1;background:#f8fafc;border-radius:10px;padding:10px 6px;text-align:center;">
                            <div style="font-size:16px;font-weight:800;color:#334155;line-height:1;">${(item.kgs||0).toFixed(0)}</div>
                            <div style="font-size:10px;color:#94a3b8;margin-top:3px;font-weight:600;">KG</div>
                        </div>
                    </div>
                    <div style="margin-top:12px;text-align:right;font-size:12px;font-weight:600;color:${clr};">View 3D →</div>
                </div>
            `;
            card.addEventListener('mouseenter', () => { card.style.transform='translateY(-4px)'; card.style.boxShadow='0 12px 28px rgba(0,0,0,0.14)'; card.style.borderColor=clr; });
            card.addEventListener('mouseleave', () => { card.style.transform=''; card.style.boxShadow='0 2px 10px rgba(0,0,0,0.07)'; card.style.borderColor='transparent'; });
            card.addEventListener('click', () => showItemDetail(item, data, outerContainer));
            grid.appendChild(card);
        });
    }

    // ── INDIVIDUAL ITEM DETAIL VIEW ───────────────────────────────────────────
    function showItemDetail(item, allData, outerContainer) {
        if (outerContainer._threeCleanup) { outerContainer._threeCleanup(); outerContainer._threeCleanup = null; }
        outerContainer.style.overflowY = 'hidden';
        const BAGS_PER_PALLET = 50;
        const totalBags  = Math.max(1, Math.round(item.bags || 1));
        const palletsCnt = Math.ceil(totalBags / BAGS_PER_PALLET);
        outerContainer.innerHTML = `
            <div style="background:linear-gradient(135deg,#1e293b,#0f172a);padding:12px 20px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
                <button id="rm-back-btn" style="background:#334155;color:#e2e8f0;border:none;border-radius:8px;padding:8px 16px;cursor:pointer;font-size:13px;font-weight:600;white-space:nowrap;">← All Items</button>
                <div style="flex:1;min-width:0;">
                    <div style="color:#f8fafc;font-weight:800;font-size:16px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${item.item_name || item.item_code}</div>
                    <div style="color:#64748b;font-size:12px;margin-top:2px;">${item.item_code} &nbsp;·&nbsp; ${totalBags} bags &nbsp;·&nbsp; ${palletsCnt} pallets &nbsp;·&nbsp; ${(item.kgs||0).toFixed(0)} kg</div>
                </div>
                <div style="display:flex;gap:10px;flex-shrink:0;">
                    <div style="background:rgba(56,189,248,0.12);border:1px solid rgba(56,189,248,0.3);border-radius:8px;padding:8px 14px;text-align:center;">
                        <div style="color:#38bdf8;font-size:20px;font-weight:900;">${palletsCnt}</div>
                        <div style="color:#64748b;font-size:10px;font-weight:600;">PALLETS</div>
                    </div>
                    <div style="background:rgba(56,189,248,0.12);border:1px solid rgba(56,189,248,0.3);border-radius:8px;padding:8px 14px;text-align:center;">
                        <div style="color:#38bdf8;font-size:20px;font-weight:900;">${totalBags}</div>
                        <div style="color:#64748b;font-size:10px;font-weight:600;">BAGS</div>
                    </div>
                </div>
            </div>
            <div id="rm-detail-canvas" style="width:100%;height:calc(85vh - 58px);position:relative;overflow:hidden;background:#eef2f7;">
                <div id="rm-tooltip" style="position:absolute;display:none;background:rgba(15,23,42,0.93);color:white;padding:12px 16px;border-radius:10px;font-size:13px;pointer-events:none;z-index:20;box-shadow:0 4px 20px rgba(0,0,0,0.4);min-width:170px;"></div>
            </div>
        `;
        const backBtn = document.getElementById('rm-back-btn');
        backBtn.addEventListener('mouseenter', () => backBtn.style.background = '#475569');
        backBtn.addEventListener('mouseleave', () => backBtn.style.background = '#334155');
        backBtn.onclick = () => showItemGrid(allData, outerContainer);
        requestAnimationFrame(() => initItemThreeJS(item, document.getElementById('rm-detail-canvas'), outerContainer));
    }

    // ── THREE.JS SINGLE-ITEM 3D VIEW ─────────────────────────────────────────
    function initItemThreeJS(item, canvasCont, outerContainer) {
        const BAGS_PER_PALLET = 50;
        const BAGS_PER_LAYER  = 10;   // 5 wide × 2 deep per layer
        const LAYERS_MAX      = 5;    // 5 layers × 10 bags = 50 max
        const PALLETS_PER_ROW = 5;

        // Pallet: 60 × 4 × 50
        const PALLET_W = 60, PALLET_H = 4, PALLET_D = 50;
        // Bag: 5 cols × BAG_W=11 = 55 (fits 60), 2 rows × BAG_D=23 = 46 (fits 50)
        const BAG_W = 11, BAG_H = 5.5, BAG_D = 23;

        // 5×2 grid of bag positions per layer (relative to pallet center)
        const bagOffsets = [];
        for (let c = 0; c < 5; c++) {
            for (let r = 0; r < 2; r++) {
                bagOffsets.push({ x: (c - 2) * BAG_W, z: (r - 0.5) * BAG_D });
            }
        }

        const totalBags    = Math.max(1, Math.round(item.bags || 1));
        const palletsCount = Math.ceil(totalBags / BAGS_PER_PALLET);

        // Scene
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xeef2f7);
        scene.fog = new THREE.FogExp2(0xeef2f7, 0.0008);
        const W = canvasCont.clientWidth || 900;
        const H = canvasCont.clientHeight || 550;
        const camera = new THREE.PerspectiveCamera(48, W / H, 0.5, 4000);
        const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(W, H);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        canvasCont.appendChild(renderer.domElement);

        // Floor
        const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshLambertMaterial({ color: 0xdce4ef }));
        floorMesh.rotation.x = -Math.PI / 2;
        floorMesh.receiveShadow = true;
        scene.add(floorMesh);
        scene.add(new THREE.GridHelper(3000, 80, 0xc0cad8, 0xd0dae8));

        // Lighting
        scene.add(new THREE.AmbientLight(0xffffff, 0.55));
        const sun = new THREE.DirectionalLight(0xfff6e8, 1.3);
        sun.position.set(300, 500, 250);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        sun.shadow.camera.left = -600; sun.shadow.camera.right = 600;
        sun.shadow.camera.top = 600;   sun.shadow.camera.bottom = -600;
        sun.shadow.bias = -0.002;
        scene.add(sun);
        const rimLight = new THREE.DirectionalLight(0xaac8f0, 0.35);
        rimLight.position.set(-300, 200, -300);
        scene.add(rimLight);

        // Geometries
        const palletGeo = new THREE.BoxGeometry(PALLET_W, PALLET_H, PALLET_D);
        const palletMat = new THREE.MeshPhongMaterial({ color: 0xc8823a, shininess: 25 });
        const bagGeo    = new THREE.BoxGeometry(BAG_W, BAG_H, BAG_D);
        const bagMat    = new THREE.MeshPhongMaterial({ color: 0xcfd4de, shininess: 55, specular: new THREE.Color(0x8899bb) });
        const bagEdgeGeo = new THREE.EdgesGeometry(bagGeo);
        const bagEdgeMat = new THREE.LineBasicMaterial({ color: 0x5577aa });

        // Instanced meshes
        const palletMesh = new THREE.InstancedMesh(palletGeo, palletMat, palletsCount);
        palletMesh.castShadow = true; palletMesh.receiveShadow = true;
        scene.add(palletMesh);
        const bagMesh = new THREE.InstancedMesh(bagGeo, bagMat, totalBags);
        bagMesh.castShadow = true; bagMesh.receiveShadow = true;
        scene.add(bagMesh);

        const BAKE_EDGES = totalBags <= 1000;
        const edgePositions = [];

        // Layout pallets in rows of 5
        const SPACING_X = PALLET_W + 14;
        const SPACING_Z = PALLET_D + 16;
        const totalRows = Math.ceil(palletsCount / PALLETS_PER_ROW);
        const groupOffX = -((Math.min(palletsCount, PALLETS_PER_ROW) - 1) * SPACING_X) / 2;
        const groupOffZ = -((totalRows - 1) * SPACING_Z) / 2;

        const dummy = new THREE.Object3D();
        const palletMetadata = {};
        let palletIdx = 0, bagIdx = 0;

        for (let p = 0; p < palletsCount; p++) {
            const col = p % PALLETS_PER_ROW;
            const row = Math.floor(p / PALLETS_PER_ROW);
            const px  = groupOffX + col * SPACING_X;
            const pz  = groupOffZ + row * SPACING_Z;

            dummy.position.set(px, PALLET_H / 2, pz);
            dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
            palletMesh.setMatrixAt(palletIdx, dummy.matrix);

            const bagsActual = Math.max(1, p === palletsCount - 1 ? totalBags - p * BAGS_PER_PALLET : BAGS_PER_PALLET);
            palletMetadata[palletIdx] = { pallet_num: p + 1, bags: bagsActual, total_bags: totalBags, total_kgs: item.kgs || 0 };

            let bagCount = 0, layer = 0;
            while (bagCount < bagsActual && layer < LAYERS_MAX) {
                for (let s = 0; s < bagOffsets.length && bagCount < bagsActual; s++) {
                    const off = bagOffsets[s];
                    const staggerX = layer % 2 === 1 ? BAG_W / 2 : 0;
                    const by = PALLET_H + BAG_H / 2 + layer * BAG_H;
                    dummy.position.set(px + off.x + staggerX, by, pz + off.z);
                    dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
                    bagMesh.setMatrixAt(bagIdx, dummy.matrix);
                    if (BAKE_EDGES) {
                        const mat = dummy.matrix, pos = bagEdgeGeo.attributes.position;
                        for (let ei = 0; ei < pos.count; ei++) {
                            const v = new THREE.Vector3(pos.getX(ei), pos.getY(ei), pos.getZ(ei)).applyMatrix4(mat);
                            edgePositions.push(v.x, v.y, v.z);
                        }
                    }
                    bagIdx++; bagCount++;
                }
                layer++;
            }
            palletIdx++;
        }
        palletMesh.instanceMatrix.needsUpdate = true;
        bagMesh.instanceMatrix.needsUpdate    = true;

        if (edgePositions.length > 0) {
            const edgeBuf = new THREE.BufferGeometry();
            edgeBuf.setAttribute('position', new THREE.Float32BufferAttribute(edgePositions, 3));
            scene.add(new THREE.LineSegments(edgeBuf, bagEdgeMat));
        }

        // Label canvas overlay
        const labelCanvas = document.createElement('canvas');
        labelCanvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;';
        canvasCont.appendChild(labelCanvas);

        function canvasRR(ctx, x, y, w, h, r) {
            if (typeof ctx.roundRect === 'function') { ctx.roundRect(x, y, w, h, r); return; }
            ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
            ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
            ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
            ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y); ctx.closePath();
        }

        function drawPalletLabels() {
            const cw = canvasCont.clientWidth, ch = canvasCont.clientHeight;
            if (labelCanvas.width !== cw || labelCanvas.height !== ch) {
                labelCanvas.width = cw; labelCanvas.height = ch;
                labelCanvas.style.width = cw + 'px'; labelCanvas.style.height = ch + 'px';
            }
            const ctx = labelCanvas.getContext('2d');
            ctx.clearRect(0, 0, cw, ch);
            for (let p = 0; p < palletsCount; p++) {
                palletMesh.getMatrixAt(p, dummy.matrix);
                dummy.position.setFromMatrixPosition(dummy.matrix);
                const meta = palletMetadata[p];
                const stackTop = PALLET_H + Math.ceil(meta.bags / BAGS_PER_LAYER) * BAG_H + 8;
                const wp = new THREE.Vector3(dummy.position.x, stackTop, dummy.position.z).project(camera);
                if (wp.z > 1) continue;
                const sx = ((wp.x + 1) / 2) * cw;
                const sy = ((-wp.y + 1) / 2) * ch;
                const dist = camera.position.distanceTo(dummy.position);
                if (dist > 700) continue;
                const alpha = Math.min(1, Math.max(0, (600 - dist) / 200));
                const sc    = Math.max(0.65, Math.min(1.5, 130 / dist));
                const fw = 62 * sc, fh = 36 * sc;
                ctx.save();
                ctx.globalAlpha = alpha;
                ctx.translate(sx, sy);
                ctx.fillStyle = 'rgba(15,23,42,0.88)';
                ctx.beginPath(); canvasRR(ctx, -fw/2, -fh, fw, fh, 5*sc); ctx.fill();
                ctx.fillStyle = '#94a3b8';
                ctx.font = `600 ${Math.round(9*sc)}px Inter,sans-serif`;
                ctx.textAlign = 'center';
                ctx.fillText(`P${p+1}`, 0, -fh + 12*sc);
                ctx.fillStyle = '#38bdf8';
                ctx.font = `800 ${Math.round(11*sc)}px Inter,sans-serif`;
                ctx.fillText(`${meta.bags} bags`, 0, -fh + 26*sc);
                ctx.fillStyle = 'rgba(15,23,42,0.88)';
                ctx.beginPath(); ctx.moveTo(-5*sc,0); ctx.lineTo(5*sc,0); ctx.lineTo(0,6*sc); ctx.closePath(); ctx.fill();
                ctx.restore();
            }
        }

        // Camera setup — center on full pallet group
        const extent = Math.max(
            Math.min(palletsCount, PALLETS_PER_ROW) * SPACING_X,
            totalRows * SPACING_Z
        );
        let camRadius = Math.max(200, extent * 0.85);
        let camTheta = -0.4, camPhi = 0.55;
        const camTarget = new THREE.Vector3(0, 15, 0);

        function rebuildCamera() {
            camera.position.set(
                camTarget.x + camRadius * Math.cos(camPhi) * Math.sin(camTheta),
                camTarget.y + camRadius * Math.sin(camPhi),
                camTarget.z + camRadius * Math.cos(camPhi) * Math.cos(camTheta)
            );
            camera.lookAt(camTarget);
        }
        rebuildCamera();

        let isDragging = false, prevMouse = { x: 0, y: 0 };
        const keys = {};
        function onMouseUp()  { isDragging = false; }
        function onKeyDown(e) { keys[e.key.toLowerCase()] = true; }
        function onKeyUp(e)   { keys[e.key.toLowerCase()] = false; }

        const cvs = renderer.domElement;
        cvs.addEventListener('mousedown', e => { isDragging = true; prevMouse = { x: e.clientX, y: e.clientY }; });
        window.addEventListener('mouseup',  onMouseUp);
        window.addEventListener('keydown',  onKeyDown);
        window.addEventListener('keyup',    onKeyUp);

        const tooltip   = document.getElementById('rm-tooltip');
        const raycaster = new THREE.Raycaster();
        const mouse     = new THREE.Vector2();

        cvs.addEventListener('mousemove', e => {
            if (isDragging) {
                const dx = e.clientX - prevMouse.x, dy = e.clientY - prevMouse.y;
                prevMouse = { x: e.clientX, y: e.clientY };
                camTheta -= dx * 0.006;
                camPhi = Math.max(0.05, Math.min(Math.PI/2 - 0.05, camPhi - dy * 0.006));
                rebuildCamera(); tooltip.style.display = 'none';
                return;
            }
            const rect = cvs.getBoundingClientRect();
            mouse.x  =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
            mouse.y  = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
            raycaster.setFromCamera(mouse, camera);
            const hits = raycaster.intersectObjects([palletMesh, bagMesh]);
            if (hits.length > 0) {
                const hitPt = hits[0].point;
                let closestId = -1, minD = Infinity;
                for (let i = 0; i < palletIdx; i++) {
                    palletMesh.getMatrixAt(i, dummy.matrix);
                    dummy.position.setFromMatrixPosition(dummy.matrix);
                    const d = dummy.position.distanceTo(hitPt);
                    if (d < minD) { minD = d; closestId = i; }
                }
                if (closestId >= 0 && minD < 90) {
                    const meta = palletMetadata[closestId];
                    tooltip.style.display = 'block';
                    tooltip.style.left    = (e.clientX - rect.left + 14) + 'px';
                    tooltip.style.top     = (e.clientY - rect.top  - 80) + 'px';
                    tooltip.innerHTML = `
                        <div style="font-weight:800;font-size:15px;color:#38bdf8;margin-bottom:4px;">Pallet #${meta.pallet_num}</div>
                        <div style="font-size:14px;font-weight:700;margin-bottom:8px;">${meta.bags} bags on this pallet</div>
                        <div style="border-top:1px solid #334155;padding-top:6px;color:#94a3b8;font-size:12px;">
                            <div>${item.item_name || item.item_code}</div>
                            <div style="margin-top:3px;">Total: <b style="color:#e2e8f0;">${meta.total_bags} bags</b> / ${(meta.total_kgs||0).toFixed(0)} kg</div>
                        </div>`;
                    cvs.style.cursor = 'pointer';
                    return;
                }
            }
            tooltip.style.display = 'none'; cvs.style.cursor = 'default';
        });

        cvs.addEventListener('wheel', e => {
            e.preventDefault();
            camRadius = Math.max(25, Math.min(2500, camRadius + e.deltaY * 0.45));
            rebuildCamera();
        }, { passive: false });

        function handleKeys() {
            const speed = camRadius * 0.012;
            const forward = new THREE.Vector3(), right = new THREE.Vector3();
            camera.getWorldDirection(forward); forward.y = 0; forward.normalize();
            right.crossVectors(forward, new THREE.Vector3(0,1,0)).normalize();
            if (keys['w'] || keys['arrowup'])    camTarget.addScaledVector(forward,  speed);
            if (keys['s'] || keys['arrowdown'])  camTarget.addScaledVector(forward, -speed);
            if (keys['a'] || keys['arrowleft'])  camTarget.addScaledVector(right,   -speed);
            if (keys['d'] || keys['arrowright']) camTarget.addScaledVector(right,    speed);
            if (keys['q']) camTarget.y += speed * 0.5;
            if (keys['e']) camTarget.y = Math.max(0, camTarget.y - speed * 0.5);
            rebuildCamera();
        }

        // HUD hint
        const hud = document.createElement('div');
        hud.style.cssText = 'position:absolute;bottom:16px;left:50%;transform:translateX(-50%);background:rgba(15,23,42,0.78);color:#94a3b8;font:12px Inter,sans-serif;padding:8px 20px;border-radius:20px;pointer-events:none;white-space:nowrap;backdrop-filter:blur(4px);border:1px solid rgba(255,255,255,0.08);';
        hud.textContent = '🖱 Drag to orbit  •  Scroll to zoom in/out  •  WASD / Arrow keys to pan';
        canvasCont.appendChild(hud);

        // Render loop
        let frameId;
        function animate() {
            frameId = requestAnimationFrame(animate);
            handleKeys();
            drawPalletLabels();
            renderer.render(scene, camera);
        }
        animate();

        const resizeObs = new ResizeObserver(() => {
            if (!canvasCont) return;
            const w = canvasCont.clientWidth, h = canvasCont.clientHeight;
            camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h);
        });
        resizeObs.observe(canvasCont);

        function cleanup() {
            cancelAnimationFrame(frameId);
            resizeObs.disconnect();
            mutObs.disconnect();
            window.removeEventListener('mouseup',  onMouseUp);
            window.removeEventListener('keydown',  onKeyDown);
            window.removeEventListener('keyup',    onKeyUp);
            renderer.dispose();
        }
        outerContainer._threeCleanup = cleanup;

        const mutObs = new MutationObserver(() => {
            if (!document.body.contains(canvasCont)) cleanup();
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

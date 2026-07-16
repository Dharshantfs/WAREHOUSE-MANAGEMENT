// WMS Portal JavaScript Logic - Jayashree Spun Bond
document.addEventListener('DOMContentLoaded', function () {
    // --- STATE MANAGEMENT ---
    let appState = {
        isDemoMode: true, // Will auto-toggle if Frappe APIs fail
        batches: [],      // Holds all batches/rolls
        bays: [],         // Holds aggregated bay data
        currentBayDetails: null,
        selectedBayName: '',
        activeUnit: 'unit_3', // Matches filter selector
        activeTab: 'dashboard',
        mockDatabase: {}, // Local copy for Demo Mode
        charts: {
            items: null,
            company: null
        }
    };

    // --- UTILITIES ---
    // Extract metadata from Roll/Batch ID (e.g. JS-0306261/22)
    function parseBatchDetails(batchId) {
        const match = batchId.match(/^([A-Za-z]+)-(\d{2})(\d{2})(\d{2})(\d+)\/(\d+)$/);
        if (match) {
            const rawCompany = match[1].toUpperCase();
            let fullCompany = rawCompany;
            let unit = parseInt(match[2], 10);
            
            if (rawCompany === 'JS') {
                fullCompany = 'JAYASHREE SPUN BOND';
            } else if (rawCompany === 'TS') {
                fullCompany = 'THUSMA PRIVATE LIMITED';
                unit = 4;
            }

            return {
                company: fullCompany,
                rawCompany,
                unit,
                month: match[3],
                year: match[4],
                series: match[5],
                roll: match[6],
                parsed: true
            };
        }
        return { company: 'Unknown', rawCompany: 'Unknown', unit: 0, parsed: false };
    }

    // Determine batch status and colors
    function getBatchStatus(batch) {
        const qty = batch.batch_qty || batch.qty || 0;
        if (qty <= 0) return { label: 'Out of Stock', class: 'status-badge text-muted' };
        
        if (batch.expiry_date) {
            const expiry = new Date(batch.expiry_date);
            const now = new Date();
            const diffDays = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            
            if (diffDays < 0) return { label: 'Expired', class: 'status-badge expired' };
            if (diffDays <= 30) return { label: 'Expiring Soon', class: 'status-badge expiring-soon' };
        }

        if (qty < 10) return { label: 'Low Stock', class: 'status-badge low-stock' };
        return { label: 'In Stock', class: 'status-badge in-stock' };
    }

    // --- MOCK DATABASE (Demo fallback) ---
    function initializeMockDatabase() {
        // Build mock list mirroring React app and user's Excel sheet
        const unit3Mock = Array.from({ length: 22 }, (_, i) => {
            const rollNo = i + 1;
            const weight = rollNo === 22 ? 44.17 : 44.15;
            return {
                name: `JS-0306261/${rollNo}`,
                batch_id: `JS-0306261/${rollNo}`,
                item: "JS-SPUN-BOND",
                item_name: "Jayashree Spun Bond Roll",
                batch_qty: weight,
                qty: weight,
                custom_bay: "OUTSIDE",
                custom_order_code: "ORD-2026-9901",
                manufacturing_date: "2026-06-01",
                expiry_date: "2027-06-01"
            };
        });

        // Additional mock rolls for other bays / units
        const otherMock = [
            { name: "JS-0306261/23", batch_id: "JS-0306261/23", item: "JS-SPUN-BOND", item_name: "Jayashree Spun Bond Roll", batch_qty: 45.00, qty: 45.00, custom_bay: "UNASSIGNED", custom_order_code: "ORD-2026-9902", manufacturing_date: "2026-06-02", expiry_date: "2027-06-02" },
            { name: "JS-0306261/24", batch_id: "JS-0306261/24", item: "JS-SPUN-BOND", item_name: "Jayashree Spun Bond Roll", batch_qty: 42.80, qty: 42.80, custom_bay: "UNASSIGNED", custom_order_code: "ORD-2026-9902", manufacturing_date: "2026-06-02", expiry_date: "2027-06-02" },
            { name: "JS-0106261/1", batch_id: "JS-0106261/1", item: "JS-SPUN-BOND", item_name: "Jayashree Spun Bond Roll", batch_qty: 50.50, qty: 50.50, custom_bay: "B1", custom_order_code: "ORD-2026-1102", manufacturing_date: "2026-06-01", expiry_date: "2027-06-01" },
            { name: "JS-0106261/2", batch_id: "JS-0106261/2", item: "JS-SPUN-BOND", item_name: "Jayashree Spun Bond Roll", batch_qty: 45.20, qty: 45.20, custom_bay: "B1", custom_order_code: "ORD-2026-1102", manufacturing_date: "2026-06-01", expiry_date: "2027-06-01" },
            { name: "JS-0106261/3", batch_id: "JS-0106261/3", item: "JS-SPUN-BOND", item_name: "Jayashree Spun Bond Roll", batch_qty: 52.10, qty: 52.10, custom_bay: "B2", custom_order_code: "ORD-2026-1105", manufacturing_date: "2026-06-01", expiry_date: "2027-06-01" },
            { name: "JS-0205261/1", batch_id: "JS-0205261/1", item: "JS-SPUN-BOND", item_name: "Jayashree Spun Bond Roll", batch_qty: 40.20, qty: 40.20, custom_bay: "B1", custom_order_code: "ORD-2026-8804", manufacturing_date: "2026-05-20", expiry_date: "2027-05-20" }
        ];

        appState.mockDatabase = [...unit3Mock, ...otherMock];
    }
    initializeMockDatabase();

    // --- DOM ELEMENTS ---
    const refreshBtn = document.getElementById('refresh-btn');
    const demoModeBadge = document.getElementById('demo-mode-badge');
    const unitSelect = document.getElementById('unit-select');
    const pageTitle = document.getElementById('page-title');
    const pageSubtitle = document.getElementById('page-subtitle');
    
    // KPI Cards
    const totalWeightEl = document.getElementById('total-weight');
    const totalLowStockEl = document.getElementById('total-low-stock');
    const totalExpiringEl = document.getElementById('total-expiring');

    // Sidebar & View Navigation
    const navItems = document.querySelectorAll('.nav-item');
    const tabContents = document.querySelectorAll('.tab-content');

    // Scanner
    const scanInput = document.getElementById('scan-input');
    const bayAssignSelect = document.getElementById('bay-assign-select');
    const executeMoveBtn = document.getElementById('execute-move-btn');
    const scannerFeedback = document.getElementById('scanner-feedback');
    const cameraScanBtn = document.getElementById('camera-scan-btn');
    const cameraModal = document.getElementById('camera-modal');
    const closeCameraBtn = document.getElementById('close-camera-btn');
    let html5QrCodeScanner = null;

    // AI Suggestions Panel
    const aiSuggestionPanel = document.getElementById('ai-suggestion-panel');
    const aiSuggestionReason = document.getElementById('ai-suggestion-reason');
    const suggestedPutawayBay = document.getElementById('suggested-putaway-bay');
    const anomaliesList = document.getElementById('anomalies-list');

    // AI Insights
    const generateInsightsBtn = document.getElementById('generate-insights-btn');
    const aiInsightsContent = document.getElementById('ai-insights-content');

    // Bay Stock Grid & Dialogs
    const baysGrid = document.getElementById('bays-grid');
    const moveDialog = document.getElementById('move-dialog');
    const dialogRollId = document.getElementById('dialog-roll-id');
    const dialogBaySelect = document.getElementById('dialog-bay-select');
    const dialogConfirmBtn = document.getElementById('dialog-confirm-btn');
    const closeDialogBtn = document.getElementById('close-dialog-btn');
    let activeMovingRoll = null;

    // Drilldown Drawer
    const detailsDrawer = document.getElementById('details-drawer');
    const drawerTitle = document.getElementById('drawer-title');
    const drawerSubtitle = document.getElementById('drawer-subtitle');
    const drawerBody = document.getElementById('drawer-body');
    const closeDrawerBtn = document.getElementById('close-drawer-btn');
    const drawerSearchInput = document.getElementById('drawer-search-input');
    const exportDrawerExcelBtn = document.getElementById('export-drawer-excel-btn');
    const exportDrawerPdfBtn = document.getElementById('export-drawer-pdf-btn');

    // Inventory Tab Elements
    const inventorySearch = document.getElementById('inventory-search');
    const filterCompany = document.getElementById('filter-company');
    const filterUnit = document.getElementById('filter-unit');
    const filterBay = document.getElementById('filter-bay');
    const filterStatus = document.getElementById('filter-status');
    const inventoryListTbody = document.getElementById('inventory-list-tbody');
    const exportAllExcelBtn = document.getElementById('export-all-excel-btn');
    const exportAllPdfBtn = document.getElementById('export-all-pdf-btn');
    const movementsLogTbody = document.getElementById('movements-log-tbody');

    // AI Chat Widget
    const aiChatToggle = document.getElementById('ai-chat-toggle');
    const aiChatBox = document.getElementById('ai-chat-box');
    const closeChatBtn = document.getElementById('close-chat-btn');
    const chatMessages = document.getElementById('chat-messages');
    const chatQueryInput = document.getElementById('chat-query-input');
    const sendChatBtn = document.getElementById('send-chat-btn');

    // --- CONNECTION CHECK & APP INITIALIZATION ---
    function checkFrappeConnection() {
        // If we are not running locally from file:/// protocol, try using live APIs
        if (window.location.protocol !== 'file:') {
            appState.isDemoMode = false;
            demoModeBadge.className = 'mode-badge live-active';
            demoModeBadge.querySelector('.badge-text').textContent = 'Live Connected';
            
            // Connect to Realtime WebSockets if available
            if (typeof frappe !== 'undefined' && frappe.realtime) {
                frappe.realtime.on('wms_bay_update', function(data) {
                    showToast(`WebSocket: Roll ${data.batch_no} moved to ${data.new_bay}`, 'success');
                    fetchData();
                });
            }
        } else {
            appState.isDemoMode = true;
            demoModeBadge.className = 'mode-badge demo-active';
            demoModeBadge.querySelector('.badge-text').textContent = 'Demo Mode (Interactive)';
        }
    }

    // Tab Navigation switching
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetTab = item.getAttribute('data-tab');
            appState.activeTab = targetTab;
            
            // Toggle active classes on buttons
            navItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            // Toggle active classes on sections
            tabContents.forEach(content => {
                content.classList.remove('active');
                if (content.id === `${targetTab}-view`) {
                    content.classList.add('active');
                }
            });

            // Update Titles
            if (targetTab === 'dashboard') {
                pageTitle.textContent = 'Warehouse Overview';
                pageSubtitle.textContent = 'Live inventory distribution & analytics';
            } else if (targetTab === 'scanner') {
                pageTitle.textContent = 'Barcode Scanner Console';
                pageSubtitle.textContent = 'Wedge scan or input roll batches';
            } else if (targetTab === 'bay-stock') {
                pageTitle.textContent = 'Bay Stock Manager';
                pageSubtitle.textContent = 'Interactive layout configuration';
            } else if (targetTab === 'inventory') {
                pageTitle.textContent = 'Inventory Records';
                pageSubtitle.textContent = 'Consolidated stock ledger and auditing';
            }
        });
    });

    // --- CORE DATA FETCHING ---
    async function fetchData() {
        if (appState.isDemoMode) {
            appState.batches = [...appState.mockDatabase];
            processData();
            return;
        }

        try {
            // Fetch ALL batches directly from ERPNext API resource
            const response = await fetch('/api/resource/Batch?fields=["*"]&limit_page_length=999999');
            const result = await response.json();
            
            if (result.data) {
                appState.batches = result.data.map(b => ({
                    ...b,
                    // Map generic fields if custom fields aren't initialized yet
                    custom_bay: b.custom_bay || b.bay || 'UNASSIGNED',
                    custom_order_code: b.custom_order_code || b.order_code || 'UNASSIGNED',
                    batch_qty: parseFloat(b.batch_qty || b.qty || 0)
                }));
                processData();
            } else {
                throw new Error('No data returned from ERPNext');
            }
        } catch (error) {
            console.warn("API Error, falling back to Demo Mode: ", error.message);
            appState.isDemoMode = true;
            demoModeBadge.className = 'mode-badge demo-active';
            demoModeBadge.querySelector('.badge-text').textContent = 'Demo Mode (Fallback)';
            appState.batches = [...appState.mockDatabase];
            processData();
        }
    }

    // Process & Aggregate raw batches into UI values
    function processData() {
        const selectedUnitVal = unitSelect.value;
        
        // Filter batches by Unit selection
        let filtered = appState.batches;
        if (selectedUnitVal !== 'All') {
            filtered = appState.batches.filter(b => {
                const details = parseBatchDetails(b.name);
                const bay = b.custom_bay || 'UNASSIGNED';
                
                // Determine unit mapping based on batch prefix or bay code
                let itemUnit = details.unit;
                if (bay.startsWith('B') && !isNaN(bay.charAt(1))) itemUnit = 1;
                else if (bay.startsWith('A') && !isNaN(bay.charAt(1))) itemUnit = 2;
                else if (bay.startsWith('C') && !isNaN(bay.charAt(1))) itemUnit = 3;
                else if (bay.startsWith('D') && !isNaN(bay.charAt(1))) itemUnit = 4;
                
                const targetUnit = selectedUnitVal === 'unit_1' ? 1 : selectedUnitVal === 'unit_2' ? 2 : selectedUnitVal === 'unit_3' ? 3 : 4;
                return itemUnit === targetUnit;
            });
        }

        // 1. Compute Stats
        const activeBatches = filtered.filter(b => (b.batch_qty || b.qty || 0) > 0);
        const totalWeight = activeBatches.reduce((sum, b) => sum + (b.batch_qty || b.qty || 0), 0);
        const lowStockCount = activeBatches.filter(b => (b.batch_qty || b.qty || 0) < 10).length;
        
        let expiringCount = 0;
        const now = new Date();
        activeBatches.forEach(b => {
            if (b.expiry_date) {
                const expiry = new Date(b.expiry_date);
                const diffTime = Math.abs(expiry.getTime() - now.getTime());
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                if (diffDays <= 30 && expiry > now) expiringCount++;
            }
        });

        totalWeightEl.textContent = `${totalWeight.toFixed(2)} KGs`;
        totalLowStockEl.textContent = lowStockCount;
        totalExpiringEl.textContent = expiringCount;

        // 2. Aggregate Bay Data
        const bayNames = ["B1", "B2", "B3", "B4", "OUTSIDE", "UNASSIGNED"];
        appState.bays = bayNames.map(bayName => {
            const rollsInBay = filtered.filter(r => (r.custom_bay || 'UNASSIGNED') === bayName);
            const weight = rollsInBay.reduce((sum, r) => sum + (r.batch_qty || r.qty || 0), 0);
            return {
                bay_no: bayName,
                no_of_rolls: rollsInBay.length,
                kgs: Number(weight.toFixed(2))
            };
        });

        // Render sections
        renderBaysGrid();
        renderInventoryList(filtered);
        renderCharts(filtered);
    }

    // --- INVENTORY VIEW RENDERING & FILTERING ---
    function renderInventoryList(batchesToRender) {
        inventoryListTbody.innerHTML = '';
        if (batchesToRender.length === 0) {
            inventoryListTbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">No rolls matched the selected filters.</td></tr>`;
            return;
        }

        batchesToRender.forEach(b => {
            const status = getBatchStatus(b);
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${b.name}</strong></td>
                <td>${b.item}</td>
                <td>${b.custom_order_code || 'UNASSIGNED'}</td>
                <td>${(b.batch_qty || b.qty || 0).toFixed(2)}</td>
                <td><span class="val-badge">${b.custom_bay || 'UNASSIGNED'}</span></td>
                <td>${b.expiry_date || 'None'}</td>
                <td><span class="${status.class}">${status.label}</span></td>
            `;
            inventoryListTbody.appendChild(tr);
        });
    }

    // Setup filter event listeners for Inventory Tab
    function applyInventoryFilters() {
        const query = inventorySearch.value.toLowerCase();
        const company = filterCompany.value;
        const unit = filterUnit.value;
        const bay = filterBay.value;
        const status = filterStatus.value;

        const filtered = appState.batches.filter(b => {
            const details = parseBatchDetails(b.name);
            const bayName = b.custom_bay || 'UNASSIGNED';
            
            // Search Query
            const matchesSearch = b.name.toLowerCase().includes(query) || 
                                  (b.custom_order_code || '').toLowerCase().includes(query) ||
                                  (b.item_name || b.item).toLowerCase().includes(query);
            
            // Company Filter
            const matchesCompany = company === 'All' || details.company === company;

            // Unit Filter
            let targetUnit = details.unit;
            if (bayName.startsWith('B') && !isNaN(bayName.charAt(1))) targetUnit = 1;
            else if (bayName.startsWith('A') && !isNaN(bayName.charAt(1))) targetUnit = 2;
            else if (bayName.startsWith('C') && !isNaN(bayName.charAt(1))) targetUnit = 3;
            else if (bayName.startsWith('D') && !isNaN(bayName.charAt(1))) targetUnit = 4;
            const matchesUnit = unit === 'All' || `Unit ${targetUnit}` === unit;

            // Bay Filter
            const matchesBay = bay === 'All' || bayName === bay;

            // Status Filter
            const matchesStatus = status === 'All' || getBatchStatus(b).label === status;

            return matchesSearch && matchesCompany && matchesUnit && matchesBay && matchesStatus;
        });

        renderInventoryList(filtered);
    }

    [inventorySearch, filterCompany, filterUnit, filterBay, filterStatus].forEach(el => {
        el.addEventListener('input', applyInventoryFilters);
        el.addEventListener('change', applyInventoryFilters);
    });

    // --- CHART.JS ANALYTICS ---
    function renderCharts(batchesData) {
        const itemMap = {};
        const companyMap = {};

        batchesData.forEach(b => {
            const qty = b.batch_qty || b.qty || 0;
            if (qty <= 0) return;

            const name = b.item_name || b.item;
            itemMap[name] = (itemMap[name] || 0) + qty;

            const details = parseBatchDetails(b.name);
            const comp = details.parsed ? details.company : 'Unknown';
            companyMap[comp] = (companyMap[comp] || 0) + qty;
        });

        // 1. Top Items Chart
        const itemLabels = Object.keys(itemMap).sort((a,b) => itemMap[b] - itemMap[a]).slice(0, 5);
        const itemValues = itemLabels.map(label => itemMap[label]);

        if (appState.charts.items) appState.charts.items.destroy();
        const ctxItems = document.getElementById('itemsChart').getContext('2d');
        appState.charts.items = new Chart(ctxItems, {
            type: 'bar',
            data: {
                labels: itemLabels,
                datasets: [{
                    label: 'Weight (KGs)',
                    data: itemValues,
                    backgroundColor: 'rgba(59, 130, 246, 0.75)', // Blue 500
                    borderColor: 'rgb(59, 130, 246)',
                    borderWidth: 1.5,
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true } }
            }
        });

        // 2. Stock by Company Chart
        const compLabels = Object.keys(companyMap);
        const compValues = compLabels.map(label => companyMap[label]);

        if (appState.charts.company) appState.charts.company.destroy();
        const ctxCompany = document.getElementById('companyChart').getContext('2d');
        appState.charts.company = new Chart(ctxCompany, {
            type: 'doughnut',
            data: {
                labels: compLabels,
                datasets: [{
                    data: compValues,
                    backgroundColor: [
                        'rgba(59, 130, 246, 0.8)',  // Blue
                        'rgba(16, 185, 129, 0.8)', // Emerald
                        'rgba(245, 158, 11, 0.8)',  // Amber
                        'rgba(239, 68, 68, 0.8)'    // Red
                    ],
                    borderWidth: 2,
                    borderColor: '#ffffff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom' }
                }
            }
        });
    }

    // --- AI INSIGHTS GENERATION ---
    generateInsightsBtn.addEventListener('click', async () => {
        aiInsightsContent.textContent = 'Analyzing stock ledger and gathering insights...';
        aiInsightsContent.className = 'ai-insights-body';

        const totalActiveWeight = appState.batches.reduce((sum, b) => sum + (b.batch_qty || b.qty || 0), 0);
        const expiredCount = appState.batches.filter(b => {
            if (!b.expiry_date) return false;
            return new Date(b.expiry_date) < new Date();
        }).length;
        
        // Formulate a structured prompt for the AI Chat handler to trigger insights
        const analysisPrompt = `WMS GENERAL INSIGHTS REPORT. Total Stock Weight: ${totalActiveWeight.toFixed(2)} KGs. Low Stock Count: ${totalLowStockEl.textContent}. Expired count: ${expiredCount}. Please provide a 3-point actionable inventory report summary.`;

        if (appState.isDemoMode) {
            setTimeout(() => {
                aiInsightsContent.innerHTML = `
                    <ul>
                        <li><strong>⚠️ Stock Distribution Alert</strong>: 100% of the active Spun Bond rolls are located in the OUTSIDE staging zone. Consider relocating them to rack bays B1/B2 to optimize floor space.</li>
                        <li><strong>💡 Picking Recommendation</strong>: Batches JS-0306261/1, JS-0306261/2, and JS-0306261/3 are expiring within 12 months. Prioritize these for immediate dispatch to customers (FEFO).</li>
                        <li><strong>📋 Low Stock Warning</strong>: No active stocks are recorded in Unit 1. Verify if transfer requests from Unit 3 are required.</li>
                    </ul>
                `;
            }, 800);
            return;
        }

        try {
            const response = await fetch('/api/method/warehouse_management.api.ai_api.process_chat_query', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ user_query: analysisPrompt })
            });
            const result = await response.json();
            if (result.message && result.message.status === 'success') {
                // Parse markdown list formatting
                const formattedHtml = result.message.reply
                    .replace(/\n/g, '<br/>')
                    .replace(/\* \*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                aiInsightsContent.innerHTML = formattedHtml;
            } else {
                throw new Error('Failed to generate insights');
            }
        } catch (error) {
            aiInsightsContent.textContent = 'Error: ' + error.message;
            aiInsightsContent.className = 'ai-insights-body empty';
        }
    });

    // --- BAY STOCK GRID ---
    function renderBaysGrid() {
        baysGrid.innerHTML = '';
        appState.bays.forEach(bay => {
            const isOutside = bay.bay_no.toUpperCase() === 'OUTSIDE';
            const isUnassigned = bay.bay_no.toUpperCase() === 'UNASSIGNED';
            
            const card = document.createElement('div');
            card.className = `bay-card ${isOutside ? 'outside' : isUnassigned ? 'unassigned' : 'bay-active'} ${bay.no_of_rolls === 0 ? 'empty-bay' : ''}`;
            card.innerHTML = `
                <div class="bay-card-header">
                    <div class="bay-number">${bay.bay_no}</div>
                    <span class="bay-type-badge">${isOutside ? 'Holding Zone' : isUnassigned ? 'New Arrivals' : 'Rack Bay'}</span>
                </div>
                <div class="bay-metrics">
                    <div class="metric-row">
                        <span class="label">No. of Rolls</span>
                        <span class="value">${bay.no_of_rolls}</span>
                    </div>
                    <div class="metric-row">
                        <span class="label">Total Weight</span>
                        <span class="value">${bay.kgs.toFixed(2)} KGs</span>
                    </div>
                </div>
            `;

            card.addEventListener('click', () => {
                openBayDetails(bay.bay_no);
            });
            baysGrid.appendChild(card);
        });
    }

    // --- DRILLDOWN DRAWER ---
    async function openBayDetails(bayName) {
        appState.selectedBayName = bayName;
        drawerTitle.textContent = `${bayName} details`;
        drawerSubtitle.textContent = `Physical Bay Stock`;
        detailsDrawer.classList.remove('hidden');
        drawerBody.innerHTML = '<div class="loading-state">Loading rolls...</div>';

        if (appState.isDemoMode) {
            setTimeout(() => {
                loadDemoDetails(bayName);
            }, 200);
        } else {
            try {
                const response = await fetch(`/api/method/warehouse_management.api.stock_api.get_bay_details?bay_name=${encodeURIComponent(bayName)}`);
                const result = await response.json();
                if (result.message && result.message.status === 'success') {
                    appState.currentBayDetails = result.message.data;
                    renderDrawerDetails();
                } else {
                    throw new Error('API failed');
                }
            } catch (error) {
                showToast("Failed to load bay details: " + error.message, 'error');
            }
        }
    }

    function loadDemoDetails(bayName) {
        const rollsInBay = appState.batches.filter(r => (r.custom_bay || 'UNASSIGNED') === bayName);
        const grouped = {};
        rollsInBay.forEach(roll => {
            const orderCode = roll.custom_order_code || "UNASSIGNED";
            if (!grouped[orderCode]) grouped[orderCode] = [];
            grouped[orderCode].push(roll);
        });

        appState.currentBayDetails = Object.keys(grouped).map(orderCode => {
            const rolls = grouped[orderCode];
            return {
                order_code: orderCode,
                rolls_count: rolls.length,
                total_kgs: rolls.reduce((sum, r) => sum + (r.batch_qty || r.qty || 0), 0),
                rolls: rolls
            };
        });
        renderDrawerDetails();
    }

    function renderDrawerDetails(searchTerm = '') {
        if (!appState.currentBayDetails || appState.currentBayDetails.length === 0) {
            drawerBody.innerHTML = '<div class="loading-state">No rolls currently in this bay.</div>';
            return;
        }

        drawerBody.innerHTML = '';
        appState.currentBayDetails.forEach(group => {
            const filteredRolls = group.rolls.filter(roll => {
                const searchLower = searchTerm.toLowerCase();
                return roll.name.toLowerCase().includes(searchLower) ||
                       group.order_code.toLowerCase().includes(searchLower);
            });

            if (filteredRolls.length === 0) return;
            const groupTotalWeight = filteredRolls.reduce((sum, r) => sum + (r.batch_qty || r.qty || 0), 0);

            const groupEl = document.createElement('div');
            groupEl.className = 'order-group';
            groupEl.innerHTML = `
                <div class="order-group-header">
                    <span class="order-code-title">${group.order_code}</span>
                    <div class="order-summary-badge">
                        <span>${filteredRolls.length} Rolls</span>
                        <span class="weight">${groupTotalWeight.toFixed(2)} KGs</span>
                    </div>
                </div>
                <div class="order-rolls-list"></div>
            `;

            const listContainer = groupEl.querySelector('.order-rolls-list');
            filteredRolls.forEach(roll => {
                const rollEl = document.createElement('div');
                rollEl.className = 'roll-card';
                rollEl.innerHTML = `
                    <div class="roll-details">
                        <span class="roll-id">${roll.name}</span>
                        <span class="roll-dates">MFG: ${roll.manufacturing_date || 'N/A'}</span>
                    </div>
                    <div class="roll-stats">
                        <span class="roll-weight">${(roll.batch_qty || roll.qty || 0).toFixed(2)} KGs</span>
                        <button class="btn-action-small move-roll-btn" data-roll="${roll.name}">Move</button>
                    </div>
                `;

                rollEl.querySelector('.move-roll-btn').addEventListener('click', (e) => {
                    e.stopPropagation();
                    openMoveDialog(roll.name);
                });
                listContainer.appendChild(rollEl);
            });

            drawerBody.appendChild(groupEl);
        });
    }

    drawerSearchInput.addEventListener('input', (e) => {
        renderDrawerDetails(e.target.value);
    });

    // --- QUICK MOVE REASSIGNMENT ---
    function openMoveDialog(batchNo) {
        activeMovingRoll = batchNo;
        dialogRollId.textContent = batchNo;
        dialogBaySelect.innerHTML = '';
        
        const bayNames = ["UNASSIGNED", "B1", "B2", "B3", "B4", "OUTSIDE"];
        bayNames.forEach(bay => {
            if (bay !== appState.selectedBayName) {
                const opt = document.createElement('option');
                opt.value = bay;
                opt.textContent = bay === 'OUTSIDE' ? 'Outside Holding' : bay === 'UNASSIGNED' ? 'Unassigned (New Arrivals)' : `Bay ${bay}`;
                dialogBaySelect.appendChild(opt);
            }
        });
        moveDialog.classList.remove('hidden');
    }

    async function moveRoll(batchNo, newBay) {
        const oldBay = appState.batches.find(r => r.name === batchNo)?.custom_bay || 'UNASSIGNED';
        const weight = appState.batches.find(r => r.name === batchNo)?.batch_qty || 0;

        if (appState.isDemoMode) {
            const roll = appState.mockDatabase.find(r => r.name === batchNo);
            if (roll) {
                roll.custom_bay = newBay;
                showToast(`Roll ${batchNo} moved successfully to ${newBay}!`, 'success');
                addMovementLog(batchNo, oldBay, newBay, roll.qty);
                processData();
                if (!detailsDrawer.classList.contains('hidden')) loadDemoDetails(appState.selectedBayName);
            }
            return;
        }

        try {
            executeMoveBtn.disabled = true;
            executeMoveBtn.textContent = 'Moving...';
            
            const response = await fetch('/api/method/warehouse_management.api.stock_api.update_batch_bay', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ batch_no: batchNo, new_bay: newBay })
            });
            const result = await response.json();
            if (result.message && result.message.status === 'success') {
                showToast(result.message.message, 'success');
                addMovementLog(batchNo, oldBay, newBay, weight);
                fetchData();
                if (!detailsDrawer.classList.contains('hidden')) openBayDetails(appState.selectedBayName);
            } else {
                throw new Error(result.message ? result.message.message : 'API failure');
            }
        } catch (error) {
            showToast("Failed to reassign: " + error.message, 'error');
        } finally {
            executeMoveBtn.disabled = false;
            executeMoveBtn.textContent = 'Reassign Bay';
        }
    }

    dialogConfirmBtn.addEventListener('click', () => {
        const targetBay = dialogBaySelect.value;
        if (activeMovingRoll && targetBay) {
            moveRoll(activeMovingRoll, targetBay);
            moveDialog.classList.add('hidden');
        }
    });

    closeDialogBtn.addEventListener('click', () => moveDialog.classList.add('hidden'));
    closeDrawerBtn.addEventListener('click', () => detailsDrawer.classList.add('hidden'));

    // --- SCANNER TABS & CAMERA INTERFACE ---
    executeMoveBtn.addEventListener('click', () => {
        const batchNo = scanInput.value.trim();
        const destBay = bayAssignSelect.value;
        if (!batchNo) {
            showScannerFeedback("Please enter a Roll Batch Number.", 'error');
            return;
        }
        moveRoll(batchNo, destBay);
        scanInput.value = '';
        scanInput.focus();
    });

    scanInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            executeMoveBtn.click();
        }
    });

    function showScannerFeedback(msg, type) {
        scannerFeedback.textContent = msg;
        scannerFeedback.className = `feedback-message ${type}`;
        scannerFeedback.classList.remove('hidden');
        setTimeout(() => scannerFeedback.classList.add('hidden'), 4000);
    }

    // AI suggestion routing debounce
    scanInput.addEventListener('input', debounce(function (e) {
        const batchNo = e.target.value.trim();
        if (batchNo.length >= 3) getAISuggestions(batchNo);
        else aiSuggestionPanel.classList.add('hidden');
    }, 300));

    async function getAISuggestions(batchNo) {
        if (appState.isDemoMode) {
            aiSuggestionPanel.classList.remove('hidden');
            suggestedPutawayBay.textContent = batchNo.includes('/23') || batchNo.includes('/24') ? 'UNASSIGNED' : 'OUTSIDE';
            aiSuggestionReason.textContent = "Order Consolidation: Consolidated sibling rolls of same batch series.";
            
            anomaliesList.innerHTML = '';
            if (batchNo.endsWith('/99')) {
                anomaliesList.innerHTML = `<div class="anomaly-alert"><span>⚠️</span> <span><strong>Zero Weight Alert</strong>: Roll has 0.0 KG stock in ERPNext.</span></div>`;
            }
            return;
        }

        try {
            const response = await fetch(`/api/method/warehouse_management.api.ai_api.get_ai_suggestions?batch_no=${encodeURIComponent(batchNo)}&item_code=JS-SPUN-BOND`);
            const result = await response.json();
            if (result.message && result.message.status === 'success') {
                const data = result.message;
                aiSuggestionPanel.classList.remove('hidden');
                suggestedPutawayBay.textContent = data.putaway.suggested_bay;
                aiSuggestionReason.textContent = data.putaway.reason;
                
                anomaliesList.innerHTML = '';
                if (data.anomalies && data.anomalies.length > 0) {
                    data.anomalies.forEach(anomaly => {
                        const alertEl = document.createElement('div');
                        alertEl.className = 'anomaly-alert';
                        alertEl.innerHTML = `<span>⚠️</span> <span><strong>${anomaly.type}</strong>: ${anomaly.message}</span>`;
                        anomaliesList.appendChild(alertEl);
                    });
                }
            }
        } catch (error) {
            console.error("AI suggestion error", error);
        }
    }

    // Camera Scan Trigger
    cameraScanBtn.addEventListener('click', () => {
        cameraModal.classList.remove('hidden');
        html5QrCodeScanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: 250 }, false);
        html5QrCodeScanner.render(decodedText => {
            html5QrCodeScanner.clear().then(() => {
                cameraModal.classList.add('hidden');
                scanInput.value = decodedText;
                showToast(`Scanned: ${decodedText}`, 'success');
                getAISuggestions(decodedText);
                bayAssignSelect.focus();
            });
        }, () => {});
    });

    closeCameraBtn.addEventListener('click', () => {
        if (html5QrCodeScanner) {
            html5QrCodeScanner.clear().then(() => cameraModal.classList.add('hidden')).catch(() => cameraModal.classList.add('hidden'));
        } else {
            cameraModal.classList.add('hidden');
        }
    });

    // --- RECENT MOVEMENTS LOG & TOASTS ---
    function addMovementLog(batchNo, src, dest, weight) {
        const time = new Date().toLocaleTimeString();
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${time}</td>
            <td><strong>${batchNo}</strong></td>
            <td><span class="val-badge">${src}</span></td>
            <td><span class="val-badge">${dest}</span></td>
            <td>${weight.toFixed(2)}</td>
            <td>Admin</td>
            <td><span class="status-badge completed">Completed</span></td>
        `;
        
        if (movementsLogTbody.querySelector('td[colspan]')) movementsLogTbody.innerHTML = '';
        movementsLogTbody.insertBefore(tr, movementsLogTbody.firstChild);
    }

    function showToast(message, type = 'success') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `<span class="toast-icon">${type === 'success' ? '✓' : '✗'}</span> <span>${message}</span>`;
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'slideUp 0.3s ease reverse forwards';
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    }

    // --- EXPORT SHEET GENERATION (CSV & PDF) ---
    function exportToCSV(dataList, filename) {
        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "Roll Batch ID,Item Code,Order Code,Weight (KGs),Bay Location,Expiry Date\n";
        
        dataList.forEach(r => {
            csvContent += `"${r.name}","${r.item}","${r.custom_order_code || ''}",${r.batch_qty || r.qty || 0},"${r.custom_bay || 'UNASSIGNED'}","${r.expiry_date || ''}"\n`;
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    exportAllExcelBtn.addEventListener('click', () => {
        exportToCSV(appState.batches, "WMS_Warehouse_Inventory_Stock.csv");
        showToast("Excel Export CSV downloaded successfully", "success");
    });

    exportDrawerExcelBtn.addEventListener('click', () => {
        const drawerRolls = [];
        appState.currentBayDetails.forEach(g => {
            g.rolls.forEach(r => drawerRolls.push(r));
        });
        exportToCSV(drawerRolls, `Bay_${appState.selectedBayName}_Inventory.csv`);
        showToast("Drawer Inventory CSV downloaded", "success");
    });

    exportAllPdfBtn.addEventListener('click', () => window.print());
    exportDrawerPdfBtn.addEventListener('click', () => window.print());

    // --- AI CHAT ASSISTANT WIDGET ---
    aiChatToggle.addEventListener('click', () => {
        aiChatBox.classList.toggle('hidden');
        if (!aiChatBox.classList.contains('hidden')) chatQueryInput.focus();
    });
    closeChatBtn.addEventListener('click', () => aiChatBox.classList.add('hidden'));

    sendChatBtn.addEventListener('click', sendChatMessage);
    chatQueryInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') sendChatMessage();
    });

    async function sendChatMessage() {
        const query = chatQueryInput.value.trim();
        if (!query) return;

        appendMessage(query, 'user');
        chatQueryInput.value = '';
        const typingEl = appendMessage('Typing response...', 'assistant typing');

        if (appState.isDemoMode) {
            setTimeout(() => {
                typingEl.remove();
                let reply = "I'm not sure how to answer that in Demo Mode. Try asking: 'What is in OUTSIDE?', 'Show near expiry rolls', or 'How many rolls in B1?'";
                const qLower = query.toLowerCase();
                if (qLower.includes('outside')) {
                    reply = "In Unit 3, the OUTSIDE holding zone currently stores 22 rolls belonging to order ORD-2026-9901, totaling 971.32 KGs.";
                } else if (qLower.includes('expiry') || qLower.includes('expired')) {
                    reply = "Near expiry rolls detected in database: JS-0306261/1, JS-0306261/2, and JS-0306261/3 are set to expire on June 01, 2027. We suggest picking these first (FEFO).";
                } else if (qLower.includes('b1')) {
                    reply = "Bay B1 contains 2 active rolls totaling 95.70 KGs in Unit 1.";
                } else if (qLower.includes('total') || qLower.includes('how many rolls')) {
                    reply = "There are currently 24 rolls stored across all active bays in Unit 3 (22 in OUTSIDE, 2 in UNASSIGNED).";
                }
                appendMessage(reply, 'assistant');
            }, 800);
            return;
        }

        try {
            const response = await fetch('/api/method/warehouse_management.api.ai_api.process_chat_query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_query: query })
            });
            const result = await response.json();
            typingEl.remove();
            if (result.message && result.message.status === 'success') {
                appendMessage(result.message.reply, 'assistant');
            } else {
                throw new Error('Chat failed');
            }
        } catch (error) {
            typingEl.remove();
            appendMessage("Error processing chat: " + error.message, 'assistant');
        }
    }

    function appendMessage(text, className) {
        const msgEl = document.createElement('div');
        msgEl.className = `message ${className}`;
        msgEl.innerHTML = text;
        chatMessages.appendChild(msgEl);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return msgEl;
    }

    // --- INITIALIZATION ACTIONS ---
    checkFrappeConnection();
    fetchData();
    refreshBtn.addEventListener('click', () => {
        showToast("Synchronizing with ERPNext...", "success");
        fetchData();
    });

    unitSelect.addEventListener('change', fetchData);

    function debounce(func, wait) {
        let timeout;
        return function () {
            const context = this, args = arguments;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), wait);
        };
    }
});

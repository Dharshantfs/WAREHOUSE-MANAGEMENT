// WMS Portal Javascript Logic - Jayashree Spun Bond
document.addEventListener('DOMContentLoaded', function () {
    // --- STATE MANAGEMENT ---
    let appState = {
        isDemoMode: true, // Will auto-toggle if Frappe APIs fail
        bays: [],
        currentBayDetails: null,
        selectedBayName: '',
        activeUnit: 'unit_3',
        mockDatabase: {} // In-memory DB for demo mode
    };

    // --- MOCK DATABASE (Matches User's Excel sheet exactly) ---
    function initializeMockDatabase() {
        appState.mockDatabase = {
            // Unit 3 mock inventory
            unit_3: [
                // Let's create exactly 22 rolls inside OUTSIDE that sum up to 971.32 KGs
                // 971.32 / 22 = ~44.1509 KGs per roll
                ...Array.from({ length: 22 }, (_, i) => {
                    const rollNo = i + 1;
                    const weight = rollNo === 22 ? 44.17 : 44.15; // adjust last roll so sum is exactly 971.32
                    return {
                        batch_no: `JS-0306261/${rollNo}`,
                        custom_order_code: "ORD-2026-9901",
                        manufacturing_date: "2026-06-01",
                        expiry_date: "2027-06-01",
                        custom_bay: "OUTSIDE",
                        qty: weight
                    };
                }),
                // Let's add some mock rolls to UNASSIGNED to simulate standard ERPNext batches that need a location
                {
                    batch_no: "JS-0306261/23",
                    custom_order_code: "ORD-2026-9902",
                    manufacturing_date: "2026-06-02",
                    expiry_date: "2027-06-02",
                    custom_bay: "UNASSIGNED",
                    qty: 45.00
                },
                {
                    batch_no: "JS-0306261/24",
                    custom_order_code: "ORD-2026-9902",
                    manufacturing_date: "2026-06-02",
                    expiry_date: "2027-06-02",
                    custom_bay: "UNASSIGNED",
                    qty: 42.80
                }
            ],
            unit_1: [
                {
                    batch_no: "JS-0106261/1",
                    custom_order_code: "ORD-2026-1102",
                    manufacturing_date: "2026-06-01",
                    expiry_date: "2027-06-01",
                    custom_bay: "B1",
                    qty: 45.50
                },
                {
                    batch_no: "JS-0106261/2",
                    custom_order_code: "ORD-2026-1102",
                    manufacturing_date: "2026-06-01",
                    expiry_date: "2027-06-01",
                    custom_bay: "B1",
                    qty: 45.20
                },
                {
                    batch_no: "JS-0106261/3",
                    custom_order_code: "ORD-2026-1105",
                    manufacturing_date: "2026-06-01",
                    expiry_date: "2027-06-01",
                    custom_bay: "B2",
                    qty: 50.10
                }
            ],
            unit_2: [
                {
                    batch_no: "JS-0206261/1",
                    custom_order_code: "ORD-2026-8804",
                    manufacturing_date: "2026-06-02",
                    expiry_date: "2027-06-02",
                    custom_bay: "B1",
                    qty: 48.00
                }
            ]
        };
    }
    initializeMockDatabase();

    // --- DOM ELEMENTS ---
    const baysGrid = document.getElementById('bays-grid');
    const totalBaysEl = document.getElementById('total-bays');
    const totalRollsEl = document.getElementById('total-rolls');
    const totalWeightEl = document.getElementById('total-weight');
    const refreshBtn = document.getElementById('refresh-btn');
    const demoModeBadge = document.getElementById('demo-mode-badge');
    const unitSelect = document.getElementById('unit-select');
    
    // Scanner
    const scanInput = document.getElementById('scan-input');
    const bayAssignSelect = document.getElementById('bay-assign-select');
    const executeMoveBtn = document.getElementById('execute-move-btn');
    const scannerFeedback = document.getElementById('scanner-feedback');
    const cameraScanBtn = document.getElementById('camera-scan-btn');
    
    // Camera Modal
    const cameraModal = document.getElementById('camera-modal');
    const closeCameraBtn = document.getElementById('close-camera-btn');
    let html5QrCodeScanner = null;

    // Drawer
    const detailsDrawer = document.getElementById('details-drawer');
    const drawerTitle = document.getElementById('drawer-title');
    const drawerSubtitle = document.getElementById('drawer-subtitle');
    const drawerBody = document.getElementById('drawer-body');
    const closeDrawerBtn = document.getElementById('close-drawer-btn');
    const drawerSearchInput = document.getElementById('drawer-search-input');

    // Quick Move Dialog
    const moveDialog = document.getElementById('move-dialog');
    const dialogRollId = document.getElementById('dialog-roll-id');
    const dialogBaySelect = document.getElementById('dialog-bay-select');
    const dialogConfirmBtn = document.getElementById('dialog-confirm-btn');
    const closeDialogBtn = document.getElementById('close-dialog-btn');
    let activeMovingRoll = null;

    // --- CORE LOGIC & API CONNECTIVITY ---
    
    // Check if running inside Frappe environment
    function checkFrappeConnection() {
        // Standard Frappe exposes 'frappe' object globally
        if (typeof frappe !== 'undefined') {
            appState.isDemoMode = false;
            demoModeBadge.classList.remove('demo-active');
            demoModeBadge.classList.add('live-active');
            demoModeBadge.innerHTML = '<span class="pulse-dot"></span><span>Live Connected</span>';
            
            // Connect to Realtime WebSockets
            if (frappe.realtime) {
                frappe.realtime.on('wms_bay_update', function(data) {
                    showToast(`Roll ${data.batch_no} moved to ${data.new_bay} by ${data.user}`, 'success');
                    fetchData();
                });
            }
        } else {
            appState.isDemoMode = true;
            demoModeBadge.classList.add('demo-active');
            demoModeBadge.classList.remove('live-active');
            demoModeBadge.innerHTML = '<span class="pulse-dot"></span><span>Demo Mode (Interactive)</span>';
        }
    }
    checkFrappeConnection();

    // Fetch summaries from API or Demo Database
    async function fetchData() {
        if (appState.isDemoMode) {
            loadDemoData();
            return;
        }

        try {
            const response = await fetch('/api/method/warehouse_management.api.stock_api.get_bay_summary');
            const result = await response.json();
            
            if (result.message && result.message.status === 'success') {
                appState.bays = result.message.data;
                renderBaysSummary();
            } else {
                throw new Error(result.message ? result.message.message : 'API failed');
            }
        } catch (error) {
            console.warn("API Error, falling back to Demo Mode: ", error.message);
            appState.isDemoMode = true;
            demoModeBadge.classList.add('demo-active');
            demoModeBadge.innerHTML = '<span class="pulse-dot"></span><span>Demo Mode (Fallback)</span>';
            loadDemoData();
        }
    }

    // Load Demo data
    function loadDemoData() {
        const unitStock = appState.mockDatabase[appState.activeUnit] || [];
        
        // Defined Bays (including UNASSIGNED)
        const bayNames = ["B1", "B2", "OUTSIDE", "B3", "B4", "UNASSIGNED"];
        const summary = bayNames.map(bayName => {
            const rollsInBay = unitStock.filter(r => r.custom_bay === bayName);
            const totalWeight = rollsInBay.reduce((sum, r) => sum + r.qty, 0);
            return {
                bay_no: bayName,
                no_of_rolls: rollsInBay.length,
                kgs: Number(totalWeight.toFixed(2))
            };
        });

        appState.bays = summary;
        renderBaysSummary();
    }

    // Render Summary Cards (View 1)
    function renderBaysSummary() {
        baysGrid.innerHTML = '';
        let grandTotalRolls = 0;
        let grandTotalWeight = 0;

        appState.bays.forEach(bay => {
            grandTotalRolls += bay.no_of_rolls;
            grandTotalWeight += bay.kgs;

            const isOutside = bay.bay_no.toUpperCase() === 'OUTSIDE';
            const isUnassigned = bay.bay_no.toUpperCase() === 'UNASSIGNED';
            const card = document.createElement('div');
            card.className = `bay-card ${isOutside ? 'outside' : isUnassigned ? 'unassigned' : 'bay-active'} ${bay.no_of_rolls === 0 ? 'empty-bay' : ''}`;
            card.id = `bay-card-${bay.bay_no}`;
            
            card.innerHTML = `
                <div class="bay-card-header">
                    <div class="bay-number">${isUnassigned ? 'UNASSIGNED' : bay.bay_no}</div>
                    <span class="bay-type-badge">${isOutside ? 'Holding Zone' : isUnassigned ? 'New Arrivals' : 'Rack Bay'}</span>
                </div>
                <div class="bay-metrics">
                    <div class="metric-row">
                        <span class="label">No. of Rolls</span>
                        <span class="value rolls-count">${bay.no_of_rolls}</span>
                    </div>
                    <div class="metric-row">
                        <span class="label">Total Weight</span>
                        <span class="value weight-kgs">${bay.kgs.toFixed(2)} KGs</span>
                    </div>
                </div>
            `;

            // Open drilldown on click
            card.addEventListener('click', () => {
                openBayDetails(bay.bay_no);
            });

            baysGrid.appendChild(card);
        });

        // Update totals bar
        totalBaysEl.textContent = appState.bays.filter(b => b.no_of_rolls > 0).length;
        totalRollsEl.textContent = grandTotalRolls;
        totalWeightEl.textContent = `${grandTotalWeight.toFixed(2)} KGs`;
    }

    // Open Drawer (View 2)
    async function openBayDetails(bayName) {
        appState.selectedBayName = bayName;
        drawerTitle.textContent = `${bayName} details`;
        drawerSubtitle.textContent = `Physical Bay Stock`;
        
        detailsDrawer.classList.remove('hidden');
        drawerBody.innerHTML = '<div class="loading-state">Loading rolls...</div>';

        if (appState.isDemoMode) {
            setTimeout(() => {
                loadDemoDetails(bayName);
            }, 200); // Simulate API latency
        } else {
            try {
                const response = await fetch(`/api/method/warehouse_management.api.stock_api.get_bay_details?bay_name=${encodeURIComponent(bayName)}`);
                const result = await response.json();
                
                if (result.message && result.message.status === 'success') {
                    appState.currentBayDetails = result.message.data;
                    renderDrawerDetails();
                } else {
                    throw new Error(result.message ? result.message.message : 'API failed');
                }
            } catch (error) {
                showToast("Failed to load details: " + error.message, 'error');
            }
        }
    }

    // Load Demo Details
    function loadDemoDetails(bayName) {
        const unitStock = appState.mockDatabase[appState.activeUnit] || [];
        const rollsInBay = unitStock.filter(r => r.custom_bay === bayName);
        
        // Group by custom_order_code
        const grouped = {};
        rollsInBay.forEach(roll => {
            const orderCode = roll.custom_order_code || "UNASSIGNED";
            if (!grouped[orderCode]) {
                grouped[orderCode] = [];
            }
            grouped[orderCode].push(roll);
        });

        // Convert to list format
        const result = Object.keys(grouped).map(orderCode => {
            const rolls = grouped[orderCode];
            const rollsCount = rolls.length;
            const totalKgs = rolls.reduce((sum, r) => sum + r.qty, 0);
            return {
                order_code: orderCode,
                rolls_count: rollsCount,
                total_kgs: Number(totalKgs.toFixed(2)),
                rolls: rolls
            };
        });

        appState.currentBayDetails = result;
        renderDrawerDetails();
    }

    // Render drawer detail cards grouped by Order Code
    function renderDrawerDetails(searchTerm = '') {
        if (!appState.currentBayDetails || appState.currentBayDetails.length === 0) {
            drawerBody.innerHTML = '<div class="loading-state">No rolls currently in this bay.</div>';
            return;
        }

        drawerBody.innerHTML = '';
        let matchFound = false;

        appState.currentBayDetails.forEach(group => {
            // Filter rolls in this order group
            const filteredRolls = group.rolls.filter(roll => {
                const searchLower = searchTerm.toLowerCase();
                return roll.batch_no.toLowerCase().includes(searchLower) ||
                       group.order_code.toLowerCase().includes(searchLower);
            });

            if (filteredRolls.length === 0) return;
            matchFound = true;

            const groupTotalWeight = filteredRolls.reduce((sum, r) => sum + r.qty, 0);

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
                        <span class="roll-id">${roll.batch_no}</span>
                        <span class="roll-dates">MFG: ${roll.manufacturing_date}</span>
                    </div>
                    <div class="roll-stats">
                        <span class="roll-weight">${roll.qty.toFixed(2)} KGs</span>
                        <button class="btn-action-small move-roll-btn" data-roll="${roll.batch_no}">Move</button>
                    </div>
                `;

                // Add move button listener
                rollEl.querySelector('.move-roll-btn').addEventListener('click', (e) => {
                    e.stopPropagation();
                    openMoveDialog(roll.batch_no);
                });

                listContainer.appendChild(rollEl);
            });

            drawerBody.appendChild(groupEl);
        });

        if (!matchFound) {
            drawerBody.innerHTML = '<div class="loading-state">No matching rolls found.</div>';
        }
    }

    // Trigger physical bay reassignments
    async function moveRoll(batchNo, newBay) {
        if (appState.isDemoMode) {
            // Local update
            const unitStock = appState.mockDatabase[appState.activeUnit] || [];
            const roll = unitStock.find(r => r.batch_no === batchNo);
            
            if (roll) {
                const oldBay = roll.custom_bay || 'UNASSIGNED';
                roll.custom_bay = newBay;
                showToast(`Roll ${batchNo} moved successfully from ${oldBay} to ${newBay}!`, 'success');
                
                // Add log entry
                addMovementLog(batchNo, oldBay, newBay, roll.qty);
                
                // Refresh views
                loadDemoData();
                if (detailsDrawer.classList.contains('hidden') === false) {
                    loadDemoDetails(appState.selectedBayName);
                }
            } else {
                showToast(`Roll ${batchNo} not found in database.`, 'error');
            }
            return;
        }

        // Live Mode API request
        try {
            executeMoveBtn.disabled = true;
            executeMoveBtn.textContent = 'Moving...';
            
            // Capture old bay for logging before update
            let oldBayVal = 'UNASSIGNED';
            if (appState.currentBayDetails) {
                const group = appState.currentBayDetails.find(g => g.rolls.some(r => r.batch_no === batchNo));
                if (group) oldBayVal = appState.selectedBayName || 'UNASSIGNED';
            }
            
            const response = await fetch('/api/method/warehouse_management.api.stock_api.update_batch_bay', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    batch_no: batchNo,
                    new_bay: newBay
                })
            });
            const result = await response.json();
            
            if (result.message && result.message.status === 'success') {
                showToast(result.message.message, 'success');
                
                // Find roll quantity for logging
                let qtyVal = 44.15;
                if (appState.currentBayDetails) {
                    const group = appState.currentBayDetails.find(g => g.rolls.some(r => r.batch_no === batchNo));
                    if (group) {
                        const rObj = group.rolls.find(r => r.batch_no === batchNo);
                        if (rObj) qtyVal = rObj.kgs || rObj.qty || 44.15;
                    }
                }
                addMovementLog(batchNo, oldBayVal, newBay, qtyVal);
                
                fetchData();
                if (detailsDrawer.classList.contains('hidden') === false) {
                    openBayDetails(appState.selectedBayName);
                }
            } else {
                throw new Error(result.message ? result.message.message : 'Movement failed');
            }
        } catch (error) {
            showToast("Failed to move roll: " + error.message, 'error');
        } finally {
            executeMoveBtn.disabled = false;
            executeMoveBtn.textContent = 'Reassign Bay';
        }
    }

    // --- INTERACTIVE EVENTS & INPUTS ---

    // Top Right Unit Selector
    unitSelect.addEventListener('change', (e) => {
        appState.activeUnit = e.target.value;
        showToast(`Switched to Unit ${e.target.value.replace('unit_', '')}`, 'success');
        fetchData();
        closeDrawer();
    });

    // Sync button
    refreshBtn.addEventListener('click', () => {
        showToast("Synchronizing with ERPNext Stock...", "success");
        fetchData();
    });

    // Scanner / Wedge execute button
    executeMoveBtn.addEventListener('click', () => {
        const batchNo = scanInput.value.trim();
        const destBay = bayAssignSelect.value;

        if (!batchNo) {
            showScannerFeedback("Please enter a Roll Batch Number.", 'error');
            return;
        }

        moveRoll(batchNo, destBay);
        scanInput.value = ''; // clear field for next wedge scan
        scanInput.focus();
    });

    // Handle Keyboard Wedge scanning (Sends carriage return/Enter key)
    scanInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            executeMoveBtn.click();
        }
    });

    // Show scanner console inline error feedback
    function showScannerFeedback(msg, type) {
        scannerFeedback.textContent = msg;
        scannerFeedback.className = `feedback-message ${type}`;
        scannerFeedback.classList.remove('hidden');
        
        setTimeout(() => {
            scannerFeedback.classList.add('hidden');
        }, 4000);
    }

    // --- DRAWER ACTIONS ---
    closeDrawerBtn.addEventListener('click', closeDrawer);
    
    function closeDrawer() {
        detailsDrawer.classList.add('hidden');
    }

    // Search drawer roll records
    drawerSearchInput.addEventListener('input', (e) => {
        renderDrawerDetails(e.target.value);
    });

    // --- QUICK MOVE DIALOG ---
    function openMoveDialog(batchNo) {
        activeMovingRoll = batchNo;
        dialogRollId.textContent = batchNo;
        
        // Populate options in dialog dropdown, omitting selected bay
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

    closeDialogBtn.addEventListener('click', () => {
        moveDialog.classList.add('hidden');
    });

    dialogConfirmBtn.addEventListener('click', () => {
        const targetBay = dialogBaySelect.value;
        if (activeMovingRoll && targetBay) {
            moveRoll(activeMovingRoll, targetBay);
            moveDialog.classList.add('hidden');
        }
    });

    // --- CAMERA BARCODE SCANNING (Using html5-qrcode) ---
    cameraScanBtn.addEventListener('click', () => {
        cameraModal.classList.remove('hidden');
        
        // Start scanner camera
        html5QrCodeScanner = new Html5QrcodeScanner(
            "reader", 
            { fps: 15, qrbox: { width: 250, height: 150 } },
            /* verbose= */ false
        );
        
        html5QrCodeScanner.render(onScanSuccess, onScanFailure);
    });

    function onScanSuccess(decodedText, decodedResult) {
        // Stop scanning
        html5QrCodeScanner.clear().then(() => {
            cameraModal.classList.add('hidden');
            
            // Pop scan value to field
            scanInput.value = decodedText;
            showToast(`Scanned: ${decodedText}`, 'success');
            
            // Focus destination field
            bayAssignSelect.focus();
        }).catch(err => {
            console.error("Scanner clear error", err);
        });
    }

    function onScanFailure(error) {
        // Silently scan for QR or barcodes
    }

    closeCameraBtn.addEventListener('click', () => {
        if (html5QrCodeScanner) {
            html5QrCodeScanner.clear().then(() => {
                cameraModal.classList.add('hidden');
            }).catch(() => {
                cameraModal.classList.add('hidden');
            });
        } else {
            cameraModal.classList.add('hidden');
        }
    });

    // --- TOAST NOTIFICATIONS ---
    function showToast(message, type = 'success') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        const icon = type === 'success' ? '✓' : '✗';
        toast.innerHTML = `<span class="toast-icon">${icon}</span> <span>${message}</span>`;
        
        container.appendChild(toast);
        
        // Remove toast after animation finishes
        setTimeout(() => {
            toast.style.animation = 'slideUp 0.3s ease reverse forwards';
            setTimeout(() => {
                toast.remove();
            }, 300);
        }, 3500);
    }

    // --- WMS AI & SUGGESTIONS LOGIC ---

    const aiSuggestionPanel = document.getElementById('ai-suggestion-panel');
    const aiSuggestionReason = document.getElementById('ai-suggestion-reason');
    const suggestedPutawayBay = document.getElementById('suggested-putaway-bay');
    const anomaliesList = document.getElementById('anomalies-list');

    // Trigger AI suggestion lookup on input change / wedge scan focus
    scanInput.addEventListener('input', debounce(function (e) {
        const batchNo = e.target.value.trim();
        if (batchNo.length >= 3) {
            getAISuggestions(batchNo);
        } else {
            aiSuggestionPanel.classList.add('hidden');
        }
    }, 300));

    function debounce(func, wait) {
        let timeout;
        return function () {
            const context = this, args = arguments;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), wait);
        };
    }

    async function getAISuggestions(batchNo) {
        if (appState.isDemoMode) {
            // Mock AI putaway strategy logic
            aiSuggestionPanel.classList.remove('hidden');
            
            // Suggest OUTSIDE for standard rolls, or B2/B1
            if (batchNo.includes('/23') || batchNo.includes('/24')) {
                suggestedPutawayBay.textContent = 'UNASSIGNED';
                aiSuggestionReason.textContent = "New Arrivals Staging: Staging roll until storage space is assigned.";
            } else {
                suggestedPutawayBay.textContent = 'OUTSIDE';
                aiSuggestionReason.textContent = "Order Consolidation: Sibling rolls of order 'ORD-2026-9901' are in OUTSIDE.";
            }
            
            // Check for mock anomalies
            anomaliesList.innerHTML = '';
            if (batchNo.endsWith('/99')) {
                const alertEl = document.createElement('div');
                alertEl.className = 'anomaly-alert';
                alertEl.innerHTML = `<span>⚠️</span> <span><strong>Zero Weight Alert:</strong> Roll has 0.0 KG stock in ERPNext ledger.</span>`;
                anomaliesList.appendChild(alertEl);
            }
            if (batchNo.includes('EXP')) {
                const alertEl = document.createElement('div');
                alertEl.className = 'anomaly-alert';
                alertEl.innerHTML = `<span>⚠️</span> <span><strong>Expired Batch Warning:</strong> Batch expired on 2026-06-01.</span>`;
                anomaliesList.appendChild(alertEl);
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
                        alertEl.innerHTML = `<span>⚠️</span> <span><strong>${anomaly.type}:</strong> ${anomaly.message}</span>`;
                        anomaliesList.appendChild(alertEl);
                    });
                }
            }
        } catch (error) {
            console.error("AI Suggestions API failure", error);
        }
    }

    // --- AI CHAT ASSISTANT HANDLERS ---

    const aiChatToggle = document.getElementById('ai-chat-toggle');
    const aiChatBox = document.getElementById('ai-chat-box');
    const closeChatBtn = document.getElementById('close-chat-btn');
    const chatMessages = document.getElementById('chat-messages');
    const chatQueryInput = document.getElementById('chat-query-input');
    const sendChatBtn = document.getElementById('send-chat-btn');

    aiChatToggle.addEventListener('click', () => {
        aiChatBox.classList.toggle('hidden');
        if (!aiChatBox.classList.contains('hidden')) {
            chatQueryInput.focus();
        }
    });

    closeChatBtn.addEventListener('click', () => {
        aiChatBox.classList.add('hidden');
    });

    // Make suggestion clicks send query automatically
    chatMessages.addEventListener('click', (e) => {
        if (e.target.tagName === 'LI') {
            chatQueryInput.value = e.target.textContent.replace(/"/g, '');
            sendChatMessage();
        }
    });

    sendChatBtn.addEventListener('click', sendChatMessage);
    chatQueryInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            sendChatMessage();
        }
    });

    async function sendChatMessage() {
        const query = chatQueryInput.value.trim();
        if (!query) return;

        // Append User Message
        appendMessage(query, 'user');
        chatQueryInput.value = '';

        // Typing indicator
        const typingEl = appendMessage('Typing response...', 'assistant typing');

        if (appState.isDemoMode) {
            // Mock response logic
            setTimeout(() => {
                typingEl.remove();
                let reply = "I'm not sure how to answer that in Demo Mode. Try asking: 'What is in OUTSIDE?', 'Show near expiry rolls', or 'How many rolls in B1?'";
                const qLower = query.toLowerCase();
                if (qLower.includes('outside')) {
                    reply = "In Unit 3, the OUTSIDE holding zone currently stores 22 rolls belonging to order ORD-2026-9901, totaling 971.32 KGs.";
                } else if (qLower.includes('expiry') || qLower.includes('expired')) {
                    reply = "Near expiry rolls detected in database: JS-0306261/1, JS-0306261/2, and JS-0306261/3 are set to expire on June 01, 2027. We suggest picking these first (FEFO).";
                } else if (qLower.includes('b1')) {
                    reply = "Bay B1 is currently empty in Unit 3, but contains 2 rolls totaling 90.70 KGs in Unit 1.";
                } else if (qLower.includes('total') || qLower.includes('how many rolls')) {
                    reply = "There are currently 24 rolls stored across all active bays in Unit 3 (22 in OUTSIDE, 2 in UNASSIGNED).";
                }
                appendMessage(reply, 'assistant');
            }, 800);
            return;
        }

        // Live API call
        try {
            const response = await fetch('/api/method/warehouse_management.api.ai_api.process_chat_query', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ user_query: query })
            });
            const result = await response.json();
            typingEl.remove();
            
            if (result.message && result.message.status === 'success') {
                appendMessage(result.message.reply, 'assistant');
            } else {
                throw new Error(result.message ? result.message.message : 'Chat query failed');
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

    // --- EXPORT CENTRE & MOVEMENT LEDGER LOGIC ---

    const exportAllExcelBtn = document.getElementById('export-all-excel-btn');
    const exportAllPdfBtn = document.getElementById('export-all-pdf-btn');
    const exportDrawerExcelBtn = document.getElementById('export-drawer-excel-btn');
    const exportDrawerPdfBtn = document.getElementById('export-drawer-pdf-btn');
    const movementsLogTbody = document.getElementById('movements-log-tbody');

    exportAllExcelBtn.addEventListener('click', exportAllStockExcel);
    exportAllPdfBtn.addEventListener('click', exportAllStockPDF);
    exportDrawerExcelBtn.addEventListener('click', exportDrawerExcel);
    exportDrawerPdfBtn.addEventListener('click', exportDrawerPDF);

    function downloadCSV(csvContent, filename) {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    async function getAllRollsLive() {
        const bayNames = appState.bays.map(b => b.bay_no);
        const promises = bayNames.map(async (bayName) => {
            try {
                const response = await fetch(`/api/method/warehouse_management.api.stock_api.get_bay_details?bay_name=${encodeURIComponent(bayName)}`);
                const result = await response.json();
                if (result.message && result.message.status === 'success') {
                    let rolls = [];
                    result.message.data.forEach(group => {
                        group.rolls.forEach(roll => {
                            rolls.push({
                                batch_no: roll.batch_no,
                                custom_order_code: group.order_code,
                                manufacturing_date: roll.mfg_date || roll.manufacturing_date,
                                expiry_date: roll.expiry_date,
                                custom_bay: bayName,
                                qty: roll.kgs || roll.qty
                            });
                        });
                    });
                    return rolls;
                }
            } catch (e) {
                console.error("Failed fetching rolls for " + bayName, e);
            }
            return [];
        });
        const results = await Promise.all(promises);
        return results.flat();
    }

    async function exportAllStockExcel() {
        let rolls = [];
        if (appState.isDemoMode) {
            rolls = appState.mockDatabase[appState.activeUnit] || [];
        } else {
            showToast("Generating stock report...", "info");
            rolls = await getAllRollsLive();
        }
        
        if (rolls.length === 0) {
            showToast("No stock records to export.", "error");
            return;
        }
        
        let csv = "Roll Batch Number,Item Code,Order Code,Weight (KGs),Warehouse Location,Mfg Date,Expiry Date\n";
        rolls.forEach(r => {
            const mfg = r.manufacturing_date || r.mfg_date || '';
            const exp = r.expiry_date || '';
            const weight = r.qty !== undefined ? r.qty : r.kgs;
            csv += `"${r.batch_no}","JS-SPUN-BOND","${r.custom_order_code || ''}",${weight.toFixed(2)},"${r.custom_bay || ''}","${mfg}","${exp}"\n`;
        });
        
        const filename = `wms_stock_report_${appState.activeUnit}_${new Date().toISOString().slice(0,10)}.csv`;
        downloadCSV(csv, filename);
        showToast("Excel stock report downloaded successfully!", "success");
    }

    async function exportAllStockPDF() {
        let rolls = [];
        if (appState.isDemoMode) {
            rolls = appState.mockDatabase[appState.activeUnit] || [];
        } else {
            showToast("Generating PDF report...", "info");
            rolls = await getAllRollsLive();
        }
        
        if (rolls.length === 0) {
            showToast("No stock records to print.", "error");
            return;
        }
        
        // Sort rolls by bay then order code
        rolls.sort((a,b) => {
            if (a.custom_bay !== b.custom_bay) return a.custom_bay.localeCompare(b.custom_bay);
            return (a.custom_order_code || '').localeCompare(b.custom_order_code || '');
        });
        
        const totalRolls = rolls.length;
        const totalWeight = rolls.reduce((sum, r) => sum + (r.qty !== undefined ? r.qty : r.kgs), 0);
        const unitName = appState.activeUnit.replace('unit_', 'Unit ').toUpperCase();
        
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <html>
            <head>
                <title>WMS Inventory Report - ${unitName}</title>
                <style>
                    body { font-family: sans-serif; color: #1e293b; padding: 40px; }
                    .header { border-bottom: 2px solid #e2e8f0; padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-end; }
                    .header h1 { margin: 0; font-size: 22px; color: #0f172a; }
                    .header p { margin: 4px 0 0 0; font-size: 13px; color: #64748b; }
                    .summary { display: flex; gap: 40px; background: #f8fafc; padding: 16px; border-radius: 8px; margin-bottom: 24px; border: 1px solid #e2e8f0; }
                    .summary-item { display: flex; flex-direction: column; }
                    .summary-item .label { font-size: 10px; text-transform: uppercase; color: #64748b; font-weight: 700; letter-spacing: 0.5px; }
                    .summary-item .value { font-size: 16px; font-weight: 700; color: #0f172a; margin-top: 4px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                    th { background: #f1f5f9; color: #475569; font-weight: 600; text-align: left; padding: 10px; font-size: 12px; border-bottom: 1px solid #e2e8f0; }
                    td { padding: 10px; font-size: 12px; border-bottom: 1px solid #f1f5f9; }
                    tr:nth-child(even) td { background: #f8fafc; }
                    .text-right { text-align: right; }
                    @media print {
                        body { padding: 0; }
                        button { display: none; }
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <div>
                        <h1>JAYASHREE SPUN BOND</h1>
                        <p>WMS Stock Ledger Report &mdash; ${unitName}</p>
                    </div>
                    <div>
                        <p><strong>Report Date:</strong> ${new Date().toLocaleString()}</p>
                    </div>
                </div>
                <div class="summary">
                    <div class="summary-item">
                        <span class="label">Total Rolls Listed</span>
                        <span class="value">${totalRolls} Rolls</span>
                    </div>
                    <div class="summary-item">
                        <span class="label">Net Stock Weight</span>
                        <span class="value">${totalWeight.toFixed(2)} KGs</span>
                    </div>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Roll Batch No.</th>
                            <th>Warehouse Bay</th>
                            <th>Order Code</th>
                            <th>Mfg Date</th>
                            <th>Expiry Date</th>
                            <th class="text-right">Weight (KGs)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rolls.map((r, i) => `
                            <tr>
                                <td>${i + 1}</td>
                                <td><strong>${r.batch_no}</strong></td>
                                <td>${r.custom_bay || 'UNASSIGNED'}</td>
                                <td>${r.custom_order_code || '-'}</td>
                                <td>${r.manufacturing_date || r.mfg_date || '-'}</td>
                                <td>${r.expiry_date || '-'}</td>
                                <td class="text-right"><strong>${(r.qty !== undefined ? r.qty : r.kgs).toFixed(2)}</strong></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                <script>
                    window.onload = function() {
                        window.print();
                        setTimeout(() => window.close(), 1000);
                    }
                <\/script>
            </body>
            </html>
        `);
        printWindow.document.close();
    }

    function exportDrawerExcel() {
        if (!appState.currentBayDetails || appState.currentBayDetails.length === 0) {
            showToast("No records in this bay to export.", "error");
            return;
        }
        
        let csv = "Roll Batch Number,Order Code,Weight (KGs),Mfg Date,Expiry Date\n";
        appState.currentBayDetails.forEach(group => {
            group.rolls.forEach(r => {
                const batchNo = r.batch_no;
                const mfg = r.mfg_date || r.manufacturing_date || '';
                const exp = r.expiry_date || '';
                const weight = r.kgs !== undefined ? r.kgs : r.qty;
                csv += `"${batchNo}","${group.order_code}",${weight.toFixed(2)},"${mfg}","${exp}"\n`;
            });
        });
        
        const filename = `wms_report_bay_${appState.selectedBayName}_${new Date().toISOString().slice(0,10)}.csv`;
        downloadCSV(csv, filename);
        showToast(`Excel report for Bay ${appState.selectedBayName} downloaded!`, "success");
    }

    function exportDrawerPDF() {
        if (!appState.currentBayDetails || appState.currentBayDetails.length === 0) {
            showToast("No records in this bay to print.", "error");
            return;
        }
        
        const rolls = [];
        appState.currentBayDetails.forEach(group => {
            group.rolls.forEach(r => {
                rolls.push({
                    batch_no: r.batch_no,
                    order_code: group.order_code,
                    kgs: r.kgs !== undefined ? r.kgs : r.qty,
                    mfg_date: r.mfg_date || r.manufacturing_date || '-',
                    expiry_date: r.expiry_date || '-'
                });
            });
        });
        
        const totalRolls = rolls.length;
        const totalWeight = rolls.reduce((sum, r) => sum + r.kgs, 0);
        const bayName = appState.selectedBayName;
        const unitName = appState.activeUnit.replace('unit_', 'Unit ').toUpperCase();
        
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <html>
            <head>
                <title>WMS Bay Stock Report - ${bayName} (${unitName})</title>
                <style>
                    body { font-family: sans-serif; color: #1e293b; padding: 40px; }
                    .header { border-bottom: 2px solid #e2e8f0; padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-end; }
                    .header h1 { margin: 0; font-size: 22px; color: #9900cc; }
                    .header p { margin: 4px 0 0 0; font-size: 13px; color: #64748b; }
                    .summary { display: flex; gap: 40px; background: #faf5ff; padding: 16px; border-radius: 8px; margin-bottom: 24px; border: 1px solid #f3d8f8; }
                    .summary-item { display: flex; flex-direction: column; }
                    .summary-item .label { font-size: 10px; text-transform: uppercase; color: #9c00e6; font-weight: 700; letter-spacing: 0.5px; }
                    .summary-item .value { font-size: 16px; font-weight: 700; color: #0f172a; margin-top: 4px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                    th { background: #faf5ff; color: #6b21a8; font-weight: 600; text-align: left; padding: 10px; font-size: 12px; border-bottom: 1px solid #f3d8f8; }
                    td { padding: 10px; font-size: 12px; border-bottom: 1px solid #f3d8f8; }
                    tr:nth-child(even) td { background: #faf5ff; }
                    .text-right { text-align: right; }
                    @media print {
                        body { padding: 0; }
                        button { display: none; }
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <div>
                        <h1>JAYASHREE SPUN BOND</h1>
                        <p>Bay Inventory Ledger &mdash; ${bayName} (${unitName})</p>
                    </div>
                    <div>
                        <p><strong>Report Date:</strong> ${new Date().toLocaleString()}</p>
                    </div>
                </div>
                <div class="summary">
                    <div class="summary-item">
                        <span class="label">Bays Location</span>
                        <span class="value">${bayName}</span>
                    </div>
                    <div class="summary-item">
                        <span class="label">Total Rolls in Bay</span>
                        <span class="value">${totalRolls} Rolls</span>
                    </div>
                    <div class="summary-item">
                        <span class="label">Net Weight inside Bay</span>
                        <span class="value">${totalWeight.toFixed(2)} KGs</span>
                    </div>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Roll Batch No.</th>
                            <th>Order Code</th>
                            <th>Mfg Date</th>
                            <th>Expiry Date</th>
                            <th class="text-right">Weight (KGs)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rolls.map((r, i) => `
                            <tr>
                                <td>${i + 1}</td>
                                <td><strong>${r.batch_no}</strong></td>
                                <td>${r.order_code}</td>
                                <td>${r.mfg_date}</td>
                                <td>${r.expiry_date}</td>
                                <td class="text-right"><strong>${r.kgs.toFixed(2)}</strong></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                <script>
                    window.onload = function() {
                        window.print();
                        setTimeout(() => window.close(), 1000);
                    }
                <\/script>
            </body>
            </html>
        `);
        printWindow.document.close();
    }

    function addMovementLog(batchNo, source, dest, weight, status = 'COMPLETED') {
        if (movementsLogTbody.children.length === 1 && movementsLogTbody.children[0].querySelector('td[colspan]')) {
            movementsLogTbody.innerHTML = '';
        }
        
        const tr = document.createElement('tr');
        const timeStr = new Date().toLocaleString();
        tr.innerHTML = `
            <td>${timeStr}</td>
            <td><strong>${batchNo}</strong></td>
            <td><span class="val-badge">${source}</span></td>
            <td><span class="val-badge" style="color:var(--accent-purple); border-color:rgba(153,0,204,0.2); background:rgba(153,0,204,0.05);">${dest}</span></td>
            <td>${weight.toFixed(2)} KGs</td>
            <td>Operator (FRA)</td>
            <td><span class="status-badge ${status.toLowerCase()}">${status}</span></td>
        `;
        
        movementsLogTbody.insertBefore(tr, movementsLogTbody.firstChild);
    }

    function prepopulateMovementLog() {
        movementsLogTbody.innerHTML = '';
        
        const mockLogs = [
            { batch: 'JS-0306261/12', from: 'UNASSIGNED', to: 'OUTSIDE', weight: 44.15, timeOffset: 5 },
            { batch: 'JS-0306261/8', from: 'UNASSIGNED', to: 'B1', weight: 45.30, timeOffset: 12 },
            { batch: 'JS-0306261/19', from: 'OUTSIDE', to: 'B2', weight: 44.15, timeOffset: 25 }
        ];
        
        mockLogs.forEach(log => {
            const tr = document.createElement('tr');
            const time = new Date(Date.now() - log.timeOffset * 60000).toLocaleString();
            tr.innerHTML = `
                <td>${time}</td>
                <td><strong>${log.batch}</strong></td>
                <td><span class="val-badge">${log.from}</span></td>
                <td><span class="val-badge" style="color:var(--accent-purple); border-color:rgba(153,0,204,0.2); background:rgba(153,0,204,0.05);">${log.to}</span></td>
                <td>${log.weight.toFixed(2)} KGs</td>
                <td>Operator (FRA)</td>
                <td><span class="status-badge completed">COMPLETED</span></td>
            `;
            movementsLogTbody.appendChild(tr);
        });
    }

    prepopulateMovementLog();

    // --- INITIAL LOAD ---
    fetchData();
});

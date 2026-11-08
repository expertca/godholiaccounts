let appData = { Members: [], Users: [], Events: [], Accounts: [], Categories: [], Expected: [], Ledger: [], MemberConfig: [], AuditLog: [] };
let userCtx = { role: 0 };
const fmtIdr = num => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(num || 0);

function showToast(msg, isErr=false) {
    const el = document.getElementById('toast'); document.getElementById('toast-msg').innerText = msg;
    document.getElementById('toast-icon').className = isErr ? 'fas fa-exclamation-triangle text-rose-400 text-xl' : 'fas fa-check-circle text-emerald-400 text-xl';
    el.classList.remove('translate-x-full', 'opacity-0'); setTimeout(() => el.classList.add('translate-x-full', 'opacity-0'), 4000);
}

function setLoader(show) { document.getElementById('sync-loader').style.display = show ? 'flex' : 'none'; }
function openModal(id) { const el = document.getElementById(id); el.classList.remove('hidden'); setTimeout(()=>el.classList.add('visible'),10); }
function closeModal(id) { const el = document.getElementById(id); el.classList.remove('visible'); setTimeout(()=>el.classList.add('hidden'), 200); }
function toggleSidebar() { document.getElementById('sidebar').classList.toggle('-translate-x-full'); document.getElementById('mobile-overlay').classList.toggle('active'); }

function customConfirm(title, msg, confirmText = 'Confirm', isDanger = true) {
    return new Promise((resolve) => {
        document.getElementById('confirm-title').innerText = title; document.getElementById('confirm-msg').innerText = msg;
        const okBtn = document.getElementById('btn-confirm-ok'); okBtn.innerText = confirmText;
        okBtn.className = isDanger ? 'flex-1 py-2.5 rounded-xl font-bold text-white bg-rose-600 shadow-md hover:bg-rose-700 transition-colors' : 'flex-1 py-2.5 rounded-xl font-bold text-white bg-indigo-600 shadow-md hover:bg-indigo-700 transition-colors';
        openModal('modal-confirm');
        document.getElementById('btn-confirm-cancel').onclick = () => { closeModal('modal-confirm'); resolve(false); };
        okBtn.onclick = () => { closeModal('modal-confirm'); resolve(true); };
    });
}

function switchTab(id) {
    ['dashboard', 'members', 'contributions', 'donations', 'liabilities', 'ledger', 'reports', 'masterdata', 'audit'].forEach(t => {
        document.getElementById(`view-${t}`).classList.add('hidden');
        if(document.getElementById(`nav-${t}`)) document.getElementById(`nav-${t}`).classList.remove('active');
    });
    document.getElementById(`view-${id}`).classList.remove('hidden');
    if(document.getElementById(`nav-${id}`)) document.getElementById(`nav-${id}`).classList.add('active');
    
    const titles = { dashboard:'Dashboard', members:'Directory & Security', contributions:'Expected Contributions (Memo)', donations:'Donations & Sponsorships', liabilities:'Advances & Payables', ledger:'Main Ledger (Universal Vouchers)', reports:'Financial Reports', masterdata:'Master Data Config', audit:'System Audit Log' };
    document.getElementById('page-title').innerText = titles[id];
    if(id === 'dashboard') updateDashboard();
    if(window.innerWidth < 768 && document.getElementById('mobile-overlay').classList.contains('active')) toggleSidebar();
}

// --- AUTH & API WITH DELTA UPDATES ---
let currentAuthResolver = null;
let storedToken = localStorage.getItem('fam_token');

function executeLogin(e) {
    e.preventDefault();
    const u = document.getElementById('loginUsername').value, p = document.getElementById('loginPassword').value, btn = document.getElementById('loginBtn');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Authenticating...';
    
    fetch(SCRIPT_URL, { method: 'POST', body: JSON.stringify({ method: 'doLogin', token: null, args: [u, p] }) })
    .then(r => r.json()).then(res => {
        btn.innerHTML = 'Unlock Ledger';
        if (res.error) { document.getElementById('loginError').innerText = res.error; } 
        else if (res.token) {
            localStorage.setItem('fam_token', res.token); storedToken = res.token;
            document.getElementById('authGate').classList.add('hidden'); document.getElementById('loginError').innerText = '';
            loadAllData(false);
        }
    }).catch(err => { btn.innerHTML = 'Unlock Ledger'; document.getElementById('loginError').innerText = "Network connection failed."; });
}

function executeReAuth(e) {
    e.preventDefault();
    const p = document.getElementById('reauthPassword').value, btn = document.getElementById('reauthBtn');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifying...';
    
    fetch(SCRIPT_URL, { method: 'POST', body: JSON.stringify({ method: 'doLogin', token: null, args: [userCtx.username, p] }) })
    .then(r => r.json()).then(res => {
        btn.innerHTML = 'Resume Action';
        if (res.error) { document.getElementById('reauthError').innerText = res.error; } 
        else if (res.token) {
            localStorage.setItem('fam_token', res.token); storedToken = res.token;
            closeModal('reAuthGate'); document.getElementById('reauthError').innerText = '';
            if(currentAuthResolver) { currentAuthResolver(res.token); currentAuthResolver = null; }
        }
    }).catch(err => { btn.innerHTML = 'Resume Action'; document.getElementById('reauthError').innerText = "Network connection failed."; });
}

function logout() {
    localStorage.removeItem('fam_token'); storedToken = null;
    document.getElementById('authGate').classList.remove('hidden');
    document.getElementById('loginPassword').value = ''; document.getElementById('loginError').innerText = '';
}

function apiCall(methodName, ...args) {
    return new Promise((resolve, reject) => {
        if (!storedToken && methodName === 'getAppData') return reject(new Error("No Token"));
        const attemptCall = (tokenToUse) => {
            fetch(SCRIPT_URL, { method: 'POST', body: JSON.stringify({ method: methodName, token: tokenToUse, args: args }) })
            .then(r => r.json()).then(res => {
                if (res.error === "SESSION_EXPIRED") {
                    document.getElementById('reauthPassword').value = ''; openModal('reAuthGate');
                    new Promise(resReAuth => { currentAuthResolver = resReAuth; }).then(newToken => attemptCall(newToken)); 
                } else if (res.error) { reject(new Error(res.error)); } else { resolve(res); }
            }).catch(err => reject(new Error("Network Error: Could not reach the server.")));
        };
        attemptCall(storedToken);
    });
}

function loadAllData(silent = false) {
    if (!storedToken) { logout(); return; }
    if (!silent) setLoader(true);
    apiCall('getAppData').then(res => {
        appData = res.db; userCtx = res.user;
        document.getElementById('user-name').innerText = userCtx.name;
        document.getElementById('user-role-badge').innerText = userCtx.role === 2 ? 'Admin' : 'Viewer';
        document.querySelectorAll('.admin-only').forEach(el => el.style.display = userCtx.role === 2 ? '' : 'none');
        populateDropdowns();
        renderAllViews();
        setLoader(false);
    }).catch(err => {
        setLoader(false);
        if (err.message === "SESSION_EXPIRED" || err.message === "No Token" || err.message.includes("Invalid")) logout(); else showToast(err.message, true);
    });
}

function renderAllViews() {
    if(!document.getElementById('view-dashboard').classList.contains('hidden')) updateDashboard();
    renderMembers(); renderContributions(); renderDonations(); renderLiabilities(); renderLedger(); renderMasterData(); renderAudit();
}

// --- INSTANT DELTA UPDATES (Zero Load Screen on Save) ---
async function executeApiAction(e, methodName, payloadStr, optionalArg = null) {
    if(e) e.preventDefault(); const form = e.target, btn = form.querySelector('button[type="submit"]'), originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...'; btn.disabled = true;
    try {
        let res; if(optionalArg) res = await apiCall(methodName, optionalArg, payloadStr); else res = await apiCall(methodName, payloadStr);
        showToast('Action Successful'); closeModal(form.closest('.modal').id); 
        
        const payload = JSON.parse(payloadStr);
        if (methodName === 'saveVoucher') {
            if (payload.isEdit) appData.Ledger = appData.Ledger.filter(t => t.GroupID !== payload.groupID);
            if (res.newLines) appData.Ledger.push(...res.newLines);
        } else if (methodName === 'saveGenericRecord' || methodName === 'saveExpected') {
            payload.ID = res.id; payload.LastUpdatedBy = userCtx.username;
            const targetArray = appData[optionalArg || 'Expected'];
            const idx = targetArray.findIndex(x => x.ID === payload.ID);
            if (idx > -1) targetArray[idx] = { ...targetArray[idx], ...payload }; else targetArray.push(payload);
        } else if (methodName === 'saveBulkExpected') {
            if (res.newRecords) appData.Expected.push(...res.newRecords);
        } else if (methodName === 'saveUserAuth') {
            const uIdx = appData.Users.findIndex(u => u.MemberID === payload.MemberID);
            if (uIdx > -1) { appData.Users[uIdx].Username = payload.Username; appData.Users[uIdx].Role = payload.Role; appData.Users[uIdx].IsLocked = payload.IsLocked; }
            else appData.Users.push({ MemberID: payload.MemberID, Username: payload.Username, Role: payload.Role, IsLocked: payload.IsLocked });
        }
        
        renderAllViews();
        setTimeout(() => loadAllData(true), 2000);
    } catch(err) { showToast(err.message, true); } 
    finally { btn.innerHTML = originalText; btn.disabled = false; }
}

async function deleteEntry(groupId, btnElement, modalToClose) {
    if(!(await customConfirm("Delete Voucher?", "Delete this entire voucher completely? This action cannot be undone."))) return;
    const originalText = btnElement.innerHTML; btnElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; btnElement.disabled = true;
    try { 
        await apiCall('deleteVoucher', groupId); showToast('Deleted'); 
        if(modalToClose) closeModal(modalToClose); 
        appData.Ledger = appData.Ledger.filter(t => t.GroupID !== groupId);
        renderAllViews(); setTimeout(() => loadAllData(true), 2000);
    } 
    catch(err) { showToast(err.message, true); } 
    finally { btnElement.innerHTML = originalText; btnElement.disabled = false; }
}

async function deleteExpected(id, btnElement) {
    if(!(await customConfirm("Remove Due?", "Are you sure you want to remove this assigned due?"))) return;
    const originalHtml = btnElement.innerHTML; btnElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; btnElement.disabled = true;
    try { 
        await apiCall('deleteGenericRecord', 'Expected', id); showToast('Due Deleted'); 
        appData.Expected = appData.Expected.filter(e => e.ID !== id);
        renderAllViews(); setTimeout(() => loadAllData(true), 2000);
    } 
    catch(e) { showToast(e.message, true); btnElement.innerHTML = originalHtml; btnElement.disabled = false; }
}

// --- PAYLOAD BUILDERS ---
function buildVoucherPayload() {
    const mode = document.getElementById('smart-vouch-mode').value, editId = document.getElementById('smart-vouch-edit-id').value, date = document.getElementById('smart-vouch-date').value, memo = document.getElementById('smart-vouch-memo').value, mainAcc = document.getElementById('smart-vouch-main-acc').value;
    let lines = [], totalLinesAmt = 0;
    document.querySelectorAll('#smart-vouch-lines tr').forEach(tr => {
        const type = mode === 'journal' ? tr.querySelector('.v-type').value : (mode === 'receipt' ? 2 : 1), acc = mode === 'journal' ? tr.querySelector('.v-acc').value : '', cat = tr.querySelector('.v-cat').value, ev = tr.querySelector('.v-evt').value, mem = tr.querySelector('.v-mem').value, amt = parseFloat(tr.querySelector('.v-amt').value) || 0;
        if (amt > 0) { lines.push({ Date: date, Type: parseInt(type), AccountID: acc, CategoryID: cat, EventID: ev, MemberID: mem, Amount: amt, Notes: memo }); totalLinesAmt += amt; }
    });
    if (mode !== 'journal') lines.push({ Date: date, Type: mode === 'receipt' ? 1 : 2, AccountID: mainAcc, CategoryID: '', EventID: '', MemberID: '', Amount: totalLinesAmt, Notes: memo });
    return JSON.stringify({ isEdit: !!editId, groupID: editId, lines: lines });
}
function buildMemberPayload() {
    let cfg = {}; document.querySelectorAll('.config-row').forEach(row => { const k = row.querySelector('.config-key').value.trim(), v = row.querySelector('.config-val').value.trim(); if(k) cfg[k] = v; });
    return JSON.stringify({ ID: document.getElementById('mem-id').value, Name: document.getElementById('mem-name').value, Email: document.getElementById('mem-email').value, Status: document.getElementById('mem-status').value, Config: JSON.stringify(cfg) });
}
function buildUserPayload() {
    return JSON.stringify({ MemberID: document.getElementById('user-member-id').value, Username: document.getElementById('user-username').value, NewPassword: document.getElementById('user-newpass').value, Role: document.getElementById('user-role').value, IsLocked: !document.getElementById('user-unlock').checked && !document.getElementById('user-locked-warning').classList.contains('hidden') });
}
function buildExpectedPayload() { return JSON.stringify({ ID: document.getElementById('exp-id').value, Date: document.getElementById('exp-date').value, MemberID: document.getElementById('exp-member').value, EventID: document.getElementById('exp-event').value, Amount: parseFloat(document.getElementById('exp-amount').value) }); }
function buildBulkExpectedPayload() {
    const date = document.getElementById('bulk-date').value, evId = document.getElementById('bulk-event').value, amt = parseFloat(document.getElementById('bulk-amount').value), ids = Array.from(document.querySelectorAll('.bulk-cb:checked')).map(cb => cb.value);
    return JSON.stringify(ids.map(id => ({ Date: date, EventID: evId, MemberID: id, Amount: amt })));
}
function buildMasterPayload(e) { let data = {}; e.target.querySelectorAll('[data-col]').forEach(inp => data[inp.dataset.col] = inp.value); return JSON.stringify(data); }

// --- GLOBAL OPTIONS ---
let optAccounts = '', optCategories = '', optEvents = '', optMembers = '';
function populateDropdowns() {
    optMembers = '<option value="ANON">-- Ext. / None --</option>' + appData.Members.filter(m=>m.Status==1).map(m => `<option value="${m.ID}">${m.Name}</option>`).join('');
    optEvents = '<option value="">-- General --</option>' + appData.Events.map(e => `<option value="${e.ID}">${e.Name}</option>`).join('');
    optAccounts = '<option value="">-- Select Account --</option>' + appData.Accounts.map(a => `<option value="${a.ID}">${a.Name} (${a.Type==2?'Bank':'Cash'})</option>`).join('');
    optCategories = '<option value="">-- Select Category --</option>' + appData.Categories.map(c => `<option value="${c.ID}">${c.Name} (${c.Type})</option>`).join('');
    document.querySelectorAll('.dropdown-events').forEach(el => { const isReq = el.hasAttribute('required'); el.innerHTML = (isReq ? '' : '<option value="">-- All Events --</option>') + appData.Events.map(e => `<option value="${e.ID}">${e.Name}</option>`).join(''); });
    document.querySelectorAll('.dropdown-members').forEach(el => el.innerHTML = optMembers);
    document.querySelectorAll('.dropdown-accounts').forEach(el => el.innerHTML = optAccounts);
}

// --- SMART VOUCHER UI ---
function getCapCache() {
    let caps = {}; const contCat = appData.Categories.find(c => String(c.Name).toLowerCase().includes('contrib'))?.ID;
    appData.Expected.forEach(x => { const eId = x.EventID || 'general'; if(!caps[eId]) caps[eId] = {}; if(!caps[eId][x.MemberID]) caps[eId][x.MemberID] = { expected: 0, paid: 0 }; caps[eId][x.MemberID].expected += parseFloat(x.Amount) || 0; });
    appData.Ledger.forEach(t => { 
        if (t.CategoryID !== contCat || !t.MemberID || t.MemberID === 'ANON') return; 
        const eId = t.EventID || 'general'; 
        if(!caps[eId]) caps[eId] = {}; 
        if(!caps[eId][t.MemberID]) caps[eId][t.MemberID] = { expected: 0, paid: 0 }; 
        if (t.Type == 2) caps[eId][t.MemberID].paid += parseFloat(t.Amount) || 0; 
        if (t.Type == 1) caps[eId][t.MemberID].paid -= parseFloat(t.Amount) || 0; 
    });
    return caps;
}

function openSmartVoucher(mode, editGroupId = null) {
    document.getElementById('form-smart-voucher').reset(); document.getElementById('smart-vouch-date').value = new Date().toISOString().split('T')[0]; document.getElementById('smart-vouch-lines').innerHTML = ''; document.getElementById('smart-vouch-mode').value = mode; document.getElementById('smart-vouch-edit-id').value = editGroupId || '';
    const tDrBox = document.getElementById('smart-vouch-dr-box'), tCrBox = document.getElementById('smart-vouch-cr-box'), accWrapper = document.getElementById('smart-vouch-main-acc-wrapper'), tLabel = document.getElementById('smart-vouch-tot-label'), delBtn = document.getElementById('smart-vouch-delete-btn');
    
    if (mode === 'journal') {
        document.getElementById('smart-vouch-title').innerText = editGroupId ? 'Edit Journal Voucher' : 'Post Journal Voucher';
        accWrapper.classList.add('hidden'); document.getElementById('smart-vouch-main-acc').removeAttribute('required'); document.getElementById('smart-vouch-col-type').classList.remove('hidden'); document.getElementById('smart-vouch-col-acc').classList.remove('hidden'); tDrBox.classList.remove('hidden'); tCrBox.classList.remove('hidden'); tLabel.innerText = 'Difference (Must be 0)';
    } else {
        document.getElementById('smart-vouch-title').innerText = mode === 'receipt' ? (editGroupId?'Edit Receipt':'Receive Money In') : (editGroupId?'Edit Payment':'Send Money Out'); document.getElementById('smart-vouch-acc-label').innerText = mode === 'receipt' ? 'Received Into (Dr)' : 'Paid From (Cr)';
        accWrapper.classList.remove('hidden'); document.getElementById('smart-vouch-main-acc').setAttribute('required', 'true'); document.getElementById('smart-vouch-col-type').classList.add('hidden'); document.getElementById('smart-vouch-col-acc').classList.add('hidden'); tDrBox.classList.add('hidden'); tCrBox.classList.add('hidden'); tLabel.innerText = 'Total ' + (mode === 'receipt' ? 'Receipt' : 'Payment');
    }
    
    if (editGroupId && userCtx.role === 2) { delBtn.classList.remove('hidden'); delBtn.onclick = function() { deleteEntry(editGroupId, this, 'modal-smart-voucher'); }; } else { delBtn.classList.add('hidden'); }
    
    if (editGroupId) {
        const grpLines = appData.Ledger.filter(t => t.GroupID === editGroupId);
        if(grpLines.length > 0) document.getElementById('smart-vouch-date').value = grpLines[0].Date;
        if (mode === 'journal') { grpLines.forEach(line => { addSmartVoucherLine(mode, { ...line, Amount: Math.abs(parseFloat(line.Amount)) }); }); } 
        else {
            const targetAccType = mode === 'receipt' ? 1 : 2; const accLine = grpLines.find(x => x.Type == targetAccType && x.AccountID);
            if(accLine) document.getElementById('smart-vouch-main-acc').value = accLine.AccountID; document.getElementById('smart-vouch-memo').value = grpLines[0].Notes || '';
            const itemLines = grpLines.filter(x => x !== accLine);
            if(itemLines.length === 0) addSmartVoucherLine(mode); else itemLines.forEach(line => { addSmartVoucherLine(mode, { ...line, Amount: Math.abs(parseFloat(line.Amount)) }); });
        }
    } else { addSmartVoucherLine(mode); if(mode==='journal') addSmartVoucherLine(mode); }
    calcSmartVoucher(); openModal('modal-smart-voucher');
}

function addSmartVoucherLine(mode, existingData = null) {
    const tr = document.createElement('tr'); tr.className = 'hover:bg-slate-100/50 transition-colors group';
    const defType = existingData ? existingData.Type : (mode === 'receipt' ? 2 : (mode === 'payment' ? 1 : 1)), defAcc = existingData ? existingData.AccountID : '', defCat = existingData ? existingData.CategoryID : '', defEvt = existingData ? existingData.EventID : '', defMem = existingData ? existingData.MemberID : '', defAmt = existingData ? Math.abs(existingData.Amount) : '';
    let catsToUse = optCategories;
    if (mode === 'receipt') catsToUse = '<option value="">-- None --</option>' + appData.Categories.filter(c=>c.Type==='Income' || c.Type==='Liability').map(c => `<option value="${c.ID}">${c.Name} (${c.Type})</option>`).join('');
    if (mode === 'payment') catsToUse = '<option value="">-- None --</option>' + appData.Categories.filter(c=>c.Type==='Expense' || c.Type==='Asset' || c.Type==='Liability').map(c => `<option value="${c.ID}">${c.Name} (${c.Type})</option>`).join('');
    tr.innerHTML = `<td class="p-2 ${mode==='journal'?'':'hidden'}"><select class="v-type border rounded px-2 py-1.5 w-full text-xs bg-white font-bold" onchange="calcSmartVoucher()"><option value="1" ${defType==1?'selected':''}>Dr</option><option value="2" ${defType==2?'selected':''}>Cr</option></select></td><td class="p-2 ${mode==='journal'?'':'hidden'}"><select class="v-acc border rounded px-2 py-1.5 w-full text-xs bg-white">${optAccounts.replace(`value="${defAcc}"`, `value="${defAcc}" selected`)}</select></td><td class="p-2"><select class="v-cat border rounded px-2 py-1.5 w-full text-xs bg-white v-cat-trigger" required>${catsToUse.replace(`value="${defCat}"`, `value="${defCat}" selected`)}</select></td><td class="p-2"><select class="v-evt border rounded px-2 py-1.5 w-full text-xs bg-white">${optEvents.replace(`value="${defEvt}"`, `value="${defEvt}" selected`)}</select></td><td class="p-2"><select class="v-mem border rounded px-2 py-1.5 w-full text-xs bg-white">${optMembers.replace(`value="${defMem}"`, `value="${defMem}" selected`)}</select></td><td class="p-2"><input type="number" step="0.01" class="v-amt border rounded px-2 py-1.5 w-full text-xs text-right font-bold" value="${defAmt}" oninput="calcSmartVoucher()" required></td><td class="p-2 text-center"><button type="button" onclick="this.closest('tr').remove(); calcSmartVoucher();" class="text-slate-300 hover:text-rose-500"><i class="fas fa-trash-alt"></i></button></td>`;
    document.getElementById('smart-vouch-lines').appendChild(tr);
    tr.querySelector('.v-cat-trigger').addEventListener('change', validateCap); tr.querySelector('.v-evt').addEventListener('change', validateCap); tr.querySelector('.v-mem').addEventListener('change', validateCap); tr.querySelector('.v-amt').addEventListener('input', validateCap);
}

function validateCap(e) {
    const tr = e.target.closest('tr'), cat = tr.querySelector('.v-cat'), mode = document.getElementById('smart-vouch-mode').value;
    if (cat.options[cat.selectedIndex]?.text.toLowerCase().includes('contribution') && (mode === 'receipt' || tr.querySelector('.v-type')?.value == 2)) {
        const memId = tr.querySelector('.v-mem').value, evtId = tr.querySelector('.v-evt').value || 'general', amt = parseFloat(tr.querySelector('.v-amt').value) || 0;
        if (memId && memId !== 'ANON') {
            const caps = getCapCache(), cache = caps[evtId]?.[memId] || { expected: 0, paid: 0 }, bal = cache.expected - cache.paid; 
            if (amt > bal && bal >= 0) { tr.querySelector('.v-amt').classList.add('border-rose-400', 'bg-rose-50', 'text-rose-600'); tr.querySelector('.v-amt').title = `Exceeds expected due (Bal: ${bal})`; } 
            else { tr.querySelector('.v-amt').classList.remove('border-rose-400', 'bg-rose-50', 'text-rose-600'); tr.querySelector('.v-amt').title = ''; }
        }
    } else { tr.querySelector('.v-amt').classList.remove('border-rose-400', 'bg-rose-50', 'text-rose-600'); tr.querySelector('.v-amt').title = ''; }
}

function calcSmartVoucher() {
    const mode = document.getElementById('smart-vouch-mode').value; let dr = 0, cr = 0, total = 0;
    document.querySelectorAll('#smart-vouch-lines tr').forEach(tr => { const amt = parseFloat(tr.querySelector('.v-amt').value) || 0; total += amt; if(mode === 'journal') { const type = tr.querySelector('.v-type').value; if (type == 1) dr += amt; if (type == 2) cr += amt; }});
    const btn = document.getElementById('smart-vouch-submit-btn');
    if (mode === 'journal') {
        const diff = dr - cr; document.getElementById('smart-vouch-tot-dr').innerText = fmtIdr(dr); document.getElementById('smart-vouch-tot-cr').innerText = fmtIdr(cr);
        const diffEl = document.getElementById('smart-vouch-tot-amt'); diffEl.innerText = fmtIdr(Math.abs(diff));
        if (Math.abs(diff) < 0.05 && dr > 0) { diffEl.classList.add('text-emerald-600'); diffEl.classList.remove('text-rose-600'); btn.disabled = false; } else { diffEl.classList.add('text-rose-600'); diffEl.classList.remove('text-emerald-600'); btn.disabled = true; }
    } else { document.getElementById('smart-vouch-tot-amt').innerText = fmtIdr(total); btn.disabled = total <= 0; }
}

// --- DASHBOARD (6 KPIs) ---
function updateDashboard() {
    let cash = 0, bank = 0, expYTD = 0, payables = 0, contribRec = 0, donRec = 0; let evtData = {}; 
    appData.Events.forEach(e => evtData[e.ID] = { inc:0, exp:0, name:e.Name }); evtData['general'] = { inc:0, exp:0, name:'General' };
    const catContribId = appData.Categories.find(c => String(c.Name).toLowerCase().includes('contrib'))?.ID;
    const catDonateId = appData.Categories.find(c => String(c.Name).toLowerCase().includes('donation'))?.ID;
    appData.Ledger.forEach(t => {
        const amt = parseFloat(t.Amount)||0, cat = appData.Categories.find(c=>c.ID===t.CategoryID), acc = appData.Accounts.find(a=>a.ID===t.AccountID), eKey = t.EventID || 'general';
        let effType = t.Type;
        if (effType == 1 && acc) { acc.Type == 2 ? bank+=amt : cash+=amt; }
        if (effType == 2 && acc) { acc.Type == 2 ? bank-=amt : cash-=amt; }
        if (cat) {
            if (cat.Type === 'Expense') { if (effType == 1) { expYTD += amt; if(evtData[eKey]) evtData[eKey].exp += amt; } if (effType == 2) { expYTD -= amt; if(evtData[eKey]) evtData[eKey].exp -= amt; } }
            if (cat.Type === 'Liability') { if (effType == 2) payables += amt; if (effType == 1) payables -= amt; }
            if (cat.ID === catContribId) { if (effType == 2) { contribRec += amt; if(evtData[eKey]) evtData[eKey].inc += amt; } if (effType == 1) { contribRec -= amt; if(evtData[eKey]) evtData[eKey].inc -= amt; } }
            if (cat.ID === catDonateId) { if (effType == 2) { donRec += amt; if(evtData[eKey]) evtData[eKey].inc += amt; } if (effType == 1) { donRec -= amt; if(evtData[eKey]) evtData[eKey].inc -= amt; } }
        }
    });
    document.getElementById('dash-cash').innerText = fmtIdr(cash); document.getElementById('dash-bank').innerText = fmtIdr(bank); document.getElementById('dash-expenses').innerText = fmtIdr(expYTD); document.getElementById('dash-payables').innerText = fmtIdr(payables); document.getElementById('dash-contrib').innerText = fmtIdr(contribRec); document.getElementById('dash-donation').innerText = fmtIdr(donRec);
    let evHtml = ''; Object.values(evtData).filter(d => d.inc > 0 || d.exp > 0).sort((a,b) => (b.inc - b.exp) - (a.inc - a.exp)).forEach(ev => { const bal = ev.inc - ev.exp; evHtml += `<tr class="hover:bg-slate-50 border-b border-slate-100"><td class="py-3 px-3 text-xs md:text-sm font-medium text-slate-700">${ev.name}</td><td class="py-3 px-3 text-xs md:text-sm text-right font-bold text-emerald-600">${ev.inc > 0 ? fmtIdr(ev.inc) : '-'}</td><td class="py-3 px-3 text-xs md:text-sm text-right font-bold text-rose-600">${ev.exp > 0 ? fmtIdr(ev.exp) : '-'}</td><td class="py-3 px-3 text-xs md:text-sm text-right font-black ${bal >= 0 ? 'text-indigo-600' : 'text-rose-600'}">${fmtIdr(bal)}</td></tr>`; });
    document.getElementById('dash-events-tbody').innerHTML = evHtml || `<tr><td colspan="4" class="py-6 text-center text-slate-400 italic">No event financials recorded.</td></tr>`;
    let recentHtml = ''; const allGroups = [...new Set([...appData.Ledger].reverse().map(t => t.GroupID))].slice(0, 7); 
    allGroups.forEach(gId => {
        const grpItems = appData.Ledger.filter(t => t.GroupID === gId); if (grpItems.length === 0) return;
        const dt = grpItems[0].Date; let totAmt = 0; grpItems.forEach(x => { if(x.Type == 1) totAmt += Math.abs(parseFloat(x.Amount)); });
        const particulars = [...new Set(grpItems.filter(x=>x.CategoryID).map(x=> appData.Categories.find(c=>c.ID===x.CategoryID)?.Name))].join(', ') || 'Journal Entry';
        recentHtml += `<tr class="hover:bg-slate-50 border-b border-slate-100 cursor-pointer" onclick="switchTab('ledger')"><td class="py-3 px-3 text-[10px] text-slate-500 whitespace-nowrap">${dt}</td><td class="py-3 px-3 text-xs font-medium text-slate-700 whitespace-normal leading-tight">${particulars}</td><td class="py-3 px-3 text-xs md:text-sm text-right font-bold text-slate-800">${fmtIdr(totAmt)}</td></tr>`;
    });
    document.getElementById('dash-recent-tbody').innerHTML = recentHtml || `<tr><td colspan="3" class="py-6 text-center text-slate-400 italic">No recent activity.</td></tr>`;
}

// --- ACCOUNT DRILLDOWN ---
function openAccountDrilldown(accType) {
    const tbody = document.getElementById('drilldown-tbody'); tbody.innerHTML = ''; const accs = appData.Accounts.filter(a => a.Type == accType); let totalTypeBal = 0;
    accs.forEach(acc => {
        let bal = 0; appData.Ledger.filter(t => t.AccountID === acc.ID).forEach(t => { bal += (t.Type == 1 ? Math.abs(parseFloat(t.Amount)) : -Math.abs(parseFloat(t.Amount))); });
        totalTypeBal += bal;
        tbody.innerHTML += `<tr class="hover:bg-slate-50 border-b border-slate-100"><td class="py-3 px-2 font-medium text-slate-700">${acc.Name}</td><td class="py-3 px-2 text-right font-bold text-slate-800">${fmtIdr(bal)}</td><td class="py-3 px-2 text-center"><button onclick="closeModal('modal-account-list'); jumpToAccountStmt('${acc.ID}')" class="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded hover:bg-indigo-100 transition-colors">Statement</button></td></tr>`;
    });
    tbody.innerHTML += `<tr class="bg-slate-100/50"><td class="py-3 px-2 font-black text-slate-700 uppercase tracking-wider text-[10px]">Total</td><td class="py-3 px-2 text-right font-black text-indigo-700 text-lg">${fmtIdr(totalTypeBal)}</td><td></td></tr>`;
    document.getElementById('drilldown-title').innerText = accType == 1 ? 'Cash Accounts Overview' : 'Bank Accounts Overview';
    openModal('modal-account-list');
}
function jumpToAccountStmt(accId) { 
    switchTab('reports'); document.getElementById('reportSelector').value = 'stmt'; 
    onReportTypeChange(); 
    setTimeout(() => { document.getElementById('reportParam').value = accId; runReport(); }, 100); 
}

// --- DIRECTORY & USERS ---
function openAddMemberModal() { document.getElementById('form-member').reset(); document.getElementById('mem-id').value = ''; renderMemberConfigForm({}); openModal('modal-member'); }
function editMember(id) { const m = appData.Members.find(x => x.ID === id); document.getElementById('mem-id').value = m.ID; document.getElementById('mem-name').value = m.Name; document.getElementById('mem-email').value = m.Email; document.getElementById('mem-status').value = m.Status; let currentCfg = {}; try { currentCfg = m.Config ? JSON.parse(m.Config) : {}; } catch(e) {} renderMemberConfigForm(currentCfg); openModal('modal-member'); }

function openUserModal(memberId, memberName) {
    document.getElementById('form-user').reset(); document.getElementById('user-member-id').value = memberId; document.getElementById('user-member-name-label').innerText = memberName;
    const u = appData.Users.find(x => x.MemberID === memberId), w = document.getElementById('user-locked-warning'), c = document.getElementById('user-unlock');
    if (u) { document.getElementById('user-username').value = u.Username; document.getElementById('user-role').value = u.Role; if(u.IsLocked) { w.classList.remove('hidden'); c.checked = false; } else { w.classList.add('hidden'); c.checked = true; } } 
    else { w.classList.add('hidden'); c.checked = true; }
    openModal('modal-user');
}

function openBulkContribModal() {
    document.getElementById('form-bulk-contrib').reset(); document.getElementById('bulk-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('bulk-tbody').innerHTML = appData.Members.filter(m => m.Status == 1).map(m => `<tr class="hover:bg-slate-50 border-b border-slate-100"><td class="px-4 py-2 text-center w-10"><input type="checkbox" class="bulk-cb w-4 h-4 text-indigo-600 rounded" value="${m.ID}" checked></td><td class="px-4 py-2 text-sm font-medium text-slate-700">${m.Name}</td></tr>`).join('');
    openModal('modal-bulk-contrib');
}

function renderMemberConfigForm(currentCfg) {
    const container = document.getElementById('mem-config-container'); container.innerHTML = '';
    if (!appData.MemberConfig || appData.MemberConfig.length === 0) { container.innerHTML = '<p class="text-xs text-slate-400 italic">No custom fields defined in Master Data.</p>'; return; }
    appData.MemberConfig.forEach(c => { const div = document.createElement('div'); div.className = 'flex flex-col config-row mb-3'; div.innerHTML = `<label class="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">${c.Label}</label><input type="hidden" class="config-key" value="${c.FieldKey}"><input type="${c.Type}" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-1 outline-none config-val" value="${currentCfg[c.FieldKey]||''}" placeholder="Enter ${c.Label.toLowerCase()}">`; container.appendChild(div); });
}

function renderMembers() {
    const tbody = document.getElementById('member-tbody'), q = document.getElementById('search-member')?.value.toLowerCase() || '', filtered = appData.Members.filter(m => String(m.Name).toLowerCase().includes(q));
    tbody.innerHTML = [...filtered].reverse().map(m => {
        const u = appData.Users.find(x => x.MemberID === m.ID); let authHtml = `<span class="text-[10px] text-slate-400 italic">No Login Setup</span>`;
        
        // Admin Clash Security Check
        const isMe = u && u.ID === userCtx.id;
        const isTargetAdmin = u && u.Role == 2;
        const canManageAuth = (userCtx.role === 2) && (!isTargetAdmin || isMe || userCtx.username === 'admin');
        const manageBtn = canManageAuth ? `<button onclick="openUserModal('${m.ID}', '${m.Name.replace(/'/g, "\\'")}')" class="text-slate-400 hover:text-amber-500 p-2" title="Manage Login Account"><i class="fas fa-key"></i></button>` : `<span class="text-slate-200 p-2"><i class="fas fa-lock" title="Admin lock"></i></span>`;

        if(u) { if(u.IsLocked) authHtml = `<span class="bg-rose-100 text-rose-700 px-2 py-0.5 rounded text-[9px] font-bold uppercase"><i class="fas fa-lock mr-1"></i>Locked</span><br><span class="text-[9px] text-slate-400">@${u.Username}</span>`; else authHtml = `<span class="text-[10px] text-emerald-600 font-bold"><i class="fas fa-check-circle mr-1"></i>Active</span><br><span class="text-[9px] text-slate-400">@${u.Username}</span>`; }
        return `<tr class="hover:bg-slate-50 transition-colors"><td class="px-3 py-3 font-mono text-[10px] text-slate-400">${m.ID}</td><td class="px-3 py-3 text-xs md:text-sm font-bold text-slate-700 whitespace-normal leading-tight">${m.Name}<br><span class="text-[10px] font-normal text-slate-400">${m.Email||'No Email'}</span></td><td class="px-3 py-3">${authHtml}</td><td class="px-3 py-3 text-center admin-only whitespace-nowrap"><button onclick="editMember('${m.ID}')" class="text-slate-400 hover:text-indigo-600 p-2 mr-1" title="Edit Profile"><i class="fas fa-edit"></i></button>${manageBtn}</td></tr>`;
    }).join('') || `<tr><td colspan="5" class="text-center py-8 text-slate-400">No members found.</td></tr>`;
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = userCtx.role === 2 ? '' : 'none');
}

// --- ACCOUNTING VIEWS ---
function renderContributions() {
    const tbody = document.getElementById('contrib-tbody'); const evtId = document.getElementById('contrib-event-filter').value; const catContribId = appData.Categories.find(c => String(c.Name).toLowerCase().includes('contrib'))?.ID;
    let evtSummary = {}; 
    appData.Expected.forEach(x => { if(evtId && x.EventID !== evtId) return; const eId = x.EventID || 'general'; if(!evtSummary[eId]) evtSummary[eId] = { name: appData.Events.find(e=>e.ID===eId)?.Name || 'General', due: 0, paid: 0, mems: {} }; if(!evtSummary[eId].mems[x.MemberID]) evtSummary[eId].mems[x.MemberID] = { name: appData.Members.find(m=>m.ID===x.MemberID)?.Name || 'Unknown', due: 0, paid: 0, records: [] }; evtSummary[eId].mems[x.MemberID].records.push({id: x.ID, amt: parseFloat(x.Amount)}); evtSummary[eId].mems[x.MemberID].due += parseFloat(x.Amount); evtSummary[eId].due += parseFloat(x.Amount); });
    appData.Ledger.forEach(t => { 
        if(evtId && t.EventID !== evtId) return; if(!t.MemberID || t.MemberID === 'ANON') return; const eId = t.EventID || 'general'; if(!evtSummary[eId] || !evtSummary[eId].mems[t.MemberID]) return; const amt = parseFloat(t.Amount) || 0; 
        if (t.CategoryID === catContribId) { 
            if(t.Type == 2) { evtSummary[eId].mems[t.MemberID].paid += amt; evtSummary[eId].paid += amt; } 
            if(t.Type == 1) { evtSummary[eId].mems[t.MemberID].paid -= amt; evtSummary[eId].paid -= amt; }
        } 
    });
    let html = ''; Object.keys(evtSummary).forEach(eId => { const ev = evtSummary[eId], bal = ev.due - ev.paid; html += `<tr class="bg-indigo-50 border-b border-indigo-100 cursor-pointer hover:bg-indigo-100 transition-colors" onclick="document.getElementById('evt-details-${eId}').classList.toggle('hidden')"><td class="px-3 py-3 text-xs md:text-sm font-bold text-indigo-800"><i class="fas fa-chevron-down mr-2 text-indigo-400 text-[10px]"></i> ${ev.name}</td><td class="px-3 py-3 text-xs md:text-sm text-right font-bold text-slate-700">${fmtIdr(ev.due)}</td><td class="px-3 py-3 text-xs md:text-sm text-right font-bold text-emerald-600">${fmtIdr(ev.paid)}</td><td class="px-3 py-3 text-xs md:text-sm text-right font-bold ${bal>0?'text-rose-600':'text-slate-500'}">${fmtIdr(bal)}</td></tr>`; html += `<tr id="evt-details-${eId}" class="hidden bg-white"><td colspan="4" class="p-0"><div class="bg-slate-50 py-2 px-2 md:px-8 border-b shadow-inner overflow-x-auto"><table class="w-full text-xs"><thead class="text-slate-400 border-b"><tr><th class="py-2 text-left w-1/3">Member Name</th><th class="py-2 text-right">Expected</th><th class="py-2 text-right">Cont. Paid</th><th class="py-2 text-right">Bal Memo</th><th class="py-2 text-right admin-only w-16">Del</th></tr></thead><tbody>${Object.values(ev.mems).map(m => { const mBal = m.due - m.paid; const delBtns = m.records.map(r => `<button onclick="deleteExpected('${r.id}', this)" title="Delete ₹${r.amt} due" class="text-rose-400 hover:text-rose-600 ml-2 admin-only"><i class="fas fa-trash-alt"></i></button>`).join(''); return `<tr class="border-b border-slate-100 hover:bg-slate-100"><td class="py-2 font-medium whitespace-normal leading-tight">${m.name}</td><td class="py-2 text-right text-slate-500">${fmtIdr(m.due)}</td><td class="py-2 text-right text-emerald-600">${fmtIdr(m.paid)}</td><td class="py-2 text-right font-bold ${mBal>0?'text-rose-500':'text-slate-400'}">${fmtIdr(mBal)}</td><td class="py-2 text-right whitespace-nowrap admin-only">${delBtns}</td></tr>` }).join('')}</tbody></table></div></td></tr>`; });
    document.getElementById('contrib-tbody').innerHTML = html || `<tr><td colspan="4" class="text-center py-8 text-slate-400">No expected dues found.</td></tr>`;
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = userCtx.role === 2 ? '' : 'none');
}

function renderDonations() {
    const tbody = document.getElementById('donations-tbody'), evtId = document.getElementById('donation-event-filter').value, catDonateId = appData.Categories.find(c => String(c.Name).toLowerCase().includes('donation'))?.ID;
    let html = '', total = 0;
    [...appData.Ledger].filter(t => t.CategoryID === catDonateId && (evtId==='' || t.EventID === evtId)).sort((a,b)=>new Date(b.Date)-new Date(a.Date)).forEach(t => { const amt = parseFloat(t.Amount)||0; if (t.Type == 2) total += amt; else total -= amt; const ev = appData.Events.find(e=>e.ID===t.EventID)?.Name || '-'; const mem = t.MemberID === 'ANON' ? 'External' : (appData.Members.find(m=>m.ID===t.MemberID)?.Name || '-'); html += `<tr class="border-b border-slate-100 hover:bg-slate-50"><td class="px-3 py-3 font-mono text-[10px] text-slate-500">${t.Date}</td><td class="px-3 py-3 text-xs md:text-sm font-medium text-slate-700 whitespace-normal leading-tight">${mem}</td><td class="px-3 py-3 text-[10px] md:text-xs text-slate-500">${ev}</td><td class="px-3 py-3 text-[10px] text-slate-400 whitespace-normal leading-tight">${t.Notes||''}</td><td class="px-3 py-3 text-xs md:text-sm text-right font-bold text-fuchsia-600">${t.Type==1?'-':''}${fmtIdr(amt)}</td></tr>`; });
    document.getElementById('donations-total-display').innerText = fmtIdr(total);
    tbody.innerHTML = html || `<tr><td colspan="5" class="text-center py-8 text-slate-400">No donations recorded.</td></tr>`;
}

function renderLiabilities() {
    const tbody = document.getElementById('liabilities-tbody'); let memberAdvances = {}; appData.Members.forEach(m => memberAdvances[m.ID] = { name: m.Name, gen: 0, settled: 0, net: 0 });
    appData.Ledger.forEach(t => { if(!t.MemberID || t.MemberID === 'ANON') return; const cat = appData.Categories.find(c=>c.ID===t.CategoryID); if(cat && cat.Type === 'Liability' && memberAdvances[t.MemberID]) { const amt = parseFloat(t.Amount)||0; if(t.Type == 2) memberAdvances[t.MemberID].gen += amt; if(t.Type == 1) memberAdvances[t.MemberID].settled += amt; } });
    let html = ''; Object.keys(memberAdvances).forEach(mId => { const a = memberAdvances[mId]; a.net = a.gen - a.settled; if (a.net !== 0 || a.gen > 0) { html += `<tr class="border-b border-slate-100 hover:bg-slate-50"><td class="px-3 py-3 text-xs md:text-sm font-medium text-slate-700 whitespace-normal leading-tight">${a.name}</td><td class="px-3 py-3 text-[10px] md:text-sm text-right text-slate-500">${fmtIdr(a.gen)}</td><td class="px-3 py-3 text-[10px] md:text-sm text-right text-emerald-500">${fmtIdr(a.settled)}</td><td class="px-3 py-3 text-xs md:text-sm text-right font-bold ${a.net>0?'text-amber-600':(a.net<0?'text-rose-500':'text-slate-400')}">${fmtIdr(a.net)}</td></tr>`; } });
    tbody.innerHTML = html || `<tr><td colspan="4" class="text-center py-8 text-slate-400">No member advances found.</td></tr>`;
}

function renderLedger() {
    const tbody = document.getElementById('ledger-tbody'), tFilt = document.getElementById('ledger-filter-type').value, eFilt = document.getElementById('ledger-filter-event').value;
    let filtered = appData.Ledger.filter(t => { if (eFilt && t.EventID != eFilt) return false; return true; }), html = '', processedGroups = new Set();
    [...filtered].reverse().forEach(t => {
        if (processedGroups.has(t.GroupID)) return; processedGroups.add(t.GroupID);
        const grpItems = appData.Ledger.filter(x => x.GroupID === t.GroupID);
        let vType = 'Journal'; let vSty = 'indigo'; const hasAcc = grpItems.find(x => x.AccountID);
        if (hasAcc) { if (hasAcc.Type == 1) { vType = 'Receipt'; vSty = 'emerald'; } if (hasAcc.Type == 2) { vType = 'Payment'; vSty = 'rose'; } }
        if (tFilt !== 'All') { if (tFilt == '1' && vType !== 'Receipt') return; if (tFilt == '2' && vType !== 'Payment') return; if (tFilt == '3' && vType !== 'Journal') return; }
        let drCount = 0; let crCount = 0; let totAmt = 0;
        grpItems.forEach(x => { if (x.Type == 1) { drCount++; totAmt += Math.abs(parseFloat(x.Amount)); } if (x.Type == 2) { crCount++; } });
        const particulars = [...new Set(grpItems.filter(x=>x.CategoryID).map(x=> appData.Categories.find(c=>c.ID===x.CategoryID)?.Name))].join(', ') || 'No Category';
        const typeProfile = `<span class="text-emerald-500">Dr: ${drCount}</span> / <span class="text-rose-500">Cr: ${crCount}</span>`;
        const payload = btoa(unescape(encodeURIComponent(JSON.stringify(grpItems))));
        let editMode = vType.toLowerCase();
        html += `<tr class="hover:bg-slate-50 cursor-pointer transition-colors border-b border-slate-100" onclick="showVoucherModal('${payload}')"><td class="px-3 py-3 text-[10px] text-slate-500 whitespace-nowrap">${t.Date}</td><td class="px-3 py-3"><span class="text-[9px] font-bold uppercase bg-${vSty}-100 text-${vSty}-700 px-2 py-0.5 rounded">${vType}</span><br><span class="font-mono text-[8px] text-slate-400 block mt-1">${t.GroupID}</span></td><td class="px-3 py-3 text-[9px] font-bold text-slate-500 uppercase">${typeProfile}</td><td class="px-3 py-3 text-xs md:text-sm"><div class="font-medium text-slate-700 whitespace-normal leading-tight">${particulars}</div><div class="text-slate-400 text-[10px] whitespace-normal leading-tight mt-0.5">${grpItems[0].Notes || ''}</div></td><td class="px-3 py-3 text-right font-black text-slate-700 text-sm md:text-lg">${fmtIdr(totAmt)}</td><td class="px-3 py-3 text-center admin-only" onclick="event.stopPropagation();"><button onclick="openSmartVoucher('${editMode}', '${t.GroupID}')" class="text-indigo-400 hover:text-indigo-700 p-2 border border-slate-200 rounded shadow-sm bg-white"><i class="fas fa-edit"></i></button></td></tr>`;
    });
    document.getElementById('ledger-tbody').innerHTML = html || `<tr><td colspan="6" class="text-center py-8 text-slate-400">No ledger entries.</td></tr>`;
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = userCtx.role === 2 ? '' : 'none');
}

function showVoucherModal(b64) {
    const items = JSON.parse(decodeURIComponent(escape(atob(b64))));
    let content = `<div class="overflow-x-auto w-full"><table class="w-full text-left text-xs whitespace-nowrap min-w-[400px]"><thead class="border-b bg-slate-50"><tr class="text-slate-500 text-[9px] uppercase tracking-wider"><th class="p-2 w-10">Dr/Cr</th><th class="p-2">Particulars</th><th class="p-2 text-right">Debit (₹)</th><th class="p-2 text-right">Credit (₹)</th></tr></thead><tbody class="divide-y divide-slate-100">`;
    let tDr = 0, tCr = 0;
    items.forEach(i => {
        const c = appData.Categories.find(cat => cat.ID === i.CategoryID)?.Name || ''; const a = appData.Accounts.find(acc => acc.ID === i.AccountID)?.Name || ''; const m = i.MemberID && i.MemberID !== 'ANON' ? (appData.Members.find(mem=>mem.ID===i.MemberID)?.Name || '') : '';
        const amt = Math.abs(parseFloat(i.Amount)) || 0;
        let particulars = [a, c, m].filter(x=>x).join(' - '); if(!particulars) particulars = 'System Generated';
        if (i.Type == 1) tDr += amt; if (i.Type == 2) tCr += amt;
        content += `<tr><td class="p-2 text-[10px] font-bold ${i.Type==1?'text-emerald-500':'text-rose-500'}">${i.Type==1?'Dr':'Cr'}</td><td class="p-2 text-xs text-slate-700 font-medium whitespace-normal leading-tight">${particulars}</td><td class="p-2 text-right font-bold text-emerald-600">${i.Type==1 ? fmtIdr(amt) : '-'}</td><td class="p-2 text-right font-bold text-rose-600">${i.Type==2 ? fmtIdr(amt) : '-'}</td></tr>`;
    });
    content += `<tr class="bg-slate-50 border-t-2 border-slate-200"><td colspan="2" class="p-2 font-bold text-slate-700 text-right uppercase text-[10px]">Voucher Total</td><td class="p-2 text-right font-black text-emerald-700">${fmtIdr(tDr)}</td><td class="p-2 text-right font-black text-rose-700">${fmtIdr(tCr)}</td></tr></tbody></table></div>`;
    const vMemo = items[0].Notes || 'No general memo.'; content += `<div class="mt-4 p-3 bg-indigo-50 border border-indigo-100 rounded-lg text-xs text-indigo-800"><span class="font-bold uppercase tracking-wider mr-2 text-[10px]">Narration:</span> ${vMemo}</div>`;
    document.getElementById('details-title').innerText = `Breakdown: ${items[0].GroupID}`; document.getElementById('details-content').innerHTML = content;
    openModal('modal-details'); 
}

function showDetailsModal(title, b64Data) {
    const dataStr = decodeURIComponent(escape(atob(b64Data))); let content = '';
    try {
        const obj = JSON.parse(dataStr);
        content = '<div class="overflow-x-auto"><table class="w-full text-left text-xs"><tbody class="divide-y divide-slate-100">';
        for (let key in obj) { content += `<tr><td class="py-2 pr-4 font-bold text-slate-500 whitespace-nowrap">${key}</td><td class="py-2 font-mono text-slate-800 break-all">${obj[key]}</td></tr>`; }
        content += '</tbody></table></div>';
    } catch(e) { content = `<div class="p-4 text-sm font-mono text-slate-700 whitespace-pre-wrap break-all">${dataStr}</div>`; }
    document.getElementById('details-title').innerText = title; document.getElementById('details-content').innerHTML = content; openModal('modal-details');
}

// --- REPORTING SYSTEM ---
function onReportTypeChange() {
    const type = document.getElementById('reportSelector').value, paramSel = document.getElementById('reportParam'), wrapper = document.getElementById('reportParamWrapper'), label = document.getElementById('reportParamLabel');
    document.getElementById('report-container').innerHTML = '<div class="h-full flex flex-col items-center justify-center text-slate-400 bg-white border border-dashed border-slate-200 rounded-2xl"><i class="fas fa-file-invoice-dollar text-4xl mb-3 text-slate-200"></i><p>Select report settings to generate.</p></div>';
    
    if (type === 'stmt') {
        wrapper.classList.remove('hidden'); label.innerText = "Select Account";
        paramSel.innerHTML = '<option value="">-- Choose Account --</option>' + appData.Accounts.map(a => `<option value="${a.ID}">${a.Name} (${a.Type==2?'Bank':'Cash'})</option>`).join('');
    } else if (type === 'adv-stmt') {
        wrapper.classList.remove('hidden'); label.innerText = "Select Member";
        paramSel.innerHTML = '<option value="">-- Choose Member --</option>' + appData.Members.map(m=>`<option value="${m.ID}">${m.Name}</option>`).join('');
    } else if (type === 'bs' || type === 'ine') { 
        wrapper.classList.add('hidden'); runReport(); 
    } else { wrapper.classList.add('hidden'); }
}

function runReport() {
    const type = document.getElementById('reportSelector').value, paramVal = document.getElementById('reportParam').value, container = document.getElementById('report-container');
    const fDate = document.getElementById('report-from').value, tDate = document.getElementById('report-to').value;
    if((type === 'stmt' || type === 'adv-stmt') && !paramVal) return;
    container.innerHTML = '<div class="h-full flex flex-col items-center justify-center text-indigo-400 bg-white border border-dashed border-indigo-200 rounded-2xl"><i class="fas fa-spinner fa-spin text-4xl mb-3"></i><p class="font-bold">Generating Report...</p></div>';
    
    setTimeout(() => {
        if(type === 'stmt') { renderAccountStatement(paramVal, fDate, tDate); } 
        else if (type === 'adv-stmt') { renderAdvanceStatement(paramVal, fDate, tDate); } 
        else if (type === 'bs') { renderBalanceSheet(tDate); }
        else if (type === 'ine') { renderIncomeExpense(fDate, tDate); }
    }, 100);
}

function renderBalanceSheet(toDate) {
    let assetsHtml = '', totalAssets = 0, liabHtml = '', totalLiab = 0, inc = 0, exp = 0;
    const ledgerAsOf = appData.Ledger.filter(t => !toDate || t.Date <= toDate);

    appData.Accounts.forEach(a => { let aBal = 0; ledgerAsOf.filter(t=>t.AccountID === a.ID).forEach(t => { aBal += (t.Type == 1 ? Math.abs(parseFloat(t.Amount)) : -Math.abs(parseFloat(t.Amount))); }); if (aBal !== 0) { assetsHtml += `<div class="flex justify-between py-2 border-b border-slate-100"><span class="text-slate-600">${a.Name}</span><span class="font-bold text-slate-700">${fmtIdr(aBal)}</span></div>`; totalAssets += aBal; } });
    appData.Categories.filter(c=>c.Type==='Asset').forEach(c => { let cBal = 0; ledgerAsOf.filter(t=>t.CategoryID === c.ID).forEach(t => { cBal += (t.Type == 1 ? Math.abs(parseFloat(t.Amount)) : -Math.abs(parseFloat(t.Amount))); }); if (cBal !== 0) { assetsHtml += `<div class="flex justify-between py-2 border-b border-slate-100"><span class="text-slate-600">${c.Name} (Capitalized)</span><span class="font-bold text-slate-700">${fmtIdr(cBal)}</span></div>`; totalAssets += cBal; } });
    
    appData.Categories.filter(c=>c.Type==='Liability').forEach(c => { let cBal = 0; ledgerAsOf.filter(t=>t.CategoryID === c.ID).forEach(t => { cBal += (t.Type == 2 ? Math.abs(parseFloat(t.Amount)) : -Math.abs(parseFloat(t.Amount))); }); if (cBal !== 0) { liabHtml += `<div class="flex justify-between py-2 border-b border-slate-100"><span class="text-slate-600">${c.Name} (Payables)</span><span class="font-bold text-slate-700">${fmtIdr(cBal)}</span></div>`; totalLiab += cBal; } });
    
    ledgerAsOf.forEach(t => { const cat = appData.Categories.find(c=>c.ID === t.CategoryID); if(cat?.Type === 'Income') inc += (t.Type == 2 ? Math.abs(parseFloat(t.Amount)) : -Math.abs(parseFloat(t.Amount))); if(cat?.Type === 'Expense') exp += (t.Type == 1 ? Math.abs(parseFloat(t.Amount)) : -Math.abs(parseFloat(t.Amount))); });
    const surplus = inc - exp;
    
    document.getElementById('report-container').innerHTML = `
    <div class="max-w-4xl mx-auto w-full">
        <div class="mb-4 flex items-center justify-between"><h3 class="font-black text-slate-700 uppercase tracking-wider text-sm"><i class="fas fa-balance-scale mr-2 text-indigo-500"></i> Balance Sheet</h3><span class="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-lg text-xs font-bold shadow-sm">As of ${toDate || 'Today'}</span></div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="bg-white rounded-2xl border shadow-sm overflow-hidden flex flex-col">
                <div class="bg-rose-50 border-b p-4 text-rose-800 font-bold uppercase text-sm tracking-wider">Liabilities & Capital</div>
                <div class="p-6 space-y-2 flex-1">
                    <h4 class="font-bold text-slate-400 text-[10px] uppercase tracking-wider mb-2">Advances & Payables</h4>${liabHtml || '<p class="text-xs text-slate-400 italic py-2">No active liabilities.</p>'}
                    <h4 class="font-bold text-slate-400 text-[10px] uppercase tracking-wider mt-6 mb-2">General Fund (Capital)</h4>
                    <div class="flex justify-between py-2 border-b border-slate-100"><span class="text-slate-600">Surplus / (Deficit) All-Time</span><span class="font-bold ${surplus>=0?'text-emerald-600':'text-rose-600'}">${fmtIdr(surplus)}</span></div>
                </div>
                <div class="bg-slate-50 border-t p-5 flex justify-between font-black text-lg text-slate-800"><span>Total</span><span>${fmtIdr(totalLiab + surplus)}</span></div>
            </div>
            <div class="bg-white rounded-2xl border shadow-sm overflow-hidden flex flex-col">
                <div class="bg-emerald-50 border-b p-4 text-emerald-800 font-bold uppercase text-sm tracking-wider">Assets</div>
                <div class="p-6 space-y-2 flex-1">
                    <h4 class="font-bold text-slate-400 text-[10px] uppercase tracking-wider mb-2">Bank, Cash & Capitalized Assets</h4>${assetsHtml || '<p class="text-xs text-slate-400 italic py-2">No active assets.</p>'}
                </div>
                <div class="bg-slate-50 border-t p-5 flex justify-between font-black text-lg text-slate-800"><span>Total</span><span>${fmtIdr(totalAssets)}</span></div>
            </div>
        </div>
    </div>`;
}

function renderIncomeExpense(fromDate, toDate) {
    let inc = {}, exp = {}, tInc = 0, tExp = 0;
    const ledgerRange = appData.Ledger.filter(t => (!fromDate || t.Date >= fromDate) && (!toDate || t.Date <= toDate));
    
    ledgerRange.forEach(t => { const amt = Math.abs(parseFloat(t.Amount)) || 0; const cat = appData.Categories.find(c=>c.ID === t.CategoryID); if (cat) { if (cat.Type === 'Income') { inc[cat.Name] = (inc[cat.Name]||0) + (t.Type==2?amt:-amt); tInc += (t.Type==2?amt:-amt); } if (cat.Type === 'Expense') { exp[cat.Name] = (exp[cat.Name]||0) + (t.Type==1?amt:-amt); tExp += (t.Type==1?amt:-amt); } } });
    
    const renderRows = (obj) => Object.entries(obj).map(([k,v]) => `<div class="flex justify-between py-1.5 border-b border-slate-100 text-slate-600"><span>${k}</span><span class="font-medium">${fmtIdr(v)}</span></div>`).join('');
    document.getElementById('report-container').innerHTML = `
    <div class="max-w-4xl mx-auto w-full">
        <div class="mb-4 flex items-center justify-between"><h3 class="font-black text-slate-700 uppercase tracking-wider text-sm"><i class="fas fa-file-invoice-dollar mr-2 text-indigo-500"></i> Income & Expenditure</h3><span class="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-lg text-xs font-bold shadow-sm">${fromDate||'Start'} to ${toDate||'Present'}</span></div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="bg-white rounded-2xl border shadow-sm overflow-hidden flex flex-col">
                <div class="bg-emerald-50 border-b p-4 text-emerald-800 font-bold uppercase text-sm tracking-wider"><i class="fas fa-arrow-down mr-2"></i>Income</div>
                <div class="p-6 space-y-2 flex-1">${renderRows(inc) || '<p class="text-xs text-slate-400 italic py-2">No recorded income in this period.</p>'}</div>
                <div class="bg-slate-50 border-t p-5 flex justify-between font-bold text-emerald-700"><span>Total Income</span><span>${fmtIdr(tInc)}</span></div>
            </div>
            <div class="bg-white rounded-2xl border shadow-sm overflow-hidden flex flex-col">
                <div class="bg-rose-50 border-b p-4 text-rose-800 font-bold uppercase text-sm tracking-wider"><i class="fas fa-arrow-up mr-2"></i>Expenditure</div>
                <div class="p-6 space-y-2 flex-1">${renderRows(exp) || '<p class="text-xs text-slate-400 italic py-2">No recorded expenditure in this period.</p>'}</div>
                <div class="bg-slate-50 border-t p-5 flex justify-between font-bold text-rose-700"><span>Total Expense</span><span>${fmtIdr(tExp)}</span></div>
            </div>
        </div>
        <div class="mt-6 p-6 bg-white border border-slate-200 rounded-2xl shadow-sm flex justify-between items-center"><span class="font-bold text-slate-500 uppercase tracking-wider text-sm">Surplus / (Deficit) For Period</span><span class="font-black text-2xl ${tInc-tExp >= 0 ? 'text-indigo-600' : 'text-rose-600'}">${fmtIdr(tInc-tExp)}</span></div>
    </div>`;
}

function renderAccountStatement(accId, fromDate, toDate) {
    const accObj = appData.Accounts.find(a=>a.ID===accId);
    let opBal = 0, bal = 0, rowsHtml = '';
    
    if (fromDate) {
        appData.Ledger.filter(t => t.AccountID === accId && t.Date < fromDate).forEach(t => { opBal += (t.Type == 1 ? Math.abs(t.Amount) : -Math.abs(t.Amount)); });
        bal = opBal;
        rowsHtml += `<tr class="bg-indigo-50/50 text-xs font-bold border-b border-indigo-100"><td class="py-3 px-3">${fromDate}</td><td class="py-3 px-3 text-indigo-700" colspan="3">Opening Balance Brought Forward</td><td class="py-3 px-3 text-right text-indigo-700 text-sm">${fmtIdr(opBal)}</td></tr>`;
    }

    const accLedger = appData.Ledger.filter(t => t.AccountID === accId && (!fromDate || t.Date >= fromDate) && (!toDate || t.Date <= toDate));
    const grpIds = [...new Set(accLedger.map(t => t.GroupID))];
    const grps = grpIds.map(gId => appData.Ledger.filter(t => t.GroupID === gId)).sort((a,b) => new Date(a[0].Date) - new Date(b[0].Date));
    
    grps.forEach(grp => {
        let dr = 0, cr = 0;
        const myLines = grp.filter(t => t.AccountID === accId);
        const otherLines = grp.filter(t => t.AccountID !== accId);
        
        if(myLines.length === 0) return;

        // Unmerged distinct statement row logic
        if (myLines.length === 1 && otherLines.length > 0) {
            const myType = myLines[0].Type;
            otherLines.forEach(opp => {
                let amt = Math.abs(parseFloat(opp.Amount));
                if (amt === 0) return;
                let lDr = myType == 1 ? amt : 0; let lCr = myType == 2 ? amt : 0;
                bal += (lDr - lCr);
                const cat = appData.Categories.find(c=>c.ID===opp.CategoryID)?.Name; const acc = appData.Accounts.find(a=>a.ID===opp.AccountID)?.Name; const mem = opp.MemberID && opp.MemberID !== 'ANON' ? appData.Members.find(m=>m.ID===opp.MemberID)?.Name : '';
                const ref = [acc, cat, mem].filter(x=>x).join(' | ') || 'Journal Transfer';
                rowsHtml += `<tr class="border-b border-slate-100 hover:bg-slate-50 text-xs"><td class="py-3 px-3 whitespace-nowrap text-[10px] text-slate-500">${grp[0].Date}</td><td class="py-3 px-3 text-slate-700 font-medium whitespace-normal leading-tight"><div class="font-bold">${ref}</div><div class="text-[10px] text-slate-400 mt-0.5">${grp[0].Notes||''}</div></td><td class="py-3 px-3 text-right text-emerald-600 font-bold">${lDr > 0 ? fmtIdr(lDr) : '-'}</td><td class="py-3 px-3 text-right text-rose-600 font-bold">${lCr > 0 ? fmtIdr(lCr) : '-'}</td><td class="py-3 px-3 text-right font-bold text-slate-800 text-sm">${fmtIdr(bal)}</td></tr>`;
            });
        } else {
            grp.forEach(t => { if(t.AccountID === accId) { if(t.Type == 1) dr += Math.abs(parseFloat(t.Amount)); if(t.Type == 2) cr += Math.abs(parseFloat(t.Amount)); } });
            bal += (dr - cr);
            rowsHtml += `<tr class="border-b border-slate-100 hover:bg-slate-50 text-xs"><td class="py-3 px-3 whitespace-nowrap text-[10px] text-slate-500">${grp[0].Date}</td><td class="py-3 px-3 text-slate-700 font-medium whitespace-normal leading-tight"><div class="font-bold">Multiple / Complex Entry</div><div class="text-[10px] text-slate-400 mt-0.5">${grp[0].Notes||''}</div></td><td class="py-3 px-3 text-right text-emerald-600 font-bold">${dr > 0 ? fmtIdr(dr) : '-'}</td><td class="py-3 px-3 text-right text-rose-600 font-bold">${cr > 0 ? fmtIdr(cr) : '-'}</td><td class="py-3 px-3 text-right font-bold text-slate-800 text-sm">${fmtIdr(bal)}</td></tr>`;
        }
    });
    document.getElementById('report-container').innerHTML = `
    <div class="mb-4 flex items-center justify-between"><h3 class="font-black text-slate-700 uppercase tracking-wider text-sm"><i class="fas fa-file-invoice mr-2 text-indigo-500"></i> Statement: ${accObj.Name}</h3><span class="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-lg text-xs font-bold shadow-sm">Closing: ${fmtIdr(bal)}</span></div>
    <div class="overflow-x-auto"><table class="w-full text-left min-w-[500px] bg-white rounded-xl shadow-sm border border-slate-100"><thead class="bg-slate-50 border-b border-slate-100 sticky top-0"><tr class="text-[10px] text-slate-500 uppercase tracking-wider"><th class="py-3 px-3">Date</th><th class="py-3 px-3">Particulars / Narration</th><th class="py-3 px-3 text-right">Debit (In)</th><th class="py-3 px-3 text-right">Credit (Out)</th><th class="py-3 px-3 text-right">Balance</th></tr></thead><tbody>${rowsHtml || '<tr><td colspan="5" class="py-8 text-center text-slate-400">No transactions recorded in this period.</td></tr>'}</tbody></table></div>`;
}

function renderAdvanceStatement(memId, fromDate, toDate) {
    const memObj = appData.Members.find(m=>m.ID===memId);
    let opBal = 0, bal = 0, rowsHtml = '';
    
    if (fromDate) {
        appData.Ledger.filter(t => t.MemberID === memId && t.Date < fromDate && appData.Categories.find(c=>c.ID===t.CategoryID)?.Type === 'Liability').forEach(t => { opBal += (t.Type == 2 ? Math.abs(t.Amount) : -Math.abs(t.Amount)); });
        bal = opBal;
        rowsHtml += `<tr class="bg-amber-50/50 text-xs font-bold border-b border-amber-100"><td class="py-3 px-4">${fromDate}</td><td class="py-3 px-4 text-amber-700" colspan="3">Opening Balance Brought Forward</td><td class="py-3 px-4 text-right text-amber-700 text-sm">${fmtIdr(opBal)}</td></tr>`;
    }

    appData.Ledger.filter(t => t.MemberID === memId && (!fromDate || t.Date >= fromDate) && (!toDate || t.Date <= toDate) && appData.Categories.find(c=>c.ID===t.CategoryID)?.Type === 'Liability').sort((a,b) => new Date(a.Date) - new Date(b[0].Date)).forEach(t => {
        const amt = Math.abs(parseFloat(t.Amount)) || 0; let advanceGenerated = 0, advanceRepaid = 0;
        if(t.Type == 2) { bal += amt; advanceGenerated = amt; } if(t.Type == 1) { bal -= amt; advanceRepaid = amt; }
        const ev = appData.Events.find(e=>e.ID===t.EventID)?.Name || '', ref = [ev, t.Notes].filter(x=>x).join(' | ');
        rowsHtml += `<tr class="border-b border-slate-100 hover:bg-slate-50 text-xs"><td class="py-3 px-4 whitespace-nowrap">${t.Date}</td><td class="py-3 px-4 text-slate-600 truncate max-w-xs" title="${ref}">${ref}</td><td class="py-3 px-4 text-right text-amber-600 font-bold">${advanceGenerated !== 0 ? fmtIdr(advanceGenerated) : '-'}</td><td class="py-3 px-4 text-right text-emerald-600 font-bold">${advanceRepaid !== 0 ? fmtIdr(advanceRepaid) : '-'}</td><td class="py-3 px-4 text-right font-bold text-slate-700">${fmtIdr(bal)}</td></tr>`;
    });
    
    document.getElementById('report-container').innerHTML = `
    <div class="mb-4 flex items-center justify-between"><h3 class="font-black text-slate-700 uppercase tracking-wider text-sm"><i class="fas fa-handshake mr-2 text-amber-500"></i> Advances: ${memObj.Name}</h3><span class="bg-amber-50 text-amber-700 px-3 py-1 rounded-lg text-xs font-bold shadow-sm">Closing Payable: ${fmtIdr(bal)}</span></div>
    <div class="overflow-x-auto"><table class="w-full text-left min-w-[600px] bg-white rounded-xl shadow-sm border border-slate-100"><thead class="bg-slate-50 border-b border-slate-100 sticky top-0"><tr class="text-[10px] text-slate-500 uppercase tracking-wider"><th class="py-3 px-4">Date</th><th class="py-3 px-4">Particulars</th><th class="py-3 px-4 text-right">Advance Issued (Cr)</th><th class="py-3 px-4 text-right">Set-off / Repaid (Dr)</th><th class="py-3 px-4 text-right">Net Balance</th></tr></thead><tbody>${rowsHtml || '<tr><td colspan="5" class="py-8 text-center text-slate-400">No liability/advance records in this period.</td></tr>'}</tbody></table></div>`;
}

// --- MASTER DATA & AUDIT ---
function renderMasterData() {
    document.getElementById('list-accounts').innerHTML = appData.Accounts.map(a => `<li class="py-2 text-sm flex justify-between"><span>${a.Name}</span><span class="text-[10px] bg-slate-100 px-2 py-0.5 rounded">${a.Type==2?'Bank':'Cash'}</span></li>`).join('');
    document.getElementById('list-categories').innerHTML = appData.Categories.map(c => `<li class="py-2 text-sm flex justify-between"><span>${c.Name}</span><span class="text-[10px] ${c.Type==='Income'?'bg-emerald-50 text-emerald-600':(c.Type==='Expense'?'bg-rose-50 text-rose-600':(c.Type==='Liability'?'bg-amber-50 text-amber-600':'bg-indigo-50 text-indigo-600'))} px-2 py-0.5 rounded font-bold">${c.Type}</span></li>`).join('');
    document.getElementById('list-events').innerHTML = appData.Events.map(e => `<li class="py-2 text-sm flex justify-between"><span>${e.Name}</span><span class="text-[10px] text-slate-400 font-mono">${e.Date}</span></li>`).join('');
    if (document.getElementById('list-configs')) { document.getElementById('list-configs').innerHTML = (appData.MemberConfig || []).map(c => `<li class="py-2 text-sm flex justify-between"><span>${c.Label}</span><span class="text-[10px] text-slate-400 font-mono">${c.Type}</span></li>`).join(''); }
}
function renderAudit() {
    const tbody = document.getElementById('audit-tbody'); if (!tbody) return;
    tbody.innerHTML = [...(appData.AuditLog || [])].reverse().map((a) => { const b64Details = btoa(unescape(encodeURIComponent(a.Details || '{}'))); return `<tr class="hover:bg-slate-50 transition-colors cursor-pointer" onclick="showDetailsModal('Audit Record: ${a.Action}', '${b64Details}')"><td class="px-6 py-4 text-xs text-slate-500">${new Date(a.Timestamp).toLocaleString()}</td><td class="px-6 py-4 font-bold text-indigo-600 text-xs">${a.Action}</td><td class="px-6 py-4 text-slate-600 text-xs">${a.User}</td><td class="px-6 py-4 text-slate-600 text-xs">${a.TableName}</td><td class="px-6 py-4 text-slate-400 text-xs font-mono">${a.RecordID} <i class="fas fa-search ml-2 text-slate-300"></i></td></tr>`; }).join('') || `<tr><td colspan="5" class="text-center py-8 text-slate-400">Audit log empty.</td></tr>`;
}

window.addEventListener('DOMContentLoaded', () => loadAllData(false));
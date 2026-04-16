// Remove Supabase
// Initialize Firebase variables
let firestoreDb;
let collection, addDoc, getDocs, getDoc, setDoc, doc, onSnapshot, query, orderBy, updateDoc, where, deleteDoc;
let auth, signInWithEmailAndPassword, onAuthStateChanged, signOut;

function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return String(unsafe)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Wait for module script to load
const firebaseInitInterval = setInterval(() => {
    if (window.db && window.firebaseImports) {
        firestoreDb = window.db;
        ({ collection, addDoc, getDocs, getDoc, setDoc, doc, onSnapshot, query, orderBy, updateDoc, where, auth, signInWithEmailAndPassword, onAuthStateChanged, signOut, deleteDoc } = window.firebaseImports);
        clearInterval(firebaseInitInterval);
        console.log('Firebase initialized in standard script.');

        if (sessionStorage.getItem('master_unlocked') === 'true') {
            document.getElementById("pinVerificationArea").style.display = "none";
            document.getElementById("otpVerificationArea").style.display = "none";
            document.getElementById("logsDataArea").style.display = "block";
            loadActivityLogs();
            loadStaffList();
            recordAndShowLogsAccess(false); // just display without writing a duplicate on refresh
        }
    }
}, 100);
let guests = [];
let attendance = [];
let hotelBookingsList = [];
let currentScanDay = 'day1';
let videoStream = null;
let scanActive = false;
let canvasElement = null;
let canvasContext = null;
let lastScanTime = 0;
const SCAN_COOLDOWN = 3000;
let currentGuestFilter = 'all';
let searchQuery = '';
let currentStaffName = "Unknown Staff";
let currentStaffPerms = {};

// IP & Activity Logging
let currentUserIP = "Unknown IP";
fetch("https://api.ipify.org?format=json")
    .then(res => res.json())
    .then(data => currentUserIP = data.ip)
    .catch(err => console.error("Could not fetch IP:", err));

let generatedOTP = "";
let masterSettings = { pin: "", email: "" };

async function logAdminActivity(action, details, overrideUser = null) {
    if (!isFirebaseReady()) return;
    try {
        const logUser = overrideUser ? overrideUser : (currentStaffName || "Unknown");
        await addDoc(collection(firestoreDb, 'activity_logs'), {
            action: action,
            user: logUser,
            details: details,
            ip_address: currentUserIP,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error("Error logging activity: ", error);
    }
}

// ========== STAFF ID GENERATOR ==========
function generateStaffId() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No confusing 0/O, 1/I
    let id = 'STF-';
    for (let i = 0; i < 6; i++) {
        id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
}

// ========== LOGIN HISTORY (separate from activity_logs) ==========
let currentStaffId = "";
let allLoginHistory = [];
let loginHistoryUnsubscribe = null;

async function saveLoginHistory() {
    if (!isFirebaseReady()) return;
    try {
        const role = currentStaffName === 'Master Admin' ? 'Master Admin' : 'Staff';
        await addDoc(collection(firestoreDb, 'login_history'), {
            user: currentStaffName,
            staff_id: currentStaffId || 'MASTER',
            role: role,
            ip_address: currentUserIP,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error("Error saving login history: ", error);
    }
}

async function loadAndShowLastVisit() {
    if (!isFirebaseReady()) return;
    try {
        const histRef = collection(firestoreDb, 'login_history');
        const q = query(histRef, where('user', '==', currentStaffName));
        const snapshot = await getDocs(q);

        // Sort in JavaScript to avoid Firestore composite index requirement
        const docs = snapshot.docs.sort((a, b) => {
            const timeA = new Date(a.data().timestamp).getTime();
            const timeB = new Date(b.data().timestamp).getTime();
            return timeB - timeA; // descending
        });

        // docs[0] = current login (just saved), docs[1+] = previous sessions
        if (docs.length >= 2) {
            const prevTs = docs[1].data().timestamp;
            showLastVisitBadge(prevTs);
            localStorage.setItem('adminCachedLastVisitTs', prevTs);

            // Populate the collapsible history list (skip docs[0] = current session)
            const historyList = document.getElementById('loginHistoryList');
            const toggleWrap = document.getElementById('loginHistoryToggleWrap');
            if (historyList && toggleWrap) {
                const entries = docs.slice(1); // all previous sessions
                historyList.innerHTML = entries.map((d, i) => {
                    const data = d.data();
                    const dt = new Date(data.timestamp);
                    const date = dt.toLocaleDateString('en-GB');
                    // Format time in 12-hour format (e.g. 11:30 PM)
                    const time = dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
                    const isLatest = i === 0;
                    return `<div style="padding:3px 0; border-bottom:1px solid #eee; display:flex; justify-content:flex-start; align-items:center; gap:6px;">
                        <span>${isLatest ? '🔷' : '•'} <b>${date}</b> at ${time}</span>
                    </div>`;
                }).join('');
                toggleWrap.style.display = 'block';
                localStorage.setItem('adminCachedLoginHistoryHtml', historyList.innerHTML);
            }
        } else {
            // Show badge but with 'No previous visit'
            const badge = document.getElementById('sidebarLastVisitBadge');
            const text = document.getElementById('sidebarLastVisitText');
            if (badge && text) {
                text.textContent = 'No previous visit';
                badge.style.display = 'block';
            }
            localStorage.removeItem('adminCachedLastVisitTs');
            localStorage.removeItem('adminCachedLoginHistoryHtml');
        }
    } catch (error) {
        console.error("Error loading last visit: ", error);
    }
}

function toggleLoginHistory() {
    const list = document.getElementById('loginHistoryList');
    const toggle = document.getElementById('loginHistoryToggle');
    if (!list || !toggle) return;
    const isOpen = list.style.display !== 'none';
    list.style.display = isOpen ? 'none' : 'block';
    toggle.innerHTML = isOpen
        ? '<i class="fas fa-history"></i> View login history'
        : '<i class="fas fa-history"></i> Hide login history';
}

async function recordAndShowLogsAccess(isNewAccess = true) {
    if (!isFirebaseReady()) return;

    const textSpan = document.getElementById('activityLogAccessText');
    const box = document.getElementById('activityLogAccessBox');
    const toggle = document.getElementById('activityLogHistoryToggle');
    const historyList = document.getElementById('activityLogHistoryList');
    const wrap = document.getElementById('activityLogHistoryWrap');

    try {
        // 1. Fetch the MOST RECENT access to show to the admin
        const accessRef = collection(firestoreDb, 'activity_log_access');
        const q = query(accessRef, orderBy('timestamp', 'desc'));
        const snapshot = await getDocs(q);

        let foundPreviousInfo = false;

        if (!snapshot.empty) {
            // Find the most recent access log
            const docs = snapshot.docs;
            const accessData = docs[0].data();

            const dt = new Date(accessData.timestamp);
            const dateStr = dt.toLocaleDateString('en-GB');
            // Format time in 12-hour format (e.g. 11:30 PM)
            const timeStr = dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

            if (box && textSpan) {
                textSpan.innerHTML = `Logs Area Last Accessed: <b>${dateStr} at ${timeStr}</b> — from IP: <b style="font-family:monospace;">${accessData.ip_address || 'Unknown'}</b>`;
                box.style.display = 'flex';
                foundPreviousInfo = true;
            }

            // Populate previous history dropdown if there are more records
            if (docs.length > 1 && historyList && toggle) {
                let historyHtml = '';
                for (let i = 1; i < docs.length; i++) {
                    const hd = docs[i].data();
                    const hdt = new Date(hd.timestamp);
                    const hDate = hdt.toLocaleDateString('en-GB');
                    const hTime = hdt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
                    historyHtml += `<div style="padding:6px 0; border-bottom:1px solid #eee; display:flex; justify-content:space-between;">
                        <span>• <b>${hDate}</b> at ${hTime}</span>
                        <span style="font-family:monospace; color:#856404;">IP: ${hd.ip_address || 'Unknown'}</span>
                    </div>`;
                }
                historyList.innerHTML = historyHtml;
                toggle.style.display = 'inline-block';
            }
        }

        if (!foundPreviousInfo && box && textSpan) {
            textSpan.innerHTML = `Logs Area Last Accessed: <b>No previous access recorded.</b>`;
            box.style.display = 'flex';
        }

        // 2. Save THIS current access so the *next* person sees it
        if (isNewAccess) {
            await addDoc(collection(firestoreDb, 'activity_log_access'), {
                ip_address: currentUserIP,
                timestamp: new Date().toISOString()
            });
        }

    } catch (error) {
        console.error("Error with activity log access marker:", error);
    }
}

function toggleActivityLogHistory() {
    const wrap = document.getElementById('activityLogHistoryWrap');
    const toggle = document.getElementById('activityLogHistoryToggle');
    if (!wrap || !toggle) return;

    if (wrap.style.display === 'none') {
        wrap.style.display = 'block';
        toggle.innerHTML = '<i class="fas fa-history"></i> Hide History';
    } else {
        wrap.style.display = 'none';
        toggle.innerHTML = '<i class="fas fa-history"></i> View History';
    }
}

function showLastVisitBadge(isoTimestamp) {
    const badge = document.getElementById('sidebarLastVisitBadge');
    const text = document.getElementById('sidebarLastVisitText');
    if (!badge || !text) return;

    const d = new Date(isoTimestamp);
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const dayName = days[d.getDay()];

    // Format time in 12-hour format (e.g. 11:30 PM)
    const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

    text.textContent = `Last Visit: ${dd}-${mm}-${yyyy} ${dayName} at ${timeStr}`;
    badge.style.display = 'block';
}

function showStaffIdBadge(staffId) {
    const badge = document.getElementById('sidebarStaffIdBadge');
    const text = document.getElementById('sidebarStaffIdText');
    if (!badge || !text) return;
    if (staffId && staffId !== 'MASTER') {
        text.textContent = staffId;
        badge.style.display = 'block';
    } else {
        badge.style.display = 'none';
    }
}

function loadLoginHistory() {
    try {
        if (loginHistoryUnsubscribe) loginHistoryUnsubscribe();
        const histRef = collection(firestoreDb, 'login_history');
        const q = query(histRef, orderBy('timestamp', 'desc'));
        loginHistoryUnsubscribe = onSnapshot(q, (snapshot) => {
            allLoginHistory = [];
            const uniqueUsers = new Set();
            snapshot.forEach(docSnap => {
                const data = docSnap.data();
                allLoginHistory.push(data);
                if (data.user) uniqueUsers.add(data.user);
            });
            updateLoginHistoryDropdown(uniqueUsers);
            renderLoginHistory();
        }, (error) => {
            if (error.code !== 'permission-denied') {
                console.error('Error loading login history', error);
            }
        });
    } catch (error) {
        console.error('Error loading login history', error);
    }
}

function updateLoginHistoryDropdown(uniqueUsers) {
    const dropdown = document.getElementById('loginHistoryUserFilter');
    if (!dropdown) return;
    const currentVal = dropdown.value;
    dropdown.innerHTML = '<option value="all">All Users</option>';
    Array.from(uniqueUsers).sort((a, b) => a.localeCompare(b)).forEach(user => {
        const opt = document.createElement('option');
        opt.value = user;
        opt.textContent = user;
        if (user === currentVal) opt.selected = true;
        dropdown.appendChild(opt);
    });
}

function renderLoginHistory() {
    const tbody = document.getElementById('loginHistoryTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    const dropdown = document.getElementById('loginHistoryUserFilter');
    const filterVal = dropdown ? dropdown.value : 'all';
    const filtered = filterVal === 'all' ? allLoginHistory
        : allLoginHistory.filter(l => l.user === filterVal);

    filtered.forEach(data => {
        const tr = document.createElement('tr');
        const roleBadgeClass = data.role === 'Master Admin' ? 'role-badge-master' : 'role-badge-staff';
        tr.innerHTML = `
                    <td style="white-space:nowrap;">${new Date(data.timestamp).toLocaleString()}</td>
                    <td style="font-weight:bold;">${escapeHtml(data.user) || 'Unknown'}</td>
                    <td style="font-family:monospace; color: var(--primary);">${escapeHtml(data.staff_id) || '-'}</td>
                    <td><span class="${roleBadgeClass}">${escapeHtml(data.role) || '-'}</span></td>
                    <td style="font-family:monospace; background:#f8f9fa; padding:5px; white-space:nowrap;">${escapeHtml(data.ip_address) || '-'}</td>
                `;
        tbody.appendChild(tr);
    });

    if (filtered.length === 0) {
        tbody.innerHTML = "<tr><td colspan='5' style='text-align:center;'>No login history yet.</td></tr>";
    }
}

async function verifyMasterPin() {
    const enteredPin = document.getElementById("masterPinInput").value.trim();
    if (!enteredPin) { alert("Please enter the PIN"); return; }

    // Show loading
    document.getElementById("masterPinInput").disabled = true;

    try {
        const docSnap = await getDoc(doc(firestoreDb, 'settings', 'admin'));
        if (docSnap.exists()) {
            const data = docSnap.data();
            masterSettings.pin = data.master_pin;
            masterSettings.email = data.master_email;

            if (!masterSettings.pin || !masterSettings.email) {
                alert("Master PIN and Email are not configured in the Firebase Database yet.");
                document.getElementById("masterPinInput").disabled = false;
                return;
            }

            if (enteredPin === masterSettings.pin) {
                // PIN matched! Generate OTP.
                generatedOTP = Math.floor(100000 + Math.random() * 900000).toString();

                // Send Email using EmailJS
                const templateParams = {
                    email: masterSettings.email,
                    to_name: 'Master Admin',
                    rsvp_id: 'SYSTEM',
                    phone: 'Security',
                    additional_guests: 0,
                    events_attending: 'System Security Action',
                    qr_code_url: '',
                    user_message: `<br><br><strong style="color: #d9534f; font-size: 20px;">SECURITY ALERT:</strong><br><br>Someone has successfully entered the Master PIN and is attempting to access the Activity Logs from IP: ${currentUserIP}.<br><br>Your verification code is:<br><div style="text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #d9534f; margin: 20px 0; border: 2px dashed #ccc; padding: 15px;">${generatedOTP}</div>`
                };

                await emailjs.send('service_tdfv5cn', 'template_d0w0asc', templateParams);

                document.getElementById("pinVerificationArea").style.display = "none";
                document.getElementById("otpVerificationArea").style.display = "block";
                alert("PIN accepted! A 6-digit verification code has been successfully sent to your Master Email.");
            } else {
                alert("Incorrect PIN.");
            }
        } else {
            alert("Settings doc not found in Firebase.");
        }
    } catch (error) {
        console.error("Verification error:", error);
        let errorMsg = error;
        let isNetworkError = false;

        if (typeof error === 'object' && error !== null) {
            if (error.status === 0) {
                isNetworkError = true;
            }
            errorMsg = error.text || error.message || JSON.stringify(error) || "Unknown error object";
        }

        if (isNetworkError || String(errorMsg).includes("ERR_CONNECTION_RESET") || String(errorMsg).includes("Failed to fetch") || String(errorMsg).includes("Network Error")) {
            alert("Network Error: Could not reach the email server (Connection Reset).\nPlease check your internet connection, disable adblockers/VPNs temporarily, or try another network.");
        } else {
            alert("Verification failed: " + errorMsg);
        }
    }

    document.getElementById("masterPinInput").disabled = false;
}

function verifyMasterOTP() {
    const enteredOtp = document.getElementById("masterOtpInput").value.trim();
    if (enteredOtp === generatedOTP) {
        sessionStorage.setItem('master_unlocked', 'true');
        document.getElementById("otpVerificationArea").style.display = "none";
        document.getElementById("logsDataArea").style.display = "block";
        loadActivityLogs();
        loadStaffList();
        recordAndShowLogsAccess(true); // brand new unlock, so write a new log
    } else {
        alert("Incorrect OTP. Please try again.");
    }
}

let activityLogsUnsubscribe = null;
let allActivityLogs = []; // Stores the latest raw logs from firebase

function loadActivityLogs() {
    try {
        if (activityLogsUnsubscribe) {
            activityLogsUnsubscribe();
        }

        const logsRef = collection(firestoreDb, 'activity_logs');
        const q = query(logsRef, orderBy('timestamp', 'desc'));

        activityLogsUnsubscribe = onSnapshot(q, (snapshot) => {
            allActivityLogs = [];
            const uniqueUsers = new Set();

            snapshot.forEach(docSnap => {
                const data = docSnap.data();
                allActivityLogs.push(data);
                if (data.user) {
                    uniqueUsers.add(data.user);
                }
            });

            updateLogUserDropdown(uniqueUsers);
            renderActivityLogs();

        }, (error) => {
            if (error.code !== 'permission-denied') {
                console.error('Error setting up logs listener', error);
                alert("Failed to setup realtime logs. Error connecting to database.");
            }
        });
    } catch (error) {
        console.error("Error setting up logs listener", error);
    }
}

function updateLogUserDropdown(uniqueUsers) {
    const dropdown = document.getElementById("logUserFilter");
    if (!dropdown) return;

    const currentValue = dropdown.value; // Remember the selection
    dropdown.innerHTML = '<option value="all">All Staff</option>';

    Array.from(uniqueUsers).sort((a, b) => a.localeCompare(b)).forEach(user => {
        const option = document.createElement("option");
        option.value = user;
        option.textContent = user;
        if (user === currentValue) {
            option.selected = true;
        }
        dropdown.appendChild(option);
    });
}

function renderActivityLogs() {
    const tbody = document.getElementById("activityLogsTableBody");
    if (!tbody) return;
    tbody.innerHTML = "";

    const dropdown = document.getElementById("logUserFilter");
    const filterValue = dropdown ? dropdown.value : "all";

    const filteredLogs = filterValue === "all"
        ? allActivityLogs
        : allActivityLogs.filter(log => log.user === filterValue);

    filteredLogs.forEach(data => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
                    <td style="white-space: nowrap;">${new Date(data.timestamp).toLocaleString()}</td>
                    <td style="white-space: nowrap; color: var(--primary);"><strong>${escapeHtml(data.action)}</strong></td>
                    <td style="white-space: nowrap; font-weight: bold;">${escapeHtml(data.user) || 'Unknown'}</td>
                    <td>${escapeHtml(data.details) || ''}</td>
                    <td style="white-space: nowrap; font-family: monospace; background: #f8f9fa; padding: 5px;">${escapeHtml(data.ip_address)}</td>
                `;
        tbody.appendChild(tr);
    });

    if (filteredLogs.length === 0) {
        tbody.innerHTML = "<tr><td colspan='5' style='text-align:center;'>No activity logged yet (or none match filter).</td></tr>";
    }
}

// ========== STAFF MANAGEMENT ==========
async function loadStaffList() {
    try {
        const staffRef = collection(firestoreDb, 'staff_pins');
        const snapshot = await getDocs(staffRef);
        const tbody = document.getElementById("staffListTableBody");
        tbody.innerHTML = "";

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const perms = data.permissions || { guestlist: true, attendance: true, reports: true, editguest: false };
            const staffId = data.staff_id || 'N/A';
            const tr = document.createElement("tr");
            tr.innerHTML = `
                        <td style="font-family:monospace; color:var(--primary); font-weight:bold;">${escapeHtml(staffId)}</td>
                        <td><strong>${escapeHtml(data.name)}</strong></td>
                        <td style="font-family: monospace;">${escapeHtml(data.email) || 'N/A'}</td>
                        <td style="font-size: 0.85rem; line-height: 1.8;">
                            <label><input type="checkbox" onchange="updateStaffPermission('${docSnap.id}', 'guestlist', this.checked)" ${perms.guestlist ? 'checked' : ''}> Guest List</label><br>
                            <label><input type="checkbox" onchange="updateStaffPermission('${docSnap.id}', 'attendance', this.checked)" ${perms.attendance ? 'checked' : ''}> Attendance</label><br>
                            <label><input type="checkbox" onchange="updateStaffPermission('${docSnap.id}', 'reports', this.checked)" ${perms.reports ? 'checked' : ''}> Reports</label><br>
                            <label><input type="checkbox" onchange="updateStaffPermission('${docSnap.id}', 'editguest', this.checked)" ${perms.editguest ? 'checked' : ''}> Edit Guests</label>
                        </td>
                        <td>
                            <button onclick="deleteStaff('${docSnap.id}', '${escapeHtml(data.name)}')" style="background: var(--danger); color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer;">
                                <i class="fas fa-trash"></i> Delete
                            </button>
                        </td>
                    `;
            tbody.appendChild(tr);
        });

        if (snapshot.empty) {
            tbody.innerHTML = "<tr><td colspan='5' style='text-align:center;'>No staff pins created yet.</td></tr>";
        }
    } catch (error) {
        if (error.code !== 'permission-denied') {
            console.error("Error loading staff", error);
        }
    }
}

async function updateStaffPermission(id, field, value) {
    try {
        const staffDocRef = doc(firestoreDb, 'staff_pins', id);
        await updateDoc(staffDocRef, {
            [`permissions.${field}`]: value
        });
    } catch (error) {
        console.error("Error updating permission", error);
        alert("Failed to update staff permission.");
        loadStaffList(); // Revert checkbox visually
    }
}

async function saveNewStaff() {
    const name = document.getElementById("newStaffName").value.trim();
    const email = document.getElementById("newStaffEmail").value.trim().toLowerCase();
    const password = document.getElementById("newStaffPassword").value;

    const p_guestlist = document.getElementById("perm_guestlist").checked;
    const p_attendance = document.getElementById("perm_attendance").checked;
    const p_reports = document.getElementById("perm_reports").checked;
    const p_editguest = document.getElementById("perm_editguest").checked;

    if (!name || !email || !password) {
        alert("Please enter Name, Email, and Password.");
        return;
    }

    try {
        // Secondary auth instance to create secure account without logging Master Admin out
        const secondaryApp = window.firebaseImports.initializeApp(window.firebaseImports.firebaseConfig, "Secondary");
        const secondaryAuth = window.firebaseImports.getAuth(secondaryApp);

        let userCreated = false;
        try {
            await window.firebaseImports.createUserWithEmailAndPassword(secondaryAuth, email, password);
            userCreated = true;
        } catch (authErr) {
            if (authErr.code === 'auth/email-already-in-use') {
                const confirmLink = confirm("A staff account with this email already exists in Firebase Auth. Would you like to restore their access and link it to this new profile?");
                if (!confirmLink) {
                    return; // User cancelled
                }
                // Proceed to create the document in Firestore
            } else {
                throw authErr;
            }
        }

        if (userCreated) {
            await window.firebaseImports.signOut(secondaryAuth);
        }

        // Auto-generate unique Staff ID
        const newStaffId = generateStaffId();

        await addDoc(collection(firestoreDb, 'staff_pins'), {
            name: name,
            email: email,
            staff_id: newStaffId,
            permissions: {
                guestlist: p_guestlist,
                attendance: p_attendance,
                reports: p_reports,
                editguest: p_editguest
            },
            created_at: new Date().toISOString()
        });

        document.getElementById("newStaffName").value = '';
        document.getElementById("newStaffEmail").value = '';
        document.getElementById("newStaffPassword").value = '';

        loadStaffList();
        alert(`Staff member '${name}' added successfully!\nStaff ID: ${newStaffId}`);
        logAdminActivity("Added Staff", `Created/Restored account for staff: ${name} (ID: ${newStaffId})`);
    } catch (error) {
        console.error("Error saving staff:", error);
        alert("Failed to save staff. Error: " + error.message);
    }
}

async function deleteStaff(id, name) {
    if (confirm(`Are you sure you want to delete staff member '${name}'?`)) {
        try {
            await deleteDoc(doc(firestoreDb, 'staff_pins', id));
            loadStaffList();
            logAdminActivity("Deleted Staff", `Removed staff member: ${name}`);

            // If the logged-in staff is the one being deleted, log them out
            if (currentStaffName === name) {
                alert("Your staff account has been deleted. You will now be logged out. (Note: Firebase Auth User must be deleted manually in console)");
                logout();
            }
        } catch (error) {
            console.error("Error deleting staff", error);
            alert("Failed to delete staff.");
        }
    }
}

// RSVP System Settings
let RSVP_SETTINGS = {
    enabled: true,
    disabledMessage: 'Thank you for your interest! The RSVP period has now closed. If you have any questions, please contact us directly.'
};

// Current tab state
let CURRENT_TAB = 'scanner';

// ========== FIREBASE INITIALIZATION ==========
function isFirebaseReady() {
    return typeof firestoreDb !== 'undefined' && typeof collection === 'function' && typeof where === 'function' && typeof auth !== 'undefined';
}

// ========== TAB MANAGEMENT ==========
function saveTabState(tabName) {
    localStorage.setItem('weddingAdminCurrentTab', tabName);
}

function restoreTabState() {
    let savedTab = localStorage.getItem('weddingAdminCurrentTab');

    // Restrict staff access to certain tabs on refresh
    if (currentStaffName !== 'Master Admin' && (savedTab === 'settings' || savedTab === 'logs' || savedTab === 'bookings')) {
        savedTab = 'scanner';
    }

    // Always hide all tabs and remove active class from links first
    document.querySelectorAll('.content-section').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.nav-links a').forEach(link => {
        link.classList.remove('active');
    });

    if (savedTab && document.getElementById(savedTab)) {
        CURRENT_TAB = savedTab;

        // Show saved tab
        document.getElementById(CURRENT_TAB).classList.add('active');

        // Activate corresponding nav link
        document.querySelectorAll('.nav-links a').forEach(link => {
            if (link.getAttribute('data-tab') === CURRENT_TAB) {
                link.classList.add('active');
            }
        });

        if (CURRENT_TAB !== 'scanner') {
            stopScanner();
        }

        console.log('Restored tab:', CURRENT_TAB);
    } else {
        // Default to scanner tab
        CURRENT_TAB = 'scanner';
        document.getElementById('scanner').classList.add('active');

        const scannerLink = document.querySelector('.nav-links a[data-tab="scanner"]');
        if (scannerLink) scannerLink.classList.add('active');

        saveTabState('scanner');
    }
}

function openTab(tabName) {
    // Restrict staff access
    if (currentStaffName !== 'Master Admin' && (tabName === 'settings' || tabName === 'logs' || tabName === 'bookings')) {
        // Return silently since the buttons are hidden anyway
        return;
    }

    CURRENT_TAB = tabName;

    // Hide all tabs
    document.querySelectorAll('.content-section').forEach(tab => {
        tab.classList.remove('active');
    });

    // Remove active from all nav links
    document.querySelectorAll('.nav-links a').forEach(link => {
        link.classList.remove('active');
    });

    // Show selected tab
    document.getElementById(tabName).classList.add('active');

    // Activate clicked nav link
    event.currentTarget.classList.add('active');

    // Save tab state
    saveTabState(tabName);

    if (tabName !== 'scanner') {
        stopScanner();
    }
}

function setupTabListeners() {
    document.querySelectorAll('.nav-links a[data-tab]').forEach(link => {
        link.addEventListener('click', function (e) {
            e.preventDefault();
            const tabName = this.getAttribute('data-tab');
            openTab(tabName);
        });
    });
}

// ========== CATERING HEADCOUNT FUNCTIONS ==========
function calculateCateringTotals(guests) {
    let day1Total = 0, day2Total = 0, day3Total = 0;
    let day1Primary = 0, day1Additional = 0;
    let day2Primary = 0, day2Additional = 0;
    let day3Primary = 0, day3Additional = 0;

    guests.forEach(guest => {
        if (guest.is_attending) {
            const additionalCount = guest.guests ? guest.guests.length : 0;
            const totalGuests = 1 + additionalCount;

            if (guest.days_attending?.includes('day1')) {
                day1Total += totalGuests;
                day1Primary += 1;
                day1Additional += additionalCount;
            }
            if (guest.days_attending?.includes('day2')) {
                day2Total += totalGuests;
                day2Primary += 1;
                day2Additional += additionalCount;
            }
            if (guest.days_attending?.includes('day3')) {
                day3Total += totalGuests;
                day3Primary += 1;
                day3Additional += additionalCount;
            }
        }
    });

    return {
        day1: { total: day1Total, primary: day1Primary, additional: day1Additional },
        day2: { total: day2Total, primary: day2Primary, additional: day2Additional },
        day3: { total: day3Total, primary: day3Primary, additional: day3Additional }
    };
}

function exportCateringData() {
    const cateringTotals = calculateCateringTotals(guests);

    let csv = 'Event Day,Total Guests,Primary Guests,Additional Guests\n';
    csv += `Day 1 - Welcome Dinner,${cateringTotals.day1.total},${cateringTotals.day1.primary},${cateringTotals.day1.additional}\n`;
    csv += `Day 2 - Wedding Day,${cateringTotals.day2.total},${cateringTotals.day2.primary},${cateringTotals.day2.additional}\n`;
    csv += `Day 3 - Farewell Brunch,${cateringTotals.day3.total},${cateringTotals.day3.primary},${cateringTotals.day3.additional}\n`;

    downloadCSV(csv, 'wedding_catering_headcount.csv');
}

// ========== SEARCH FUNCTIONALITY ==========
function setupSearch() {
    const searchInput = document.getElementById('guestSearch');
    searchInput.addEventListener('input', function (e) {
        searchQuery = e.target.value.toLowerCase().trim();
        filterAndDisplayGuests();
    });
}

function clearSearch() {
    document.getElementById('guestSearch').value = '';
    searchQuery = '';
    filterAndDisplayGuests();
}

function filterAndDisplayGuests() {
    let filteredGuests = guests;

    if (currentGuestFilter === 'attending') {
        filteredGuests = filteredGuests.filter(g => g.is_attending);
    } else if (currentGuestFilter === 'not-attending') {
        filteredGuests = filteredGuests.filter(g => !g.is_attending);
    }

    if (searchQuery) {
        filteredGuests = filteredGuests.filter(guest => {
            const fullName = `${guest.first_name} ${guest.last_name}`.toLowerCase();
            const email = guest.email ? guest.email.toLowerCase() : '';
            const rsvpId = guest.rsvp_id ? guest.rsvp_id.toLowerCase() : '';
            const phone = guest.phone ? guest.phone.toLowerCase() : '';

            return fullName.includes(searchQuery) ||
                email.includes(searchQuery) ||
                rsvpId.includes(searchQuery) ||
                phone.includes(searchQuery);
        });
    }

    const searchResults = document.getElementById('searchResults');
    if (searchQuery) {
        searchResults.textContent = `Found ${filteredGuests.length} guest(s) matching "${searchQuery}"`;
    } else {
        searchResults.textContent = `Showing all ${filteredGuests.length} guest(s)`;
    }

    displayGuestsTable(filteredGuests);
}

function displayGuestsTable(filteredGuests) {
    const tbody = document.getElementById('guestsTableBody');
    tbody.innerHTML = '';

    filteredGuests.forEach(guest => {
        const guestAttendance = attendance.filter(a => a.rsvp_id === guest.rsvp_id);
        const checkedInDays = [...new Set(guestAttendance.map(a => a.day))];

        const isAttendingDay1 = guest.days_attending && guest.days_attending.includes('day1');
        const isAttendingDay2 = guest.days_attending && guest.days_attending.includes('day2');
        const isAttendingDay3 = guest.days_attending && guest.days_attending.includes('day3');

        const day1Checked = !isAttendingDay1 ? '-' : (checkedInDays.includes('day1') ? '✓' : '');
        const day2Checked = !isAttendingDay2 ? '-' : (checkedInDays.includes('day2') ? '✓' : '');
        const day3Checked = !isAttendingDay3 ? '-' : (checkedInDays.includes('day3') ? '✓' : '');

        const additionalGuestsCount = guest.guests ? guest.guests.length : 0;

        const hasValidEmail = guest.email && guest.email.trim() !== '' && isValidEmail(guest.email);
        const emailDisplay = hasValidEmail ? escapeHtml(guest.email) : `<span class="no-email">No valid email</span>`;

        const attendanceStatus = guest.is_attending ?
            '<span class="attendance-badge attending-badge">Attending</span>' :
            '<span class="attendance-badge not-attending-badge">Not Attending</span>';

        const canEditGuests = (currentStaffName === 'Master Admin') || (currentStaffPerms && currentStaffPerms.editguest);

        const row = document.createElement('tr');
        row.innerHTML = `
                    <td>${escapeHtml(guest.first_name)} ${escapeHtml(guest.last_name)}</td>
                    <td>${emailDisplay}</td>
                    <td>${escapeHtml(guest.phone) || 'N/A'}</td>
                    <td>${attendanceStatus}</td>
                    <td>${guest.days_attending ? guest.days_attending.join(', ') : 'N/A'}</td>
                    <td>${additionalGuestsCount}</td>
                    <td>${guest.message ? `<span title="${escapeHtml(guest.message)}">📝</span>` : 'N/A'}</td>
                    <td style="text-align:center;">${day1Checked}</td>
                    <td style="text-align:center;">${day2Checked}</td>
                    <td style="text-align:center;">${day3Checked}</td>
                    <td class="guest-actions">
                        <div class="action-buttons">
                            ${canEditGuests ? `
                                <button class="btn action-btn edit-btn" onclick="openEditGuestModal('${guest.id}')" style="background-color: #ffc107; color: black; border-color: #ffc107;">
                                    <i class="fas fa-edit"></i> Edit
                                </button>
                            ` : ''}
                            ${guest.is_attending && hasValidEmail ? `
                                <button class="btn action-btn send-single-btn" onclick="sendQRCodeToGuest('${guest.id}')">
                                    <i class="fas fa-paper-plane"></i> Send QR
                                </button>
                            ` : ''}
                            ${guest.is_attending ? `
                                <button class="btn action-btn preview-qr-btn" onclick="showQRPreview('${guest.rsvp_id}')">
                                    <i class="fas fa-eye"></i> Preview
                                </button>
                            ` : ''}
                            ${guest.message ? `
                                <button class="btn action-btn view-message-btn" onclick="viewGuestMessage('${guest.id}')" style="background-color: #6c757d;">
                                    <i class="fas fa-comment"></i> View
                                </button>
                            ` : ''}
                        </div>
                        <div style="margin-top: 5px; font-size: 0.8rem; color: #666; white-space: nowrap;">
                            ID: ${guest.rsvp_id}
                        </div>
                    </td>
                `;
        tbody.appendChild(row);
    });

    loadNotAttendingTable();
}

// ========== MESSAGE MODAL FUNCTIONS ==========
function viewGuestMessage(guestId) {
    const guest = guests.find(g => g.id === guestId);
    if (guest && guest.message) {
        document.getElementById('messageGuestName').textContent = `Message from ${guest.first_name} ${guest.last_name}`;
        document.getElementById('messageContent').textContent = guest.message;
        document.getElementById('messageModal').style.display = 'flex';
    } else {
        alert('No message from this guest.');
    }
}

function closeMessageModal() {
    document.getElementById('messageModal').style.display = 'none';
}

function openEditGuestModal(guestId) {
    const guest = guests.find(g => g.id === guestId);
    if (!guest) return;

    document.getElementById('editGuestId').value = guest.id;
    document.getElementById('editGuestFirstName').value = guest.first_name || '';
    document.getElementById('editGuestLastName').value = guest.last_name || '';
    document.getElementById('editGuestEmail').value = guest.email || '';
    document.getElementById('editGuestPhone').value = guest.phone || '';
    document.getElementById('editGuestAdditional').value = guest.guests ? guest.guests.length : 0;

    const days = guest.days_attending || [];
    document.getElementById('editGuestDay1').checked = days.includes('day1');
    document.getElementById('editGuestDay2').checked = days.includes('day2');
    document.getElementById('editGuestDay3').checked = days.includes('day3');

    document.getElementById('editGuestModal').style.display = 'flex';

    // Store the current guests data globally to reconstruct fields
    window.currentEditingGuest = guest;
    generateEditAdditionalGuestFields();
}

function generateEditAdditionalGuestFields() {
    const countStr = document.getElementById('editGuestAdditional').value;
    let count = countStr ? parseInt(countStr) : 0;
    if (count < 0) {
        count = 0;
        document.getElementById('editGuestAdditional').value = 0;
    }
    if (count > 10) {
        count = 10;
        document.getElementById('editGuestAdditional').value = 10;
    }

    const container = document.getElementById('editAdditionalGuestsContainer');
    container.innerHTML = '';

    const guest = window.currentEditingGuest;
    const existingGuests = (guest && guest.guests) ? guest.guests : [];

    if (count > 0) {
        const title = document.createElement('h5');
        title.textContent = 'Additional Guest Names:';
        title.style.margin = '0 0 5px 0';
        container.appendChild(title);
    }

    for (let i = 0; i < count; i++) {
        const prevGuest = existingGuests[i] || {};

        const div = document.createElement('div');
        div.style.display = 'grid';
        div.style.gridTemplateColumns = '1fr 1fr';
        div.style.gap = '15px';

        div.innerHTML = `
                    <div>
                        <input type="text" id="edit_additional_first_${i}" placeholder="Guest ${i + 1} First Name" class="edit-additional-firstname" value="${escapeHtml(prevGuest.first_name) || ''}" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box;">
                    </div>
                    <div>
                        <input type="text" id="edit_additional_last_${i}" placeholder="Guest ${i + 1} Last Name" class="edit-additional-lastname" value="${escapeHtml(prevGuest.last_name) || ''}" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box;">
                    </div>
                `;
        container.appendChild(div);
    }
}

function closeEditGuestModal() {
    document.getElementById('editGuestModal').style.display = 'none';
}

async function saveEditedGuest() {
    const guestId = document.getElementById('editGuestId').value;
    const guest = guests.find(g => g.id === guestId);
    if (!guest) return;

    const newFirstName = document.getElementById('editGuestFirstName').value.trim();
    const newLastName = document.getElementById('editGuestLastName').value.trim();
    const newEmail = document.getElementById('editGuestEmail').value.trim();
    const newPhone = document.getElementById('editGuestPhone').value.trim();
    const newAdditionalStr = document.getElementById('editGuestAdditional').value;
    const newAdditional = newAdditionalStr ? parseInt(newAdditionalStr) : 0;

    const newDays = [];
    if (document.getElementById('editGuestDay1').checked) newDays.push('day1');
    if (document.getElementById('editGuestDay2').checked) newDays.push('day2');
    if (document.getElementById('editGuestDay3').checked) newDays.push('day3');

    const isAttending = newDays.length > 0;

    let newGuestsArray = [];
    for (let i = 0; i < newAdditional; i++) {
        const fNameField = document.getElementById(`edit_additional_first_${i}`);
        const lNameField = document.getElementById(`edit_additional_last_${i}`);

        const fName = fNameField ? fNameField.value.trim() : "";
        const lName = lNameField ? lNameField.value.trim() : "";

        if (!fName || !lName) {
            alert(`Please fill in both first and last names for Additional Guest ${i + 1}.`);
            return;
        }

        newGuestsArray.push({ first_name: fName, last_name: lName });
    }

    try {
        const guestRef = doc(firestoreDb, 'guests', guestId);
        await updateDoc(guestRef, {
            first_name: newFirstName,
            last_name: newLastName,
            email: newEmail,
            phone: newPhone,
            days_attending: newDays,
            is_attending: isAttending,
            guests: newGuestsArray
        });

        logAdminActivity("Edited Guest", `Updated details for ${newFirstName} ${newLastName} (${guest.rsvp_id})`);
        closeEditGuestModal();
        alert("Guest updated successfully!");
        // No need to manually reload dashboard data if real-time subscription is active, 
        // but we can call loadDashboardData() just in case.
        loadDashboardData();
    } catch (error) {
        console.error("Error updating guest:", error);
        alert("Failed to update guest details.");
    }
}

// ========== EMAIL VALIDATION FUNCTIONS ==========
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// ========== EMAIL FUNCTIONS ==========
function generateQRCodeImage(rsvpId) {
    const encodedData = encodeURIComponent(rsvpId);
    return `https://quickchart.io/qr?text=${encodedData}&size=400&margin=2`;
}

async function testEmailSetup() {
    const testEmail = prompt('Enter your email address to test:');
    if (!testEmail || !isValidEmail(testEmail)) {
        showEmailStatus('error', 'Please enter a valid email address.');
        return false;
    }

    try {
        showEmailStatus('loading', 'Testing EmailJS setup...');

        const testQRCode = generateQRCodeImage('TEST-12345');
        const templateParams = {
            to_email: testEmail,
            to_name: 'Test Administrator',
            rsvp_id: 'TEST-12345',
            phone: '000-000-0000',
            additional_guests: 0,
            events_attending: '• Day 1 - Welcome Dinner (Test)',
            qr_code_url: testQRCode,
            user_message: '<br><br><strong>THIS IS A TEST EMAIL!</strong>'
        };

        const response = await emailjs.send('service_tdfv5cn', 'template_88gh7ms', templateParams);

        if (response.status === 200) {
            showEmailStatus('success', '✅ Test email sent successfully! Check your inbox.');
            return true;
        } else {
            throw new Error('EmailJS request failed');
        }
    } catch (error) {
        console.error('EmailJS test error:', error);
        showEmailStatus('error', `Test failed. Please check console.`);
        return false;
    }
}

async function sendQRCodeToGuest(guestId) {
    console.log('sendQRCodeToGuest called with ID:', guestId);

    const guest = guests.find(g => g.id === guestId);
    if (!guest) {
        console.error('Guest not found with ID:', guestId);
        showEmailStatus('error', 'Guest not found!');
        return false;
    }

    if (!guest.email || guest.email.trim() === '') {
        showEmailStatus('error', `No email address for ${guest.first_name} ${guest.last_name}`);
        return false;
    }

    const email = guest.email.trim();

    if (!isValidEmail(email)) {
        showEmailStatus('error', `Invalid email format for ${guest.first_name} ${guest.last_name}: ${email}`);
        return false;
    }

    try {
        showEmailStatus('loading', `Sending QR code to ${email}`);

        const qrCodeUrl = generateQRCodeImage(guest.rsvp_id);

        let eventsStr = 'Not specified';
        if (guest.days_attending && guest.days_attending.length > 0) {
            eventsStr = guest.days_attending.map(day => {
                let eventName = '';
                switch (day) {
                    case 'day1': eventName = '• Day 1 - Welcome Dinner'; break;
                    case 'day2': eventName = '• Day 2 - Wedding Ceremony & Reception'; break;
                    case 'day3': eventName = '• Day 3 - Farewell Brunch'; break;
                }
                return eventName;
            }).join('<br>');
        }

        const templateParams = {
            to_email: email,
            to_name: `${guest.first_name} ${guest.last_name}`,
            rsvp_id: guest.rsvp_id,
            phone: guest.phone || '',
            additional_guests: guest.guests ? guest.guests.length : 0,
            events_attending: eventsStr,
            qr_code_url: qrCodeUrl,
            user_message: ''
        };

        const response = await emailjs.send('service_tdfv5cn', 'template_88gh7ms', templateParams);

        if (response.status === 200) {
            showEmailStatus('success', `✅ QR code sent to ${email}`);

            try {
                await markEmailAsSent(guest.id);
            } catch (updateError) {
                console.warn('Could not update email sent status:', updateError);
            }

            return true;
        } else {
            throw new Error('EmailJS request failed');
        }

    } catch (error) {
        console.error('Error sending email:', error);
        showEmailStatus('error', `Failed to send to ${email}: ${error.message || error}`);
        return false;
    }
}

async function sendQRCodeToAllGuests() {
    const guestsWithEmails = guests.filter(g =>
        g.is_attending &&
        g.email &&
        g.email.trim() !== '' &&
        isValidEmail(g.email)
    );

    if (!guestsWithEmails.length) {
        showEmailStatus('error', 'No attending guests with valid email addresses found.');
        return;
    }

    if (!confirm(`Send QR codes to ${guestsWithEmails.length} attending guests with valid email addresses? This may take a while.`)) {
        return;
    }

    let successCount = 0;
    let failCount = 0;

    showEmailStatus('loading', `Sending QR codes to ${guestsWithEmails.length} guests...`);

    for (let i = 0; i < guestsWithEmails.length; i++) {
        const guest = guestsWithEmails[i];

        const success = await sendQRCodeToGuest(guest.id);

        if (success) {
            successCount++;
        } else {
            failCount++;
        }

        showEmailStatus('loading', `Progress: ${i + 1}/${guestsWithEmails.length} guests processed (${successCount} success, ${failCount} failed)`);

        await new Promise(resolve => setTimeout(resolve, 1500));
    }

    showEmailStatus('success', `✅ Email sending completed! ${successCount} successful, ${failCount} failed.`);
}

async function sendQRCodeToUnsentGuests() {
    await sendQRCodeToAllGuests();
}

function showEmailStatus(type, message) {
    document.getElementById('emailLoading').style.display = 'none';
    document.getElementById('emailSuccess').style.display = 'none';
    document.getElementById('emailError').style.display = 'none';

    switch (type) {
        case 'loading':
            document.getElementById('emailLoading').style.display = 'block';
            document.getElementById('emailLoading').querySelector('span').textContent = message;
            break;
        case 'success':
            document.getElementById('emailSuccess').style.display = 'block';
            document.getElementById('emailSuccessText').textContent = message;
            break;
        case 'error':
            document.getElementById('emailError').style.display = 'block';
            document.getElementById('emailErrorText').textContent = message;
            break;
    }
}

async function markEmailAsSent(guestId) {
    try {
        const docRef = doc(firestoreDb, 'guests', guestId);
        await updateDoc(docRef, { email_sent: true });
    } catch (error) {
        console.error('Error updating email sent status:', error);
    }
}

// ========== GUEST FILTERING ==========
function filterGuests(filter) {
    currentGuestFilter = filter;

    document.getElementById('filterAll').classList.remove('active');
    document.getElementById('filterAttending').classList.remove('active');
    document.getElementById('filterNotAttending').classList.remove('active');

    switch (filter) {
        case 'all':
            document.getElementById('filterAll').classList.add('active');
            break;
        case 'attending':
            document.getElementById('filterAttending').classList.add('active');
            break;
        case 'not-attending':
            document.getElementById('filterNotAttending').classList.add('active');
            break;
    }

    filterAndDisplayGuests();
}

// ========== RSVP SETTINGS FUNCTIONS ==========
async function loadRSVPSettings() {
    try {
        const docRef = doc(firestoreDb, 'settings', 'admin');
        const docSnap = await getDoc(docRef);

        let data = null;
        let error = !docSnap.exists();

        if (!error) {
            data = docSnap.data();
            RSVP_SETTINGS.enabled = data.rsvp_enabled;
            RSVP_SETTINGS.disabledMessage = data.disabled_message;
            console.log('Loaded settings from Firebase:', RSVP_SETTINGS);
        } else {
            const savedSettings = localStorage.getItem('weddingRSVPSettings');
            if (savedSettings) {
                RSVP_SETTINGS = { ...RSVP_SETTINGS, ...JSON.parse(savedSettings) };
                console.log('Loaded settings from localStorage:', RSVP_SETTINGS);
            }
        }

        document.getElementById('rsvpToggle').checked = RSVP_SETTINGS.enabled;
        document.getElementById('rsvpDisabledMessage').value = RSVP_SETTINGS.disabledMessage;
        updateRSVPStatusDisplay();

    } catch (error) {
        console.error('Error loading RSVP settings:', error);
        const savedSettings = localStorage.getItem('weddingRSVPSettings');
        if (savedSettings) {
            RSVP_SETTINGS = { ...RSVP_SETTINGS, ...JSON.parse(savedSettings) };
            document.getElementById('rsvpToggle').checked = RSVP_SETTINGS.enabled;
            document.getElementById('rsvpDisabledMessage').value = RSVP_SETTINGS.disabledMessage;
            updateRSVPStatusDisplay();
        }
    }
}

async function saveRSVPSettings() {
    try {
        RSVP_SETTINGS.enabled = document.getElementById('rsvpToggle').checked;
        RSVP_SETTINGS.disabledMessage = document.getElementById('rsvpDisabledMessage').value;

        console.log('Saving RSVP settings:', RSVP_SETTINGS);

        localStorage.setItem('weddingRSVPSettings', JSON.stringify(RSVP_SETTINGS));

        const docRef = doc(firestoreDb, 'settings', 'admin');
        await setDoc(docRef, {
            rsvp_enabled: RSVP_SETTINGS.enabled,
            disabled_message: RSVP_SETTINGS.disabledMessage,
            updated_at: new Date().toISOString()
        }, { merge: true });

        const error = false; // setDoc throws on error

        if (error) {
            console.error('Firebase save error:', error);
            alert('Settings saved locally. Firebase sync failed: ' + error.message);
        } else {
            console.log('Settings saved to Firebase');
            alert('✅ RSVP settings saved and synced across all devices!');
            logAdminActivity("Changed RSVP Settings", `RSVP system set to: ${RSVP_SETTINGS.enabled ? 'Enabled' : 'Disabled'}`);
        }

        updateRSVPStatusDisplay();
    } catch (error) {
        console.error('Error saving RSVP settings:', error);
        alert('Error saving RSVP settings: ' + error.message);
    }
}

function updateRSVPStatusDisplay() {
    const statusText = document.getElementById('rsvpStatusText');
    const statusDisplay = document.getElementById('currentStatusDisplay');
    const messagePreview = document.getElementById('messagePreview');

    if (RSVP_SETTINGS.enabled) {
        statusText.textContent = 'RSVP System: ACTIVE';
        statusText.className = 'rsvp-status-badge rsvp-active';
        statusDisplay.textContent = 'Active - Guests can submit RSVPs';
    } else {
        statusText.textContent = 'RSVP System: DISABLED';
        statusText.className = 'rsvp-status-badge rsvp-inactive';
        statusDisplay.textContent = 'Disabled - Guests see message only';
    }

    messagePreview.textContent = RSVP_SETTINGS.disabledMessage;
}

// ========== REAL-TIME SETTINGS SYNC ==========
function setupSettingsRealtimeSubscription() {
    try {
        const unsub = onSnapshot(doc(firestoreDb, "settings", "admin"), (docSnap) => {
            if (docSnap.exists()) {
                const newData = docSnap.data();

                if (RSVP_SETTINGS.enabled !== newData.rsvp_enabled ||
                    RSVP_SETTINGS.disabledMessage !== newData.disabled_message) {

                    RSVP_SETTINGS.enabled = newData.rsvp_enabled;
                    RSVP_SETTINGS.disabledMessage = newData.disabled_message;

                    document.getElementById('rsvpToggle').checked = RSVP_SETTINGS.enabled;
                    document.getElementById('rsvpDisabledMessage').value = RSVP_SETTINGS.disabledMessage;
                    updateRSVPStatusDisplay();

                    localStorage.setItem('weddingRSVPSettings', JSON.stringify(RSVP_SETTINGS));

                    alert('⚡ RSVP settings updated from another device!');
                }
            }
        }, (error) => {
            if (error.code !== 'permission-denied') {
                console.error('Settings subscription error:', error);
            }
        });
        return unsub;
    } catch (error) {
        console.error('Settings subscription error:', error);
    }
}

// ========== DAY SELECTION ==========
function initDaySelection() {
    const dayOptions = document.querySelectorAll('.day-option');
    dayOptions.forEach(option => {
        option.addEventListener('click', function () {
            dayOptions.forEach(opt => opt.classList.remove('selected'));
            this.classList.add('selected');
            const radio = this.querySelector('input[type="radio"]');
            radio.checked = true;
            currentScanDay = radio.value;
            updateDayDisplay();
        });
    });
}

function updateDayDisplay() {
    const dayDisplay = document.getElementById('currentDayDisplay');
    let dayText = '';
    switch (currentScanDay) {
        case 'day1': dayText = 'Day 1 - Welcome Dinner'; break;
        case 'day2': dayText = 'Day 2 - Wedding Day'; break;
        case 'day3': dayText = 'Day 3 - Farewell Brunch'; break;
    }
    if (dayDisplay) dayDisplay.textContent = `Currently Scanning: ${dayText}`;

    // Automatically re-run manual check-in search so the UI instantly updates 
    // when you switch days while searching for a guest!
    const manualSearchInput = document.getElementById('manualSearchInput');
    if (manualSearchInput && manualSearchInput.value.trim().length >= 2) {
        if (typeof searchGuestsForManualCheckin === 'function') {
            searchGuestsForManualCheckin();
        }
    }
}

// ========== SCANNER FUNCTIONS ==========
function hideAllScannerResults() {
    document.getElementById('scannerSuccess').style.display = 'none';
    document.getElementById('scannerWarning').style.display = 'none';
    document.getElementById('scannerError').style.display = 'none';
    document.getElementById('scannerAlert').style.display = 'none';
}

// ========== TOAST NOTIFICATION SYSTEM ==========
function showToast(type, title, message, duration = 4500) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const icons = {
        success: '✅',
        warning: '⚠️',
        error: '❌',
        alert: '🔔'
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
                <div class="toast-icon">${icons[type] || '🔔'}</div>
                <div class="toast-body">
                    <div class="toast-title">${title}</div>
                    <div class="toast-message">${message}</div>
                </div>
                <div class="toast-progress" style="animation-duration: ${duration}ms;"></div>
            `;

    // Click to dismiss
    toast.addEventListener('click', () => dismissToast(toast));

    // Clear any existing toasts instantly before showing the new one
    Array.from(container.children).forEach(t => t.remove());

    container.appendChild(toast);

    // Optionally play a subtle beep on successful check-in
    if (type === 'success') {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.15);
            gain.gain.setValueAtTime(0.15, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.4);
        } catch (e) { /* Ignore if AudioContext not available */ }
    } else if (type === 'warning') {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(440, ctx.currentTime);
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.5);
        } catch (e) { /* Ignore */ }
    } else if (type === 'error') {
        // Harsh descending tone for invalid QR
        try {
            if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(600, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.4);
            gain.gain.setValueAtTime(0.15, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.4);
        } catch (e) { /* Ignore */ }
    } else if (type === 'alert') {
        // Double-beep for not attending this day
        try {
            if ('vibrate' in navigator) navigator.vibrate([300, 100, 300]);
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            [0, 0.25].forEach(startOffset => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.type = 'sine';
                osc.frequency.setValueAtTime(520, ctx.currentTime + startOffset);
                gain.gain.setValueAtTime(0.12, ctx.currentTime + startOffset);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startOffset + 0.18);
                osc.start(ctx.currentTime + startOffset);
                osc.stop(ctx.currentTime + startOffset + 0.18);
            });
        } catch (e) { /* Ignore */ }
    }

    // Auto-dismiss after duration
    setTimeout(() => dismissToast(toast), duration);
}

function dismissToast(toast) {
    if (!toast || toast.classList.contains('toast-hiding')) return;
    toast.classList.add('toast-hiding');
    setTimeout(() => toast.remove(), 300);
}

function showScannerResult(type, message) {
    hideAllScannerResults();

    // Strip HTML tags for toast, preserve line breaks, remove blank lines from indentation
    const plainText = message
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0)
        .join('\n');

    // Map type to toast title
    const toastTitles = {
        success: 'Guest Checked In!',
        warning: 'Already Checked In',
        error: 'Scan Error',
        alert: 'Not Attending This Day'
    };

    showToast(type, toastTitles[type] || 'Alert', plainText);

    switch (type) {
        case 'success':
            document.getElementById('successInfo').innerHTML = message;
            document.getElementById('scannerSuccess').style.display = 'block';
            break;
        case 'warning':
            document.getElementById('warningInfo').innerHTML = message;
            document.getElementById('scannerWarning').style.display = 'block';
            break;
        case 'error':
            document.getElementById('errorInfo').textContent = message;
            document.getElementById('scannerError').style.display = 'block';
            break;
        case 'alert':
            document.getElementById('alertInfo').textContent = message;
            document.getElementById('scannerAlert').style.display = 'block';
            break;
    }
}

function startCooldownTimer() {
    const indicator = document.getElementById('cooldownIndicator');
    const timer = document.getElementById('cooldownTimer');

    indicator.style.display = 'block';
    indicator.classList.add('cooldown-active');

    let seconds = 3;
    const countdown = setInterval(() => {
        seconds--;
        timer.textContent = seconds;

        if (seconds <= 0) {
            clearInterval(countdown);
            indicator.style.display = 'none';
            indicator.classList.remove('cooldown-active');
        }
    }, 1000);
}

function initScanner() {
    const video = document.getElementById("qr-video");
    canvasElement = document.getElementById("qr-canvas");
    canvasContext = canvasElement.getContext("2d");

    hideAllScannerResults();

    const constraints = {
        video: {
            facingMode: "environment",
            width: { ideal: 1280 },
            height: { ideal: 720 }
        }
    };

    navigator.mediaDevices.getUserMedia(constraints)
        .then(function (stream) {
            videoStream = stream;
            video.srcObject = stream;
            video.setAttribute("playsinline", true);
            video.play();
            scanActive = true;

            video.onplaying = () => {
                requestAnimationFrame(scanQRCode);
            };
        })
        .catch(function (err) {
            console.error("Error accessing camera: ", err);
            showScannerResult('error', "Cannot access camera. Please check permissions.");
        });
}

function stopScanner() {
    scanActive = false;

    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
    }

    const video = document.getElementById("qr-video");
    if (video) {
        video.srcObject = null;
    }

    clearScannerBox();
    hideAllScannerResults();
}

function scanQRCode() {
    if (!scanActive) return;

    const video = document.getElementById("qr-video");

    if (video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth > 0 && video.videoHeight > 0) {
        canvasElement.height = video.videoHeight;
        canvasElement.width = video.videoWidth;

        canvasContext.drawImage(video, 0, 0, canvasElement.width, canvasElement.height);
        const imageData = canvasContext.getImageData(0, 0, canvasElement.width, canvasElement.height);

        try {
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: "dontInvert",
            });

            if (code) {
                const now = Date.now();
                if (now - lastScanTime >= SCAN_COOLDOWN) {
                    handleScanResult(code.data);
                    drawScannerBox(code.location);

                    if (scanActive) {
                        requestAnimationFrame(scanQRCode);
                    }
                    return;
                } else {
                    clearScannerBox();
                }
            } else {
                clearScannerBox();
            }
        } catch (e) {
            console.error("QR scanning error:", e);
        }
    }

    if (scanActive) {
        requestAnimationFrame(scanQRCode);
    }
}

function drawScannerBox(location) {
    if (!canvasElement || !canvasContext) return;

    canvasContext.clearRect(0, 0, canvasElement.width, canvasElement.height);

    canvasContext.strokeStyle = "#00FF00";
    canvasContext.lineWidth = 4;
    canvasContext.beginPath();
    canvasContext.moveTo(location.topLeftCorner.x, location.topLeftCorner.y);
    canvasContext.lineTo(location.topRightCorner.x, location.topRightCorner.y);
    canvasContext.lineTo(location.bottomRightCorner.x, location.bottomRightCorner.y);
    canvasContext.lineTo(location.bottomLeftCorner.x, location.bottomLeftCorner.y);
    canvasContext.lineTo(location.topLeftCorner.x, location.topLeftCorner.y);
    canvasContext.stroke();
}

function clearScannerBox() {
    if (canvasElement && canvasContext) {
        canvasContext.clearRect(0, 0, canvasElement.width, canvasElement.height);
    }
}

async function handleScanResult(result) {
    const now = Date.now();

    if (now - lastScanTime < SCAN_COOLDOWN) {
        console.log("Scan cooldown active, ignoring scan...");
        return;
    }

    const rsvpId = result.trim();
    console.log("Scanned QR code:", rsvpId, "for day:", currentScanDay);

    lastScanTime = now;
    startCooldownTimer();

    try {
        const guestsRef = collection(firestoreDb, 'guests');
        const q = query(guestsRef, where('rsvp_id', '==', rsvpId));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            showScannerResult('error', 'Invalid QR code! Guest not found in database.');
            return;
        }

        const guest = querySnapshot.docs[0].data();
        guest.id = querySnapshot.docs[0].id;

        if (!guest.is_attending) {
            showScannerResult('alert', `${guest.first_name} ${guest.last_name} is not attending the wedding.`);
            return;
        }

        if (!guest.days_attending || !guest.days_attending.includes(currentScanDay)) {
            showScannerResult('alert', `${guest.first_name} ${guest.last_name} is not attending this event day.`);
            return;
        }

        const attendanceRef = collection(firestoreDb, 'attendance');
        const attendanceQ = query(attendanceRef,
            where('rsvp_id', '==', rsvpId),
            where('day', '==', currentScanDay)
        );

        const attendanceSnapshot = await getDocs(attendanceQ);
        let existingAttendance = [];
        attendanceSnapshot.forEach(doc => {
            existingAttendance.push(doc.data());
        });

        if (existingAttendance.length > 0) {
            let dayName = '';
            switch (currentScanDay) {
                case 'day1': dayName = 'Welcome Dinner'; break;
                case 'day2': dayName = 'Wedding Day'; break;
                case 'day3': dayName = 'Farewell Brunch'; break;
            }

            const additionalWarning = (guest.guests && guest.guests.length > 0)
                ? `Additional Guests: ${guest.guests.length}`
                : 'Additional Guests: N/A';

            showScannerResult('warning',
                `<strong>${guest.first_name} ${guest.last_name}</strong><br>
                         Already checked in for <strong>${dayName}</strong><br>
                         Previous check-in: ${new Date(existingAttendance[0].check_in_time).toLocaleTimeString()}<br>
                         ${additionalWarning}`
            );
        } else {
            let insertError = null;
            try {
                await addDoc(collection(firestoreDb, 'attendance'), {
                    guest_name: `${guest.first_name} ${guest.last_name}`,
                    rsvp_id: rsvpId,
                    day: currentScanDay,
                    staff_member: currentStaffName,
                    check_in_time: new Date().toISOString()
                });
            } catch (e) {
                insertError = e;
            }

            if (insertError) {
                console.error('Error saving attendance:', insertError);
                showScannerResult('error', 'Error saving attendance record!');
            } else {
                const updatedCheckedInDays = guest.checked_in_days || [];
                if (!updatedCheckedInDays.includes(currentScanDay)) {
                    updatedCheckedInDays.push(currentScanDay);

                    try {
                        const guestDocRef = doc(firestoreDb, 'guests', guest.id);
                        await updateDoc(guestDocRef, { checked_in_days: updatedCheckedInDays });
                    } catch (updateError) {
                        console.error('Error updating guest record:', updateError);
                    }
                }

                let dayName = '';
                switch (currentScanDay) {
                    case 'day1': dayName = 'Welcome Dinner'; break;
                    case 'day2': dayName = 'Wedding Day'; break;
                    case 'day3': dayName = 'Farewell Brunch'; break;
                }

                const additionalSuccess = (guest.guests && guest.guests.length > 0)
                    ? `Additional Guests: ${guest.guests.length}`
                    : 'Additional Guests: N/A';

                showScannerResult('success',
                    `<strong>${guest.first_name} ${guest.last_name}</strong><br>
                             Successfully checked in for <strong>${dayName}</strong><br>
                             Time: ${new Date().toLocaleTimeString()}<br>
                             ${additionalSuccess}`
                );

                logAdminActivity("QR Code Scanned", `Checked in: ${guest.first_name} ${guest.last_name} for ${dayName}`);

                await loadDashboardData();
            }
        }
    } catch (error) {
        console.error('Error in scan handling:', error);
        showScannerResult('error', 'An unexpected error occurred.');
    }

    setTimeout(() => {
        hideAllScannerResults();
    }, 5000);
}

// ========== LOGIN & INITIALIZATION ==========
function checkExistingLogin() {
    onAuthStateChanged(auth, async (user) => {
        const loader = document.getElementById('initialLoader');
        if (loader) loader.style.display = 'none';

        if (user) {
            const userEmail = user.email.toLowerCase();

            // Detect if this is a genuine page refresh using modern Navigation Performance API
            const navEntries = performance.getEntriesByType("navigation");
            const isTabRefresh = navEntries.length > 0 && navEntries[0].type === "reload";

            if (isTabRefresh) {
                // If it's a reload, ignore and clear any shutdown flags generated by the page unloading.
                // The browser destroys the document on refresh, triggering pagehide, but we don't want to log them out.
                localStorage.removeItem('forceLogoutOnNextLoad');
                localStorage.removeItem('sessionPausedFlag');

                const lastUser = localStorage.getItem('lastActiveUser') || userEmail;
                logAdminActivity("Session Resumed", `Returned from background (tab refreshed): ${lastUser}`, lastUser);
            } else {
                // NOT a refresh (e.g., fresh tab or returning after app close)
                // Detect if they were explicitly killed via swipe-away/close tab last time
                if (localStorage.getItem('forceLogoutOnNextLoad') === 'true') {
                    // Clear the flag to prevent an infinite loop
                    localStorage.removeItem('forceLogoutOnNextLoad');
                    localStorage.removeItem('sessionPausedFlag');

                    // Force the log out process immediately before rendering dashboard
                    await signOut(auth);

                    document.getElementById('loginSection').style.display = 'block';
                    document.getElementById('adminDashboard').style.display = 'none';
                    document.getElementById('realtimeIndicator').style.display = 'none';
                    currentStaffName = "";
                    return; // Halt login sequence
                }

                if (localStorage.getItem('sessionPausedFlag') === 'true') {
                    // Legitimate App Kill! They backgrounded/closed it without returning.
                    const lastUser = localStorage.getItem('lastActiveUser') || userEmail;
                    await logAdminActivity("App Backgrounded/Closed", `Session abruptly ended previously for ${lastUser}`, lastUser);

                    localStorage.removeItem('sessionPausedFlag');
                    await signOut(auth); // Force them out securely

                    document.getElementById('loginSection').style.display = 'block';
                    document.getElementById('adminDashboard').style.display = 'none';
                    document.getElementById('realtimeIndicator').style.display = 'none';
                    currentStaffName = "";
                    return; // Halt login sequence
                }
            }

            // If we made it here, it's either a fresh manual login or a seamless refresh
            document.getElementById('loginSection').style.display = 'none';
            document.getElementById('adminDashboard').style.display = 'none';

            // Try to use cached staff data to skip the 0.5s network request on refresh
            const cachedStaffName = localStorage.getItem('cachedStaffName');
            const cachedStaffId = localStorage.getItem('cachedStaffId');

            if (cachedStaffName && cachedStaffId !== null) {
                currentStaffName = cachedStaffName;
                currentStaffId = cachedStaffId;
            } else {
                const staffRef = collection(firestoreDb, 'staff_pins');
                const qQuery = query(staffRef, where('email', '==', userEmail));

                try {
                    const snapshot = await getDocs(qQuery);
                    if (!snapshot.empty) {
                        const staffData = snapshot.docs[0].data();
                        currentStaffName = staffData.name;
                        currentStaffId = staffData.staff_id || '';
                    } else {
                        currentStaffName = "Master Admin";
                        currentStaffId = 'MASTER';
                    }
                } catch (e) {
                    currentStaffName = "Master Admin";
                    currentStaffId = 'MASTER';
                }

                // Cache for next refresh to speed up loading
                localStorage.setItem('cachedStaffName', currentStaffName);
                localStorage.setItem('cachedStaffId', currentStaffId);
            }

            const isRestore = !window.isManualLogin;
            handleSuccessfulLogin(isRestore);
            window.isManualLogin = false; // reset
        } else {
            document.getElementById('loginSection').style.display = 'block';
            document.getElementById('adminDashboard').style.display = 'none';
            document.getElementById('realtimeIndicator').style.display = 'none';
            currentStaffName = "";
        }
    });
}

async function handleSuccessfulLogin(isRestore = false) {
    document.getElementById('adminDashboard').style.display = 'block';
    document.getElementById('realtimeIndicator').style.display = 'block';

    const nameDisplay = document.getElementById('sidebarStaffNameDisplay');
    if (nameDisplay) nameDisplay.textContent = currentStaffName;

    // Show Staff ID badge (only for non-Master-Admin staff)
    showStaffIdBadge(currentStaffId);

    // Show restrictied tabs only for Master Admin
    if (currentStaffName === 'Master Admin') {
        document.getElementById('nav-guests').style.display = 'block';
        document.getElementById('nav-attendance').style.display = 'block';
        document.getElementById('nav-reports').style.display = 'block';
        document.getElementById('nav-settings').style.display = 'block';
        document.getElementById('nav-bookings').style.display = 'block';
        document.getElementById('nav-logs').style.display = 'block';
        currentStaffPerms = { guestlist: true, attendance: true, reports: true, editguest: true };
    } else {
        // Hide EVERYTHING initially to prevent the flash of unpermitted tabs before Firestore rules load
        // The realtime subscription handles showing the permitted ones later
        document.getElementById('nav-guests').style.display = 'none';
        document.getElementById('nav-attendance').style.display = 'none';
        document.getElementById('nav-reports').style.display = 'none';
        document.getElementById('nav-settings').style.display = 'none';
        document.getElementById('nav-bookings').style.display = 'none';
        document.getElementById('nav-logs').style.display = 'none';
        currentStaffPerms = { guestlist: false, attendance: false, reports: false, editguest: false };
    }

    // Restore tab state FIRST
    restoreTabState();

    loadRSVPSettings();
    initDaySelection();
    setupSearch();

    // Load dashboard data asynchronously so it doesn't block the UI rendering!
    loadDashboardData();
    setupRealtimeSubscription();

    if (!isRestore) {
        // Fresh login: save to login_history, then load previous visit asynchronously
        saveLoginHistory().then(() => loadAndShowLastVisit());
        logAdminActivity("Logged In", `Session started for ${currentStaffName}`);
        localStorage.setItem('lastActiveUser', currentStaffName);
    } else {
        // Always show last visit badge (works for both fresh login and restore) instantly
        loadAndShowLastVisit();
    }
}

// ========== MAIN INITIALIZATION ==========
document.addEventListener('DOMContentLoaded', function () {
    // Optimistic UI Rendering (0.00s load): If we have a cached staff user, show dashboard immediately!
    const cachedStaffName = localStorage.getItem('cachedStaffName');
    if (cachedStaffName) {
        document.getElementById('initialLoader').style.display = 'none';
        document.getElementById('loginSection').style.display = 'none';
        document.getElementById('adminDashboard').style.display = 'block';

        try {
            const cachedStr = localStorage.getItem('adminDashboardStats');
            if (cachedStr) {
                const stats = JSON.parse(cachedStr);
                if (document.getElementById('totalGuests')) document.getElementById('totalGuests').textContent = stats.totalGuests;
                if (document.getElementById('attendingGuests')) document.getElementById('attendingGuests').textContent = stats.attendingGuests;
                if (document.getElementById('notAttendingGuests')) document.getElementById('notAttendingGuests').textContent = stats.notAttendingGuests;
                if (document.getElementById('day1Guests')) document.getElementById('day1Guests').textContent = stats.day1Count;
                if (document.getElementById('day2Guests')) document.getElementById('day2Guests').textContent = stats.day2Count;
                if (document.getElementById('day3Guests')) document.getElementById('day3Guests').textContent = stats.day3Count;
            }

            const cachedLastVisitTs = localStorage.getItem('adminCachedLastVisitTs');
            if (cachedLastVisitTs) {
                showLastVisitBadge(cachedLastVisitTs);
            }

            const cachedHistoryHtml = localStorage.getItem('adminCachedLoginHistoryHtml');
            if (cachedHistoryHtml) {
                const historyList = document.getElementById('loginHistoryList');
                const toggleWrap = document.getElementById('loginHistoryToggleWrap');
                if (historyList && toggleWrap) {
                    historyList.innerHTML = cachedHistoryHtml;
                    toggleWrap.style.display = 'block';
                }
            }
        } catch (e) { }
    }

    // Initialize Firebase first
    if (!isFirebaseReady()) {
        console.log('Waiting for Firebase to initialize...');
        const waitInterval = setInterval(() => {
            if (isFirebaseReady()) {
                clearInterval(waitInterval);
                checkExistingLogin();
            }
        }, 100);

        // Timeout after 10 seconds just in case
        setTimeout(() => {
            clearInterval(waitInterval);
            if (!isFirebaseReady()) {
                alert('Connection error. Please refresh the page.');
            }
        }, 10000);
    } else {
        checkExistingLogin();
    }

    // Setup tab listeners
    setupTabListeners();

    // Mobile menu toggle
    const hamburger = document.getElementById('hamburger');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');

    hamburger.addEventListener('click', () => {
        sidebar.classList.toggle('active');
        overlay.classList.toggle('active');
        document.body.classList.toggle('menu-open');
    });

    overlay.addEventListener('click', () => {
        sidebar.classList.remove('active');
        overlay.classList.remove('active');
        document.body.classList.remove('menu-open');
    });

    // Close menu when clicking on a link
    document.querySelectorAll('.nav-links a').forEach(link => {
        link.addEventListener('click', () => {
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
            document.body.classList.remove('menu-open');
        });
    });

    // RSVP toggle change handler
    document.getElementById('rsvpToggle').addEventListener('change', function () {
        updateRSVPStatusDisplay();
    });
});

// ========== LOGIN FORM ==========
document.getElementById('adminLoginForm').addEventListener('submit', async function (e) {
    e.preventDefault();

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const submitBtn = e.target.querySelector('button[type="submit"]');

    try {
        submitBtn.textContent = 'Logging in...';
        submitBtn.disabled = true;

        // Flag that this is a manual login so onAuthStateChanged can log it
        window.isManualLogin = true;

        // This automatically triggers the onAuthStateChanged listener above
        await signInWithEmailAndPassword(auth, email, password);

        // Clear the form
        e.target.reset();
    } catch (error) {
        console.error('Login error:', error);
        alert('Invalid credentials! Please try again. (' + error.message + ')');
        window.isManualLogin = false;
    } finally {
        if (submitBtn) {
            submitBtn.textContent = 'Login';
            submitBtn.disabled = false;
        }
    }
});

// ========== REAL-TIME SUBSCRIPTION ==========
function setupRealtimeSubscription() {
    try {
        if (window.globalUnsubscribers) {
            window.globalUnsubscribers.forEach(unsub => {
                if (typeof unsub === 'function') unsub();
            });
        }
        window.globalUnsubscribers = [];

        // Subscribe to attendance collection
        const unsubAttendance = onSnapshot(collection(firestoreDb, "attendance"), (snapshot) => {
            console.log('Attendance change detected');
            loadDashboardData();
        }, (error) => {
            if (error.code !== 'permission-denied') {
                console.error('Attendance subscription error:', error);
                updateRealtimeIndicator('OFFLINE');
            }
        });
        window.globalUnsubscribers.push(unsubAttendance);

        // Subscribe to guests collection
        const unsubGuests = onSnapshot(collection(firestoreDb, "guests"), (snapshot) => {
            console.log('Guest change detected');
            loadDashboardData();
        }, (error) => {
            if (error.code !== 'permission-denied') {
                console.error('Guest subscription error:', error);
                updateRealtimeIndicator('OFFLINE');
            }
        });
        window.globalUnsubscribers.push(unsubGuests);

        // Subscribe to staff changes for auto-logout and permission updates
        if (currentStaffName && currentStaffName !== 'Master Admin') {
            const staffRef = collection(firestoreDb, 'staff_pins');
            const staffQuery = query(staffRef, where('name', '==', currentStaffName));
            const unsubStaff = onSnapshot(staffQuery, (snapshot) => {
                if (snapshot.empty) {
                    alert("Your staff account has been deleted. You will now be logged out.");
                    logout();
                } else {
                    const data = snapshot.docs[0].data();
                    const perms = data.permissions || { guestlist: true, attendance: true, reports: true, editguest: false };
                    currentStaffPerms = perms;

                    document.getElementById('nav-guests').style.display = perms.guestlist ? 'block' : 'none';
                    document.getElementById('nav-attendance').style.display = perms.attendance ? 'block' : 'none';
                    document.getElementById('nav-reports').style.display = perms.reports ? 'block' : 'none';

                    // Switch to default scanner tab if the current active tab is hidden
                    const activeTab = document.querySelector('.nav-links a.active');
                    if (activeTab) {
                        const tabId = activeTab.getAttribute('data-tab');
                        if (
                            (tabId === 'guests' && !perms.guestlist) ||
                            (tabId === 'attendance' && !perms.attendance) ||
                            (tabId === 'reports' && !perms.reports)
                        ) {
                            const scannerLink = document.querySelector('.nav-links a[data-tab="scanner"]');
                            if (scannerLink) scannerLink.click();
                        }
                    }

                    // Re-render guest list to immediately apply any edit permission changes
                    filterAndDisplayGuests();
                }
            }, (error) => {
                if (error.code !== 'permission-denied') {
                    console.error('Staff subscription error:', error);
                }
            });
            window.globalUnsubscribers.push(unsubStaff);
        }

        // Update indicator
        updateRealtimeIndicator('SUBSCRIBED');

        const settingsSubscription = setupSettingsRealtimeSubscription();
        window.globalUnsubscribers.push(settingsSubscription);

    } catch (error) {
        console.error('Real-time subscription error:', error);
        document.getElementById('realtimeIndicator').textContent = '🔴 Connection Error';
        document.getElementById('realtimeIndicator').classList.add('offline');
    }
}

function updateRealtimeIndicator(status) {
    const indicator = document.getElementById('realtimeIndicator');
    if (status === 'SUBSCRIBED') {
        indicator.textContent = '🟢 Live';
        indicator.classList.remove('offline');
    } else {
        indicator.textContent = '🔴 Offline';
        indicator.classList.add('offline');
    }
}

// ========== DASHBOARD DATA LOADING ==========
async function loadDashboardData() {
    try {
        const guestsRef = collection(firestoreDb, 'guests');
        const guestsQuery = query(guestsRef, orderBy('created_at', 'desc'));
        const guestsSnapshot = await getDocs(guestsQuery);

        let guestsData = [];
        guestsSnapshot.forEach(doc => {
            let data = doc.data();
            data.id = doc.id;
            guestsData.push(data);
        });

        guests = guestsData || [];

        const attendanceRef = collection(firestoreDb, 'attendance');
        const attendanceQuery = query(attendanceRef, orderBy('check_in_time', 'desc'));
        const attendanceSnapshot = await getDocs(attendanceQuery);

        let attendanceData = [];
        attendanceSnapshot.forEach(doc => {
            attendanceData.push(doc.data());
        });

        attendance = attendanceData || [];

        const totalGuests = guests.length;
        const attendingGuests = guests.filter(g => g.is_attending).length;
        const notAttendingGuests = guests.filter(g => !g.is_attending).length;

        document.getElementById('totalGuests').textContent = totalGuests;
        document.getElementById('attendingGuests').textContent = attendingGuests;
        document.getElementById('notAttendingGuests').textContent = notAttendingGuests;

        const day1Count = attendance.filter(a => a.day === 'day1').length;
        const day2Count = attendance.filter(a => a.day === 'day2').length;
        const day3Count = attendance.filter(a => a.day === 'day3').length;

        document.getElementById('day1Guests').textContent = day1Count;
        document.getElementById('day2Guests').textContent = day2Count;
        document.getElementById('day3Guests').textContent = day3Count;

        // Cache stats for optimistic UI loading on refresh
        try {
            localStorage.setItem('adminDashboardStats', JSON.stringify({
                totalGuests, attendingGuests, notAttendingGuests, day1Count, day2Count, day3Count
            }));
        } catch (e) { }

        document.getElementById('totalCheckedIn').textContent = attendance.length;

        const day1Checked = attendance.filter(a => a.day === 'day1').length;
        const day2Checked = attendance.filter(a => a.day === 'day2').length;
        const day3Checked = attendance.filter(a => a.day === 'day3').length;

        document.getElementById('day1CheckedIn').textContent = day1Checked;
        document.getElementById('day2CheckedIn').textContent = day2Checked;
        document.getElementById('day3CheckedIn').textContent = day3Checked;

        const cateringTotals = calculateCateringTotals(guests);

        document.getElementById('cateringDay1Total').textContent = cateringTotals.day1.total;
        document.getElementById('cateringDay2Total').textContent = cateringTotals.day2.total;
        document.getElementById('cateringDay3Total').textContent = cateringTotals.day3.total;

        document.getElementById('cateringDay1Breakdown').textContent =
            `${cateringTotals.day1.primary} primary + ${cateringTotals.day1.additional} additional`;
        document.getElementById('cateringDay2Breakdown').textContent =
            `${cateringTotals.day2.primary} primary + ${cateringTotals.day2.additional} additional`;
        document.getElementById('cateringDay3Breakdown').textContent =
            `${cateringTotals.day3.primary} primary + ${cateringTotals.day3.additional} additional`;

        filterAndDisplayGuests();
        loadAttendanceTable();
        loadAttendanceChart();
        loadRSVPChart();

        // Load Hotel Bookings
        try {
            const bookingsRef = collection(firestoreDb, 'hotelBookings');
            const bookingsQuery = query(bookingsRef, orderBy('timestamp', 'desc'));
            const bookingsSnapshot = await getDocs(bookingsQuery);

            hotelBookingsList = [];
            bookingsSnapshot.forEach(doc => {
                let data = doc.data();
                data.id = doc.id;
                hotelBookingsList.push(data);
            });

            document.getElementById('totalBookingsStat').textContent = hotelBookingsList.length;
            loadHotelBookingsTable();
        } catch (e) {
            console.error("Error loading hotel bookings:", e);
        }

    } catch (error) {
        console.error('Error loading dashboard data:', error);
    }
}

function loadNotAttendingTable() {
    const tbody = document.getElementById('notAttendingTableBody');
    tbody.innerHTML = '';

    const notAttendingGuests = guests.filter(g => !g.is_attending);

    notAttendingGuests.forEach(guest => {
        const row = document.createElement('tr');
        row.innerHTML = `
                    <td>${escapeHtml(guest.first_name)} ${escapeHtml(guest.last_name)}</td>
                    <td>${escapeHtml(guest.email) || 'N/A'}</td>
                    <td>${escapeHtml(guest.phone) || 'N/A'}</td>
                    <td>${escapeHtml(guest.message) || 'No message'}</td>
                    <td>${new Date(guest.created_at).toLocaleString()}</td>
                `;
        tbody.appendChild(row);
    });
}

function loadHotelBookingsTable() {
    const tbody = document.getElementById('hotelBookingsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    hotelBookingsList.forEach(booking => {
        const membersStr = booking.members ? `${booking.members} Guest(s)` : 'N/A';

        const row = document.createElement('tr');
        row.innerHTML = `
                    <td><strong>${escapeHtml(booking.reference) || 'N/A'}</strong></td>
                    <td>${escapeHtml(booking.guestName) || 'N/A'}<br><small>${escapeHtml(membersStr)}</small></td>
                    <td>${escapeHtml(booking.email) || 'N/A'}<br><small>${escapeHtml(booking.phone) || 'N/A'}</small></td>
                    <td>${escapeHtml(booking.checkin) || 'N/A'}</td>
                    <td>${escapeHtml(booking.checkout) || 'N/A'}</td>
                    <td>${escapeHtml(booking.nights) || '0'}</td>
                    <td>${booking.timestamp ? new Date(booking.timestamp).toLocaleString() : 'N/A'}</td>
                `;
        tbody.appendChild(row);
    });
}

function loadAttendanceTable() {
    const tbody = document.getElementById('attendanceTableBody');
    tbody.innerHTML = '';

    attendance.forEach(record => {
        let dayName = '';
        switch (record.day) {
            case 'day1': dayName = 'Day 1 - Welcome Dinner'; break;
            case 'day2': dayName = 'Day 2 - Wedding Day'; break;
            case 'day3': dayName = 'Day 3 - Farewell Brunch'; break;
        }

        const row = document.createElement('tr');
        row.innerHTML = `
                    <td>${escapeHtml(record.guest_name)}</td>
                    <td>${escapeHtml(record.rsvp_id)}</td>
                    <td>${dayName}</td>
                    <td>${new Date(record.check_in_time).toLocaleString()}</td>
                    <td>${escapeHtml(record.staff_member) || 'Admin'}</td>
                `;
        tbody.appendChild(row);
    });
}

function loadAttendanceChart() {
    const ctx = document.getElementById('attendanceChart');
    if (!ctx) return;

    if (ctx.chart) {
        ctx.chart.destroy();
    }

    const day1Expected = guests.filter(g => g.is_attending && g.days_attending && g.days_attending.includes('day1')).length;
    const day2Expected = guests.filter(g => g.is_attending && g.days_attending && g.days_attending.includes('day2')).length;
    const day3Expected = guests.filter(g => g.is_attending && g.days_attending && g.days_attending.includes('day3')).length;

    const day1Actual = attendance.filter(a => a.day === 'day1').length;
    const day2Actual = attendance.filter(a => a.day === 'day2').length;
    const day3Actual = attendance.filter(a => a.day === 'day3').length;

    ctx.chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Day 1', 'Day 2', 'Day 3'],
            datasets: [
                {
                    label: 'Expected',
                    data: [day1Expected, day2Expected, day3Expected],
                    backgroundColor: 'rgba(212, 175, 55, 0.7)'
                },
                {
                    label: 'Actual',
                    data: [day1Actual, day2Actual, day3Actual],
                    backgroundColor: 'rgba(40, 167, 69, 0.7)'
                }
            ]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

function loadRSVPChart() {
    const ctx = document.getElementById('rsvpChart');
    if (!ctx) return;

    if (ctx.chart) {
        ctx.chart.destroy();
    }

    const attendingCount = guests.filter(g => g.is_attending).length;
    const notAttendingCount = guests.filter(g => !g.is_attending).length;

    ctx.chart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Attending', 'Not Attending'],
            datasets: [{
                data: [attendingCount, notAttendingCount],
                backgroundColor: [
                    'rgba(40, 167, 69, 0.7)',
                    'rgba(220, 53, 69, 0.7)'
                ],
                borderColor: [
                    'rgba(40, 167, 69, 1)',
                    'rgba(220, 53, 69, 1)'
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'bottom',
                },
                title: {
                    display: true,
                    text: 'RSVP Status Overview'
                }
            }
        }
    });
}

// ========== EXPORT FUNCTIONALITY ==========
async function exportGuests() {
    try {
        const guestsRef = collection(firestoreDb, 'guests');
        const guestsQuery = query(guestsRef, orderBy('created_at', 'desc'));
        const guestsSnapshot = await getDocs(guestsQuery);

        let guestsData = [];
        guestsSnapshot.forEach(doc => {
            guestsData.push(doc.data());
        });

        let csv = 'Guest Name,Email,Phone,Attendance,Days Attending,Additional Guests,Additional Guest Names,Day 1 Checked In,Day 2 Checked In,Day 3 Checked In,Message,RSVP Date\n';

        guestsData.forEach(guest => {
            const additionalGuestNames = guest.guests ?
                guest.guests.map(g => `${g.firstName} ${g.lastName}`).join('; ') : '';
            const day1Checked = guest.checked_in_days && guest.checked_in_days.includes('day1') ? 'Yes' : 'No';
            const day2Checked = guest.checked_in_days && guest.checked_in_days.includes('day2') ? 'Yes' : 'No';
            const day3Checked = guest.checked_in_days && guest.checked_in_days.includes('day3') ? 'Yes' : 'No';
            const attendanceStatus = guest.is_attending ? 'Attending' : 'Not Attending';

            const createdAtLocal = guest.created_at ? new Date(guest.created_at).toLocaleString() : '';

            csv += `"${guest.first_name} ${guest.last_name}",${guest.email},${guest.phone || ''},"${attendanceStatus}","${guest.days_attending ? guest.days_attending.join(', ') : ''}",${guest.guests ? guest.guests.length : 0},"${additionalGuestNames}",${day1Checked},${day2Checked},${day3Checked},"${guest.message || ''}","${createdAtLocal}"\n`;
        });

        downloadCSV(csv, 'wedding_guests.csv');
    } catch (error) {
        console.error('Error exporting guests:', error);
        alert('Error exporting guest data');
    }
}

async function exportAttendance() {
    try {
        const attendanceRef = collection(firestoreDb, 'attendance');
        const attendanceQuery = query(attendanceRef, orderBy('check_in_time', 'desc'));
        const attendanceSnapshot = await getDocs(attendanceQuery);

        let attendanceData = [];
        attendanceSnapshot.forEach(doc => {
            attendanceData.push(doc.data());
        });

        let csv = 'Guest Name,RSVP ID,Event Day,Check-in Time,Staff Member\n';

        attendanceData.forEach(record => {
            let dayName = '';
            switch (record.day) {
                case 'day1': dayName = 'Day 1 - Welcome Dinner'; break;
                case 'day2': dayName = 'Day 2 - Wedding Day'; break;
                case 'day3': dayName = 'Day 3 - Farewell Brunch'; break;
            }

            csv += `"${record.guest_name}",${record.rsvp_id},"${dayName}","${new Date(record.check_in_time).toLocaleString()}","${record.staff_member || 'Admin'}"\n`;
        });

        downloadCSV(csv, 'wedding_attendance.csv');
    } catch (error) {
        console.error('Error exporting attendance:', error);
        alert('Error exporting attendance data');
    }
}

async function exportHotelBookings() {
    try {
        let csv = 'Reference ID,Guest Name,Members,Email,Phone,Check-In,Check-Out,Nights,Booking Date\n';

        hotelBookingsList.forEach(b => {
            const timestampStr = b.timestamp ? new Date(b.timestamp).toLocaleString() : '';
            csv += `"${b.reference}","${b.guestName}","${b.members || 1}","${b.email}","${b.phone}","${b.checkin}","${b.checkout}","${b.nights}","${timestampStr}"\n`;
        });

        downloadCSV(csv, 'hotel_bookings.csv');
    } catch (error) {
        console.error('Error exporting hotel bookings:', error);
        alert('Error exporting hotel bookings data');
    }
}

function downloadCSV(csv, filename) {
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('hidden', '');
    a.setAttribute('href', url);
    a.setAttribute('download', filename);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// ========== LOGOUT ==========
async function logout() {
    try {
        if (window.globalUnsubscribers) {
            window.globalUnsubscribers.forEach(unsub => {
                if (typeof unsub === 'function') unsub();
            });
            window.globalUnsubscribers = [];
        }

        localStorage.removeItem('weddingAdminCurrentTab');
        localStorage.removeItem('cachedStaffName');
        localStorage.removeItem('cachedStaffId');
        localStorage.removeItem('adminDashboardStats');
        localStorage.removeItem('adminCachedLastVisitTs');
        localStorage.removeItem('adminCachedLoginHistoryHtml');
        sessionStorage.removeItem('master_unlocked');

        // Also reset the DOM state for the logs tab so it doesn't stay open if they log right back in
        if (typeof activityLogsUnsubscribe === 'function') {
            try { activityLogsUnsubscribe(); } catch (e) { }
        }
        const logsDataArea = document.getElementById('logsDataArea');
        const pinVerificationArea = document.getElementById('pinVerificationArea');
        const otpVerificationArea = document.getElementById('otpVerificationArea');
        const masterPinInput = document.getElementById('masterPinInput');
        const masterOtpInput = document.getElementById('masterOtpInput');

        if (logsDataArea) logsDataArea.style.display = 'none';
        if (otpVerificationArea) otpVerificationArea.style.display = 'none';
        if (pinVerificationArea) pinVerificationArea.style.display = 'block';
        if (masterPinInput) masterPinInput.value = '';
        if (masterOtpInput) masterOtpInput.value = '';

        await logAdminActivity("Logged Out", `Session ended for ${currentStaffName}`);
        await signOut(auth);
        // The onAuthStateChanged listener handles showing the login screen
        document.getElementById('adminLoginForm').reset();
        stopScanner();
    } catch (error) {
        console.error('Logout error:', error);
        alert('Error logging out. Please try again.');
    }
}

// ========== QR CODE PREVIEW ==========
async function showQRPreview(rsvpId) {
    const qrCodeUrl = generateQRCodeImage(rsvpId);

    document.getElementById('previewQrCode').innerHTML = `
                <img src="${qrCodeUrl}" alt="QR Code for ${rsvpId}" style="max-width: 200px;">
            `;
    document.getElementById('previewGuestId').textContent = rsvpId;
    document.getElementById('qrPreview').style.display = 'block';
}

function closeQRPreview() {
    document.getElementById('qrPreview').style.display = 'none';
}



// ========== DEBUG ==========
function debugGuestEmails() {
    console.log('=== DEBUG: Guest Email Analysis ===');
    const guestsWithEmails = guests.filter(g => g.email && g.email.trim() !== '');
    const guestsWithoutEmails = guests.filter(g => !g.email || g.email.trim() === '');
    const guestsWithInvalidEmails = guests.filter(g => g.email && g.email.trim() !== '' && !isValidEmail(g.email));

    console.log(`Total guests: ${guests.length}`);
    console.log(`Guests with valid emails: ${guestsWithEmails.length}`);
    console.log(`Guests without emails: ${guestsWithoutEmails.length}`);
    console.log(`Guests with invalid emails: ${guestsWithInvalidEmails.length}`);

    console.log('Guests without emails:');
    guestsWithoutEmails.forEach(guest => {
        console.log(`- ${guest.first_name} ${guest.last_name}: "${guest.email}"`);
    });

    console.log('Guests with invalid emails:');
    guestsWithInvalidEmails.forEach(guest => {
        console.log(`- ${guest.first_name} ${guest.last_name}: "${guest.email}"`);
    });

    alert(`Email Debug Results:\nTotal Guests: ${guests.length}\nValid Emails: ${guestsWithEmails.length}\nNo Email: ${guestsWithoutEmails.length}\nInvalid Emails: ${guestsWithInvalidEmails.length}\nCheck browser console for details.`);
}

// ========== SESSION CLOSURE LOGGING ==========

let isShuttingDown = false;

function handleTabKill(event) {
    if (isShuttingDown) return;

    // If persisted===true, it's a BFCache (back/forward navigation) — NOT a real kill
    // We set sessionPausedFlag but NOT forceLogoutOnNextLoad so normal navigation works
    if (auth && auth.currentUser && currentStaffName) {
        if (event && event.persisted === true) {
            localStorage.setItem('sessionPausedFlag', 'true');
            localStorage.setItem('lastActiveUser', currentStaffName);
            return;
        }

        isShuttingDown = true;
        localStorage.setItem('forceLogoutOnNextLoad', 'true');
        localStorage.setItem('sessionPausedFlag', 'true');
        localStorage.setItem('lastActiveUser', currentStaffName);

        logAdminActivity("App Backgrounded/Closed", `Session abruptly ended for ${currentStaffName}`);
        sessionStorage.removeItem('master_unlocked');

        const start = Date.now();
        while (Date.now() - start < 250) { }
    }
}

// Only pagehide can distinguish genuine tab-kill vs navigation via event.persisted
window.addEventListener('pagehide', handleTabKill);

// When the user switches to a different app/tab (Backgrounded)
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && auth && auth.currentUser && currentStaffName) {
        // Set flag BEFORE logging to ensure persistence even if process is killed
        localStorage.setItem('sessionPausedFlag', 'true');
        localStorage.setItem('lastActiveUser', currentStaffName);

        logAdminActivity("App Backgrounded paused", `App paused by ${currentStaffName}`);
    } else if (document.visibilityState === 'visible') {
        if (localStorage.getItem('forceLogoutOnNextLoad') === 'true') {
            // Instantly force logout if the BFCache resumes a dead session
            localStorage.removeItem('forceLogoutOnNextLoad');
            localStorage.removeItem('sessionPausedFlag');
            signOut(auth).then(() => {
                document.getElementById('loginSection').style.display = 'block';
                document.getElementById('adminDashboard').style.display = 'none';
                document.getElementById('realtimeIndicator').style.display = 'none';
                currentStaffName = "";
            });
        } else if (localStorage.getItem('sessionPausedFlag') === 'true' && auth && auth.currentUser && currentStaffName) {
            localStorage.removeItem('sessionPausedFlag');
            logAdminActivity("Session Resumed", `Returned from background: ${currentStaffName}`);
        }
    }
});

// ========== MANUAL CHECK-IN BY NAME SEARCH ==========
function searchGuestsForManualCheckin() {
    const query = document.getElementById('manualSearchInput').value.trim().toLowerCase();
    const resultsDiv = document.getElementById('manualCheckinResults');
    const statusDiv = document.getElementById('manualCheckinStatus');
    if (statusDiv) statusDiv.style.display = 'none';

    if (query.length < 2) {
        resultsDiv.style.display = 'none';
        resultsDiv.innerHTML = '';
        return;
    }

    const matched = guests.filter(g => {
        // Enforce Day Restriction
        if (!g.is_attending) return false;
        if (!g.days_attending || !g.days_attending.includes(currentScanDay)) return false;

        const fullName = `${g.first_name} ${g.last_name}`.toLowerCase();
        const email = (g.email || '').toLowerCase();
        const phone = (g.phone || '').toLowerCase();
        return fullName.includes(query) || email.includes(query) || phone.includes(query);
    });

    if (matched.length === 0) {
        resultsDiv.style.display = 'block';
        resultsDiv.innerHTML = `<div style="text-align:center; padding: 20px; color: #888;">
                    <i class="fas fa-user-slash" style="font-size:2rem; margin-bottom:10px; display:block;"></i>
                    No guests attending <b>Day ${currentScanDay.replace('day', '')}</b> found matching "<strong>${escapeHtml(query)}</strong>"
                </div>`;
        return;
    }

    renderManualCheckinResults(matched);
}

function renderManualCheckinResults(matched) {
    const resultsDiv = document.getElementById('manualCheckinResults');
    resultsDiv.style.display = 'block';

    const dayLabels = { day1: 'Day 1 – Welcome Dinner', day2: 'Day 2 – Wedding Day', day3: 'Day 3 – Farewell Brunch' };
    const currentDayLabel = dayLabels[currentScanDay] || currentScanDay;

    let html = `<p style="font-size:0.85rem; color:#555; margin-bottom:10px;">
                <i class="fas fa-info-circle"></i> Checking in for: <strong>${currentDayLabel}</strong>
            </p>`;

    matched.forEach(guest => {
        const fullName = `${escapeHtml(guest.first_name)} ${escapeHtml(guest.last_name)}`;
        const isAttending = guest.is_attending;
        const daysArr = guest.days_attending || [];
        const attendsThisDay = daysArr.includes(currentScanDay);

        // Check if already checked in for current day
        const alreadyCheckedIn = attendance.some(a => a.rsvp_id === guest.rsvp_id && a.day === currentScanDay);

        const statusColor = !isAttending ? '#dc3545' : !attendsThisDay ? '#fd7e14' : alreadyCheckedIn ? '#856404' : '#155724';
        const statusBg = !isAttending ? '#f8d7da' : !attendsThisDay ? '#fff3cd' : alreadyCheckedIn ? '#fff3cd' : '#d4edda';
        const statusIcon = !isAttending ? '❌' : !attendsThisDay ? '⚠️' : alreadyCheckedIn ? '⚠️' : '✅';
        const statusText = !isAttending ? 'Not Attending' : !attendsThisDay ? 'Not registered for this day' : alreadyCheckedIn ? 'Already checked in' : 'Ready to check in';

        const canCheckIn = isAttending && attendsThisDay && !alreadyCheckedIn;
        const additionalCount = guest.guests ? guest.guests.length : 0;

        html += `
                <div style="background: white; border-radius: 12px; padding: 18px; margin-bottom: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.08); border-left: 4px solid ${statusColor};">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 10px;">
                        <div>
                            <div style="font-size: 1.1rem; font-weight: 700; color: var(--dark);">👤 ${fullName}</div>
                            <div style="font-size: 0.82rem; color: #666; margin-top: 4px;">
                                📧 ${escapeHtml(guest.email || 'N/A')} &nbsp;|&nbsp; 📞 ${escapeHtml(guest.phone || 'N/A')}
                            </div>
                            <div style="font-size: 0.82rem; color: #888; margin-top: 3px;">
                                Days: ${daysArr.length > 0 ? daysArr.map(d => d.replace('day', 'Day ')).join(', ') : 'None'} &nbsp;|&nbsp;
                                RSVP ID: <code style="font-size:0.78rem; background:#f0f0f0; padding:1px 5px; border-radius:3px;">${escapeHtml(guest.rsvp_id)}</code>
                                ${additionalCount > 0 ? ` &nbsp;|&nbsp; +${additionalCount} additional guest(s)` : ''}
                            </div>
                        </div>
                        <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                            <span style="padding: 5px 12px; border-radius: 20px; font-size: 0.8rem; font-weight: 600; background: ${statusBg}; color: ${statusColor};">
                                ${statusIcon} ${statusText}
                            </span>
                            ${canCheckIn ? `
                            <button onclick="manualCheckIn('${escapeHtml(guest.rsvp_id)}', '${fullName.replace(/'/g, "\\'")}', '${guest.id}')"
                                style="background: #28a745; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: 700; font-size: 0.9rem; display: flex; align-items: center; gap: 6px; transition: 0.2s;"
                                onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">
                                <i class="fas fa-check-circle"></i> Check In
                            </button>` : ''}
                        </div>
                    </div>
                </div>`;
    });

    resultsDiv.innerHTML = html;
}

async function manualCheckIn(rsvpId, guestName, guestDocId) {
    const statusDiv = document.getElementById('manualCheckinStatus');

    showManualStatus('loading', `⏳ Checking in ${guestName}...`);

    try {
        // Double-check not already checked in
        const attendanceRef = collection(firestoreDb, 'attendance');
        const attendanceQ = query(attendanceRef, where('rsvp_id', '==', rsvpId), where('day', '==', currentScanDay));
        const attendanceSnapshot = await getDocs(attendanceQ);

        if (!attendanceSnapshot.empty) {
            const existingTime = new Date(attendanceSnapshot.docs[0].data().check_in_time).toLocaleTimeString();
            showManualStatus('warning', `⚠️ ${guestName} is already checked in for this day (at ${existingTime}).`);
            showToast('warning', 'Already Checked In', `${guestName} was already checked in at ${existingTime}.`);
            searchGuestsForManualCheckin(); // Refresh display
            return;
        }

        // Save attendance record
        await addDoc(collection(firestoreDb, 'attendance'), {
            guest_name: guestName,
            rsvp_id: rsvpId,
            day: currentScanDay,
            staff_member: currentStaffName,
            check_in_time: new Date().toISOString(),
            method: 'manual_name_search'
        });

        // Update checked_in_days on the guest document
        const guestDocRef = doc(firestoreDb, 'guests', guestDocId);
        const guestSnap = await getDoc(guestDocRef);
        if (guestSnap.exists()) {
            const updatedCheckedInDays = guestSnap.data().checked_in_days || [];
            if (!updatedCheckedInDays.includes(currentScanDay)) {
                updatedCheckedInDays.push(currentScanDay);
                await updateDoc(guestDocRef, { checked_in_days: updatedCheckedInDays });
            }
        }

        const dayLabels = { day1: 'Welcome Dinner', day2: 'Wedding Day', day3: 'Farewell Brunch' };
        showManualStatus('success', `✅ ${guestName} successfully checked in for ${dayLabels[currentScanDay] || currentScanDay}!`);
        showToast('success', 'Manual Check-In Successful!', `${guestName}\nChecked in for ${dayLabels[currentScanDay]}\nTime: ${new Date().toLocaleTimeString()}`);
        logAdminActivity("Manual Check-In", `Manually checked in: ${guestName} for ${dayLabels[currentScanDay]} (via name search)`);

        // Instant optimistic UI update so the card turns green instantly
        attendance.push({
            rsvp_id: rsvpId,
            guest_id: guestDocId,
            guest_name: guestName,
            day: currentScanDay,
            staff_member: currentStaffName,
            check_in_time: new Date().toISOString(),
            method: 'manual_name_search'
        });

        searchGuestsForManualCheckin(); // Refresh cards instantly
        loadDashboardData(); // Sync full dashboard in background without blocking UI

    } catch (error) {
        console.error('Manual check-in error:', error);
        showManualStatus('error', `❌ Error during check-in: ${error.message}`);
    }
}

function showManualStatus(type, message) {
    const statusDiv = document.getElementById('manualCheckinStatus');
    const colors = {
        success: { bg: '#d4edda', color: '#155724', border: '#c3e6cb' },
        warning: { bg: '#fff3cd', color: '#856404', border: '#ffeaa7' },
        error: { bg: '#f8d7da', color: '#721c24', border: '#f5c6cb' },
        loading: { bg: '#e3f2fd', color: '#0d47a1', border: '#90caf9' }
    };
    const c = colors[type] || colors.loading;
    statusDiv.style.cssText = `display:block; margin-top:15px; padding:12px 18px; border-radius:8px; font-weight:600; font-size:0.95rem; background:${c.bg}; color:${c.color}; border:1px solid ${c.border};`;
    statusDiv.textContent = message;
}

function clearManualSearch() {
    document.getElementById('manualSearchInput').value = '';
    document.getElementById('manualCheckinResults').style.display = 'none';
    document.getElementById('manualCheckinResults').innerHTML = '';
    document.getElementById('manualCheckinStatus').style.display = 'none';
}
// ==========================================
// CORE APP LOGIC (SECURED FOR PRODUCTION)
// ==========================================

let db = {};
let appConfig = {};
let currentUser = null;
let currentSession = {};

// 1. SIMPLE HASH FUNCTION (To hide admin password)
async function sha256(message) {
	const msgBuffer = new TextEncoder().encode(message);
	const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// 2. INITIALIZATION
document.addEventListener("DOMContentLoaded", function () {
	// Disable Console in Production
	if (
		window.location.hostname !== "localhost" &&
		window.location.hostname !== "127.0.0.1"
	) {
		console.log = function () {};
		console.warn = function () {};
		console.error = function () {};
	}

	// Restore Theme
	const savedTheme = localStorage.getItem("appTheme") || "light";
	document.documentElement.setAttribute("data-bs-theme", savedTheme);
	const themeBtn = document.getElementById("theme-toggle");
	if (themeBtn)
		themeBtn.innerHTML =
			savedTheme === "dark"
				? '<i class="bi bi-sun"></i>'
				: '<i class="bi bi-moon-stars"></i>';

	// Load Local Data
	const localDB = localStorage.getItem("employeeDB");
	const localConf = localStorage.getItem("appConfig");

	if (localDB) db = JSON.parse(localDB);
	if (localConf) appConfig = JSON.parse(localConf);

	// Restore Session
	const savedUser = sessionStorage.getItem("hr_user");
	if (savedUser) {
		currentUser = JSON.parse(savedUser);
	}

	// Auto-Sync if User Exists
	if (currentUser) {
		showApp();
		syncData();
	} else {
		syncData(); // Silent background sync
	}
});

async function attemptLogin() {
    const u = document.getElementById("login-user").value.trim();
    const p = document.getElementById("login-pass").value.trim();
    const btn = document.getElementById("login-btn");
    
    btn.disabled = true;
    btn.innerText = "Syncing Database...";

    // FORCE SYNC: Always try to get latest data from Sheet before login
    // This ensures new devices pull the data immediately.
    await syncData();

    btn.innerText = "Verifying...";

    // 1. Admin Check (Hashed)
    if (u === "HRaul___") {
        const pHash = await sha256(p);
        if (pHash === ADMIN_HASH) {
            loginSuccess({ id: "admin", name: "Super Admin", role: "admin" });
            return;
        }
    }

    // 2. Employee Check
    if(db[u] && db[u].password === p) {
        const rec = db[u];
        let role = "employee";
        if(rec.seniority && (rec.seniority.includes("Manager") || rec.seniority.includes("Lead"))) {
            role = "manager";
        }
        loginSuccess({ id: rec.id, name: rec.name, role: role });
        return;
    }

    // 3. Failure
    alert("Invalid ID or Password. If you are a new employee, please wait for Admin to sync.");
    btn.disabled = false;
    btn.innerText = "Login System";
}

function loginSuccess(user) {
	currentUser = user;
	sessionStorage.setItem("hr_user", JSON.stringify(user));
	sessionStorage.setItem("hr_auth", "valid"); // Token placeholder
	showApp();
}

function doLogout() {
	currentUser = null;
	sessionStorage.clear();
	location.reload();
}

async function syncData() {
    const btn = document.getElementById('sync-btn');
    if(btn) btn.classList.add('spin');

    try {
        // We use 'cors' mode and 'follow' redirects to handle Google's architecture
        const requestOptions = {
            method: "GET",
            mode: "cors",
            redirect: "follow"
        };

        // 1. Sync Database
        const resDB = await fetch(`${API_URL}?type=db`, requestOptions);
        if (!resDB.ok) throw new Error("DB Network response was not ok");
        const dataDB = await resDB.json();
        
        if (dataDB && Object.keys(dataDB).length > 0) {
            db = dataDB;
            localStorage.setItem('employeeDB', JSON.stringify(db));
        }

        // 2. Sync Config
        const resConf = await fetch(`${API_URL}?type=config`, requestOptions);
        if (!resConf.ok) throw new Error("Config Network response was not ok");
        const dataConf = await resConf.json();
        
        if (dataConf && Object.keys(dataConf).length > 0) {
            appConfig = dataConf;
            localStorage.setItem('appConfig', JSON.stringify(appConfig));
        }

        if(typeof renderRecordsTable === 'function') renderRecordsTable();
        
    } catch (error) {
        // Detailed error for you to see in DevTools (on your local machine)
        if (window.location.hostname === "localhost") {
            console.error("Connection Error:", error);
        }
        
        // Show alert only if this is a login attempt
        const loginBtn = document.getElementById("login-btn");
        if (loginBtn && loginBtn.innerText === "Syncing Database...") {
            alert("Connection Error: Unable to reach the server. Please check your internet or Google Script URL.");
        }
    } finally {
        if(btn) btn.classList.remove('spin');
    }
}

// 2. UPDATED SAVE TO CLOUD (Added Protection)
function saveToCloud(type = "db") {
    // SECURITY: Never save to cloud if the local variable is empty!
    // This prevents a blank browser from wiping your Google Sheet.
    if (type === 'db' && (!db || Object.keys(db).length === 0)) {
        return; 
    }

    // Update Local First
    if (type === 'db') localStorage.setItem('employeeDB', JSON.stringify(db));

    fetch(API_URL, {
        method: "POST",
        mode: "no-cors", 
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ type: type, data: (type === 'db' ? db : appConfig) })
    }).catch(e => {
        // Fail silently or log locally
    });
}

// 6. UI SWITCHER
function showApp() {
	document.getElementById("login-view").classList.add("hidden");
	document.getElementById("main-app").classList.remove("hidden");

	if (!currentUser) {
		const saved = sessionStorage.getItem("hr_user");
		if (saved) currentUser = JSON.parse(saved);
		else {
			doLogout();
			return;
		}
	}

	const role = currentUser.role;

	document
		.querySelectorAll(".nav-item")
		.forEach((el) => el.classList.add("hidden"));

	if (role === "admin") {
		document
			.querySelectorAll(".nav-item")
			.forEach((el) => el.classList.remove("hidden"));
		renderDashboard();
		switchTab("tab-dashboard");
	} else if (role === "manager") {
		document.getElementById("nav-1").parentElement.classList.remove("hidden");
		document.getElementById("nav-2").parentElement.classList.remove("hidden");
		document.getElementById("nav-4").parentElement.classList.remove("hidden");
		document.getElementById("nav-5").parentElement.classList.remove("hidden");
		renderDashboard();
		switchTab("tab-dashboard");
	} else {
		document.getElementById("nav-1").parentElement.classList.remove("hidden");
		document.getElementById("nav-2").parentElement.classList.remove("hidden");
		switchTab("tab-records");
	}

	// Update Header Name
	const userDisplay = document.getElementById("user-display-name");
	if (userDisplay) userDisplay.innerText = currentUser.name;

	if (typeof renderRecordsTable === "function") renderRecordsTable();
}

function switchTab(tabId) {
	document
		.querySelectorAll(".content-section")
		.forEach((el) => el.classList.remove("active"));
	document
		.querySelectorAll(".nav-tab")
		.forEach((el) => el.classList.remove("active"));

	const target = document.getElementById(tabId);
	if (target) target.classList.add("active");

	if (tabId === "tab-assessment") {
		document.getElementById("nav-1").classList.add("active");
		if (typeof renderPendingList === "function") renderPendingList();
	}
	if (tabId === "tab-records") {
		document.getElementById("nav-2").classList.add("active");
		if (typeof renderRecordsTable === "function") renderRecordsTable();
	}
	if (tabId === "tab-admin") {
		document.getElementById("nav-3").classList.add("active");
	}
	if (tabId === "tab-dashboard") {
		document.getElementById("nav-4").classList.add("active");
		if (typeof renderDashboard === "function") renderDashboard();
	}
	if (tabId === "tab-employees") {
		document.getElementById("nav-5").classList.add("active");
		if (typeof renderEmployeeManager === "function") renderEmployeeManager();
	}
}

// UTILS
function escapeHTML(str) {
	if (!str) return "";
	return String(str).replace(/[&<>"']/g, function (m) {
		return {
			"&": "&amp;",
			"<": "&lt;",
			">": "&gt;",
			'"': "&quot;",
			"'": "&#39;",
		}[m];
	});
}

function getDepartment(pos) {
	if (!pos) return "Other";
	const p = pos.toLowerCase();
	if (p.includes("hr") || p.includes("human")) return "HR";
	if (p.includes("finance") || p.includes("account")) return "Finance";
	if (p.includes("dev") || p.includes("engineer") || p.includes("tech"))
		return "IT/Engineering";
	if (p.includes("sales") || p.includes("marketing")) return "Sales/Marketing";
	return "Operations";
}

function getInputValue(val) {
	if (!val || val === "-") return "";
	try {
		const d = new Date(val);
		if (isNaN(d.getTime())) return "";
		return d.toISOString().split("T")[0];
	} catch (e) {
		return "";
	}
}

function getDisplayDate(val) {
	if (!val || val === "-") return "-";
	try {
		const d = new Date(val);
		if (isNaN(d.getTime())) return String(val).substring(0, 10);
		return d.toISOString().split("T")[0];
	} catch (e) {
		return String(val).substring(0, 10);
	}
}

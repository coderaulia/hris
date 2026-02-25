// 1. RENDER EMPLOYEE MANAGER
function renderEmployeeManager() {
	// 1. Position Dropdown
	const posSelect = document.getElementById("emp-position");
	const currentPosVal = posSelect.value;
	posSelect.innerHTML = '<option value="">-- Select Position --</option>';
	if (appConfig) {
		Object.keys(appConfig)
			.sort()
			.forEach((pos) => {
				posSelect.innerHTML += `<option value="${escapeHTML(pos)}">${escapeHTML(pos)}</option>`;
			});
	}
	// Restore if editing
	if (
		currentPosVal &&
		document.getElementById("emp-edit-mode").value === "true"
	) {
		posSelect.value = currentPosVal;
	}

	// 2. MANAGER DROPDOWN (Fix)
	const mgrSelect = document.getElementById("emp-manager-id");
	const currentMgrVal = mgrSelect.value; // Save current selection

	mgrSelect.innerHTML = '<option value="">-- Direct to Director --</option>';

	// Sort employees by name to make the dropdown nice
	const sortedIds = Object.keys(db).sort((a, b) =>
		db[a].name.localeCompare(db[b].name),
	);

	sortedIds.forEach((id) => {
		const rec = db[id];
		// Check if Seniority contains "Manager" or "Lead"
		if (
			rec.seniority &&
			(rec.seniority.includes("Manager") ||
				rec.seniority.includes("Lead") ||
				rec.seniority.includes("Sr. Lead"))
		) {
			mgrSelect.innerHTML += `<option value="${rec.id}">${rec.name} (${rec.position})</option>`;
		}
	});

	// Restore selected manager if editing, or if user was typing
	if (currentMgrVal) {
		mgrSelect.value = currentMgrVal;
	}

	// 3. Render Table
	const tbody = document.getElementById("employee-list-body");
	tbody.innerHTML = "";

	document.getElementById("emp-count-badge").innerText =
		sortedIds.length + " Staff";

	sortedIds.forEach((id) => {
		const rec = db[id];
		const statusBadge =
			rec.percentage && rec.percentage > 0
				? '<span class="badge bg-success">Assessed</span>'
				: '<span class="badge bg-secondary">Pending</span>';

		// Check if user is manager to highlight in table
		const isMgr =
			rec.seniority &&
			(rec.seniority.includes("Manager") || rec.seniority.includes("Lead"));
		const mgrIcon = isMgr
			? '<i class="bi bi-star-fill text-warning me-1"></i>'
			: "";

		tbody.innerHTML += `
            <tr>
                <td class="font-monospace small">${escapeHTML(rec.id)}</td>
                <td class="fw-bold">${mgrIcon}${escapeHTML(rec.name)}</td>
                <td>
                    <div class="small">${escapeHTML(rec.position)}</div>
                    <div class="text-muted" style="font-size:10px;">${escapeHTML(rec.seniority)}</div>
                </td>
                <td class="text-center">${statusBadge}</td>
                <td class="text-end">
                    <button class="btn btn-sm btn-outline-primary border-0" onclick="loadEmployeeForEdit('${rec.id}')">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger border-0" onclick="deleteEmployeeData('${rec.id}')">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            </tr>
        `;
	});
}

// 2. SAVE EMPLOYEE (Create or Update Bio Only)
function saveEmployeeData() {
	const id = document.getElementById("emp-id").value.trim();
	const name = document.getElementById("emp-name").value.trim();
	const pos = document.getElementById("emp-position").value;
	const seniority = document.getElementById("emp-seniority").value;
	const joinDate = document.getElementById("emp-join").value;
	const isEdit = document.getElementById("emp-edit-mode").value === "true";
	const password = document.getElementById("emp-password").value.trim();
	const managerId = document.getElementById("emp-manager-id").value;

	if (!id || !name || !pos || !joinDate) {
		alert("Please fill in ID, Name, Position, and Join Date.");
		return;
	}

	// Check Duplicate ID (only if NOT editing)
	if (!isEdit && db[id]) {
		alert("ID " + id + " already exists. Please use a unique ID.");
		return;
	}

	// Prepare Record
	// If editing, preserve existing scores/history. If new, initialize empty.
	let rec = isEdit
		? db[id]
		: {
				id: id,
				date_created: "-",
				date_updated: "-",
				date_next: "-",
				percentage: 0,
				scores: [],
				training_history: [],
				history: [],
			};

	// Update Bio Fields
	rec.name = name;
	rec.position = pos;
	rec.seniority = seniority;
	rec.join_date = joinDate;
	rec.password = password; // NEW
	rec.manager_id = managerId; // NEW

	// Auto-assign Department (using helper from core.js)
	rec.department = getDepartment(pos);

	// Save
	db[id] = rec;
	saveToCloud("db");

	alert(isEdit ? "Employee Updated!" : "Employee Added!");
	resetEmployeeForm();
	renderEmployeeManager();
}

// 3. LOAD FOR EDIT
function loadEmployeeForEdit(id) {
	const rec = db[id];
	if (!rec) return;

	document.getElementById("emp-id").value = rec.id;
	document.getElementById("emp-id").disabled = true;
	document.getElementById("emp-name").value = rec.name;
	document.getElementById("emp-seniority").value = rec.seniority || "Junior";

	// FIX: Use helper to get clean YYYY-MM-DD
	document.getElementById("emp-join").value = getInputValue(rec.join_date);

	document.getElementById("emp-password").value = rec.password || "";
	document.getElementById("emp-manager-id").value = rec.manager_id || "";

	// Position handling
	renderEmployeeManager();
	document.getElementById("emp-position").value = rec.position;

	// UI States
	document.getElementById("emp-edit-mode").value = "true";
	document.getElementById("emp-cancel-btn").classList.remove("hidden");
	document.querySelector(".col-md-4 .card").classList.add("border-primary");
}

// 4. RESET FORM
function resetEmployeeForm() {
	document.getElementById("emp-id").value = "";
	document.getElementById("emp-id").disabled = false;
	document.getElementById("emp-name").value = "";
	document.getElementById("emp-position").value = "";
	document.getElementById("emp-join").value = "";
	document.getElementById("emp-seniority").value = "Junior";

	document.getElementById("emp-edit-mode").value = "false";
	document.getElementById("emp-cancel-btn").classList.add("hidden");
	document.querySelector(".col-md-4 .card").classList.remove("border-primary");
}

// 5. DELETE EMPLOYEE
function deleteEmployeeData(id) {
	if (
		confirm(
			`Delete ${db[id].name}? This will remove all their assessment history and scores.`,
		)
	) {
		delete db[id];
		saveToCloud("db");
		renderEmployeeManager();
	}
}

// 6. EXPORT EMPLOYEE CSV
function exportEmployeeCSV() {
	let csvContent = "data:text/csv;charset=utf-8,";
	// Header
	csvContent +=
		"ID,Name,Position,Seniority,Join_Date,Department,Password,Manager_ID\n";

	Object.values(db).forEach((rec) => {
		const row = [
			safeCSV(rec.id),
			safeCSV(rec.name),
			safeCSV(rec.position),
			safeCSV(rec.seniority),
			safeCSV(rec.join_date),
			safeCSV(rec.department),
			safeCSV(rec.password),
			safeCSV(rec.manager_id),
		].join(",");
		csvContent += row + "\n";
	});

	const encodedUri = encodeURI(csvContent);
	const link = document.createElement("a");
	link.setAttribute("href", encodedUri);
	link.setAttribute("download", "employee_data.csv");
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
}

// 7. IMPORT EMPLOYEE CSV
function importEmployeeCSV(input) {
	const file = input.files[0];
	if (!file) return;

	const reader = new FileReader();
	reader.onload = function (e) {
		const text = e.target.result;
		const lines = text.split(/\r\n|\n/);

		let count = 0;
		let startRow = 0;

		// Detect Header
		if (lines.length > 0 && lines[0].toLowerCase().includes("id"))
			startRow = 1;

		for (let i = startRow; i < lines.length; i++) {
			const line = lines[i].trim();
			if (!line) continue;

			// Split by comma, handling quotes
			const parts = line
				.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
				.map((s) => s.replace(/^"|"$/g, "").trim());

			if (parts.length >= 2) {
				// Minimum ID and Name
				const id = parts[0];

				// If ID exists, update it. If not, create new.
				// We PRESERVE assessment data if updating an existing user.
				const existing = db[id] || {
					id: id,
					percentage: 0,
					scores: [],
					history: [],
					training_history: [],
					date_created: "-",
					date_updated: "-",
					date_next: "-",
				};

				existing.name = parts[1];
				existing.position = parts[2] || "";
				existing.seniority = parts[3] || "Junior";
				existing.join_date = parts[4] || "";
				existing.department = parts[5] || getDepartment(existing.position);
				existing.password = parts[6] || "";
				existing.manager_id = parts[7] || "";

				db[id] = existing;
				count++;
			}
		}

		saveToCloud("db");
		renderEmployeeManager();
		alert(`Imported ${count} employees successfully!`);
		input.value = ""; // Reset input
	};
	reader.readAsText(file);
}

function safeCSV(str) {
	if (str === null || str === undefined) return "";
	let s = String(str);
	if (/^[=+\-@]/.test(s)) s = "'" + s; // Security
	if (s.includes(",") || s.includes('"') || s.includes("\n")) {
		s = '"' + s.replace(/"/g, '""') + '"';
	}
	return s;
}

// ==========================================
// RECORDS & REPORTS LOGIC (Cleaned & Consolidated)
// ==========================================

let competencyChart = null;
let historyChart = null;

// 1. RENDER RECORDS TABLE (Filtered by Role)
function renderRecordsTable(filterKeys = null) {
	const tbody = document.getElementById("records-table-body");
	const toolbar = document.getElementById("records-toolbar");

	if (!tbody) return;
	tbody.innerHTML = "";
	if (!currentUser) return; // Safety

	// UI: Hide Toolbar for Employees
	if (currentUser.role === "employee") {
		if (toolbar) toolbar.classList.add("hidden");
	} else {
		if (toolbar) toolbar.classList.remove("hidden");
	}

	// Get Keys
	let keys = filterKeys ? filterKeys : Object.keys(db);

	// FILTER LOGIC
	if (currentUser.role === "manager") {
		const mgrRec = db[currentUser.id];
		// Show same department OR direct reports
		if (mgrRec && mgrRec.department) {
			keys = keys.filter((id) => db[id].department === mgrRec.department);
		} else {
			keys = keys.filter((id) => db[id].manager_id === currentUser.id);
		}
	} else if (currentUser.role === "employee") {
		keys = keys.filter((id) => id == currentUser.id);
	}

	if (keys.length === 0) {
		tbody.innerHTML =
			'<tr><td colspan="6" class="text-center text-muted py-3">No records found.</td></tr>';
		return;
	}

	// SORTING
	const sortMode = document.getElementById("record-sort")
		? document.getElementById("record-sort").value
		: "date_desc";

	keys.sort((a, b) => {
		const recA = db[a];
		const recB = db[b];
		const dateA = new Date(
			recA.date_updated !== "-"
				? recA.date_updated
				: recA.date_created !== "-"
					? recA.date_created
					: "1970-01-01",
		);
		const dateB = new Date(
			recB.date_updated !== "-"
				? recB.date_updated
				: recB.date_created !== "-"
					? recB.date_created
					: "1970-01-01",
		);

		if (sortMode === "date_asc") return dateA - dateB;
		if (sortMode === "score_desc")
			return (recB.percentage || 0) - (recA.percentage || 0);
		if (sortMode === "score_asc")
			return (recA.percentage || 0) - (recB.percentage || 0);
		if (sortMode === "name_asc") return recA.name.localeCompare(recB.name);
		return dateB - dateA;
	});

	// RENDER LOOP
	keys.forEach(function (key) {
		const rec = db[key];
		if (!rec) return;

		const seniorTxt = rec.seniority || "-";
		let levelClass = "bg-secondary text-white";
		if (seniorTxt.includes("Manager")) levelClass = "bg-dark text-white";
		else if (seniorTxt === "Junior") levelClass = "bg-info text-dark";
		else if (seniorTxt === "Intermediate")
			levelClass = "bg-primary text-white";
		else if (seniorTxt === "Senior") levelClass = "bg-warning text-dark";
		else if (seniorTxt === "Lead") levelClass = "bg-success text-white";

		const assessDate = rec.date_created || rec.date || "-";
		const pct = rec.percentage || 0;

		let badgeColor = "bg-secondary";
		if (pct >= 80) badgeColor = "bg-success";
		else if (pct >= 60) badgeColor = "bg-primary";
		else if (pct >= 40) badgeColor = "bg-warning text-dark";
		else badgeColor = "bg-danger";

		// ACTIONS
		let actions = "";

		if (currentUser.role !== "employee") {
			// MANAGER / ADMIN ACTIONS
			actions = `
                <button class="btn btn-outline-secondary" onclick="editRecordSafe(this)" data-id="${escapeHTML(rec.id)}" title="Edit"><i class="bi bi-pencil"></i></button>
                <button class="btn btn-outline-danger" onclick="deleteRecordSafe(this)" data-id="${escapeHTML(rec.id)}" title="Delete"><i class="bi bi-trash"></i></button>
            `;
		} else {
			// EMPLOYEE ACTION (The Fix)
			// Instead of "View Only", we give them the Start Button
			actions = `
			<button class="btn btn-sm btn-primary shadow-sm" onclick="initiateSelfAssessment('${escapeHTML(rec.id)}')">
				<i class="bi bi-pencil-square"></i> Start Self-Assessment
			</button>
			`;
		}

		tbody.innerHTML += `
            <tr>
                <td>
                    <div class="fw-bold">${escapeHTML(rec.name)}</div>
                    <div class="small text-muted font-monospace">${escapeHTML(rec.id)}</div>
                </td>
                <td>
                    <div>${escapeHTML(rec.position)}</div>
                    <span class="badge ${levelClass}">${escapeHTML(seniorTxt)}</span>
                </td>
                <td><div class="small">${escapeHTML(assessDate)}</div></td>
                <td><span class="badge ${badgeColor}">${pct}%</span></td>
                <td class="text-end">
                    <div class="btn-group btn-group-sm shadow-sm" role="group">
                        <button class="btn btn-outline-success" onclick="openTrainingLog('${escapeHTML(rec.id)}')" title="Training"><i class="bi bi-mortarboard"></i></button>
                        <button class="btn btn-outline-primary" onclick="openReportByVal('${escapeHTML(rec.id)}')" title="Report"><i class="bi bi-eye"></i></button>
                        ${actions}
                    </div>
                </td>
            </tr>
        `;
	});
}

// 2. OPEN COMPARATIVE REPORT (Matches Formal Design)
function openReportByVal(id) {
	const rec = db[id];
	if (!rec) return;

	// Helper for safe text setting
	const setTxt = (domId, val) => {
		const el = document.getElementById(domId);
		if (el) el.innerText = val;
	};

	// Helper for Dates (No Time)
	const displayFn =
		typeof getDisplayDate === "function" ? getDisplayDate : (s) => s || "-";

	// A. Basic Info
	setTxt("r-name", rec.name);
	setTxt("r-id", rec.id);
	setTxt("r-pos", rec.position);
	setTxt("r-seniority", rec.seniority);

	// MATCHING THE NEW HTML IDs
	setTxt("r-join-date", displayFn(rec.join_date)); // Updated ID
	setTxt("r-date-updated", displayFn(rec.date_updated || rec.date_created)); // Updated ID
	setTxt("r-date-next", displayFn(rec.date_next)); // Updated ID

	setTxt("r-total", rec.percentage || 0);
	setTxt("r-date-generated", new Date().toLocaleDateString());

	// B. Comparative Data & Table
	const details = document.getElementById("r-details");
	const recList = document.getElementById("r-rec-list");
	if (details) details.innerHTML = "";
	if (recList) recList.innerHTML = "";

	const posConfig = appConfig[rec.position] || { competencies: [] };
	const chartLabels = [];
	const mgrData = [];
	const selfData = [];
	let needsTraining = false;

	// Map Self Scores
	const selfMap = {};
	if (rec.self_scores) {
		rec.self_scores.forEach((s) => (selfMap[s.q] = s.s));
	}

	// Loop Scores
	if (rec.scores && rec.scores.length > 0) {
		rec.scores.forEach(function (s) {
			chartLabels.push(s.q);
			mgrData.push(s.s);
			const selfScore = selfMap[s.q] || 0;
			selfData.push(selfScore);

			// Gap
			const gap = s.s - selfScore;
			let gapHtml = "-";
			if (selfScore > 0) {
				if (Math.abs(gap) >= 2)
					gapHtml = `<span class="badge bg-warning text-dark">Gap: ${gap}</span>`;
				else
					gapHtml = `<span class="badge bg-light text-secondary border">Match</span>`;
			} else {
				gapHtml = `<span class="text-muted small">-</span>`;
			}

			// Recs
			const compConfig = posConfig.competencies.find((c) => c.name === s.q);
			if (s.s < 7) {
				needsTraining = true;
				const recText = compConfig
					? compConfig.rec
					: "Training Recommended";
				if (recList)
					recList.innerHTML += `<li class="mb-1"><strong>${escapeHTML(s.q)} (${s.s}):</strong> ${escapeHTML(recText)}</li>`;
			}

			if (details) {
				details.innerHTML += `
                    <tr>
                        <td>
                            <div class="fw-bold">${escapeHTML(s.q)}</div>
                            <div class="small text-muted fst-italic" style="font-size:11px;">${s.n ? '"' + escapeHTML(s.n) + '"' : ""}</div>
                        </td>
                        <td class="text-center align-middle text-primary fw-bold">${selfScore > 0 ? selfScore : "-"}</td>
                        <td class="text-center align-middle text-dark fw-bold">${s.s}</td>
                        <td class="text-center align-middle">${gapHtml}</td>
                    </tr>
                `;
			}
		});
	}

	if (!needsTraining && recList) {
		recList.innerHTML =
			"<li><i class='bi bi-check-circle text-success'></i> Performance meets expectations.</li>";
	}

	// C. Charts
	if (document.getElementById("competencyChart"))
		renderComparisonChart(chartLabels, mgrData, selfData);

	const historyBox = document.getElementById("r-history-box");
	let histData = rec.history ? [...rec.history] : [];
	histData.push({ date: rec.date_updated || "Today", score: rec.percentage });

	if (historyBox) {
		if (histData.length > 0) {
			historyBox.classList.remove("hidden");
			if (document.getElementById("historyChart"))
				renderHistoryChart(histData);
		} else {
			historyBox.classList.add("hidden");
		}
	}

	// E. Training Tables
	renderReportTrainingTables(rec.training_history || []);

	// F. Show Modal
	const overlay = document.getElementById("report-overlay");
	if (overlay) overlay.classList.remove("hidden");
}

// Helper for Training Tables in Report
function renderReportTrainingTables(history) {
	const tOngoingList = document.getElementById("r-training-ongoing");
	const tCompletedList = document.getElementById("r-training-completed");
	const tEmpty = document.getElementById("r-training-empty");
	const tOngoingBox = document.getElementById("r-training-ongoing-box");
	const tCompletedBox = document.getElementById("r-training-completed-box");

	if (tOngoingList) tOngoingList.innerHTML = "";
	if (tCompletedList) tCompletedList.innerHTML = "";

	let hasOngoing = false;
	let hasCompleted = false;

	history.forEach((t) => {
		if (!t.end && t.status === "approved") {
			hasOngoing = true;
			if (tOngoingList)
				tOngoingList.innerHTML += `<tr><td>${escapeHTML(t.course)}</td><td>${escapeHTML(t.start)}</td></tr>`;
		} else if (t.end && t.status === "approved") {
			hasCompleted = true;
			if (tCompletedList)
				tCompletedList.innerHTML += `<tr><td>${escapeHTML(t.course)}</td><td>${escapeHTML(t.start)}</td><td>${escapeHTML(t.end)}</td></tr>`;
		}
	});

	// Toggle Visibility based on content
	if (tOngoingBox) tOngoingBox.style.display = hasOngoing ? "block" : "none";
	if (tCompletedBox)
		tCompletedBox.style.display = hasCompleted ? "block" : "none";

	if (tEmpty) {
		if (!hasOngoing && !hasCompleted) tEmpty.classList.remove("hidden");
		else tEmpty.classList.add("hidden");
	}
}

// 3. CHART RENDERING
function renderComparisonChart(labels, mgrData, selfData) {
	const ctx = document.getElementById("competencyChart");
	if (competencyChart) competencyChart.destroy();

	competencyChart = new Chart(ctx, {
		type: "radar",
		data: {
			labels: labels,
			datasets: [
				{
					label: "Manager Assessment",
					data: mgrData,
					borderColor: "rgb(13, 110, 253)",
					backgroundColor: "rgba(13, 110, 253, 0.2)",
					borderWidth: 2,
				},
				{
					label: "Self Assessment",
					data: selfData,
					borderColor: "rgb(255, 193, 7)",
					backgroundColor: "rgba(255, 193, 7, 0.2)",
					borderWidth: 2,
					borderDash: [5, 5],
				},
			],
		},
		options: {
			elements: { line: { borderWidth: 3 } },
			scales: {
				r: { suggestedMin: 0, suggestedMax: 10, ticks: { stepSize: 2 } },
			},
		},
	});
}

function renderHistoryChart(dataPoints) {
	const ctx = document.getElementById("historyChart");
	if (!ctx) return;
	if (historyChart) historyChart.destroy();

	historyChart = new Chart(ctx, {
		type: "line",
		data: {
			labels: dataPoints.map((d) => d.date),
			datasets: [
				{
					label: "Performance Trend",
					data: dataPoints.map((d) => d.score),
					borderColor: "#198754",
					tension: 0.2,
					fill: true,
					backgroundColor: "rgba(25, 135, 84, 0.1)",
				},
			],
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			scales: { y: { beginAtZero: true, max: 100 } },
		},
	});
}

function renderReportTrainingTables(history) {
	const tOngoingList = document.getElementById("r-training-ongoing");
	const tCompletedList = document.getElementById("r-training-completed");

	tOngoingList.innerHTML = "";
	tCompletedList.innerHTML = "";

	history.forEach((t) => {
		if (!t.end && t.status === "approved") {
			tOngoingList.innerHTML += `<tr><td>${escapeHTML(t.course)}</td><td>${escapeHTML(t.start)}</td></tr>`;
		} else if (t.end && t.status === "approved") {
			tCompletedList.innerHTML += `<tr><td>${escapeHTML(t.course)}</td><td>${escapeHTML(t.start)}</td><td>${escapeHTML(t.end)}</td></tr>`;
		}
	});

	if (tOngoingList.innerHTML === "")
		tOngoingList.innerHTML =
			"<tr><td colspan='2' class='text-muted small'>No ongoing training.</td></tr>";
	if (tCompletedList.innerHTML === "")
		tCompletedList.innerHTML =
			"<tr><td colspan='3' class='text-muted small'>No completed training.</td></tr>";
}

// ==========================================
// 4. TRAINING LOG & WORKFLOW LOGIC
// ==========================================

let editingTrainingIndex = -1; // -1 means adding new, 0+ means editing index
let currentTrainingId = null;

// A. OPEN THE LOG
function openTrainingLog(id) {
	const rec = db[id];
	if (!rec) return;

	currentTrainingId = id;
	editingTrainingIndex = -1;
	resetTrainingForm();

	// 1. Set Header Info
	document.getElementById("t-name").innerText = rec.name;
	document.getElementById("t-id").innerText = rec.position;

	// 2. Customize UI based on Role
	const formTitle = document.getElementById("t-form-title");
	const submitBtn = document.getElementById("t-submit-btn");

	if (currentUser.role === "employee") {
		formTitle.innerText = "Request New Training";
		submitBtn.innerHTML = '<i class="bi bi-send"></i> Submit Request';
		submitBtn.classList.remove("btn-primary");
		submitBtn.classList.add("btn-success");
	} else {
		formTitle.innerText = "Add Training Record";
		submitBtn.innerHTML = '<i class="bi bi-plus-lg"></i> Add Record';
		submitBtn.classList.add("btn-primary");
		submitBtn.classList.remove("btn-success");
	}

	// 3. Populate "Recommendation" Dropdown
	const sel = document.getElementById("t-comp-select");
	sel.innerHTML =
		'<option value="">-- Select Competency to Auto-fill --</option>';

	if (appConfig[rec.position] && appConfig[rec.position].competencies) {
		appConfig[rec.position].competencies.forEach((c) => {
			sel.innerHTML += `<option value="${escapeHTML(c.rec)}">${escapeHTML(c.name)}: ${escapeHTML(c.rec)}</option>`;
		});
	}

	// 4. Render
	renderTrainingHistory();
	document.getElementById("training-overlay").classList.remove("hidden");
}

// B. RENDER TABLE (With Approval Workflow)
function renderTrainingHistory() {
	const tbody = document.getElementById("t-history-body");
	tbody.innerHTML = "";
	const rec = db[currentTrainingId];
	const history = rec.training_history || [];

	if (history.length === 0) {
		tbody.innerHTML =
			'<tr><td colspan="5" class="text-center text-muted small py-3">No history found.</td></tr>';
		return;
	}

	history.forEach((item, index) => {
		// Status Badge Logic
		let statusBadge = '<span class="badge bg-success">Approved</span>';
		let actionBtn = "";

		if (item.status === "pending") {
			statusBadge =
				'<span class="badge bg-warning text-dark">Pending</span>';
			// Manager/Admin can approve
			if (currentUser.role !== "employee") {
				actionBtn = `<button class="btn btn-sm btn-success py-0 px-2 me-1" onclick="approveTraining(${index})" title="Approve Request"><i class="bi bi-check"></i></button>`;
			}
		} else if (item.status === "rejected") {
			statusBadge = '<span class="badge bg-danger">Rejected</span>';
		}

		// End Date or Ongoing
		const endDate = item.end
			? item.end
			: '<span class="badge bg-warning text-dark" style="font-size: 0.6em;">Ongoing</span>';

		// Edit/Delete Controls
		// Managers can edit/delete anything. Employees can only delete their own PENDING requests.
		let controls = "";

		if (currentUser.role !== "employee") {
			// Manager: Full Control
			controls = `
                <button class="btn btn-sm btn-link text-primary p-0 me-1" onclick="editTrainingItem(${index})"><i class="bi bi-pencil"></i></button>
                <button class="btn btn-sm btn-link text-danger p-0" onclick="deleteTrainingItem(${index})"><i class="bi bi-trash"></i></button>
             `;
		} else if (item.status === "pending") {
			// Employee: Delete Only (if pending)
			controls = `<button class="btn btn-sm btn-link text-danger p-0" onclick="deleteTrainingItem(${index})"><i class="bi bi-trash"></i></button>`;
		}

		tbody.innerHTML += `
            <tr>
                <td>
                    <div class="fw-bold">${escapeHTML(item.course)}</div>
                    <div class="small text-muted">${escapeHTML(item.provider || "External")}</div>
                </td>
                <td class="text-center">${statusBadge}</td>
                <td class="small">${item.start || "-"}</td>
                <td class="small">${endDate}</td>
                <td class="text-end">
                    ${actionBtn}
                    ${controls}
                </td>
            </tr>
        `;
	});
}

// C. SAVE (ADD/REQUEST)
function saveTrainingLog() {
	const rec = db[currentTrainingId];
	if (!rec) return;

	// Get Values
	const course = document.getElementById("t-course-name").value.trim();
	const start = document.getElementById("t-date-start").value;
	let end = document.getElementById("t-date-end").value;
	const isOngoing = document.getElementById("t-ongoing").checked;

	if (!course) {
		alert("Please enter a course name.");
		return;
	}
	if (isOngoing) end = "";

	if (!rec.training_history) rec.training_history = [];

	// Logic: Employees = Pending, Managers = Approved
	let status = "approved";
	if (currentUser.role === "employee") status = "pending";

	const newItem = {
		course: course,
		start: start,
		end: end,
		provider: "External",
		status: status,
	};

	if (editingTrainingIndex === -1) {
		// ADD NEW
		rec.training_history.push(newItem);
	} else {
		// UPDATE EXISTING (Keep previous status if editing, unless manager approves)
		// If Manager edits, we assume they approve or keep it as is.
		// For simplicity, editing keeps existing status unless specifically changing it.
		newItem.status = rec.training_history[editingTrainingIndex].status;
		rec.training_history[editingTrainingIndex] = newItem;
	}

	saveToCloud("db");
	renderTrainingHistory();
	resetTrainingForm();

	if (currentUser.role === "employee" && editingTrainingIndex === -1) {
		alert("Training Request submitted to Manager.");
	}
}

// D. ACTIONS
function approveTraining(index) {
	const rec = db[currentTrainingId];
	rec.training_history[index].status = "approved";
	saveToCloud("db");
	renderTrainingHistory();
}

function editTrainingItem(index) {
	const rec = db[currentTrainingId];
	const item = rec.training_history[index];
	editingTrainingIndex = index;

	// Fill Form
	document.getElementById("t-course-name").value = item.course;
	document.getElementById("t-date-start").value = item.start;
	document.getElementById("t-date-end").value = item.end;

	const chk = document.getElementById("t-ongoing");
	if (!item.end) {
		chk.checked = true;
		document.getElementById("t-date-end").disabled = true;
	} else {
		chk.checked = false;
		document.getElementById("t-date-end").disabled = false;
	}

	document.getElementById("t-form-title").innerText = "Edit Record";
	document.getElementById("t-submit-btn").innerHTML =
		'<i class="bi bi-check-lg"></i> Update';
	document.getElementById("t-cancel-edit").classList.remove("hidden");
}

function deleteTrainingItem(index) {
	if (!confirm("Remove this item?")) return;
	const rec = db[currentTrainingId];
	rec.training_history.splice(index, 1);
	saveToCloud("db");
	renderTrainingHistory();
}

// E. UI HELPERS
function closeTrainingLog() {
	document.getElementById("training-overlay").classList.add("hidden");
	currentTrainingId = null;
}

function resetTrainingForm() {
	editingTrainingIndex = -1;
	document.getElementById("t-course-name").value = "";
	document.getElementById("t-date-start").value = "";
	document.getElementById("t-date-end").value = "";
	document.getElementById("t-date-end").disabled = false;
	document.getElementById("t-ongoing").checked = false;
	document.getElementById("t-comp-select").value = "";

	// Reset Title based on role
	const title =
		currentUser.role === "employee"
			? "Request New Training"
			: "Add Training Record";
	const btnHtml =
		currentUser.role === "employee"
			? '<i class="bi bi-send"></i> Submit Request'
			: '<i class="bi bi-plus-lg"></i> Add Record';

	document.getElementById("t-form-title").innerText = title;
	document.getElementById("t-submit-btn").innerHTML = btnHtml;
	document.getElementById("t-cancel-edit").classList.add("hidden");
}

function fillTrainingRec() {
	const val = document.getElementById("t-comp-select").value;
	if (val) document.getElementById("t-course-name").value = val;
}

function toggleOngoing() {
	const isOngoing = document.getElementById("t-ongoing").checked;
	const endInput = document.getElementById("t-date-end");
	if (isOngoing) {
		endInput.value = "";
		endInput.disabled = true;
	} else {
		endInput.disabled = false;
	}
}

// ==========================================
// 5. GLOBAL UTILS
// ==========================================

function searchRecords() {
	const term = document.getElementById("search-input").value.toLowerCase();
	const keys = Object.keys(db).filter(function (id) {
		const rec = db[id];
		return (
			rec.name.toLowerCase().includes(term) ||
			rec.id.toLowerCase().includes(term) ||
			rec.position.toLowerCase().includes(term)
		);
	});
	renderRecordsTable(keys);
}

function closeReport() {
	document.getElementById("report-overlay").classList.add("hidden");
}

function deleteRecordSafe(btn) {
	if (currentUser.role === "employee") {
		alert("Access Denied");
		return;
	}

	const id = btn.getAttribute("data-id");
	const rec = db[id];
	if (!rec) return;

	if (
		confirm(
			`Are you sure you want to DELETE the assessment results for ${rec.name}?\n\nThis will reset scores to 0% and clear history, but keep the employee.`,
		)
	) {
		rec.percentage = 0;
		rec.scores = [];
		rec.history = [];
		rec.date_created = "-";
		rec.date_updated = "-";
		rec.date_next = "-";

		db[id] = rec;
		saveToCloud("db");
		renderRecordsTable();
		alert("Assessment deleted. Employee reset to 'Pending'.");
	}
}

function editRecordSafe(btn) {
	if (currentUser.role === "employee") {
		alert("Access Denied");
		return;
	}

	const id = btn.getAttribute("data-id");
	const rec = db[id];
	if (!rec) return;

	if (!confirm(`Edit assessment for ${rec.name}?`)) return;

	currentSession = JSON.parse(JSON.stringify(rec));
	currentSession.isEditing = true;
	currentSession.scores_backup = rec.scores;

	document.getElementById("inp-id").value = rec.id;
	document.getElementById("inp-name").value = rec.name;
	document.getElementById("inp-seniority").value = rec.seniority;
	document.getElementById("inp-join-date").value = rec.join_date || "";

	switchTab("tab-assessment");
	startAssessment();
}

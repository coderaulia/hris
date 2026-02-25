// ==========================================
// ASSESSMENT LOGIC (Bulletproof Employee Mode)
// ==========================================

// NEW: FAST TRACK FOR EMPLOYEES (Bypasses Step 1 entirely)
function initiateSelfAssessment(clickedId) {
	// 1. Normalize IDs to Strings to prevent Type Mismatches (e.g. 101 vs "101")
	const targetId = String(clickedId).trim();
	const currentId = String(currentUser.id).trim();

	console.log(
		"Attempting Self-Assessment:",
		targetId,
		"vs Logged In:",
		currentId,
	);

	// 2. Security Check
	if (targetId !== currentId) {
		alert(
			`Security Violation: You are logged in as ID ${currentId}, but tried to assess ID ${targetId}.`,
		);
		return;
	}

	const rec = db[targetId];
	if (!rec) {
		alert("Error: Employee Record not found.");
		return;
	}

	// 3. Build Session immediately
	currentSession = {
		id: rec.id,
		name: rec.name,
		join_date: rec.join_date,
		seniority: rec.seniority,
		scores: [],
		position: rec.position,
	};

	// 4. Load Previous Self Scores (if any)
	if (rec.self_scores && rec.self_scores.length > 0) {
		currentSession.scores = rec.self_scores;
		currentSession.isEditing = true;
	}

	// 5. Force Switch Tab
	switchTab("tab-assessment");

	// 6. BYPASS "Step 1" -> GO DIRECTLY TO "Step 2"
	document.getElementById("step-login").classList.add("hidden");
	document.getElementById("step-form").classList.remove("hidden");

	// 7. Render the Form
	refreshPosDropdown();

	// Wait 100ms for the DOM to settle, then fill and lock the position
	setTimeout(() => {
		const posSelect = document.getElementById("inp-position");
		if (posSelect) {
			// Try to set value
			posSelect.value = rec.position;

			// If the position exists in config, lock it and render
			if (appConfig[rec.position]) {
				posSelect.disabled = true;
				renderQuestions(currentSession.isEditing);
			} else {
				// Fallback if position name doesn't match config exactly
				alert(
					`Warning: The position "${rec.position}" was not found in the Competency Config. Please select a position manually.`,
				);
				posSelect.disabled = false;
			}
		}
	}, 100);
}

// 1. RENDER / PREPARE THE VIEW
function renderPendingList() {
	// If Employee, we just show the Start Button and hide the complex selectors
	if (currentUser && currentUser.role === "employee") {
		const sel = document.getElementById("inp-pending-select");
		if (sel && sel.closest(".mb-3"))
			sel.closest(".mb-3").style.display = "none";

		// B. Auto-Fill Data
		const rec = db[currentUser.id];
		if (rec) {
			document.getElementById("inp-id").value = rec.id;
			document.getElementById("inp-name").value = rec.name;
			// FIX: Use helper
			document.getElementById("inp-join-date").value = getInputValue(
				rec.join_date,
			);
			document.getElementById("inp-seniority").value = rec.seniority;

			document.getElementById("inp-id").disabled = true;
			document.getElementById("inp-name").disabled = true;
			document.getElementById("inp-join-date").disabled = true;
			document.getElementById("inp-seniority").disabled = true;
		}

		const startBtn = document.querySelector("#step-login .btn-primary");
		if (startBtn)
			startBtn.innerHTML =
				'<i class="bi bi-pencil-square"></i> Start Self-Assessment';

		return;
	}

	// MANAGER / ADMIN LOGIC (Standard Dropdown)
	const sel = document.getElementById("inp-pending-select");
	if (!sel) return;

	if (sel.closest(".mb-3")) sel.closest(".mb-3").style.display = "block";
	document.getElementById("inp-id").disabled = false;
	document.getElementById("inp-name").disabled = false;
	document.getElementById("inp-join-date").disabled = false;
	document.getElementById("inp-seniority").disabled = false;

	sel.innerHTML = '<option value="">-- Select Employee to Assess --</option>';

	let keys = Object.keys(db);
	if (currentUser.role === "manager") {
		const mgrRec = db[currentUser.id];
		if (mgrRec && mgrRec.department) {
			keys = keys.filter(
				(id) =>
					db[id].department === mgrRec.department && id !== currentUser.id,
			);
		} else {
			keys = keys.filter((id) => db[id].manager_id === currentUser.id);
		}
	}
	keys.sort((a, b) => (db[a].name || "").localeCompare(db[b].name || ""));

	keys.forEach((id) => {
		const rec = db[id];
		const status = rec.percentage > 0 ? "✅ Done" : "⏳ Pending";
		sel.innerHTML += `<option value="${escapeHTML(rec.id)}">${escapeHTML(rec.name)} (${escapeHTML(rec.position)}) - ${status}</option>`;
	});
}

// 2. LOAD SELECTED EMPLOYEE (Manager Only)
function loadPendingEmployee() {
	if (currentUser.role === "employee") return;

	const selector = document.getElementById("inp-pending-select");
	const id = selector.value;
	if (!id) return;

	const rec = db[id];
	if (rec) {
		document.getElementById("inp-id").value = rec.id;
		document.getElementById("inp-name").value = rec.name;
		// FIX: Use helper
		document.getElementById("inp-join-date").value = getInputValue(
			rec.join_date,
		);
		document.getElementById("inp-seniority").value = rec.seniority;
	}
}

// 3. START ASSESSMENT (THE FIX)
function startAssessment() {
	let targetId = null;

	// --- BRANCH LOGIC ---
	if (currentUser.role === "employee") {
		// DIRECT BYPASS: Ignore HTML inputs. Use Session ID.
		targetId = currentUser.id;
		console.log("Starting Self-Assessment for:", targetId);
	} else {
		// MANAGER: Read from the HTML Inputs
		targetId = document.getElementById("inp-id").value.trim();
	}

	// --- VALIDATION ---
	if (!targetId) {
		alert("Error: No Employee ID identified.");
		return;
	}

	const rec = db[targetId];
	if (!rec) {
		alert("Employee Record not found in database.");
		return;
	}

	// --- BUILD SESSION ---
	if (!currentSession.isEditing) {
		// Manager Warning
		if (currentUser.role !== "employee" && rec.percentage > 0) {
			if (
				!confirm(
					`Warning: ${rec.name} has already been assessed. Overwrite?`,
				)
			)
				return;
		}

		// CONSTRUCT SESSION DIRECTLY FROM DB (Reliable)
		currentSession = {
			id: rec.id,
			name: rec.name,
			join_date: rec.join_date,
			seniority: rec.seniority,
			scores: [],
			position: rec.position,
		};

		// LOAD PREVIOUS SCORES
		if (currentUser.role === "employee") {
			// Load Self Scores
			if (rec.self_scores && rec.self_scores.length > 0) {
				currentSession.scores = rec.self_scores;
				currentSession.isEditing = true;
			}
		} else {
			// Manager: Fresh start (or load existing if you prefer)
		}
	} else {
		// Edit Mode (Manager updating seniority/date)
		if (currentUser.role !== "employee") {
			currentSession.seniority =
				document.getElementById("inp-seniority").value;
			currentSession.join_date =
				document.getElementById("inp-join-date").value;
		}
		currentSession.scores = [];
	}

	// --- UI TRANSITION ---
	document.getElementById("step-login").classList.add("hidden");
	document.getElementById("step-form").classList.remove("hidden");

	// --- LOAD COMPETENCIES ---
	refreshPosDropdown();
	const posSelect = document.getElementById("inp-position");
	const targetPos = currentSession.position;

	if (targetPos) {
		setTimeout(() => {
			let found = false;
			for (let i = 0; i < posSelect.options.length; i++) {
				if (posSelect.options[i].value === targetPos) {
					posSelect.selectedIndex = i;
					found = true;
					break;
				}
			}
			if (found) renderQuestions(currentSession.isEditing);

			// Lock Position Dropdown for Employee
			if (currentUser.role === "employee") posSelect.disabled = true;
			else posSelect.disabled = false;
		}, 100);
	}
}

function refreshPosDropdown() {
	const sel = document.getElementById("inp-position");
	sel.innerHTML = '<option value="">-- Select Position --</option>';
	if (appConfig) {
		for (const pos in appConfig) {
			sel.innerHTML +=
				'<option value="' +
				escapeHTML(pos) +
				'">' +
				escapeHTML(pos) +
				"</option>";
		}
	}
}

// 4. RENDER QUESTIONS (Slider Inputs)
function renderQuestions(isEdit = false) {
	const questionsArea = document.getElementById("questions-area");
	questionsArea.innerHTML = "";

	// Get Position
	const posSelect = document.getElementById("inp-position");
	const position = posSelect.value;

	if (!position || !appConfig[position]) {
		questionsArea.innerHTML =
			'<div class="alert alert-warning">Please select a valid position to load competencies.</div>';
		return;
	}

	const competencies = appConfig[position].competencies || [];

	// Update Header Title
	const formTitle = document.querySelector("#step-form h4");
	if (formTitle) {
		formTitle.innerHTML =
			currentUser.role === "employee"
				? '<i class="bi bi-person-check"></i> Self-Assessment'
				: '<i class="bi bi-clipboard-check"></i> Employee Assessment';
	}

	competencies.forEach((comp, index) => {
		let oldVal = 5;
		let oldNote = "";

		// If editing, try to find existing score
		if (isEdit && currentSession.scores) {
			const found = currentSession.scores.find((s) => s.q === comp.name);
			if (found) {
				oldVal = found.s;
				oldNote = found.n || "";
			}
		}

		questionsArea.innerHTML += `
            <div class="card mb-3 shadow-sm">
                <div class="card-body">
                    <label class="form-label fw-bold mb-1">${escapeHTML(comp.name)}</label>
                    <p class="small text-muted mb-2">${escapeHTML(comp.desc || "Rate proficiency level.")}</p>
                    
                    <div class="row g-3">
                        <div class="col-md-4">
                            <div class="d-flex justify-content-between mb-1">
                                <span class="small text-muted">Score (1-10)</span>
                                <span class="fw-bold text-primary" id="val-${index}">${oldVal}</span>
                            </div>
                            <input type="range" class="form-range" min="1" max="10" step="1" 
                                id="q-${index}" value="${oldVal}" 
                                oninput="document.getElementById('val-${index}').innerText = this.value">
                            
                            <div class="d-flex justify-content-between small text-muted" style="font-size: 10px;">
                                <span>Novice</span>
                                <span>Expert</span>
                            </div>
                        </div>

                        <div class="col-md-8">
                            <textarea class="form-control form-control-sm" id="note-${index}" 
                                placeholder="Evidence / Example..."
                                rows="2">${escapeHTML(oldNote)}</textarea>
                        </div>
                    </div>
                </div>
            </div>
        `;
	});
}

// 5. REVIEW ANSWERS (THE FIX)
function reviewAssessment() {
	// A. Get Position
	const pos = document.getElementById("inp-position").value;
	if (!pos || !appConfig[pos]) {
		alert("Error: Position is missing or invalid.");
		return;
	}

	// B. Gather Data by looping through Config (Source of Truth)
	const comps = appConfig[pos].competencies;
	let tempScores = [];
	let missingCount = 0;

	comps.forEach((c, index) => {
		const valEl = document.getElementById(`q-${index}`);
		const noteEl = document.getElementById(`note-${index}`);

		if (valEl) {
			const val = parseInt(valEl.value);
			const note = noteEl ? noteEl.value.trim() : "";

			tempScores.push({
				q: c.name,
				s: val,
				n: note,
			});
		} else {
			missingCount++;
		}
	});

	if (missingCount > 0) {
		alert("Error: Some questions could not be found. Please refresh.");
		return;
	}

	// C. Save to Session
	currentSession.position = pos;
	currentSession.scores = tempScores;

	// D. Render Review Screen
	const revArea = document.getElementById("review-area");
	revArea.innerHTML = "";

	tempScores.forEach(function (item) {
		revArea.innerHTML += `
            <div class="d-flex justify-content-between border-bottom py-2">
                <div>
                    <div class="fw-bold small">${escapeHTML(item.q)}</div>
                    <div class="text-muted fst-italic" style="font-size: 11px;">${item.n ? '"' + escapeHTML(item.n) + '"' : ""}</div>
                </div>
                <div class="fw-bold text-primary fs-5 ms-3">${item.s}</div>
            </div>
        `;
	});

	// E. Switch Views
	document.getElementById("step-form").classList.add("hidden");
	document.getElementById("step-review").classList.remove("hidden");

	// Scroll to top
	window.scrollTo(0, 0);
}

// 6. FINAL SUBMIT
function finalSubmit() {
	// 1. Calculate Score
	let total = 0;
	// Safety check: if scores are empty, reload them from session or re-gather
	if (!currentSession.scores || currentSession.scores.length === 0) {
		alert("Error: No scores found. Please go back and review.");
		return;
	}

	let maxPoints = currentSession.scores.length * 10;
	if (maxPoints === 0) maxPoints = 1;

	currentSession.scores.forEach((x) => (total += x.s));
	let pct = Math.round((total / maxPoints) * 100);

	// 2. Prepare Record
	const rec = db[currentSession.id];

	// Preserve System Fields
	rec.password = rec.password || "";
	rec.manager_id = rec.manager_id || "";
	rec.training_history = rec.training_history || [];
	rec.department = getDepartment(rec.position);

	// 3. Save Logic
	if (currentUser.role === "employee") {
		// Self Assessment
		rec.self_scores = currentSession.scores;
		rec.self_percentage = pct;
		rec.self_date = new Date().toLocaleDateString();
		alert("Self-Assessment Submitted Successfully!");
	} else {
		// Manager Assessment
		// Archive History
		let history = rec.history || [];
		if (rec.percentage > 0) {
			const archiveEntry = {
				date:
					rec.date_updated === "-" ? rec.date_created : rec.date_updated,
				score: rec.percentage,
				seniority: rec.seniority || "-",
			};
			// Prevent duplicates
			const isDuplicate = history.some(
				(h) =>
					h.date === archiveEntry.date && h.score === archiveEntry.score,
			);
			if (!isDuplicate) history.push(archiveEntry);
		}
		rec.history = history;

		// Save New Data
		rec.percentage = pct;
		rec.scores = currentSession.scores;
		rec.date_updated = new Date().toLocaleDateString();
		if (!rec.date_created || rec.date_created === "-")
			rec.date_created = rec.date_updated;

		// Calculate Tenure
		const now = new Date();
		function calculateTenure(joinDateString) {
			if (!joinDateString) return "N/A";
			const joinDate = new Date(joinDateString);
			if (isNaN(joinDate)) return "N/A";
			let years = now.getFullYear() - joinDate.getFullYear();
			let months = now.getMonth() - joinDate.getMonth();
			if (
				months < 0 ||
				(months === 0 && now.getDate() < joinDate.getDate())
			) {
				years--;
				months += 12;
			}
			return years > 0
				? `${joinDateString} (${years} yrs, ${months} mos)`
				: `${joinDateString} (${months} mos)`;
		}
		rec.tenure_display = calculateTenure(rec.join_date);

		alert("Employee Assessment Submitted!");
	}

	// 4. Commit to DB & Cloud
	db[rec.id] = rec;
	saveToCloud("db");

	// 5. Cleanup & Redirect
	currentSession = {};
	renderRecordsTable();
	openReportByVal(rec.id);

	// Reset Views
	document.getElementById("step-review").classList.add("hidden");
	document.getElementById("step-login").classList.remove("hidden");

	// Refresh Pending List (if manager needs to see next person)
	renderPendingList();
}

// 7. BACK BUTTONS
function backToForm() {
	document.getElementById("step-review").classList.add("hidden");
	document.getElementById("step-form").classList.remove("hidden");
}

function goBack(stepId) {
	// Hide all steps
	document.getElementById("step-login").classList.add("hidden");
	document.getElementById("step-form").classList.add("hidden");
	document.getElementById("step-review").classList.add("hidden");

	// Show target
	document.getElementById(stepId).classList.remove("hidden");

	if (stepId === "step-login") {
		if (currentUser.role === "employee") {
			renderPendingList();
		} else {
			// Manager Reset
			document.getElementById("inp-id").value = "";
			document.getElementById("inp-name").value = "";
			document.getElementById("inp-join-date").value = "";
			document.getElementById("inp-seniority").value = "";
			document.getElementById("inp-position").value = "";
			document.getElementById("inp-pending-select").value = "";
			document.getElementById("questions-area").innerHTML = "";
		}
	}
}

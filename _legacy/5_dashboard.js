let chartDistInstance = null;
let chartStatusInstance = null;
let chartScoreInstance = null;

function renderDashboard() {
	const keys = Object.keys(db);

	// Stats Vars
	let totalEmp = keys.length;
	let pendingCount = 0;
	let completedCount = 0;
	let totalScore = 0;
	let maxScore = -1;
	let topPerformer = { name: "-", dept: "-" };

	// Data Structure: { "Creative": { total: 0, completed: 0, pending: 0, sumScore: 0 } }
	let deptMap = {};

	keys.forEach((id) => {
		const rec = db[id];

		// Ensure Dept exists
		if (!rec.department || rec.department === "Other")
			rec.department = getDepartment(rec.position);
		const dept = rec.department;

		if (!deptMap[dept])
			deptMap[dept] = { total: 0, completed: 0, pending: 0, sumScore: 0 };
		deptMap[dept].total++;

		const score = rec.percentage || 0;

		if (score > 0) {
			// Completed
			completedCount++;
			totalScore += score;
			deptMap[dept].completed++;
			deptMap[dept].sumScore += score;

			if (score > maxScore) {
				maxScore = score;
				topPerformer = { name: rec.name, dept: dept };
			}
		} else {
			// Pending
			pendingCount++;
			deptMap[dept].pending++;
		}
	});

	// 1. Update Text Cards
	document.getElementById("d-total-emp").innerText = totalEmp;
	const totalSub = document.getElementById("d-total-emp").nextElementSibling;
	if (totalSub)
		totalSub.innerHTML = `<span class="text-danger fw-bold">${pendingCount} Pending</span> | <span class="text-success fw-bold">${completedCount} Done</span>`;

	const globalAvg =
		completedCount > 0 ? Math.round(totalScore / completedCount) : 0;
	document.getElementById("d-avg-score").innerText = globalAvg + "%";

	document.getElementById("d-top-emp").innerText = topPerformer.name;
	document.getElementById("d-top-role").innerText = topPerformer.dept;

	// 2. Skill Gaps List
	let gapMap = {};
	keys.forEach((id) => {
		const rec = db[id];
		if (rec.percentage > 0 && rec.scores) {
			rec.scores.forEach((s) => {
				if (s.s < 7) {
					gapMap[s.q] = (gapMap[s.q] || 0) + 1;
				}
			});
		}
	});
	const gapList = Object.entries(gapMap)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 5);
	const gapEl = document.getElementById("d-skill-gaps");
	gapEl.innerHTML = "";
	if (gapList.length === 0)
		gapEl.innerHTML =
			'<li class="list-group-item text-center text-muted fst-italic">No data available.</li>';
	else {
		gapList.forEach((item) => {
			const pct =
				completedCount > 0
					? Math.round((item[1] / completedCount) * 100)
					: 0;
			gapEl.innerHTML += `<li class="list-group-item d-flex justify-content-between align-items-center"><div><div class="fw-bold">${item[0]}</div><div class="text-muted" style="font-size:11px;">Recommended for ${item[1]} staff</div></div><span class="badge bg-danger rounded-pill">${pct}% of Team</span></li>`;
		});
	}

	// 3. CHART: Distribution (Doughnut)
	let cHigh = 0,
		cMid = 0,
		cLow = 0;
	keys.forEach((id) => {
		const s = db[id].percentage || 0;
		if (s > 0) {
			if (s >= 80) cHigh++;
			else if (s >= 60) cMid++;
			else cLow++;
		}
	});
	const ctxDist = document.getElementById("chartDist");
	if (chartDistInstance) chartDistInstance.destroy();
	chartDistInstance = new Chart(ctxDist, {
		type: "doughnut",
		data: {
			labels: ["High (>80%)", "Mid (60-79%)", "Low (<60%)"],
			datasets: [
				{
					data: [cHigh, cMid, cLow],
					backgroundColor: ["#198754", "#0d6efd", "#dc3545"],
					borderWidth: 0,
				},
			],
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			plugins: { legend: { position: "right", labels: { boxWidth: 10 } } },
		},
	});

	// 4. CHART: Department Status (Stacked Bar)
	const deptLabels = Object.keys(deptMap);
	const dataCompleted = deptLabels.map((d) => deptMap[d].completed);
	const dataPending = deptLabels.map((d) => deptMap[d].pending);

	const ctxStatus = document.getElementById("chartStatus");
	if (chartStatusInstance) chartStatusInstance.destroy();
	chartStatusInstance = new Chart(ctxStatus, {
		type: "bar",
		data: {
			labels: deptLabels,
			datasets: [
				{ label: "Done", data: dataCompleted, backgroundColor: "#198754" },
				{
					label: "Pending",
					data: dataPending,
					backgroundColor: "#e9ecef",
					borderWidth: 1,
					borderColor: "#ced4da",
				},
			],
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			scales: {
				x: { stacked: true },
				y: { stacked: true, beginAtZero: true, ticks: { stepSize: 1 } },
			},
			plugins: { legend: { position: "top" } },
		},
	});

	// 5. CHART: Average Score (Bar)
	const dataScore = deptLabels.map((d) => {
		const info = deptMap[d];
		return info.completed > 0
			? Math.round(info.sumScore / info.completed)
			: 0;
	});

	const ctxScore = document.getElementById("chartScore");
	if (chartScoreInstance) chartScoreInstance.destroy();
	chartScoreInstance = new Chart(ctxScore, {
		type: "bar",
		data: {
			labels: deptLabels,
			datasets: [
				{
					label: "Avg Score",
					data: dataScore,
					backgroundColor: "#0d6efd",
					borderRadius: 4,
				},
			],
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			scales: { y: { beginAtZero: true, max: 100 } },
			plugins: { legend: { display: false } },
		},
	});

	renderPendingList();
}

function renderPendingList() {
	const sel = document.getElementById("inp-pending-select");
	if (!sel) return;

	sel.innerHTML = '<option value="">-- Select Employee to Assess --</option>';

	// 1. Get Keys
	let keys = Object.keys(db);

	// 2. FILTER BY ROLE (The Fix)
	if (currentUser) {
		if (currentUser.role === "manager") {
			const mgrRec = db[currentUser.id];
			if (mgrRec && mgrRec.department) {
				// Show same department (excluding the manager themselves)
				keys = keys.filter(
					(id) =>
						db[id].department === mgrRec.department &&
						id !== currentUser.id,
				);
			} else {
				// Fallback: Direct reports only
				keys = keys.filter((id) => db[id].manager_id === currentUser.id);
			}
		} else if (currentUser.role === "employee") {
			// Employee cannot assess anyone (or maybe just themselves for self-assessment?)
			// For now, hide everyone
			keys = [];
		}
	}

	// 3. Sort Alphabetically
	keys.sort((a, b) => {
		const nameA = (db[a].name || "").toUpperCase();
		const nameB = (db[b].name || "").toUpperCase();
		return nameA < nameB ? -1 : nameA > nameB ? 1 : 0;
	});

	let count = 0;
	keys.forEach((id) => {
		const rec = db[id];
		// Only show if they haven't been assessed recently (or show all to allow re-assessment)
		// Usually, we list everyone available to assess

		// SECURITY FIX: escapeHTML
		sel.innerHTML += `<option value="${escapeHTML(rec.id)}">${escapeHTML(rec.name)} (${escapeHTML(rec.position)})</option>`;
		count++;
	});

	if (count === 0) {
		sel.innerHTML =
			'<option value="">(No employees found for your role)</option>';
	}
}

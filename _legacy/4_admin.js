function renderAdminList() {
	const listEl = document.getElementById("admin-pos-list");
	if (!listEl) return;

	listEl.innerHTML = "";

	if (!appConfig || Object.keys(appConfig).length === 0) {
		listEl.innerHTML =
			'<li class="list-group-item text-muted fst-italic">No positions configured. Add one on the left.</li>';
		return;
	}

	const positions = Object.keys(appConfig).sort();

	positions.forEach(function (pos) {
		const compCount = appConfig[pos].competencies
			? appConfig[pos].competencies.length
			: 0;

		// SECURITY FIX: Escape the position name to prevent script injection
		const safePos = escapeHTML(pos);

		listEl.innerHTML += `
            <li class="admin-list-item">
                <div>
                    <span class="fw-bold fs-6">${safePos}</span>
                    <span class="badge bg-secondary text-white border ms-2">${compCount} Competencies</span>
                </div>
                <div>
                    <button class="btn btn-sm btn-outline-primary me-1" onclick="loadPositionForEdit('${safePos}')">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="deletePositionConfig('${safePos}')">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </li>
        `;
	});
}

function savePositionConfig() {
	const nameInput = document.getElementById("admin-pos-name");
	const compsInput = document.getElementById("admin-pos-comps");

	const posName = nameInput.value.trim();
	const compsText = compsInput.value.trim();

	if (!posName) {
		alert("Please enter a Position Name.");
		return;
	}
	if (!compsText) {
		alert("Please enter at least one competency.");
		return;
	}

	// Parse text area
	// Format: Name | Training | Description
	const lines = compsText.split("\n");
	const competencies = [];

	lines.forEach((line) => {
		if (line.trim()) {
			const parts = line.split("|");
			competencies.push({
				name: parts[0].trim(),
				rec: parts[1] ? parts[1].trim() : "General training recommended.",
				desc: parts[2] ? parts[2].trim() : "",
			});
		}
	});

	// Save to Config Object
	appConfig[posName] = { competencies: competencies };

	// Save to Storage & Cloud
	localStorage.setItem("appConfig", JSON.stringify(appConfig));
	saveToCloud("config");

	alert("Configuration Saved!");

	// Refresh List & Clear Form
	renderAdminList();
	clearAdminForm();
}

function loadPositionForEdit(posName) {
	const config = appConfig[posName];
	if (!config) return;

	document.getElementById("admin-pos-name").value = posName;
	document.getElementById(
		"editor-title"
	).innerHTML = `<i class="bi bi-pencil-square"></i> Editing: <span class="text-primary">${posName}</span>`;

	// Convert Object array back to Text string
	let text = "";
	if (config.competencies) {
		config.competencies.forEach((c) => {
			text += `${c.name} | ${c.rec} | ${c.desc}\n`;
		});
	}
	document.getElementById("admin-pos-comps").value = text.trim();
}

function deletePositionConfig(posName) {
	if (
		confirm(
			`Are you sure you want to delete the configuration for "${posName}"?`
		)
	) {
		delete appConfig[posName];
		localStorage.setItem("appConfig", JSON.stringify(appConfig));
		saveToCloud("config");
		renderAdminList();
	}
}

function clearAdminForm() {
	document.getElementById("admin-pos-name").value = "";
	document.getElementById("admin-pos-comps").value = "";
	document.getElementById(
		"editor-title"
	).innerHTML = `<i class="bi bi-pencil-square"></i> Add / Edit Position`;
}

function exportConfigJSON() {
	const dataStr =
		"data:text/json;charset=utf-8," +
		encodeURIComponent(JSON.stringify(appConfig, null, 2));
	const downloadAnchorNode = document.createElement("a");
	downloadAnchorNode.setAttribute("href", dataStr);
	downloadAnchorNode.setAttribute("download", "competencies_config.json");
	document.body.appendChild(downloadAnchorNode);
	downloadAnchorNode.click();
	downloadAnchorNode.remove();
}

function triggerConfigImport() {
	document.getElementById("config-import").click();
}

function importConfigJSON(input) {
	const file = input.files[0];
	if (!file) return;

	const reader = new FileReader();
	reader.onload = function (e) {
		try {
			const json = JSON.parse(e.target.result);
			appConfig = json;
			localStorage.setItem("appConfig", JSON.stringify(appConfig));
			saveToCloud("config");
			renderAdminList();
			alert("Configuration Imported Successfully!");
		} catch (err) {
			alert("Invalid JSON file.");
			console.error(err);
		}
		input.value = "";
	};
	reader.readAsText(file);
}

// Initial Render
document.addEventListener("DOMContentLoaded", renderAdminList);

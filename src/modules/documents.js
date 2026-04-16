import { state } from "../lib/store.js";
import { escapeHTML } from "../lib/utils.js";
import * as notify from "../lib/notify.js";

const DOCUMENT_TYPES = [
	{
		value: "offer_letter",
		label: "Offer Letter",
		description: "Initial offer details for a new employee.",
	},
	{
		value: "employment_contract",
		label: "Employment Contract",
		description: "Core terms and conditions of employment.",
	},
	{
		value: "payslip",
		label: "Payslip",
		description: "Payroll breakdown per salary period.",
	},
	{
		value: "warning_letter",
		label: "Warning Letter (SP)",
		description: "Formal warning notice with offense details.",
	},
	{
		value: "termination_letter",
		label: "Termination Letter",
		description: "Employment termination notice.",
	},
];

const DOCUMENT_FIELD_SCHEMAS = {
	offer_letter: [
		{
			key: "start_date",
			label: "Start Date",
			type: "date",
			required: true,
		},
		{
			key: "basic_salary",
			label: "Basic Salary (IDR)",
			type: "number",
			required: true,
			placeholder: "e.g. 8500000",
		},
		{
			key: "probation_period",
			label: "Probation Period",
			type: "text",
			required: true,
			placeholder: "e.g. 3 months",
		},
	],
	employment_contract: [
		{
			key: "contract_start_date",
			label: "Contract Start Date",
			type: "date",
			required: true,
		},
		{
			key: "contract_duration",
			label: "Contract Duration",
			type: "text",
			required: true,
			placeholder: "e.g. 12 months",
		},
		{
			key: "work_location",
			label: "Work Location",
			type: "text",
			required: true,
			placeholder: "e.g. Jakarta HQ",
		},
	],
	payslip: [
		{
			key: "period",
			label: "Payroll Period",
			type: "month",
			required: true,
		},
		{
			key: "basic_salary",
			label: "Basic Salary (IDR)",
			type: "number",
			required: true,
			placeholder: "e.g. 8500000",
		},
		{
			key: "allowances",
			label: "Allowances (IDR)",
			type: "number",
			required: false,
			placeholder: "e.g. 1500000",
		},
		{
			key: "deductions",
			label: "Deductions (IDR)",
			type: "number",
			required: false,
			placeholder: "e.g. 325000",
		},
	],
	warning_letter: [
		{
			key: "warning_level",
			label: "Warning Level",
			type: "select",
			required: true,
			options: [
				{ value: "SP1", label: "SP1" },
				{ value: "SP2", label: "SP2" },
				{ value: "SP3", label: "SP3" },
			],
		},
		{
			key: "offense_details",
			label: "Offense Details",
			type: "textarea",
			required: true,
			placeholder: "Describe the incident and policy breach.",
		},
		{
			key: "validity_period",
			label: "Validity Period",
			type: "text",
			required: true,
			placeholder: "e.g. 6 months",
		},
	],
	termination_letter: [
		{
			key: "last_working_day",
			label: "Last Working Day",
			type: "date",
			required: true,
		},
		{
			key: "termination_reason",
			label: "Reason",
			type: "textarea",
			required: true,
			placeholder: "Provide the reason for termination.",
		},
		{
			key: "severance_details",
			label: "Severance Details",
			type: "textarea",
			required: false,
			placeholder: "Compensation and settlement details.",
		},
	],
};

const documentsDraft = {
	employeeId: "",
	documentType: "",
	fields: {},
};

function canAccessDocuments() {
	return ["superadmin", "hr"].includes(state.currentUser?.role);
}

function listEmployees() {
	return Object.values(state.db || {}).sort((a, b) =>
		String(a?.name || "").localeCompare(String(b?.name || "")),
	);
}

function getDocumentTypeMeta(value) {
	return DOCUMENT_TYPES.find((type) => type.value === value) || null;
}

function getFieldSchema() {
	return DOCUMENT_FIELD_SCHEMAS[documentsDraft.documentType] || [];
}

function getSelectedEmployee() {
	return state.db?.[documentsDraft.employeeId] || null;
}

function getMissingRequiredFields() {
	return getFieldSchema().filter((field) => {
		if (!field.required) return false;
		const value = String(documentsDraft.fields?.[field.key] || "").trim();
		return !value;
	});
}

function setControlsDisabled(disabled) {
	[
		"doc-employee-select",
		"doc-type-select",
		"doc-download-btn",
		"doc-reset-btn",
	].forEach((id) => {
		const el = document.getElementById(id);
		if (el) el.disabled = Boolean(disabled);
	});

	const dynamicFields = document.querySelectorAll("#doc-dynamic-fields [data-doc-field]");
	dynamicFields.forEach((field) => {
		field.disabled = Boolean(disabled);
	});
}

function renderEmployeeOptions() {
	const employeeSelect = document.getElementById("doc-employee-select");
	if (!employeeSelect) return;

	const employees = listEmployees();
	if (documentsDraft.employeeId && !state.db?.[documentsDraft.employeeId]) {
		documentsDraft.employeeId = "";
	}

	const options = [
		'<option value="">-- Select Employee --</option>',
		...employees.map((employee) => {
			const id = String(employee?.id || "");
			const name = String(employee?.name || id);
			const position = String(employee?.position || "-");
			const department = String(employee?.department || "-");
			const selected = documentsDraft.employeeId === id ? "selected" : "";
			return `<option value="${escapeHTML(id)}" ${selected}>${escapeHTML(name)} • ${escapeHTML(position)} • ${escapeHTML(department)}</option>`;
		}),
	];

	employeeSelect.innerHTML = options.join("");
}

function renderDocumentTypeOptions() {
	const typeSelect = document.getElementById("doc-type-select");
	if (!typeSelect) return;

	if (documentsDraft.documentType && !getDocumentTypeMeta(documentsDraft.documentType)) {
		documentsDraft.documentType = "";
		documentsDraft.fields = {};
	}

	const options = [
		'<option value="">-- Select Document Type --</option>',
		...DOCUMENT_TYPES.map((type) => {
			const selected = documentsDraft.documentType === type.value ? "selected" : "";
			return `<option value="${escapeHTML(type.value)}" ${selected}>${escapeHTML(type.label)}</option>`;
		}),
	];

	typeSelect.innerHTML = options.join("");
}

function renderFieldControl(field) {
	const value = String(documentsDraft.fields?.[field.key] || "");
	const requiredLabel = field.required
		? '<span class="text-danger ms-1">*</span>'
		: "";

	if (field.type === "textarea") {
		return `
			<div>
				<label class="form-label small fw-bold text-muted">${escapeHTML(field.label)}${requiredLabel}</label>
				<textarea
					class="form-control"
					rows="3"
					data-doc-field="${escapeHTML(field.key)}"
					placeholder="${escapeHTML(field.placeholder || "")}">${escapeHTML(value)}</textarea>
			</div>
		`;
	}

	if (field.type === "select") {
		const options = [
			'<option value="">-- Select --</option>',
			...(field.options || []).map((option) => {
				const optionValue = String(option?.value || "");
				const optionLabel = String(option?.label || optionValue);
				const selected = optionValue === value ? "selected" : "";
				return `<option value="${escapeHTML(optionValue)}" ${selected}>${escapeHTML(optionLabel)}</option>`;
			}),
		];

		return `
			<div>
				<label class="form-label small fw-bold text-muted">${escapeHTML(field.label)}${requiredLabel}</label>
				<select class="form-select" data-doc-field="${escapeHTML(field.key)}">
					${options.join("")}
				</select>
			</div>
		`;
	}

	return `
		<div>
			<label class="form-label small fw-bold text-muted">${escapeHTML(field.label)}${requiredLabel}</label>
			<input
				type="${escapeHTML(field.type || "text")}"
				class="form-control"
				data-doc-field="${escapeHTML(field.key)}"
				value="${escapeHTML(value)}"
				placeholder="${escapeHTML(field.placeholder || "")}">
		</div>
	`;
}

function renderDynamicFields() {
	const container = document.getElementById("doc-dynamic-fields");
	if (!container) return;

	const schema = getFieldSchema();
	if (!documentsDraft.documentType) {
		container.innerHTML =
			'<div class="small text-muted">Choose a document type to load template fields.</div>';
		return;
	}

	container.innerHTML = schema.map(renderFieldControl).join("");

	container.querySelectorAll("[data-doc-field]").forEach((input) => {
		const eventName = input.tagName === "SELECT" ? "change" : "input";
		input.addEventListener(eventName, (event) => {
			const key = String(event.currentTarget?.dataset?.docField || "");
			documentsDraft.fields[key] = String(event.currentTarget?.value || "");
			renderPreview();
			refreshButtonsState();
		});
	});
}

function renderPreview() {
	const previewEl = document.getElementById("doc-preview");
	if (!previewEl) return;

	const employee = getSelectedEmployee();
	const docType = getDocumentTypeMeta(documentsDraft.documentType);
	if (!employee || !docType) {
		previewEl.innerHTML = `
			<div class="documents-preview-empty">
				Select employee and document type to start preview.
			</div>
		`;
		return;
	}

	const schema = getFieldSchema();
	const filledFields = schema
		.map((field) => {
			const rawValue = String(documentsDraft.fields?.[field.key] || "").trim();
			if (!rawValue) return "";
			return `<li><span class="text-muted">${escapeHTML(field.label)}:</span> ${escapeHTML(rawValue)}</li>`;
		})
		.filter(Boolean);

	const todayLabel = new Date().toLocaleDateString("en-GB", {
		day: "2-digit",
		month: "short",
		year: "numeric",
	});

	const companyName =
		String(state.appSettings?.company_name || "").trim() || "Company";
	const appName =
		String(state.appSettings?.app_name || "").trim() || "HR Performance Suite";

	previewEl.innerHTML = `
		<div class="documents-preview-header">
			<div class="documents-preview-company">${escapeHTML(companyName)}</div>
			<div class="documents-preview-app">${escapeHTML(appName)}</div>
		</div>
		<hr class="my-3">
		<div class="documents-preview-title">${escapeHTML(docType.label)}</div>
		<div class="small text-muted mb-3">Generated draft preview • ${escapeHTML(todayLabel)}</div>

		<p class="mb-2"><strong>Employee:</strong> ${escapeHTML(employee.name || employee.id)}</p>
		<p class="mb-2"><strong>Employee ID:</strong> ${escapeHTML(employee.id || "-")}</p>
		<p class="mb-2"><strong>Position:</strong> ${escapeHTML(employee.position || "-")}</p>
		<p class="mb-3"><strong>Department:</strong> ${escapeHTML(employee.department || "-")}</p>

		<div class="small fw-bold text-uppercase text-muted mb-2">Template Inputs</div>
		${
			filledFields.length > 0
				? `<ul class="documents-preview-fields">${filledFields.join("")}</ul>`
				: '<div class="small text-muted">No template values entered yet.</div>'
		}

		<div class="documents-preview-footer small text-muted mt-4">
			Phase 1 preview only. PDF output engine follows in Phase 3.
		</div>
	`;
}

function refreshButtonsState() {
	const downloadBtn = document.getElementById("doc-download-btn");
	if (!downloadBtn) return;

	const employeeReady = Boolean(getSelectedEmployee());
	const typeReady = Boolean(getDocumentTypeMeta(documentsDraft.documentType));
	const missingFields = getMissingRequiredFields();
	const isReady = employeeReady && typeReady && missingFields.length === 0;

	downloadBtn.disabled = !isReady;
	downloadBtn.title = isReady
		? "PDF generation will be enabled in the next implementation phase."
		: "Complete all required fields to continue.";
}

function bindSetupHandlers() {
	const employeeSelect = document.getElementById("doc-employee-select");
	const typeSelect = document.getElementById("doc-type-select");
	const downloadBtn = document.getElementById("doc-download-btn");
	const resetBtn = document.getElementById("doc-reset-btn");

	if (employeeSelect) {
		employeeSelect.onchange = (event) => {
			documentsDraft.employeeId = String(event.target?.value || "");
			renderPreview();
			refreshButtonsState();
		};
	}

	if (typeSelect) {
		typeSelect.onchange = (event) => {
			const nextType = String(event.target?.value || "");
			if (nextType !== documentsDraft.documentType) {
				documentsDraft.documentType = nextType;
				documentsDraft.fields = {};
			}
			renderDynamicFields();
			renderPreview();
			refreshButtonsState();
		};
	}

	if (downloadBtn) {
		downloadBtn.onclick = async () => {
			if (downloadBtn.disabled) return;
			await notify.info(
				"PDF generation engine will be completed in the next implementation phase.",
				"Phase 1 Ready",
			);
		};
	}

	if (resetBtn) {
		resetBtn.onclick = () => resetDocumentsWorkspace();
	}
}

export function resetDocumentsWorkspace() {
	documentsDraft.employeeId = "";
	documentsDraft.documentType = "";
	documentsDraft.fields = {};
	renderDocumentsWorkspace();
}

export function renderDocumentsWorkspace() {
	const tabEl = document.getElementById("tab-documents");
	if (!tabEl) return;

	const canAccess = canAccessDocuments();
	const deniedAlert = document.getElementById("doc-access-denied");
	if (deniedAlert) deniedAlert.classList.toggle("hidden", canAccess);

	if (!canAccess) {
		const dynamicFields = document.getElementById("doc-dynamic-fields");
		const previewEl = document.getElementById("doc-preview");
		if (dynamicFields) {
			dynamicFields.innerHTML =
				'<div class="small text-muted">Access is restricted to HR and Superadmin.</div>';
		}
		if (previewEl) {
			previewEl.innerHTML =
				'<div class="documents-preview-empty">You do not have access to this workspace.</div>';
		}
		setControlsDisabled(true);
		return;
	}

	renderEmployeeOptions();
	renderDocumentTypeOptions();
	renderDynamicFields();
	renderPreview();
	refreshButtonsState();
	bindSetupHandlers();
	setControlsDisabled(!canAccess);
}

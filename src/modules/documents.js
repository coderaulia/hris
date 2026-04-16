import { state } from "../lib/store.js";
import { escapeHTML } from "../lib/utils.js";
import * as notify from "../lib/notify.js";
import { logActivity } from "./data/activity.js";

const TODAY_ISO = new Date().toISOString().slice(0, 10);

const DOCUMENT_TEMPLATES = {
	offer_letter: {
		label: "Offer Letter",
		description:
			"Initial employment offer with compensation package and onboarding terms.",
		fields: [
			{
				key: "letter_date",
				label: "Letter Date",
				type: "date",
				required: true,
				defaultValue: TODAY_ISO,
			},
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
				key: "fixed_allowance",
				label: "Fixed Allowance (IDR)",
				type: "number",
				required: false,
				placeholder: "e.g. 1500000",
			},
			{
				key: "probation_period",
				label: "Probation Period",
				type: "text",
				required: true,
				placeholder: "e.g. 3 months",
			},
		],
		renderPreview: (ctx) => {
			const gross = ctx.numbers.basic_salary + ctx.numbers.fixed_allowance;
			return `
				<div class="documents-preview-block">
					<p>Date: ${ctx.formatted.letter_date}</p>
					<p>Subject: Employment Offer</p>
				</div>
				<div class="documents-preview-block">
					<p>Dear ${ctx.employeeName},</p>
					<p>We are pleased to offer you the position of <strong>${ctx.employeePosition}</strong> in the <strong>${ctx.employeeDepartment}</strong> department, with an effective start date of <strong>${ctx.formatted.start_date}</strong>.</p>
					<p>Your initial probation period is <strong>${ctx.formatted.probation_period}</strong>.</p>
				</div>
				<div class="documents-preview-block">
					<p><strong>Compensation Summary</strong></p>
					<ul class="documents-preview-fields">
						<li>Basic Salary: ${ctx.formatted.basic_salary_currency}</li>
						<li>Fixed Allowance: ${ctx.formatted.fixed_allowance_currency}</li>
						<li>Total Monthly Gross: <strong>${formatCurrencyId(gross)}</strong></li>
					</ul>
				</div>
				${renderSignatureBlock(ctx)}
			`;
		},
	},
	employment_contract: {
		label: "Employment Contract",
		description:
			"Contract draft with role scope, duration, and work arrangement details.",
		fields: [
			{
				key: "contract_number",
				label: "Contract Number",
				type: "text",
				required: true,
				placeholder: "e.g. CTR-2026-04-001",
			},
			{
				key: "letter_date",
				label: "Contract Date",
				type: "date",
				required: true,
				defaultValue: TODAY_ISO,
			},
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
			{
				key: "basic_salary",
				label: "Basic Salary (IDR)",
				type: "number",
				required: true,
				placeholder: "e.g. 8500000",
			},
		],
		renderPreview: (ctx) => `
			<div class="documents-preview-block">
				<p>Contract Number: <strong>${ctx.formatted.contract_number}</strong></p>
				<p>Date: ${ctx.formatted.letter_date}</p>
			</div>
			<div class="documents-preview-block">
				<p>This employment agreement is made between <strong>${ctx.companyName}</strong> and <strong>${ctx.employeeName}</strong>, appointed as <strong>${ctx.employeePosition}</strong> under the ${ctx.employeeDepartment} function.</p>
				<p>Contract commencement date: <strong>${ctx.formatted.contract_start_date}</strong>.</p>
				<p>Contract duration: <strong>${ctx.formatted.contract_duration}</strong>.</p>
				<p>Primary work location: <strong>${ctx.formatted.work_location}</strong>.</p>
				<p>Base monthly salary: <strong>${ctx.formatted.basic_salary_currency}</strong>.</p>
			</div>
			${renderSignatureBlock(ctx)}
		`,
	},
	payslip: {
		label: "Payslip",
		description:
			"Payroll breakdown including salary components and net payment calculation.",
		fields: [
			{
				key: "period",
				label: "Payroll Period",
				type: "month",
				required: true,
			},
			{
				key: "pay_date",
				label: "Pay Date",
				type: "date",
				required: true,
				defaultValue: TODAY_ISO,
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
		renderPreview: (ctx) => {
			const totalEarnings = ctx.numbers.basic_salary + ctx.numbers.allowances;
			const netPay = totalEarnings - ctx.numbers.deductions;
			return `
				<div class="documents-preview-block">
					<p><strong>Employee:</strong> ${ctx.employeeName}</p>
					<p><strong>Position:</strong> ${ctx.employeePosition}</p>
					<p><strong>Period:</strong> ${ctx.formatted.period_month}</p>
					<p><strong>Pay Date:</strong> ${ctx.formatted.pay_date}</p>
				</div>
				<div class="documents-preview-block">
					<table class="table table-sm documents-preview-table mb-0">
						<tbody>
							<tr><td>Basic Salary</td><td class="text-end">${ctx.formatted.basic_salary_currency}</td></tr>
							<tr><td>Allowances</td><td class="text-end">${ctx.formatted.allowances_currency}</td></tr>
							<tr><td>Deductions</td><td class="text-end">(${ctx.formatted.deductions_currency})</td></tr>
							<tr class="fw-bold"><td>Net Pay</td><td class="text-end">${formatCurrencyId(netPay)}</td></tr>
						</tbody>
					</table>
				</div>
				${renderSignatureBlock(ctx)}
			`;
		},
	},
	warning_letter: {
		label: "Warning Letter (SP)",
		description:
			"Formal disciplinary notice with warning tier, incident context, and validity period.",
		fields: [
			{
				key: "letter_date",
				label: "Letter Date",
				type: "date",
				required: true,
				defaultValue: TODAY_ISO,
			},
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
				placeholder: "Describe incident chronology and related policy breach.",
			},
			{
				key: "validity_period",
				label: "Validity Period",
				type: "text",
				required: true,
				placeholder: "e.g. 6 months",
			},
			{
				key: "corrective_actions",
				label: "Corrective Actions",
				type: "textarea",
				required: false,
				placeholder: "Expected improvement or corrective commitments.",
			},
		],
		renderPreview: (ctx) => `
			<div class="documents-preview-block">
				<p>Date: ${ctx.formatted.letter_date}</p>
				<p>Reference: ${ctx.formatted.warning_level}</p>
			</div>
			<div class="documents-preview-block">
				<p>To: ${ctx.employeeName} (${ctx.employeePosition})</p>
				<p>This letter serves as <strong>${ctx.formatted.warning_level}</strong> based on the following findings:</p>
				<p>${formatMultiline(ctx.values.offense_details)}</p>
				<p>This warning is valid for <strong>${ctx.formatted.validity_period}</strong> from the date of issuance.</p>
			</div>
			${
				ctx.values.corrective_actions
					? `<div class="documents-preview-block"><p><strong>Corrective Actions:</strong><br>${formatMultiline(ctx.values.corrective_actions)}</p></div>`
					: ""
			}
			${renderSignatureBlock(ctx)}
		`,
	},
	termination_letter: {
		label: "Termination Letter",
		description:
			"Termination notice with final working date, rationale, and severance statement.",
		fields: [
			{
				key: "letter_date",
				label: "Letter Date",
				type: "date",
				required: true,
				defaultValue: TODAY_ISO,
			},
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
				placeholder: "Provide termination rationale clearly.",
			},
			{
				key: "severance_details",
				label: "Severance Details",
				type: "textarea",
				required: false,
				placeholder: "Settlement and compensation notes.",
			},
		],
		renderPreview: (ctx) => `
			<div class="documents-preview-block">
				<p>Date: ${ctx.formatted.letter_date}</p>
				<p>Subject: Employment Termination Notice</p>
			</div>
			<div class="documents-preview-block">
				<p>Dear ${ctx.employeeName},</p>
				<p>This letter confirms the termination of your employment as <strong>${ctx.employeePosition}</strong> effective on <strong>${ctx.formatted.last_working_day}</strong>.</p>
				<p><strong>Reason:</strong><br>${formatMultiline(ctx.values.termination_reason)}</p>
				${
					ctx.values.severance_details
						? `<p><strong>Severance Details:</strong><br>${formatMultiline(ctx.values.severance_details)}</p>`
						: ""
				}
			</div>
			${renderSignatureBlock(ctx)}
		`,
	},
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

function getTemplate(type = documentsDraft.documentType) {
	return DOCUMENT_TEMPLATES[type] || null;
}

function getSelectedEmployee() {
	return state.db?.[documentsDraft.employeeId] || null;
}

function normalizeNumber(value) {
	const num = Number(value);
	return Number.isFinite(num) ? num : 0;
}

function formatCurrencyId(value) {
	const num = Number(value);
	if (!Number.isFinite(num)) return "IDR 0";
	return `IDR ${num.toLocaleString("id-ID")}`;
}

function formatDateLong(value) {
	if (!value) return "-";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return escapeHTML(String(value));
	return date.toLocaleDateString("en-GB", {
		day: "2-digit",
		month: "long",
		year: "numeric",
	});
}

function formatMonthLabel(value) {
	if (!value) return "-";
	const [year, month] = String(value).split("-");
	if (!year || !month) return escapeHTML(String(value));
	const date = new Date(Number(year), Number(month) - 1, 1);
	if (Number.isNaN(date.getTime())) return escapeHTML(String(value));
	return date.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

function formatMultiline(value) {
	return escapeHTML(String(value || "")).replace(/\n/g, "<br>");
}

function renderSignatureBlock(ctx) {
	return `
		<div class="documents-preview-signature">
			<p class="mb-1">Approved by,</p>
			<p class="mb-0"><strong>${ctx.signerName}</strong></p>
			<p class="small text-muted mb-0">${ctx.signerRole}</p>
		</div>
	`;
}

function ensureTemplateDefaults() {
	const template = getTemplate();
	if (!template) return;
	template.fields.forEach((field) => {
		if (documentsDraft.fields[field.key] !== undefined) return;
		if (field.defaultValue === undefined) return;
		documentsDraft.fields[field.key] = String(field.defaultValue);
	});
}

function getMissingRequiredFields() {
	const template = getTemplate();
	if (!template) return [];
	return template.fields.filter((field) => {
		if (!field.required) return false;
		const value = String(documentsDraft.fields?.[field.key] || "").trim();
		return !value;
	});
}

function isDraftReady() {
	return Boolean(getSelectedEmployee() && getTemplate() && getMissingRequiredFields().length === 0);
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

	document.querySelectorAll("#doc-dynamic-fields [data-doc-field]").forEach((field) => {
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

	employeeSelect.innerHTML = [
		'<option value="">-- Select Employee --</option>',
		...employees.map((employee) => {
			const id = String(employee?.id || "");
			const name = String(employee?.name || id);
			const position = String(employee?.position || "-");
			const department = String(employee?.department || "-");
			const selected = documentsDraft.employeeId === id ? "selected" : "";
			return `<option value="${escapeHTML(id)}" ${selected}>${escapeHTML(name)} • ${escapeHTML(position)} • ${escapeHTML(department)}</option>`;
		}),
	].join("");
}

function renderDocumentTypeOptions() {
	const typeSelect = document.getElementById("doc-type-select");
	if (!typeSelect) return;

	if (documentsDraft.documentType && !getTemplate(documentsDraft.documentType)) {
		documentsDraft.documentType = "";
		documentsDraft.fields = {};
	}

	typeSelect.innerHTML = [
		'<option value="">-- Select Document Type --</option>',
		...Object.entries(DOCUMENT_TEMPLATES).map(([value, template]) => {
			const selected = documentsDraft.documentType === value ? "selected" : "";
			return `<option value="${escapeHTML(value)}" ${selected}>${escapeHTML(template.label)}</option>`;
		}),
	].join("");
}

function renderTemplateHint() {
	const hintEl = document.getElementById("doc-template-hint");
	if (!hintEl) return;
	const template = getTemplate();
	if (!template) {
		hintEl.innerHTML = "Choose a document type to load template details.";
		return;
	}
	hintEl.innerHTML = `<span class="fw-semibold">${escapeHTML(template.label)}:</span> ${escapeHTML(template.description)}`;
}

function renderFieldControl(field) {
	const value = String(documentsDraft.fields?.[field.key] || "");
	const requiredLabel = field.required ? '<span class="text-danger ms-1">*</span>' : "";
	const inputClass = "form-control";

	if (field.type === "textarea") {
		return `
			<div>
				<label class="form-label small fw-bold text-muted">${escapeHTML(field.label)}${requiredLabel}</label>
				<textarea
					class="${inputClass}"
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
				class="${inputClass}"
				data-doc-field="${escapeHTML(field.key)}"
				value="${escapeHTML(value)}"
				placeholder="${escapeHTML(field.placeholder || "")}">
		</div>
	`;
}

function renderDynamicFields() {
	const container = document.getElementById("doc-dynamic-fields");
	if (!container) return;

	const template = getTemplate();
	if (!template) {
		container.innerHTML =
			'<div class="small text-muted">Choose a document type to load template fields.</div>';
		return;
	}

	container.innerHTML = template.fields.map(renderFieldControl).join("");

	container.querySelectorAll("[data-doc-field]").forEach((input) => {
		const eventName = input.tagName === "SELECT" ? "change" : "input";
		input.addEventListener(eventName, (event) => {
			const key = String(event.currentTarget?.dataset?.docField || "");
			documentsDraft.fields[key] = String(event.currentTarget?.value || "");
			renderPreview();
			refreshValidationState();
		});
	});
}

function buildPreviewContext() {
	const employee = getSelectedEmployee();
	const template = getTemplate();
	if (!employee || !template) return null;

	const values = {};
	template.fields.forEach((field) => {
		values[field.key] = String(documentsDraft.fields?.[field.key] || "").trim();
	});

	const numbers = Object.fromEntries(
		template.fields
			.filter((field) => field.type === "number")
			.map((field) => [field.key, normalizeNumber(values[field.key])]),
	);

	const formatted = {};
	Object.entries(values).forEach(([key, value]) => {
		if (key === "period") {
			formatted[`${key}_month`] = formatMonthLabel(value);
			return;
		}
		if (key.includes("date") || key.includes("day")) {
			formatted[key] = formatDateLong(value);
			return;
		}
		formatted[key] = escapeHTML(value || "-");
	});

	Object.entries(numbers).forEach(([key, value]) => {
		formatted[`${key}_currency`] = formatCurrencyId(value);
	});

	const signerName = escapeHTML(state.currentUser?.name || "HR Representative");
	const signerRoleRaw = String(state.currentUser?.role || "hr");
	const signerRole = signerRoleRaw === "superadmin" ? "Superadmin" : "HR";

	return {
		employee,
		template,
		values,
		numbers,
		formatted,
		companyName: escapeHTML(
			String(state.appSettings?.company_name || "").trim() || "Company",
		),
		appName: escapeHTML(
			String(state.appSettings?.app_name || "").trim() || "HR Performance Suite",
		),
		employeeName: escapeHTML(String(employee.name || employee.id || "Employee")),
		employeePosition: escapeHTML(String(employee.position || "-")),
		employeeDepartment: escapeHTML(String(employee.department || "-")),
		signerName,
		signerRole,
	};
}

function renderPreview() {
	const previewEl = document.getElementById("doc-preview");
	if (!previewEl) return;

	const ctx = buildPreviewContext();
	if (!ctx) {
		previewEl.innerHTML = `
			<div class="documents-preview-empty">
				Select employee and document type to start preview.
			</div>
		`;
		return;
	}

	previewEl.innerHTML = `
		<div class="documents-preview-header">
			<div class="documents-preview-company">${ctx.companyName}</div>
			<div class="documents-preview-app">${ctx.appName}</div>
		</div>
		<hr class="my-3">
		<div class="documents-preview-title">${escapeHTML(ctx.template.label)}</div>
		<div class="documents-preview-meta small text-muted mb-3">
			Employee ID: ${escapeHTML(String(ctx.employee.id || "-"))}
		</div>
		${ctx.template.renderPreview(ctx)}
	`;
}

function renderValidationFeedback(missingFields) {
	const feedbackEl = document.getElementById("doc-validation-feedback");
	if (!feedbackEl) return;

	if (!documentsDraft.documentType) {
		feedbackEl.className = "small text-muted";
		feedbackEl.textContent = "";
		return;
	}

	if (missingFields.length === 0) {
		feedbackEl.className = "small text-success";
		feedbackEl.textContent = "All required fields are complete. Ready to export PDF.";
		return;
	}

	feedbackEl.className = "small text-warning";
	feedbackEl.textContent = `Required fields missing: ${missingFields.map((field) => field.label).join(", ")}.`;
}

function markInvalidFields(missingFields) {
	const missingKeys = new Set(missingFields.map((field) => field.key));
	document.querySelectorAll("#doc-dynamic-fields [data-doc-field]").forEach((input) => {
		const key = String(input?.dataset?.docField || "");
		if (missingKeys.has(key)) input.classList.add("is-invalid");
		else input.classList.remove("is-invalid");
	});
}

function refreshValidationState() {
	const missingFields = getMissingRequiredFields();
	const ready = isDraftReady();
	const downloadBtn = document.getElementById("doc-download-btn");

	if (downloadBtn) {
		downloadBtn.disabled = !ready;
		downloadBtn.title = ready
			? "Download the generated PDF file."
			: "Complete required fields first.";
	}

	renderValidationFeedback(missingFields);
	markInvalidFields(missingFields);
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
			refreshValidationState();
		};
	}

	if (typeSelect) {
		typeSelect.onchange = (event) => {
			const nextType = String(event.target?.value || "");
			if (nextType !== documentsDraft.documentType) {
				documentsDraft.documentType = nextType;
				documentsDraft.fields = {};
			}
			ensureTemplateDefaults();
			renderTemplateHint();
			renderDynamicFields();
			renderPreview();
			refreshValidationState();
		};
	}

	if (downloadBtn) {
		downloadBtn.onclick = async () => {
			if (downloadBtn.disabled) return;
			if (!canAccessDocuments()) {
				await notify.error("Access denied. HR or Superadmin role is required.");
				return;
			}
			try {
				const context = buildPreviewContext();
				if (!context) throw new Error("Document data is not ready for export.");
				const { generateHrDocumentPdf } = await import("../lib/pdfTemplates.js");

				const { doc, filename } = generateHrDocumentPdf({
					type: documentsDraft.documentType,
					employee: {
						id: context.employee.id,
						name: context.employee.name,
						position: context.employee.position,
						department: context.employee.department,
					},
					values: context.values,
					branding: {
						companyName: String(state.appSettings?.company_name || "").trim(),
						appName: String(state.appSettings?.app_name || "").trim(),
					},
					signer: {
						name: String(state.currentUser?.name || "HR Representative"),
						role: String(state.currentUser?.role || "hr"),
					},
				});

				doc.save(filename);
				await logActivity({
					action: "document.generate",
					entityType: "employee_document",
					entityId: context.employee.id,
					details: {
						document_type: documentsDraft.documentType,
						employee_id: context.employee.id,
						employee_name: context.employee.name || "",
						filename,
						generated_by: state.currentUser?.id || "",
					},
				});
				await notify.success(`PDF exported: ${filename}`, "Export Complete");
			} catch (error) {
				await notify.error(
					`Failed to export PDF: ${error?.message || String(error)}`,
					"Export Failed",
				);
			}
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
		const hintEl = document.getElementById("doc-template-hint");
		const validationEl = document.getElementById("doc-validation-feedback");
		if (dynamicFields) {
			dynamicFields.innerHTML =
				'<div class="small text-muted">Access is restricted to HR and Superadmin.</div>';
		}
		if (previewEl) {
			previewEl.innerHTML =
				'<div class="documents-preview-empty">You do not have access to this workspace.</div>';
		}
		if (hintEl) hintEl.textContent = "";
		if (validationEl) validationEl.textContent = "";
		setControlsDisabled(true);
		return;
	}

	renderEmployeeOptions();
	renderDocumentTypeOptions();
	ensureTemplateDefaults();
	renderTemplateHint();
	renderDynamicFields();
	renderPreview();
	refreshValidationState();
	bindSetupHandlers();
	setControlsDisabled(false);
}

import { state } from "../lib/store.js";
import { escapeHTML } from "../lib/utils.js";
import * as notify from "../lib/notify.js";
import { logActivity } from "./data/activity.js";
import { saveEmployee } from "./data/employees.js";
import {
	deleteHrDocumentTemplate,
	fetchHrDocumentReferenceOptions,
	fetchHrDocumentTemplates,
	saveHrDocumentTemplate,
} from "./data/hr-documents.js";

const TODAY_ISO = new Date().toISOString().slice(0, 10);
const FALLBACK_CONTRACT_TYPES = ["PKWT", "PKWTT", "PKHL"];
const FALLBACK_WARNING_LEVELS = ["SP1", "SP2", "SP3"];
const TEMPLATE_VARIABLE_TOKENS = [
	"{{company_name}}",
	"{{employee_name}}",
	"{{employee_position}}",
	"{{department}}",
	"{{contract_type}}",
	"{{basic_salary}}",
	"{{salary_in_words}}",
	"{{signer_name}}",
	"{{signer_title}}",
];

const documentsDraft = {
	subjectMode: "employee",
	surfaceMode: "preview",
	templateDraftMode: false,
	employeeId: "",
	manualIdentity: {
		name: "",
		legal_name: "",
		position: "",
		department: "",
		place_of_birth: "",
		date_of_birth: "",
		address: "",
		nik_number: "",
		job_level: "",
	},
	signerId: "",
	signerRoleOverride: "",
	documentType: "",
	templateId: "",
	fields: {},
	payroll: {
		earnings: [{ name: "Tunjangan", amount: "" }],
		deductions: [{ name: "PPh21", amount: "" }],
	},
};

const templateEditorDraft = {
	syncKey: "",
	sourceTemplateId: "",
	templateName: "",
	templateTitle: "",
	bodyText: "",
	dirty: false,
	saveState: "idle",
	statusText: "",
};

let templateCollectionsPromise = null;
let templateCollectionsLoaded = false;

function canAccessDocuments() {
	return ["superadmin", "hr"].includes(state.currentUser?.role);
}

function listEmployees() {
	return Object.values(state.db || {}).sort((a, b) =>
		String(a?.name || "").localeCompare(String(b?.name || "")),
	);
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

function normalizeMultilineText(value) {
	return String(value || "")
		.replace(/\u00a0/g, " ")
		.replace(/\r/g, "")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

function slugify(value, fallback = "manual-subject") {
	return (
		String(value || "")
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "") || fallback
	);
}

function parseValidityToDate(baseDate, validityPeriod) {
	const raw = String(validityPeriod || "").trim().toLowerCase();
	if (!raw) return "";

	const match = raw.match(/(\d+)\s*(day|days|bulan|month|months|minggu|week|weeks)/i);
	if (!match) return "";

	const qty = Number(match[1]);
	if (!Number.isFinite(qty) || qty <= 0) return "";

	const date = baseDate ? new Date(baseDate) : new Date();
	if (Number.isNaN(date.getTime())) return "";

	const unit = match[2].toLowerCase();
	if (unit.startsWith("day")) {
		date.setDate(date.getDate() + qty);
	} else if (unit.startsWith("week") || unit.startsWith("minggu")) {
		date.setDate(date.getDate() + qty * 7);
	} else {
		date.setMonth(date.getMonth() + qty);
	}

	return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function isActiveSpRecord(rec = {}) {
	const level = String(rec?.active_sp_level || "").trim();
	if (!level) return false;
	const until = String(rec?.active_sp_until || "").trim();
	if (!until) return true;
	const untilMs = Date.parse(until);
	return Number.isFinite(untilMs) && untilMs >= Date.now();
}

function getReferenceOptions(groupKey, fallback = []) {
	const items = Array.isArray(state.hrDocumentReferenceOptions)
		? state.hrDocumentReferenceOptions
				.filter(
					(item) =>
						String(item?.group_key || "") === String(groupKey || "") &&
						item?.is_active !== false,
				)
				.sort((a, b) => Number(a?.sort_order || 0) - Number(b?.sort_order || 0))
		: [];

	if (items.length > 0) {
		return items.map((item) => ({
			value: String(item?.option_value || item?.option_key || ""),
			label: String(item?.option_label || item?.option_value || item?.option_key || ""),
		}));
	}

	return fallback.map((value) => ({ value, label: value }));
}

function getContractTypeOptions() {
	return getReferenceOptions("contract_type", FALLBACK_CONTRACT_TYPES);
}

function getWarningLevelOptions() {
	return getReferenceOptions("sp_level", FALLBACK_WARNING_LEVELS);
}

function getSelectedSigner() {
	const selected = state.db?.[documentsDraft.signerId];
	if (selected) return selected;
	if (state.currentUser?.id && state.db?.[state.currentUser.id]) {
		return state.db[state.currentUser.id];
	}
	return null;
}

function getSelectedSubject() {
	if (documentsDraft.subjectMode === "manual") {
		const manualName = String(documentsDraft.manualIdentity.name || "").trim();
		if (!manualName) return null;
		return {
			id: `manual-${slugify(manualName)}`,
			name: manualName,
			legal_name:
				String(documentsDraft.manualIdentity.legal_name || "").trim() || manualName,
			position: String(documentsDraft.manualIdentity.position || "").trim(),
			department: String(documentsDraft.manualIdentity.department || "").trim(),
			place_of_birth: String(documentsDraft.manualIdentity.place_of_birth || "").trim(),
			date_of_birth: String(documentsDraft.manualIdentity.date_of_birth || "").trim(),
			address: String(documentsDraft.manualIdentity.address || "").trim(),
			nik_number: String(documentsDraft.manualIdentity.nik_number || "").trim(),
			job_level: String(documentsDraft.manualIdentity.job_level || "").trim(),
		};
	}

	return state.db?.[documentsDraft.employeeId] || null;
}

function getDocumentConfig(type = documentsDraft.documentType) {
	const contractTypeOptions = getContractTypeOptions();
	const warningLevelOptions = getWarningLevelOptions();
	const byType = {
		offer_letter: {
			label: "Offer Letter",
			description:
				"Manual candidate offer with contract type, benefits, and dual-sign preview.",
			defaultSubjectMode: "manual",
			allowedSubjectModes: ["manual"],
			fields: () => {
				const contractType = String(documentsDraft.fields.contract_type || "");
				return [
					{
						key: "nomor_surat",
						label: "Nomor Surat",
						type: "text",
						required: true,
						placeholder: "e.g. 001/HR/IV/2026",
					},
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
						key: "contract_type",
						label: "Type of Contract",
						type: "select",
						required: true,
						options: contractTypeOptions,
					},
					{
						key: "basic_salary",
						label: "Basic Salary (IDR)",
						type: "number",
						required: true,
						placeholder: "e.g. 8500000",
					},
					{
						key: "benefits",
						label: "Benefits",
						type: "textarea",
						required: false,
						placeholder: "List benefits, one per line.",
					},
					...(contractType === "PKWTT"
						? [
								{
									key: "probation_duration",
									label: "Probation Duration",
									type: "text",
									required: true,
									placeholder: "e.g. 3 months",
								},
						  ]
						: []),
					...(contractType && contractType !== "PKWTT"
						? [
								{
									key: "contract_duration",
									label: "Contract Duration",
									type: "text",
									required: true,
									placeholder: "e.g. 12 months",
								},
						  ]
						: []),
				];
			},
		},
		employment_contract: {
			label: "Employment Contract",
			description:
				"Contract setup with subject source, signer override, and contract-type-aware fields.",
			defaultSubjectMode: "employee",
			allowedSubjectModes: ["employee", "manual"],
			fields: () => {
				const contractType = String(documentsDraft.fields.contract_type || "");
				return [
					{
						key: "contract_number",
						label: "Contract Number",
						type: "text",
						required: true,
						placeholder: "e.g. PKWT/HR/2026/001",
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
						key: "contract_type",
						label: "Type of Contract",
						type: "select",
						required: true,
						options: contractTypeOptions,
					},
					{
						key: "work_location",
						label: "Work Location",
						type: "text",
						required: true,
						placeholder: "e.g. Jakarta HQ",
					},
					{
						key: "job_description",
						label: "Job Description",
						type: "textarea",
						required: false,
						placeholder: "Summarize responsibilities and expected scope.",
					},
					{
						key: "basic_salary",
						label: "Basic Salary (IDR)",
						type: "number",
						required: true,
						placeholder: "e.g. 8500000",
					},
					...(contractType === "PKWTT"
						? [
								{
									key: "probation_duration",
									label: "Probation Duration",
									type: "text",
									required: true,
									placeholder: "e.g. 3 months",
								},
						  ]
						: []),
					...(contractType && contractType !== "PKWTT"
						? [
								{
									key: "contract_duration",
									label: "Contract Duration",
									type: "text",
									required: true,
									placeholder: "e.g. 12 months",
								},
						  ]
						: []),
				];
			},
		},
		payslip: {
			label: "Payslip",
			description:
				"Employee payslip with dynamic named earnings and deduction rows.",
			defaultSubjectMode: "employee",
			allowedSubjectModes: ["employee"],
			fields: () => [
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
			],
		},
		warning_letter: {
			label: "Warning Letter (SP)",
			description:
				"Formal disciplinary notice with issuer selection and offense outcome detail.",
			defaultSubjectMode: "employee",
			allowedSubjectModes: ["employee"],
			fields: () => [
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
					options: warningLevelOptions,
				},
				{
					key: "offense_details",
					label: "Offense Details",
					type: "textarea",
					required: true,
					placeholder: "Describe incident chronology and related policy breach.",
				},
				{
					key: "offense_impact",
					label: "Outcome to Company",
					type: "textarea",
					required: false,
					placeholder: "Describe the impact or outcome of the offense.",
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
		},
		termination_letter: {
			label: "Termination Letter",
			description:
				"Termination setup with reason, legal/company references, and sanction text.",
			defaultSubjectMode: "employee",
			allowedSubjectModes: ["employee"],
			fields: () => [
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
					key: "legal_basis",
					label: "Legal Basis",
					type: "text",
					required: false,
					placeholder: "e.g. UU Ketenagakerjaan / internal regulation",
				},
				{
					key: "company_policy_basis",
					label: "Company Policy Basis",
					type: "text",
					required: false,
					placeholder: "Reference internal policy / regulation.",
				},
				{
					key: "outcome_summary",
					label: "Outcome from Reason",
					type: "textarea",
					required: false,
					placeholder: "Describe the resulting impact.",
				},
				{
					key: "sanction_text",
					label: "Sanction / Punishment",
					type: "textarea",
					required: false,
					placeholder: "Describe sanction or punishment notes.",
				},
				{
					key: "severance_details",
					label: "Severance Details",
					type: "textarea",
					required: false,
					placeholder: "Settlement and compensation notes.",
				},
			],
		},
	};

	return byType[type] || null;
}

function defaultSubjectModeForType(type) {
	const config = getDocumentConfig(type);
	return config?.defaultSubjectMode || "employee";
}

function isSubjectModeAllowed(type, mode) {
	const config = getDocumentConfig(type);
	return Boolean(config?.allowedSubjectModes?.includes(mode));
}

function getFilteredTemplates(type = documentsDraft.documentType) {
	const selectedContractType = String(documentsDraft.fields.contract_type || "");
	return Array.isArray(state.hrDocumentTemplates)
		? state.hrDocumentTemplates.filter((item) => {
				if (String(item?.document_type || "") !== String(type || "")) return false;
				if (!selectedContractType) return true;
				if (type !== "employment_contract") return true;
				return String(item?.contract_type || "") === selectedContractType;
		  })
		: [];
}

function templateBodyBlocksToText(blocks = []) {
	return (Array.isArray(blocks) ? blocks : [])
		.map((block) => String(block?.text || "").trim())
		.filter(Boolean)
		.join("\n\n");
}

function templateTextToBodyBlocks(text) {
	return String(text || "")
		.split(/\r?\n\s*\r?\n|\r?\n/g)
		.map((line) => String(line || "").trim())
		.filter(Boolean)
		.map((line) => ({ type: "paragraph", text: line }));
}

function buildLocalTemplateRecord(config, type, fields, selected = null) {
	const contractType =
		type === "employment_contract"
			? String(documentsDraft.fields.contract_type || "").trim() || null
			: null;
	return {
		id: String(selected?.id || ""),
		document_type: String(type || ""),
		locale: String(selected?.locale || "id-ID"),
		contract_type: selected?.contract_type ?? contractType,
		template_name: String(selected?.template_name || config.label),
		template_status: String(selected?.template_status || "draft"),
		version_no: Number(selected?.version_no || 1),
		header_json: {
			title: String(selected?.header_json?.title || config.label),
			...(selected?.header_json || {}),
		},
		body_json: Array.isArray(selected?.body_json) ? selected.body_json : [],
		body_markup: String(selected?.body_markup || ""),
		signature_config_json:
			selected?.signature_config_json && typeof selected.signature_config_json === "object"
				? selected.signature_config_json
				: {},
		field_schema_json:
			selected?.field_schema_json && typeof selected.field_schema_json === "object"
				? selected.field_schema_json
				: { fields: fields.map(({ key, label, type: fieldType, required }) => ({ key, label, type: fieldType, required })) },
		is_default: Boolean(selected?.is_default),
	};
}

function buildTemplateEditorKey(type = documentsDraft.documentType, templateId = documentsDraft.templateId) {
	return [
		String(type || ""),
		String(templateId || "default"),
		String(documentsDraft.fields.contract_type || ""),
	].join("::");
}

function resolveTemplateBase(type = documentsDraft.documentType) {
	const config = getDocumentConfig(type);
	if (!config) return null;

	const fields = typeof config.fields === "function" ? config.fields() : config.fields || [];

	const candidates = getFilteredTemplates(type);
	const selected =
		candidates.find((item) => String(item?.id || "") === String(documentsDraft.templateId || "")) ||
		candidates.find((item) => item?.is_default) ||
		candidates[0] ||
		null;

	return {
		config,
		fields,
		record: buildLocalTemplateRecord(config, type, fields, selected),
		selected,
	};
}

function syncTemplateEditorWithSelection(force = false) {
	const resolved = resolveTemplateBase();
	if (!resolved) {
		templateEditorDraft.syncKey = "";
		templateEditorDraft.sourceTemplateId = "";
		templateEditorDraft.templateName = "";
		templateEditorDraft.templateTitle = "";
		templateEditorDraft.bodyText = "";
		templateEditorDraft.dirty = false;
		templateEditorDraft.saveState = "idle";
		templateEditorDraft.statusText = "";
		return;
	}

	const nextKey = buildTemplateEditorKey(documentsDraft.documentType, resolved.record.id);
	if (!force && templateEditorDraft.syncKey === nextKey) return;

	templateEditorDraft.syncKey = nextKey;
	templateEditorDraft.sourceTemplateId = String(resolved.record.id || "");
	templateEditorDraft.templateName = String(
		resolved.record.template_name || resolved.config.label || "Template",
	);
	templateEditorDraft.templateTitle = String(
		resolved.record.header_json?.title || resolved.config.label || "",
	);
	templateEditorDraft.bodyText = templateBodyBlocksToText(resolved.record.body_json);
	templateEditorDraft.dirty = false;
	templateEditorDraft.saveState = "idle";
	templateEditorDraft.statusText = resolved.record.id
		? "Template loaded. Edit the content below to update preview and export."
		: "Editing the local default layout. Save to create a reusable database template.";
}

function buildEditedTemplateRecord(type = documentsDraft.documentType) {
	const resolved = resolveTemplateBase(type);
	if (!resolved) return null;

	const record = {
		...resolved.record,
		id: String(templateEditorDraft.sourceTemplateId || ""),
		template_name: String(templateEditorDraft.templateName || resolved.config.label).trim() || resolved.config.label,
		header_json: {
			...(resolved.record.header_json || {}),
			title:
				String(templateEditorDraft.templateTitle || "").trim() ||
				String(resolved.record.header_json?.title || resolved.config.label || ""),
		},
		body_json: templateTextToBodyBlocks(templateEditorDraft.bodyText),
		body_markup: String(templateEditorDraft.bodyText || "").trim(),
		field_schema_json:
			resolved.record.field_schema_json && typeof resolved.record.field_schema_json === "object"
				? resolved.record.field_schema_json
				: {
						fields: resolved.fields.map(({ key, label, type: fieldType, required }) => ({
							key,
							label,
							type: fieldType,
							required,
						})),
				  },
	};

	return {
		...record,
		contract_type:
			type === "employment_contract"
				? String(documentsDraft.fields.contract_type || "").trim() || null
				: record.contract_type || null,
	};
}

function getTemplate(type = documentsDraft.documentType) {
	const resolved = resolveTemplateBase(type);
	if (!resolved) return null;

	const editedRecord = buildEditedTemplateRecord(type);
	const record = editedRecord || resolved.record;
	const title = String(record?.header_json?.title || resolved.config.label || "");

	return {
		id: record?.id || "",
		label: String(record?.template_name || resolved.config.label),
		displayTitle: title || String(record?.template_name || resolved.config.label),
		description: resolved.config.description,
		header: record?.header_json || {},
		record,
		...resolved.config,
		fields: resolved.fields,
	};
}

function resetPayrollRows() {
	documentsDraft.payroll = {
		earnings: [{ name: "Tunjangan", amount: "" }],
		deductions: [{ name: "PPh21", amount: "" }],
	};
}

function ensureTemplateDefaults() {
	const template = getTemplate();
	if (!template) return;
	template.fields.forEach((field) => {
		if (documentsDraft.fields[field.key] !== undefined) return;
		if (field.defaultValue === undefined) return;
		documentsDraft.fields[field.key] = String(field.defaultValue);
	});

	if (!documentsDraft.signerId) {
		const fallbackSigner = getSelectedSigner();
		if (fallbackSigner?.id) documentsDraft.signerId = String(fallbackSigner.id);
		else if (state.currentUser?.id) documentsDraft.signerId = String(state.currentUser.id);
	}

	const templates = getFilteredTemplates(documentsDraft.documentType);
	if (!documentsDraft.templateId && templates.length > 0) {
		if (documentsDraft.templateDraftMode) {
			syncTemplateEditorWithSelection();
			return;
		}
		const preferred = templates.find((item) => item?.is_default) || templates[0];
		documentsDraft.templateId = String(preferred?.id || "");
	}

	syncTemplateEditorWithSelection();
}

function getMissingRequiredFields() {
	const template = getTemplate();
	const subject = getSelectedSubject();
	if (!template) return [];

	const missing = [];
	if (!subject) {
		missing.push({
			key: documentsDraft.subjectMode === "manual" ? "manual_identity" : "employeeId",
			label:
				documentsDraft.subjectMode === "manual"
					? "Candidate / manual subject"
					: "Employee",
		});
	}

	template.fields.forEach((field) => {
		if (!field.required) return;
		const value = String(documentsDraft.fields?.[field.key] || "").trim();
		if (!value) missing.push(field);
	});

	if (!documentsDraft.signerId && !getSelectedSigner()) {
		missing.push({ key: "signer", label: "Company signer" });
	}

	if (documentsDraft.documentType === "payslip") {
		const invalidEarnings = documentsDraft.payroll.earnings.some(
			(row) => !String(row?.name || "").trim() || !String(row?.amount || "").trim(),
		);
		const invalidDeductions = documentsDraft.payroll.deductions.some(
			(row) => !String(row?.name || "").trim() || !String(row?.amount || "").trim(),
		);
		if (invalidEarnings) {
			missing.push({ key: "earnings_rows", label: "Allowance / earning rows" });
		}
		if (invalidDeductions) {
			missing.push({ key: "deduction_rows", label: "Deduction rows" });
		}
	}

	return missing;
}

function isDraftReady() {
	return Boolean(getTemplate() && getMissingRequiredFields().length === 0);
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
			return `<option value="${escapeHTML(id)}" ${selected}>${escapeHTML(name)} - ${escapeHTML(position)} - ${escapeHTML(department)}</option>`;
		}),
	].join("");
}

function renderSignerOptions() {
	const signerSelect = document.getElementById("doc-signer-select");
	if (!signerSelect) return;

	const employees = listEmployees();
	signerSelect.innerHTML = [
		'<option value="">-- Select Signer --</option>',
		...employees.map((employee) => {
			const id = String(employee?.id || "");
			const name = String(employee?.name || id);
			const position = String(employee?.position || "-");
			const selected = documentsDraft.signerId === id ? "selected" : "";
			return `<option value="${escapeHTML(id)}" ${selected}>${escapeHTML(name)} - ${escapeHTML(position)}</option>`;
		}),
	].join("");
}

function renderDocumentTypeOptions() {
	const typeSelect = document.getElementById("doc-type-select");
	if (!typeSelect) return;

	typeSelect.innerHTML = [
		'<option value="">-- Select Document Type --</option>',
		...["offer_letter", "employment_contract", "payslip", "warning_letter", "termination_letter"].map(
			(type) => {
				const config = getDocumentConfig(type);
				const selected = documentsDraft.documentType === type ? "selected" : "";
				return `<option value="${escapeHTML(type)}" ${selected}>${escapeHTML(config?.label || type)}</option>`;
			},
		),
	].join("");
}

function renderSubjectModeOptions() {
	const select = document.getElementById("doc-subject-mode");
	if (!select) return;
	const config = getDocumentConfig();
	if (!config) {
		select.innerHTML = '<option value="employee">Employee Database</option>';
		select.disabled = true;
		return;
	}

	select.disabled = false;
	select.innerHTML = (config.allowedSubjectModes || ["employee"])
		.map((mode) => {
			const label = mode === "manual" ? "Manual Entry" : "Employee Database";
			const selected = documentsDraft.subjectMode === mode ? "selected" : "";
			return `<option value="${escapeHTML(mode)}" ${selected}>${escapeHTML(label)}</option>`;
		})
		.join("");
}

function renderTemplateOptions() {
	const select = document.getElementById("doc-template-select");
	if (!select) return;

	const templates = getFilteredTemplates();
	if (!documentsDraft.documentType) {
		select.disabled = true;
		select.innerHTML = '<option value="">-- Select Template --</option>';
		return;
	}

	if (!documentsDraft.templateId && templates.length > 0 && !documentsDraft.templateDraftMode) {
		const preferred = templates.find((item) => item?.is_default) || templates[0];
		documentsDraft.templateId = String(preferred?.id || "");
	}

	select.disabled = false;
	select.innerHTML = [
		`<option value="">${documentsDraft.templateDraftMode ? "-- Unsaved Draft --" : "-- Select Template --"}</option>`,
		...templates.map((template) => {
			const value = String(template?.id || "");
			const label = String(template?.template_name || template?.document_type || "Template");
			const suffix = template?.contract_type ? ` (${template.contract_type})` : "";
			const selected = documentsDraft.templateId === value ? "selected" : "";
			return `<option value="${escapeHTML(value)}" ${selected}>${escapeHTML(`${label}${suffix}`)}</option>`;
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

	if (documentsDraft.templateDraftMode) {
		hintEl.innerHTML = `<span class="fw-semibold">Unsaved draft:</span> edit on the A4 canvas, then save it as a reusable template.`;
		return;
	}

	const templateLabel = template.id ? template.label : `${template.label} (default layout)`;
	hintEl.innerHTML = `<span class="fw-semibold">${escapeHTML(templateLabel)}:</span> ${escapeHTML(template.description)}`;
}

async function ensureHrDocumentCollectionsLoaded() {
	if (templateCollectionsLoaded) return;
	if (templateCollectionsPromise) return templateCollectionsPromise;

	templateCollectionsPromise = Promise.allSettled([
		fetchHrDocumentTemplates(),
		fetchHrDocumentReferenceOptions(),
	]).finally(() => {
		templateCollectionsLoaded = true;
		templateCollectionsPromise = null;
		ensureTemplateDefaults();
		if (canAccessDocuments()) {
			rerenderDocumentWorkspace();
		}
	});

	return templateCollectionsPromise;
}

function refreshTemplateEditorStatus() {
	const statusEl = document.getElementById("doc-template-editor-status");
	if (statusEl) {
		statusEl.className = `small ${
			templateEditorDraft.saveState === "error" ? "text-danger" : "text-muted"
		}`;
		statusEl.textContent = templateEditorDraft.statusText || "";
	}

	const metaNodes = document.querySelectorAll(".documents-template-meta-state");
	metaNodes.forEach((node) => {
		node.textContent = templateEditorDraft.dirty ? "Unsaved changes" : "Synced";
	});
}

function startTemplateDraft(mode = "new") {
	const currentTemplate = getTemplate();
	const fallbackName = currentTemplate?.label || getDocumentConfig()?.label || "Template";
	const fallbackTitle =
		currentTemplate?.displayTitle || currentTemplate?.label || getDocumentConfig()?.label || "Template";
	const currentBodyText =
		mode === "blank" ? "" : normalizeMultilineText(templateEditorDraft.bodyText || "");

	documentsDraft.templateDraftMode = true;
	documentsDraft.templateId = "";
	documentsDraft.surfaceMode = "edit";
	templateEditorDraft.sourceTemplateId = "";
	templateEditorDraft.syncKey = buildTemplateEditorKey(documentsDraft.documentType, "draft");
	templateEditorDraft.templateName =
		mode === "duplicate" ? `${fallbackName} Copy` : `${fallbackName} Draft`;
	templateEditorDraft.templateTitle = fallbackTitle;
	templateEditorDraft.bodyText = currentBodyText;
	templateEditorDraft.dirty = true;
	templateEditorDraft.saveState = "idle";
	templateEditorDraft.statusText =
		mode === "duplicate"
			? "Duplicated into a new draft. Save to create another reusable template."
			: "New template draft ready. Edit on the A4 canvas, then save it.";
}

function clearTemplateDraftMode() {
	documentsDraft.templateDraftMode = false;
}

function renderTemplateEditor() {
	const editor = document.getElementById("doc-template-editor");
	if (!editor) return;

	const template = getTemplate();
	if (!template) {
		editor.innerHTML =
			'<div class="small text-muted">Choose a document type to start editing the template body.</div>';
		return;
	}

	const helperText = TEMPLATE_VARIABLE_TOKENS.map((token) => `<code>${escapeHTML(token)}</code>`).join(" ");
	const sourceLabel = documentsDraft.templateDraftMode
		? "Unsaved draft"
		: template.id
			? "Database template"
			: "Default local layout";
	const saveLabel =
		documentsDraft.templateDraftMode || !template.id ? "Save as Template" : "Save Changes";
	const deleteDisabled = !template.id || documentsDraft.templateDraftMode ? "disabled" : "";
	const duplicateDisabled = !documentsDraft.documentType ? "disabled" : "";

	editor.innerHTML = `
		<div class="documents-template-editor vstack gap-3">
			<div class="documents-template-meta">
				<div>
					<div class="small fw-bold text-muted text-uppercase">Template Source</div>
					<div class="small">${escapeHTML(sourceLabel)}</div>
				</div>
				<div class="small text-muted documents-template-meta-state">${escapeHTML(templateEditorDraft.dirty ? "Unsaved changes" : "Synced")}</div>
			</div>
			<div>
				<label class="form-label small fw-bold text-muted">Template Name</label>
				<input id="doc-template-name-input" type="text" class="form-control" value="${escapeHTML(templateEditorDraft.templateName || "")}" placeholder="e.g. Offer Letter Bahasa Indonesia">
			</div>
			<div>
				<label class="form-label small fw-bold text-muted">Document Title</label>
				<input id="doc-template-title-input" type="text" class="form-control" value="${escapeHTML(templateEditorDraft.templateTitle || "")}" placeholder="e.g. Surat Penawaran Kerja">
			</div>
			<div>
				<label class="form-label small fw-bold text-muted">Body Editing Surface</label>
				<div class="small text-muted">
					Use the A4 editor on the right side for long-form body content. Placeholders supported: ${helperText}
				</div>
			</div>
			<div class="documents-template-actions">
				<button id="doc-template-new-btn" type="button" class="btn btn-outline-secondary btn-sm" ${duplicateDisabled}>New Draft</button>
				<button id="doc-template-duplicate-btn" type="button" class="btn btn-outline-secondary btn-sm" ${duplicateDisabled}>Duplicate</button>
				<button id="doc-template-delete-btn" type="button" class="btn btn-outline-danger btn-sm" ${deleteDisabled}>Delete</button>
			</div>
			<div class="d-flex gap-2 justify-content-end">
				<button id="doc-template-reset-btn" type="button" class="btn btn-outline-secondary btn-sm">Reset Template</button>
				<button id="doc-template-save-btn" type="button" class="btn btn-outline-primary btn-sm">${escapeHTML(saveLabel)}</button>
			</div>
			<div id="doc-template-editor-status" class="small ${templateEditorDraft.saveState === "error" ? "text-danger" : "text-muted"}">${escapeHTML(templateEditorDraft.statusText || "")}</div>
		</div>
	`;

	const templateNameInput = document.getElementById("doc-template-name-input");
	if (templateNameInput) {
		templateNameInput.addEventListener("input", (event) => {
			templateEditorDraft.templateName = String(event.currentTarget?.value || "");
			templateEditorDraft.dirty = true;
			templateEditorDraft.saveState = "idle";
			templateEditorDraft.statusText = "Unsaved changes in template editor.";
			renderTemplateHint();
			refreshTemplateEditorStatus();
			renderPreview();
		});
	}

	const templateTitleInput = document.getElementById("doc-template-title-input");
	if (templateTitleInput) {
		templateTitleInput.addEventListener("input", (event) => {
			templateEditorDraft.templateTitle = String(event.currentTarget?.value || "");
			templateEditorDraft.dirty = true;
			templateEditorDraft.saveState = "idle";
			templateEditorDraft.statusText = "Unsaved changes in template editor.";
			refreshTemplateEditorStatus();
			renderPreview();
		});
	}

	const templateResetBtn = document.getElementById("doc-template-reset-btn");
	if (templateResetBtn) {
		templateResetBtn.addEventListener("click", () => {
			clearTemplateDraftMode();
			syncTemplateEditorWithSelection(true);
			renderTemplateHint();
			renderTemplateEditor();
			renderPreview();
		});
	}

	const templateNewBtn = document.getElementById("doc-template-new-btn");
	if (templateNewBtn) {
		templateNewBtn.addEventListener("click", () => {
			startTemplateDraft("blank");
			rerenderDocumentWorkspace();
		});
	}

	const templateDuplicateBtn = document.getElementById("doc-template-duplicate-btn");
	if (templateDuplicateBtn) {
		templateDuplicateBtn.addEventListener("click", () => {
			startTemplateDraft("duplicate");
			rerenderDocumentWorkspace();
		});
	}

	const templateSaveBtn = document.getElementById("doc-template-save-btn");
	if (templateSaveBtn) {
		templateSaveBtn.addEventListener("click", async () => {
			const editedRecord = buildEditedTemplateRecord();
			if (!editedRecord) return;

			templateEditorDraft.saveState = "saving";
			templateEditorDraft.statusText = "Saving template...";
			renderTemplateEditor();

			try {
				const savedTemplate = await saveHrDocumentTemplate({
					...editedRecord,
					template_status: "active",
				});
				clearTemplateDraftMode();
				documentsDraft.templateId = String(savedTemplate?.id || "");
				syncTemplateEditorWithSelection(true);
				templateEditorDraft.saveState = "success";
				templateEditorDraft.statusText = "Template saved and ready for reuse.";
				rerenderDocumentWorkspace();
				await logActivity({
					action: "document_template.save",
					entityType: "hr_document_template",
					entityId: savedTemplate?.id || "",
					details: {
						document_type: String(savedTemplate?.document_type || documentsDraft.documentType || ""),
						template_name: String(savedTemplate?.template_name || ""),
						contract_type: String(savedTemplate?.contract_type || ""),
					},
				});
				await notify.success("Document template saved successfully.", "Template Saved");
			} catch (error) {
				templateEditorDraft.saveState = "error";
				templateEditorDraft.statusText =
					error?.message || "Template could not be saved in the current environment.";
				renderTemplateEditor();
				await notify.error(
					`Failed to save template: ${error?.message || String(error)}`,
					"Template Save Failed",
				);
			}
		});
	}

	const templateDeleteBtn = document.getElementById("doc-template-delete-btn");
	if (templateDeleteBtn) {
		templateDeleteBtn.addEventListener("click", async () => {
			if (!template.id || documentsDraft.templateDraftMode) return;
			const confirmed = await notify.confirm(
				`Delete template "${template.label}"? This cannot be undone.`,
				{
					title: "Delete Template",
					confirmButtonText: "Delete",
					cancelButtonText: "Cancel",
					icon: "warning",
				},
			);
			if (!confirmed) return;

			try {
				await deleteHrDocumentTemplate(template.id);
				clearTemplateDraftMode();
				documentsDraft.templateId = "";
				syncTemplateEditorWithSelection(true);
				rerenderDocumentWorkspace();
				await logActivity({
					action: "document_template.delete",
					entityType: "hr_document_template",
					entityId: template.id,
					details: {
						document_type: documentsDraft.documentType,
						template_name: template.label,
					},
				});
				await notify.success("Template deleted.", "Template Deleted");
			} catch (error) {
				await notify.error(
					`Failed to delete template: ${error?.message || String(error)}`,
					"Template Delete Failed",
				);
			}
		});
	}
}

function renderSurfaceModeControls() {
	const previewBtn = document.getElementById("doc-surface-preview-btn");
	const editBtn = document.getElementById("doc-surface-edit-btn");
	if (previewBtn) {
		previewBtn.classList.toggle("active", documentsDraft.surfaceMode !== "edit");
	}
	if (editBtn) {
		editBtn.classList.toggle("active", documentsDraft.surfaceMode === "edit");
	}
}

function renderTemplateCanvasBody() {
	const blocks = templateTextToBodyBlocks(templateEditorDraft.bodyText);
	if (blocks.length === 0) return "";
	return blocks
		.map(
			(block) =>
				`<p>${escapeHTML(String(block?.text || ""))}</p>`,
		)
		.join("");
}

function renderSubjectSourceSection() {
	const employeeWrap = document.getElementById("doc-employee-wrap");
	const manualWrap = document.getElementById("doc-manual-identity-wrap");
	if (!employeeWrap || !manualWrap) return;

	const manualMode = documentsDraft.subjectMode === "manual";
	employeeWrap.classList.toggle("d-none", manualMode);
	manualWrap.classList.toggle("d-none", !manualMode);

	manualWrap.innerHTML = manualMode
		? `
			<div class="vstack gap-3">
				<div>
					<label class="form-label small fw-bold text-muted">Candidate / Employee Name</label>
					<input id="doc-manual-name" type="text" class="form-control" value="${escapeHTML(documentsDraft.manualIdentity.name || "")}" placeholder="e.g. Andi Saputra">
				</div>
				<div>
					<label class="form-label small fw-bold text-muted">Legal Name</label>
					<input id="doc-manual-legal-name" type="text" class="form-control" value="${escapeHTML(documentsDraft.manualIdentity.legal_name || "")}" placeholder="Optional if different from display name">
				</div>
				<div class="row g-3">
					<div class="col-md-6">
						<label class="form-label small fw-bold text-muted">Title / Position</label>
						<input id="doc-manual-position" type="text" class="form-control" value="${escapeHTML(documentsDraft.manualIdentity.position || "")}" placeholder="e.g. Backend Engineer">
					</div>
					<div class="col-md-6">
						<label class="form-label small fw-bold text-muted">Department</label>
						<input id="doc-manual-department" type="text" class="form-control" value="${escapeHTML(documentsDraft.manualIdentity.department || "")}" placeholder="e.g. Engineering">
					</div>
					<div class="col-md-6">
						<label class="form-label small fw-bold text-muted">Place of Birth</label>
						<input id="doc-manual-place-of-birth" type="text" class="form-control" value="${escapeHTML(documentsDraft.manualIdentity.place_of_birth || "")}" placeholder="e.g. Jakarta">
					</div>
					<div class="col-md-6">
						<label class="form-label small fw-bold text-muted">Date of Birth</label>
						<input id="doc-manual-date-of-birth" type="date" class="form-control" value="${escapeHTML(documentsDraft.manualIdentity.date_of_birth || "")}">
					</div>
					<div class="col-md-6">
						<label class="form-label small fw-bold text-muted">NIK Number</label>
						<input id="doc-manual-nik-number" type="text" class="form-control" value="${escapeHTML(documentsDraft.manualIdentity.nik_number || "")}" placeholder="16-digit national ID">
					</div>
					<div class="col-md-6">
						<label class="form-label small fw-bold text-muted">Job Level</label>
						<input id="doc-manual-job-level" type="text" class="form-control" value="${escapeHTML(documentsDraft.manualIdentity.job_level || "")}" placeholder="e.g. Staff / Senior Staff">
					</div>
				</div>
				<div>
					<label class="form-label small fw-bold text-muted">Address</label>
					<textarea id="doc-manual-address" class="form-control" rows="2" placeholder="Full address">${escapeHTML(documentsDraft.manualIdentity.address || "")}</textarea>
				</div>
			</div>
		`
		: "";

	const fields = [
		["doc-manual-name", "name"],
		["doc-manual-legal-name", "legal_name"],
		["doc-manual-position", "position"],
		["doc-manual-department", "department"],
		["doc-manual-place-of-birth", "place_of_birth"],
		["doc-manual-date-of-birth", "date_of_birth"],
		["doc-manual-nik-number", "nik_number"],
		["doc-manual-job-level", "job_level"],
		["doc-manual-address", "address"],
	];

	fields.forEach(([id, key]) => {
		const el = document.getElementById(id);
		if (!el) return;
		el.addEventListener("input", (event) => {
			documentsDraft.manualIdentity[key] = String(event.currentTarget?.value || "");
			renderPreview();
			refreshValidationState();
		});
	});
}

function renderSignerSummary() {
	const target = document.getElementById("doc-signer-summary");
	if (!target) return;
	const signer = getSelectedSigner();
	const overrideTitle = String(documentsDraft.signerRoleOverride || "").trim();
	if (!signer) {
		target.innerHTML = '<div class="small text-muted">Choose the company-side signer for this document.</div>';
		return;
	}

	const title = overrideTitle || signer.position || signer.role || "-";
	const hasImage = signer.signature_image_url ? "Digital signature image available" : "No signature image uploaded yet";
	target.innerHTML = `
		<div class="small">
			<div class="fw-semibold">${escapeHTML(String(signer.name || signer.id || "Signer"))}</div>
			<div class="text-muted">${escapeHTML(String(title || "-"))}</div>
			<div class="text-muted">${escapeHTML(hasImage)}</div>
		</div>
	`;
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

function renderPayrollRows() {
	if (documentsDraft.documentType !== "payslip") return "";

	const renderGroup = (title, rows, rowType, addLabel) => `
		<div class="documents-payroll-group">
			<div class="d-flex justify-content-between align-items-center mb-2">
				<div class="small fw-bold text-muted text-uppercase">${escapeHTML(title)}</div>
				<button type="button" class="btn btn-outline-primary btn-sm" data-doc-payroll-add="${escapeHTML(rowType)}">${escapeHTML(addLabel)}</button>
			</div>
			<div class="vstack gap-2">
				${rows
					.map(
						(row, index) => `
							<div class="row g-2 align-items-center" data-doc-payroll-row="${escapeHTML(`${rowType}:${index}`)}">
								<div class="col-7">
									<input type="text" class="form-control" data-doc-payroll-name="${escapeHTML(`${rowType}:${index}`)}" value="${escapeHTML(row.name || "")}" placeholder="Component name">
								</div>
								<div class="col-4">
									<input type="number" class="form-control" data-doc-payroll-amount="${escapeHTML(`${rowType}:${index}`)}" value="${escapeHTML(String(row.amount || ""))}" placeholder="0">
								</div>
								<div class="col-1">
									<button type="button" class="btn btn-outline-danger btn-sm w-100" data-doc-payroll-remove="${escapeHTML(`${rowType}:${index}`)}">-</button>
								</div>
							</div>`,
					)
					.join("")}
			</div>
		</div>
	`;

	return `
		<div class="documents-payroll-editor vstack gap-3">
			${renderGroup("Allowance / Earnings", documentsDraft.payroll.earnings, "earnings", "Add Row")}
			${renderGroup("Deductions", documentsDraft.payroll.deductions, "deductions", "Add Row")}
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

	container.innerHTML = `
		${template.fields.map(renderFieldControl).join("")}
		${renderPayrollRows()}
	`;

	container.querySelectorAll("[data-doc-field]").forEach((input) => {
		const eventName = input.tagName === "SELECT" ? "change" : "input";
		input.addEventListener(eventName, (event) => {
			const key = String(event.currentTarget?.dataset?.docField || "");
			documentsDraft.fields[key] = String(event.currentTarget?.value || "");

			if (key === "contract_type") {
				renderTemplateOptions();
				ensureTemplateDefaults();
				syncTemplateEditorWithSelection(true);
				renderTemplateHint();
				renderTemplateEditor();
				renderDynamicFields();
			}

			renderPreview();
			refreshValidationState();
		});
	});

	container.querySelectorAll("[data-doc-payroll-add]").forEach((button) => {
		button.addEventListener("click", (event) => {
			const type = String(event.currentTarget?.dataset?.docPayrollAdd || "");
			const targetRows =
				type === "deductions" ? documentsDraft.payroll.deductions : documentsDraft.payroll.earnings;
			targetRows.push({ name: "", amount: "" });
			renderDynamicFields();
			refreshValidationState();
			renderPreview();
		});
	});

	container.querySelectorAll("[data-doc-payroll-remove]").forEach((button) => {
		button.addEventListener("click", (event) => {
			const [type, rawIndex] = String(
				event.currentTarget?.dataset?.docPayrollRemove || "",
			).split(":");
			const index = Number(rawIndex);
			const targetRows =
				type === "deductions" ? documentsDraft.payroll.deductions : documentsDraft.payroll.earnings;
			targetRows.splice(index, 1);
			if (targetRows.length === 0) targetRows.push({ name: "", amount: "" });
			renderDynamicFields();
			refreshValidationState();
			renderPreview();
		});
	});

	container.querySelectorAll("[data-doc-payroll-name]").forEach((input) => {
		input.addEventListener("input", (event) => {
			const [type, rawIndex] = String(
				event.currentTarget?.dataset?.docPayrollName || "",
			).split(":");
			const index = Number(rawIndex);
			const targetRows =
				type === "deductions" ? documentsDraft.payroll.deductions : documentsDraft.payroll.earnings;
			if (targetRows[index]) targetRows[index].name = String(event.currentTarget?.value || "");
			renderPreview();
			refreshValidationState();
		});
	});

	container.querySelectorAll("[data-doc-payroll-amount]").forEach((input) => {
		input.addEventListener("input", (event) => {
			const [type, rawIndex] = String(
				event.currentTarget?.dataset?.docPayrollAmount || "",
			).split(":");
			const index = Number(rawIndex);
			const targetRows =
				type === "deductions" ? documentsDraft.payroll.deductions : documentsDraft.payroll.earnings;
			if (targetRows[index]) targetRows[index].amount = String(event.currentTarget?.value || "");
			renderPreview();
			refreshValidationState();
		});
	});
}

function buildPreviewContext() {
	const subject = getSelectedSubject();
	const template = getTemplate();
	const signer = getSelectedSigner();
	if (!subject || !template) return null;

	const values = {};
	template.fields.forEach((field) => {
		values[field.key] = String(documentsDraft.fields?.[field.key] || "").trim();
	});

	const numbers = Object.fromEntries(
		template.fields
			.filter((field) => field.type === "number")
			.map((field) => [field.key, normalizeNumber(values[field.key])]),
	);

	const payroll = {
		earnings: documentsDraft.payroll.earnings
			.map((row) => ({
				name: String(row?.name || "").trim(),
				amount: normalizeNumber(row?.amount),
			}))
			.filter((row) => row.name || row.amount),
		deductions: documentsDraft.payroll.deductions
			.map((row) => ({
				name: String(row?.name || "").trim(),
				amount: normalizeNumber(row?.amount),
			}))
			.filter((row) => row.name || row.amount),
	};

	const totals = {
		totalEarnings:
			normalizeNumber(values.basic_salary) +
			payroll.earnings.reduce((sum, row) => sum + row.amount, 0),
		totalDeductions: payroll.deductions.reduce((sum, row) => sum + row.amount, 0),
	};
	totals.netPay = totals.totalEarnings - totals.totalDeductions;

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

	const signerName = escapeHTML(
		String(signer?.name || state.currentUser?.name || "HR Representative"),
	);
	const signerRole = escapeHTML(
		String(documentsDraft.signerRoleOverride || signer?.position || signer?.role || "HR"),
	);

	return {
		subject,
		employee: subject,
		template,
		values,
		numbers,
		formatted,
		payroll,
		totals,
		companyName: escapeHTML(
			String(state.appSettings?.company_name || "").trim() || "Company",
		),
		appName: escapeHTML(
			String(state.appSettings?.app_name || "").trim() || "HR Performance Suite",
		),
		subjectName: escapeHTML(String(subject.name || subject.id || "Employee")),
		subjectPosition: escapeHTML(String(subject.position || "-")),
		subjectDepartment: escapeHTML(String(subject.department || "-")),
		subjectJobLevel: escapeHTML(String(subject.job_level || "-")),
		subjectPlaceOfBirth: escapeHTML(String(subject.place_of_birth || "-")),
		subjectDateOfBirth: escapeHTML(formatDateLong(subject.date_of_birth || "")),
		subjectAddress: escapeHTML(String(subject.address || "-")),
		subjectNik: escapeHTML(String(subject.nik_number || "-")),
		signerName,
		signerRole,
		signerHasImage: Boolean(signer?.signature_image_url),
		recipientHasImage: Boolean(subject?.signature_image_url),
	};
}

function renderSignaturePlaceholderCard({
	label,
	name,
	role,
	hasDigitalImage = false,
} = {}) {
	const digitalText = hasDigitalImage
		? "Digital signature image on file. Exported document can place the e-sign here."
		: "Digital signature placeholder. Upload an image later or keep this as e-sign placement.";
	return `
		<div class="documents-preview-signature-card">
			<p class="documents-preview-signature-label">${escapeHTML(String(label || "Signature"))}</p>
			<div class="documents-preview-signature-box">
				<div class="documents-preview-signature-box-copy">${escapeHTML(digitalText)}</div>
				<div class="documents-preview-signature-box-line"></div>
				<div class="documents-preview-signature-box-copy">Wet signature area for printed copy</div>
			</div>
			<p class="mb-0"><strong>${name}</strong></p>
			<p class="small text-muted mb-0">${role}</p>
		</div>
	`;
}

function renderSignatureBlock(ctx, options = {}) {
	const recipientTitle =
		documentsDraft.documentType === "offer_letter"
			? "Candidate acknowledgment"
			: "Employee acknowledgment";

	return `
		<div class="documents-preview-signature-grid">
			${renderSignaturePlaceholderCard({
				label: "Approved by",
				name: ctx.signerName,
				role: ctx.signerRole,
				hasDigitalImage: ctx.signerHasImage,
			})}
			${
				options.includeRecipient
					? renderSignaturePlaceholderCard({
							label: recipientTitle,
							name: ctx.subjectName,
							role: ctx.subjectPosition,
							hasDigitalImage: ctx.recipientHasImage,
					  })
					: ""
			}
		</div>
	`;
}

function numberToBahasaWords(value) {
	const units = [
		"",
		"satu",
		"dua",
		"tiga",
		"empat",
		"lima",
		"enam",
		"tujuh",
		"delapan",
		"sembilan",
		"sepuluh",
		"sebelas",
	];
	const n = Math.floor(Math.abs(Number(value) || 0));
	if (n < 12) return units[n];
	if (n < 20) return `${numberToBahasaWords(n - 10)} belas`;
	if (n < 100) {
		const tens = Math.floor(n / 10);
		const rest = n % 10;
		return `${numberToBahasaWords(tens)} puluh ${numberToBahasaWords(rest)}`.trim();
	}
	if (n < 200) return `seratus ${numberToBahasaWords(n - 100)}`.trim();
	if (n < 1000) {
		const hundreds = Math.floor(n / 100);
		const rest = n % 100;
		return `${numberToBahasaWords(hundreds)} ratus ${numberToBahasaWords(rest)}`.trim();
	}
	if (n < 2000) return `seribu ${numberToBahasaWords(n - 1000)}`.trim();
	if (n < 1000000) {
		const thousands = Math.floor(n / 1000);
		const rest = n % 1000;
		return `${numberToBahasaWords(thousands)} ribu ${numberToBahasaWords(rest)}`.trim();
	}
	if (n < 1000000000) {
		const millions = Math.floor(n / 1000000);
		const rest = n % 1000000;
		return `${numberToBahasaWords(millions)} juta ${numberToBahasaWords(rest)}`.trim();
	}
	return String(n);
}

function buildTemplateVariables(ctx) {
	return {
		company_name: ctx.companyName,
		app_name: ctx.appName,
		employee_name: ctx.subjectName,
		legal_name: escapeHTML(String(ctx.subject.legal_name || ctx.subject.name || "-")),
		place_of_birth: ctx.subjectPlaceOfBirth,
		date_of_birth: ctx.subjectDateOfBirth,
		address: ctx.subjectAddress,
		nik_number: ctx.subjectNik,
		employee_id: escapeHTML(String(ctx.subject.id || "-")),
		employee_position: ctx.subjectPosition,
		job_title: ctx.subjectPosition,
		job_level: ctx.subjectJobLevel,
		department: ctx.subjectDepartment,
		signer_name: ctx.signerName,
		signer_title: ctx.signerRole,
		contract_type: ctx.formatted.contract_type || "-",
		contract_duration: ctx.formatted.contract_duration || "-",
		probation_duration: ctx.formatted.probation_duration || "-",
		nomor_surat: ctx.formatted.nomor_surat || "-",
		letter_date: ctx.formatted.letter_date || "-",
		start_date: ctx.formatted.start_date || "-",
		contract_start_date: ctx.formatted.contract_start_date || "-",
		work_location: ctx.formatted.work_location || "-",
		basic_salary: ctx.formatted.basic_salary_currency || "IDR 0",
		salary_in_words: escapeHTML(
			`${numberToBahasaWords(ctx.numbers.basic_salary || 0).replace(/\s+/g, " ").trim()} rupiah`,
		),
		warning_level: ctx.formatted.warning_level || "-",
		last_working_day: ctx.formatted.last_working_day || "-",
		termination_reason: formatMultiline(ctx.values.termination_reason || ""),
	};
}

function renderTemplateBlocksPreview(ctx) {
	const blocks = Array.isArray(ctx.template?.record?.body_json) ? ctx.template.record.body_json : [];
	if (blocks.length === 0) return "";
	const variables = buildTemplateVariables(ctx);
	return blocks
		.map((block) => {
			const rawText = String(block?.text || "");
			const interpolated = rawText.replace(/\{\{\s*([\w_]+)\s*\}\}/g, (_, key) => {
				return variables[key] ?? "-";
			});
			if (!interpolated.trim()) return "";
			return `<div class="documents-preview-block"><p>${interpolated}</p></div>`;
		})
		.join("");
}

function renderTemplatePreview(ctx) {
	const templateBody = renderTemplateBlocksPreview(ctx);
	switch (documentsDraft.documentType) {
		case "offer_letter": {
			const durationCopy =
				ctx.values.contract_type === "PKWTT"
					? `Probation period: <strong>${ctx.formatted.probation_duration}</strong>.`
					: `Contract duration: <strong>${ctx.formatted.contract_duration}</strong>.`;
			return `
				<div class="documents-preview-block">
					<p>Date: ${ctx.formatted.letter_date}</p>
					<p>Nomor Surat: <strong>${ctx.formatted.nomor_surat}</strong></p>
					<p>Contract Type: <strong>${ctx.formatted.contract_type}</strong></p>
				</div>
				${templateBody || `<div class="documents-preview-block">
					<p>Dear ${ctx.subjectName},</p>
					<p>We are pleased to offer you the position of <strong>${ctx.subjectPosition}</strong> in <strong>${ctx.subjectDepartment}</strong> effective on <strong>${ctx.formatted.start_date}</strong>.</p>
					<p>${durationCopy}</p>
					<p>Base monthly salary: <strong>${ctx.formatted.basic_salary_currency}</strong>.</p>
				</div>`}
				${
					ctx.values.benefits
						? `<div class="documents-preview-block"><p><strong>Benefits</strong><br>${formatMultiline(ctx.values.benefits)}</p></div>`
						: ""
				}
				${renderSignatureBlock(ctx, { includeRecipient: true })}
			`;
		}
		case "employment_contract":
			return `
				<div class="documents-preview-block">
					<p>Contract Number: <strong>${ctx.formatted.contract_number}</strong></p>
					<p>Date: ${ctx.formatted.letter_date}</p>
					<p>Contract Type: <strong>${ctx.formatted.contract_type}</strong></p>
				</div>
				${templateBody || `<div class="documents-preview-block">
					<p>This employment agreement is made between <strong>${ctx.companyName}</strong> and <strong>${ctx.subjectName}</strong> for the role of <strong>${ctx.subjectPosition}</strong>.</p>
					<p>Department: <strong>${ctx.subjectDepartment}</strong>. Job level: <strong>${ctx.subjectJobLevel}</strong>.</p>
					<p>Place / DoB: <strong>${ctx.subjectPlaceOfBirth}</strong> / <strong>${ctx.subjectDateOfBirth}</strong>.</p>
					<p>Address: <strong>${ctx.subjectAddress}</strong>. NIK: <strong>${ctx.subjectNik}</strong>.</p>
					<p>Start date: <strong>${ctx.formatted.contract_start_date}</strong>. Work location: <strong>${ctx.formatted.work_location}</strong>.</p>
					<p>${
						ctx.values.contract_type === "PKWTT"
							? `Probation duration: <strong>${ctx.formatted.probation_duration}</strong>.`
							: `Contract duration: <strong>${ctx.formatted.contract_duration}</strong>.`
					}</p>
					<p>Base monthly salary: <strong>${ctx.formatted.basic_salary_currency}</strong>.</p>
				</div>`}
				${
					ctx.values.job_description
						? `<div class="documents-preview-block"><p><strong>Job Description</strong><br>${formatMultiline(ctx.values.job_description)}</p></div>`
						: ""
				}
				${renderSignatureBlock(ctx, { includeRecipient: true })}
			`;
		case "payslip":
			return `
				<div class="documents-preview-block">
					<p><strong>Employee:</strong> ${ctx.subjectName}</p>
					<p><strong>Position:</strong> ${ctx.subjectPosition}</p>
					<p><strong>Period:</strong> ${ctx.formatted.period_month}</p>
					<p><strong>Pay Date:</strong> ${ctx.formatted.pay_date}</p>
				</div>
				<div class="documents-preview-block">
					<div class="documents-preview-watermark small text-uppercase text-muted">Confidential Document</div>
					<table class="table table-sm documents-preview-table mb-0">
						<tbody>
							<tr><td>Basic Salary</td><td class="text-end">${ctx.formatted.basic_salary_currency}</td></tr>
							${ctx.payroll.earnings.map((row) => `<tr><td>${escapeHTML(row.name || "Allowance")}</td><td class="text-end">${formatCurrencyId(row.amount)}</td></tr>`).join("")}
							<tr class="fw-semibold"><td>Total Earnings</td><td class="text-end">${formatCurrencyId(ctx.totals.totalEarnings)}</td></tr>
							${ctx.payroll.deductions.map((row) => `<tr><td>${escapeHTML(row.name || "Deduction")}</td><td class="text-end">(${formatCurrencyId(row.amount)})</td></tr>`).join("")}
							<tr class="fw-semibold"><td>Total Deductions</td><td class="text-end">(${formatCurrencyId(ctx.totals.totalDeductions)})</td></tr>
							<tr class="fw-bold"><td>Net Pay</td><td class="text-end">${formatCurrencyId(ctx.totals.netPay)}</td></tr>
						</tbody>
					</table>
				</div>
				${renderSignatureBlock(ctx)}
			`;
		case "warning_letter":
			return `
				<div class="documents-preview-block">
					<p>Date: ${ctx.formatted.letter_date}</p>
					<p>Reference: ${ctx.formatted.warning_level}</p>
				</div>
				${templateBody || `<div class="documents-preview-block">
					<p>To: ${ctx.subjectName} (${ctx.subjectPosition})</p>
					<p>This letter serves as <strong>${ctx.formatted.warning_level}</strong> based on the following findings:</p>
					<p>${formatMultiline(ctx.values.offense_details)}</p>
					<p>This warning is valid for <strong>${ctx.formatted.validity_period}</strong> from the date of issuance.</p>
				</div>`}
				${ctx.values.offense_impact ? `<div class="documents-preview-block"><p><strong>Outcome to Company:</strong><br>${formatMultiline(ctx.values.offense_impact)}</p></div>` : ""}
				${ctx.values.corrective_actions ? `<div class="documents-preview-block"><p><strong>Corrective Actions:</strong><br>${formatMultiline(ctx.values.corrective_actions)}</p></div>` : ""}
				${renderSignatureBlock(ctx)}
			`;
		case "termination_letter":
			return `
				<div class="documents-preview-block">
					<p>Date: ${ctx.formatted.letter_date}</p>
					<p>Subject: Employment Termination Notice</p>
				</div>
				${templateBody || `<div class="documents-preview-block">
					<p>Dear ${ctx.subjectName},</p>
					<p>This letter confirms the termination of your employment as <strong>${ctx.subjectPosition}</strong> effective on <strong>${ctx.formatted.last_working_day}</strong>.</p>
					<p><strong>Reason:</strong><br>${formatMultiline(ctx.values.termination_reason)}</p>
				</div>`}
				${ctx.values.legal_basis ? `<div class="documents-preview-block"><p><strong>Legal Basis:</strong><br>${formatMultiline(ctx.values.legal_basis)}</p></div>` : ""}
				${ctx.values.company_policy_basis ? `<div class="documents-preview-block"><p><strong>Company Policy:</strong><br>${formatMultiline(ctx.values.company_policy_basis)}</p></div>` : ""}
				${ctx.values.outcome_summary ? `<div class="documents-preview-block"><p><strong>Outcome:</strong><br>${formatMultiline(ctx.values.outcome_summary)}</p></div>` : ""}
				${ctx.values.sanction_text ? `<div class="documents-preview-block"><p><strong>Sanction / Punishment:</strong><br>${formatMultiline(ctx.values.sanction_text)}</p></div>` : ""}
				${ctx.values.severance_details ? `<div class="documents-preview-block"><p><strong>Severance Details:</strong><br>${formatMultiline(ctx.values.severance_details)}</p></div>` : ""}
				${renderSignatureBlock(ctx)}
			`;
		default:
			return "";
	}
}

function renderPreview() {
	const previewEl = document.getElementById("doc-preview");
	if (!previewEl) return;

	const ctx = buildPreviewContext();
	if (!ctx) {
		previewEl.innerHTML = `
			<div class="documents-preview-empty">
				Select document type and complete the subject details to start preview.
			</div>
		`;
		return;
	}

	const logoUrl = String(state.appSettings?.document_logo_url || "").trim();
	if (documentsDraft.surfaceMode === "edit") {
		previewEl.innerHTML = `
			<div class="documents-preview-header">
				<div>
					<div class="documents-preview-company">${ctx.companyName}</div>
					<div class="documents-preview-app">${ctx.appName}</div>
				</div>
				${logoUrl ? `<img src="${escapeHTML(logoUrl)}" alt="Company logo" class="documents-preview-logo">` : ""}
			</div>
			<hr class="my-3">
			<div class="documents-preview-title">${escapeHTML(ctx.template.displayTitle || ctx.template.label)}</div>
			<div class="documents-preview-meta small text-muted mb-3">
				A4 template editor. Edit the body directly on the page. Dynamic signature and generated sections still use the document setup values.
			</div>
			<div
				id="doc-template-canvas-editor"
				class="documents-template-canvas"
				contenteditable="true"
				spellcheck="false"
				data-placeholder="Type the body of the document here. Use placeholders like {{employee_name}} or {{salary_in_words}}."
			>${renderTemplateCanvasBody()}</div>
			<div class="documents-template-canvas-footer">
				${renderSignatureBlock(ctx, {
					includeRecipient: ["offer_letter", "employment_contract"].includes(
						documentsDraft.documentType,
					),
				})}
			</div>
		`;

		const canvasEditor = document.getElementById("doc-template-canvas-editor");
		if (canvasEditor) {
			canvasEditor.addEventListener("input", (event) => {
				templateEditorDraft.bodyText = normalizeMultilineText(
					event.currentTarget?.innerText || "",
				);
				templateEditorDraft.dirty = true;
				templateEditorDraft.saveState = "idle";
				templateEditorDraft.statusText = "Unsaved changes in template editor.";
				refreshTemplateEditorStatus();
			});
		}
		return;
	}

	previewEl.innerHTML = `
		<div class="documents-preview-header">
			<div>
				<div class="documents-preview-company">${ctx.companyName}</div>
				<div class="documents-preview-app">${ctx.appName}</div>
			</div>
			${logoUrl ? `<img src="${escapeHTML(logoUrl)}" alt="Company logo" class="documents-preview-logo">` : ""}
		</div>
		<hr class="my-3">
		<div class="documents-preview-title">${escapeHTML(ctx.template.displayTitle || ctx.template.label)}</div>
		<div class="documents-preview-meta small text-muted mb-3">
			Subject ID: ${escapeHTML(String(ctx.subject.id || "-"))}
		</div>
		${renderTemplatePreview(ctx)}
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

	const employeeSelect = document.getElementById("doc-employee-select");
	if (employeeSelect) {
		employeeSelect.classList.toggle("is-invalid", missingKeys.has("employeeId"));
	}
	const signerSelect = document.getElementById("doc-signer-select");
	if (signerSelect) {
		signerSelect.classList.toggle("is-invalid", missingKeys.has("signer"));
	}
	const manualName = document.getElementById("doc-manual-name");
	if (manualName) {
		manualName.classList.toggle("is-invalid", missingKeys.has("manual_identity"));
	}
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

function setControlsDisabled(disabled) {
	[
		"doc-subject-mode",
		"doc-employee-select",
		"doc-type-select",
		"doc-template-select",
		"doc-surface-preview-btn",
		"doc-surface-edit-btn",
		"doc-template-save-btn",
		"doc-template-reset-btn",
		"doc-signer-select",
		"doc-signer-role-override",
		"doc-download-btn",
		"doc-reset-btn",
	].forEach((id) => {
		const el = document.getElementById(id);
		if (el) el.disabled = Boolean(disabled);
	});

	document
		.querySelectorAll(
			"#doc-dynamic-fields input, #doc-dynamic-fields select, #doc-dynamic-fields textarea, #doc-manual-identity-wrap input, #doc-manual-identity-wrap textarea, #doc-template-editor input, #doc-template-editor textarea, #doc-template-editor button",
		)
		.forEach((field) => {
			field.disabled = Boolean(disabled);
		});
}

function rerenderDocumentWorkspace() {
	renderSurfaceModeControls();
	renderSubjectModeOptions();
	renderEmployeeOptions();
	renderSignerOptions();
	renderTemplateOptions();
	renderTemplateHint();
	renderTemplateEditor();
	renderSubjectSourceSection();
	renderSignerSummary();
	renderDynamicFields();
	renderPreview();
	refreshValidationState();
}

function bindSetupHandlers() {
	const employeeSelect = document.getElementById("doc-employee-select");
	const typeSelect = document.getElementById("doc-type-select");
	const subjectModeSelect = document.getElementById("doc-subject-mode");
	const templateSelect = document.getElementById("doc-template-select");
	const surfacePreviewBtn = document.getElementById("doc-surface-preview-btn");
	const surfaceEditBtn = document.getElementById("doc-surface-edit-btn");
	const signerSelect = document.getElementById("doc-signer-select");
	const signerRoleInput = document.getElementById("doc-signer-role-override");
	const downloadBtn = document.getElementById("doc-download-btn");
	const resetBtn = document.getElementById("doc-reset-btn");

	if (employeeSelect) {
		employeeSelect.onchange = (event) => {
			documentsDraft.employeeId = String(event.target?.value || "");
			renderPreview();
			refreshValidationState();
		};
	}

	if (subjectModeSelect) {
		subjectModeSelect.onchange = (event) => {
			const nextMode = String(event.target?.value || "employee");
			documentsDraft.subjectMode = isSubjectModeAllowed(documentsDraft.documentType, nextMode)
				? nextMode
				: defaultSubjectModeForType(documentsDraft.documentType);
			rerenderDocumentWorkspace();
		};
	}

	if (typeSelect) {
		typeSelect.onchange = (event) => {
			const nextType = String(event.target?.value || "");
			if (nextType !== documentsDraft.documentType) {
				documentsDraft.documentType = nextType;
				clearTemplateDraftMode();
				documentsDraft.templateId = "";
				documentsDraft.fields = {};
				documentsDraft.subjectMode = defaultSubjectModeForType(nextType);
				if (documentsDraft.subjectMode === "manual") {
					documentsDraft.employeeId = "";
				}
				resetPayrollRows();
			}
			ensureTemplateDefaults();
			syncTemplateEditorWithSelection(true);
			rerenderDocumentWorkspace();
		};
	}

	if (templateSelect) {
		templateSelect.onchange = (event) => {
			clearTemplateDraftMode();
			documentsDraft.templateId = String(event.target?.value || "");
			syncTemplateEditorWithSelection(true);
			renderTemplateHint();
			renderTemplateEditor();
			renderPreview();
			refreshValidationState();
		};
	}

	if (surfacePreviewBtn) {
		surfacePreviewBtn.onclick = () => {
			documentsDraft.surfaceMode = "preview";
			renderSurfaceModeControls();
			renderPreview();
		};
	}

	if (surfaceEditBtn) {
		surfaceEditBtn.onclick = () => {
			documentsDraft.surfaceMode = "edit";
			renderSurfaceModeControls();
			renderPreview();
		};
	}

	if (signerSelect) {
		signerSelect.onchange = (event) => {
			documentsDraft.signerId = String(event.target?.value || "");
			renderSignerSummary();
			renderPreview();
			refreshValidationState();
		};
	}

	if (signerRoleInput) {
		signerRoleInput.oninput = (event) => {
			documentsDraft.signerRoleOverride = String(event.target?.value || "");
			renderSignerSummary();
			renderPreview();
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

				const exportValues = {
					...context.values,
					probation_period:
						context.values.probation_duration || context.values.probation_period || "",
					contract_duration: context.values.contract_duration || "",
					allowances: context.payroll.earnings.reduce((sum, row) => sum + row.amount, 0),
					deductions: context.payroll.deductions.reduce((sum, row) => sum + row.amount, 0),
				};

				const { doc, filename } = await generateHrDocumentPdf({
					type: documentsDraft.documentType,
					employee: {
						id: context.subject.id,
						name: context.subject.name,
						position: context.subject.position,
						department: context.subject.department,
					},
					values: exportValues,
					branding: {
						companyName: String(state.appSettings?.company_name || "").trim(),
						appName: String(state.appSettings?.app_name || "").trim(),
						logoUrl: String(state.appSettings?.document_logo_url || "").trim(),
						documentFooterText: String(state.appSettings?.document_footer_text || "").trim(),
						defaultWatermark: String(
							state.appSettings?.document_default_watermark || "Confidential",
						).trim(),
					},
					signer: {
						name: String(getSelectedSigner()?.name || state.currentUser?.name || "HR Representative"),
						role: String(
							documentsDraft.signerRoleOverride ||
								getSelectedSigner()?.position ||
								state.currentUser?.role ||
								"hr",
						),
						signatureImageUrl: String(getSelectedSigner()?.signature_image_url || "").trim(),
					},
					recipientSigner: {
						name: String(context.subject.name || ""),
						role: String(context.subject.position || ""),
						signatureImageUrl: String(context.subject.signature_image_url || "").trim(),
					},
					template: context.template.record || null,
					payroll: context.payroll,
				});

				doc.save(filename);

				if (documentsDraft.documentType === "warning_letter" && state.db?.[context.subject.id]) {
					const spUntil = parseValidityToDate(
						context.values.letter_date || TODAY_ISO,
						context.values.validity_period,
					);
					const nextRecord = {
						...state.db[context.subject.id],
						active_sp_level: String(context.values.warning_level || ""),
						active_sp_until: spUntil || null,
						active_sp_reason: String(context.values.offense_details || "").trim() || null,
					};
					await saveEmployee(nextRecord);
				}

				await logActivity({
					action: "document.generate",
					entityType: "employee_document",
					entityId: context.subject.id,
					details: {
						document_type: documentsDraft.documentType,
						employee_id: context.subject.id,
						employee_name: context.subject.name || "",
						filename,
						subject_mode: documentsDraft.subjectMode,
						signer_id: documentsDraft.signerId || "",
						template_id: documentsDraft.templateId || "",
						active_sp_level:
							documentsDraft.documentType === "warning_letter"
								? String(context.values.warning_level || "")
								: "",
						active_sp_until:
							documentsDraft.documentType === "warning_letter"
								? parseValidityToDate(
										context.values.letter_date || TODAY_ISO,
										context.values.validity_period,
								  )
								: "",
						termination_reason:
							documentsDraft.documentType === "termination_letter"
								? String(context.values.termination_reason || "")
								: "",
						termination_legal_basis:
							documentsDraft.documentType === "termination_letter"
								? String(context.values.legal_basis || "")
								: "",
						termination_company_policy:
							documentsDraft.documentType === "termination_letter"
								? String(context.values.company_policy_basis || "")
								: "",
						termination_outcome:
							documentsDraft.documentType === "termination_letter"
								? String(context.values.outcome_summary || "")
								: "",
						termination_sanction:
							documentsDraft.documentType === "termination_letter"
								? String(context.values.sanction_text || "")
								: "",
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
	documentsDraft.subjectMode = "employee";
	documentsDraft.surfaceMode = "preview";
	clearTemplateDraftMode();
	documentsDraft.employeeId = "";
	documentsDraft.manualIdentity = {
		name: "",
		legal_name: "",
		position: "",
		department: "",
		place_of_birth: "",
		date_of_birth: "",
		address: "",
		nik_number: "",
		job_level: "",
	};
	documentsDraft.signerId = String(state.currentUser?.id || "");
	documentsDraft.signerRoleOverride = "";
	documentsDraft.documentType = "";
	documentsDraft.templateId = "";
	documentsDraft.fields = {};
	resetPayrollRows();
	syncTemplateEditorWithSelection(true);
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
		const templateEditor = document.getElementById("doc-template-editor");
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
		if (templateEditor) templateEditor.innerHTML = "";
		if (validationEl) validationEl.textContent = "";
		setControlsDisabled(true);
		return;
	}

	void ensureHrDocumentCollectionsLoaded();
	ensureTemplateDefaults();
	renderDocumentTypeOptions();
	rerenderDocumentWorkspace();
	bindSetupHandlers();
	setControlsDisabled(false);
}

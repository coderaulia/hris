import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const PAGE = {
	width: 210,
	height: 297,
	marginX: 18,
	marginTop: 20,
	marginBottom: 16,
};

function normalizeNumber(value) {
	const num = Number(value);
	return Number.isFinite(num) ? num : 0;
}

function asText(value, fallback = "-") {
	const text = String(value ?? "").trim();
	return text || fallback;
}

function toCurrency(value) {
	return `IDR ${normalizeNumber(value).toLocaleString("id-ID")}`;
}

function toDateLabel(value) {
	if (!value) return "-";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return asText(value);
	return date.toLocaleDateString("en-GB", {
		day: "2-digit",
		month: "long",
		year: "numeric",
	});
}

function toMonthLabel(value) {
	const raw = asText(value, "");
	const [year, month] = raw.split("-");
	if (!year || !month) return raw || "-";
	const date = new Date(Number(year), Number(month) - 1, 1);
	if (Number.isNaN(date.getTime())) return raw;
	return date.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

function sanitizeFilenameToken(value, fallback) {
	const normalized = asText(value, fallback)
		.toLowerCase()
		.replace(/[^a-z0-9_-]+/g, "_")
		.replace(/^_+|_+$/g, "");
	return normalized || fallback;
}

function buildFilename(type, employeeId) {
	const date = new Date();
	const stamp = [
		String(date.getFullYear()),
		String(date.getMonth() + 1).padStart(2, "0"),
		String(date.getDate()).padStart(2, "0"),
	].join("");
	const typeToken = sanitizeFilenameToken(type, "document");
	const employeeToken = sanitizeFilenameToken(employeeId, "employee");
	return `${typeToken}_${employeeToken}_${stamp}.pdf`;
}

function ensureSpace(doc, y, neededHeight = 12) {
	if (y + neededHeight <= PAGE.height - PAGE.marginBottom) return y;
	doc.addPage();
	return PAGE.marginTop;
}

function formatSignerRole(role) {
	const normalized = String(role || "").trim().toLowerCase();
	if (normalized === "superadmin") return "Superadmin";
	if (normalized === "hr") return "HR";
	return asText(role, "HR");
}

function documentTitle(type) {
	const titleMap = {
		offer_letter: "Offer Letter",
		employment_contract: "Employment Contract",
		payslip: "Payslip",
		warning_letter: "Warning Letter",
		termination_letter: "Termination Letter",
	};
	return titleMap[type] || "HR Document";
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

function buildTemplateVariables({ employee = {}, values = {}, branding = {}, signer = {} }) {
	return {
		company_name: asText(branding.companyName || branding.company_name, "Company"),
		app_name: asText(branding.appName || branding.app_name, "HR Performance Suite"),
		employee_name: asText(employee.name),
		legal_name: asText(employee.legal_name || employee.name),
		place_of_birth: asText(employee.place_of_birth),
		date_of_birth: toDateLabel(employee.date_of_birth),
		address: asText(employee.address),
		nik_number: asText(employee.nik_number),
		employee_id: asText(employee.id),
		employee_position: asText(employee.position),
		job_title: asText(employee.position),
		job_level: asText(employee.job_level),
		department: asText(employee.department),
		signer_name: asText(signer.name, "HR Representative"),
		signer_title: formatSignerRole(signer.role),
		contract_type: asText(values.contract_type),
		contract_duration: asText(values.contract_duration),
		probation_duration: asText(values.probation_duration || values.probation_period),
		nomor_surat: asText(values.nomor_surat),
		letter_date: toDateLabel(values.letter_date),
		start_date: toDateLabel(values.start_date),
		contract_start_date: toDateLabel(values.contract_start_date),
		work_location: asText(values.work_location),
		basic_salary: toCurrency(values.basic_salary),
		salary_in_words: `${numberToBahasaWords(values.basic_salary).replace(/\s+/g, " ").trim()} rupiah`,
		warning_level: asText(values.warning_level),
		last_working_day: toDateLabel(values.last_working_day),
		termination_reason: asText(values.termination_reason, ""),
	};
}

function interpolateTemplateText(text, variables) {
	return String(text || "").replace(/\{\{\s*([\w_]+)\s*\}\}/g, (_, key) => {
		return asText(variables[key], "-");
	});
}

async function loadImageAsDataUrl(url) {
	const src = String(url || "").trim();
	if (!src) return null;
	if (src.startsWith("data:image/")) return src;

	return new Promise((resolve) => {
		const img = new Image();
		img.crossOrigin = "anonymous";
		img.onload = () => {
			try {
				const canvas = document.createElement("canvas");
				canvas.width = img.naturalWidth || img.width;
				canvas.height = img.naturalHeight || img.height;
				const ctx = canvas.getContext("2d");
				ctx.drawImage(img, 0, 0);
				resolve(canvas.toDataURL("image/png"));
			} catch {
				resolve(null);
			}
		};
		img.onerror = () => resolve(null);
		img.src = src;
	});
}

export function drawWatermark(doc, text = "", options = {}) {
	const watermark = String(text || "").trim();
	if (!watermark) return;
	const pages = doc.getNumberOfPages();
	const fontSize = Number(options.fontSize || 34);
	for (let i = 1; i <= pages; i += 1) {
		doc.setPage(i);
		doc.saveGraphicsState?.();
		doc.setTextColor(210, 214, 220);
		doc.setFont("helvetica", "bold");
		doc.setFontSize(fontSize);
		doc.text(watermark, PAGE.width / 2, PAGE.height / 2, {
			align: "center",
			angle: 330,
		});
		doc.restoreGraphicsState?.();
	}
}

export function drawLetterhead(doc, branding = {}, options = {}) {
	const companyName = asText(branding.companyName || branding.company_name, "Company");
	const appName = asText(branding.appName || branding.app_name, "HR Performance Suite");
	const title = asText(options.title, "HR Document");
	const subtitle = asText(options.subtitle, "");
	const dateLabel = asText(options.dateLabel, "");
	const logoDataUrl = asText(options.logoDataUrl, "");

	let y = PAGE.marginTop;
	if (logoDataUrl && logoDataUrl !== "-") {
		try {
			doc.addImage(logoDataUrl, "PNG", PAGE.width - PAGE.marginX - 24, y - 4, 24, 12);
		} catch {
			// Ignore unsupported or blocked images and continue with text letterhead.
		}
	}

	doc.setFont("helvetica", "bold");
	doc.setFontSize(15);
	doc.text(companyName, PAGE.marginX, y);

	doc.setFont("helvetica", "normal");
	doc.setFontSize(10);
	y += 5;
	doc.text(appName, PAGE.marginX, y);

	y += 3;
	doc.setDrawColor(180, 180, 180);
	doc.line(PAGE.marginX, y, PAGE.width - PAGE.marginX, y);

	y += 8;
	doc.setFont("helvetica", "bold");
	doc.setFontSize(13);
	doc.text(title, PAGE.marginX, y);

	doc.setFont("helvetica", "normal");
	doc.setFontSize(10);
	if (subtitle) {
		y += 5;
		doc.text(subtitle, PAGE.marginX, y);
	}
	if (dateLabel) {
		y += 5;
		doc.text(dateLabel, PAGE.marginX, y);
	}

	return y + 8;
}

export function drawBodyText(doc, paragraphs = [], options = {}) {
	let y = options.startY ?? PAGE.marginTop;
	const width = PAGE.width - PAGE.marginX * 2;

	paragraphs.forEach((paragraph) => {
		const entry = typeof paragraph === "string" ? { text: paragraph } : paragraph;
		const text = asText(entry.text, "");
		if (!text) return;

		const size = Number(entry.size || 11);
		const style = entry.bold ? "bold" : "normal";
		const lineHeight = Number(entry.lineHeight || Math.max(4.4, size * 0.37));
		const spacingAfter = Number(entry.spacingAfter || 2.5);
		const lines = doc.splitTextToSize(text, width);

		y = ensureSpace(doc, y, lines.length * lineHeight + spacingAfter);
		doc.setFont("helvetica", style);
		doc.setFontSize(size);
		doc.text(lines, PAGE.marginX, y);
		y += lines.length * lineHeight + spacingAfter;
	});

	return y;
}

export function drawPayslipTable(doc, rows = [], options = {}) {
	const startY = options.startY ?? PAGE.marginTop;
	autoTable(doc, {
		startY,
		margin: { left: PAGE.marginX, right: PAGE.marginX },
		theme: "grid",
		head: [["Component", "Amount"]],
		body: rows.map((row) => [asText(row.label), asText(row.amount)]),
		headStyles: {
			fillColor: [54, 92, 173],
			textColor: 255,
			fontStyle: "bold",
		},
		bodyStyles: {
			fontSize: 10,
			cellPadding: 2.2,
		},
		columnStyles: {
			0: { cellWidth: 100 },
			1: { halign: "right", cellWidth: 74 },
		},
	});
	return (doc.lastAutoTable?.finalY || startY) + 5;
}

export function drawSignatureBlock(doc, signer = {}, options = {}) {
	let y = options.startY ?? PAGE.marginTop;
	y = ensureSpace(doc, y, 64);
	const includeRecipient = Boolean(options.includeRecipient);
	const recipient = options.recipient || {};
	const leftX = PAGE.marginX;
	const rightX = PAGE.marginX + 95;
	const boxWidth = 76;
	const boxHeight = 30;

	function drawSignatureSlot(baseX, topY, heading, person = {}, hasDigitalImage = false) {
		doc.setFont("helvetica", "normal");
		doc.setFontSize(11);
		doc.text(heading, baseX, topY);

		const boxY = topY + 4;
		doc.setDrawColor(148, 163, 184);
		doc.roundedRect(baseX, boxY, boxWidth, boxHeight, 2.5, 2.5);

		doc.setFont("helvetica", "normal");
		doc.setFontSize(8.5);
		doc.setTextColor(100, 116, 139);
		const digitalCopy = hasDigitalImage
			? "Digital signature image on file. E-sign placement."
			: "Digital signature placeholder.";
		doc.text(doc.splitTextToSize(digitalCopy, boxWidth - 8), baseX + 4, boxY + 7);
		doc.line(baseX + 4, boxY + 17, baseX + boxWidth - 4, boxY + 17);
		doc.text("Wet signature area for printed copy", baseX + 4, boxY + 24);

		doc.setTextColor(0, 0, 0);
		doc.setFont("helvetica", "bold");
		doc.setFontSize(11);
		doc.text(asText(person.name, "Employee"), baseX, boxY + boxHeight + 8);

		doc.setFont("helvetica", "normal");
		doc.setFontSize(10);
		doc.text(formatSignerRole(person.role), baseX, boxY + boxHeight + 13);
	}

	drawSignatureSlot(
		leftX,
		y,
		"Approved by,",
		{
			name: asText(signer.name, "HR Representative"),
			role: signer.role,
		},
		Boolean(signer.signatureImageUrl),
	);
	if (includeRecipient) {
		drawSignatureSlot(
			rightX,
			y,
			options.recipientLabel || "Employee acknowledgment,",
			{
				name: asText(recipient.name, "Employee"),
				role: asText(recipient.role, "-"),
			},
			Boolean(recipient.signatureImageUrl),
		);
	}
	return y + boxHeight + 22;
}

function addPageFooter(doc, footerText = "") {
	const pages = doc.getNumberOfPages();
	for (let i = 1; i <= pages; i += 1) {
		doc.setPage(i);
		doc.setFont("helvetica", "normal");
		doc.setFontSize(9);
		if (footerText) {
			doc.text(footerText, PAGE.marginX, PAGE.height - 7);
		}
		doc.text(`Page ${i} of ${pages}`, PAGE.width - PAGE.marginX, PAGE.height - 7, {
			align: "right",
		});
	}
}

function renderTemplateBody(doc, template = {}, context = {}, startY) {
	const blocks = Array.isArray(template?.body_json) ? template.body_json : [];
	if (blocks.length === 0) return startY;
	const variables = buildTemplateVariables(context);
	const paragraphs = blocks
		.map((block) => ({
			text: interpolateTemplateText(block?.text || "", variables),
			bold: Boolean(block?.bold),
		}))
		.filter((item) => item.text.trim());
	return drawBodyText(doc, paragraphs, { startY });
}

function buildDefaultSections(type, employee, values) {
	switch (type) {
		case "offer_letter":
			return [
				`Dear ${asText(employee.name)},`,
				`We are pleased to offer you the position of ${asText(employee.position)} in the ${asText(employee.department)} department, effective ${toDateLabel(values.start_date)}.`,
				values.probation_period
					? `Your probation period will run for ${asText(values.probation_period)}.`
					: `Contract duration: ${asText(values.contract_duration)}.`,
				{ text: "Compensation Details", bold: true, spacingAfter: 1.8 },
				`Basic Salary: ${toCurrency(values.basic_salary)}`,
			];
		case "employment_contract":
			return [
				`This agreement is made between ${asText(values.branding.companyName || values.branding.company_name, "Company")} and ${asText(employee.name)} for the role of ${asText(employee.position)} under ${asText(employee.department)}.`,
				`Contract start date: ${toDateLabel(values.contract_start_date)}.`,
				values.probation_duration
					? `Probation duration: ${asText(values.probation_duration)}.`
					: `Contract duration: ${asText(values.contract_duration)}.`,
				`Work location: ${asText(values.work_location)}.`,
				`Base salary: ${toCurrency(values.basic_salary)} per month.`,
			];
		case "warning_letter":
			return [
				`To: ${asText(employee.name)} (${asText(employee.position)})`,
				`This letter is issued as ${asText(values.warning_level)} based on the following findings:`,
				asText(values.offense_details, ""),
				`This warning remains valid for ${asText(values.validity_period)} from the date of issuance.`,
			];
		case "termination_letter":
			return [
				`Dear ${asText(employee.name)},`,
				`This letter confirms the termination of your employment as ${asText(employee.position)} effective ${toDateLabel(values.last_working_day)}.`,
				{ text: "Reason", bold: true, spacingAfter: 1.8 },
				asText(values.termination_reason, ""),
			];
		default:
			return [];
	}
}

function buildStandardDocument(doc, type, employee, values, signer, recipientSigner, template, options = {}) {
	let y = drawLetterhead(doc, values.branding, {
		title: asText(template?.header_json?.title, documentTitle(type)),
		subtitle: options.subtitle,
		dateLabel: options.dateLabel,
		logoDataUrl: options.logoDataUrl,
	});

	const bodyStartY = renderTemplateBody(doc, template, { employee, values, branding: values.branding, signer }, y);
	y =
		bodyStartY === y
			? drawBodyText(doc, buildDefaultSections(type, employee, values), { startY: y })
			: bodyStartY;

	if (asText(values.job_description, "")) {
		y = drawBodyText(doc, [{ text: "Job Description", bold: true }, asText(values.job_description, "")], { startY: y + 1 });
	}
	if (asText(values.offense_impact, "")) {
		y = drawBodyText(doc, [{ text: "Outcome to Company", bold: true }, asText(values.offense_impact, "")], { startY: y + 1 });
	}
	if (asText(values.corrective_actions, "")) {
		y = drawBodyText(doc, [{ text: "Corrective Actions", bold: true }, asText(values.corrective_actions, "")], { startY: y + 1 });
	}
	if (asText(values.legal_basis, "")) {
		y = drawBodyText(doc, [{ text: "Legal Basis", bold: true }, asText(values.legal_basis, "")], { startY: y + 1 });
	}
	if (asText(values.company_policy_basis, "")) {
		y = drawBodyText(doc, [{ text: "Company Policy", bold: true }, asText(values.company_policy_basis, "")], { startY: y + 1 });
	}
	if (asText(values.outcome_summary, "")) {
		y = drawBodyText(doc, [{ text: "Outcome", bold: true }, asText(values.outcome_summary, "")], { startY: y + 1 });
	}
	if (asText(values.sanction_text, "")) {
		y = drawBodyText(doc, [{ text: "Sanction / Punishment", bold: true }, asText(values.sanction_text, "")], { startY: y + 1 });
	}
	if (asText(values.severance_details, "")) {
		y = drawBodyText(doc, [{ text: "Severance Details", bold: true }, asText(values.severance_details, "")], { startY: y + 1 });
	}

	drawSignatureBlock(doc, signer, {
		startY: y + 6,
		includeRecipient: Boolean(options.includeRecipient),
		recipient: recipientSigner,
		recipientLabel: options.recipientLabel,
	});
}

function buildPayslip(doc, employee, values, signer, template, options = {}) {
	let y = drawLetterhead(doc, values.branding, {
		title: asText(template?.header_json?.title, documentTitle("payslip")),
		subtitle: `${asText(employee.name)} (${asText(employee.id)})`,
		dateLabel: `Period: ${toMonthLabel(values.period)} | Pay Date: ${toDateLabel(values.pay_date)}`,
		logoDataUrl: options.logoDataUrl,
	});

	y = renderTemplateBody(doc, template, { employee, values, branding: values.branding, signer }, y);
	y = drawBodyText(doc, [
		`Position: ${asText(employee.position)}`,
		`Department: ${asText(employee.department)}`,
	], { startY: y });

	const basic = normalizeNumber(values.basic_salary);
	const earningsRows = Array.isArray(options.payroll?.earnings) ? options.payroll.earnings : [];
	const deductionRows = Array.isArray(options.payroll?.deductions) ? options.payroll.deductions : [];
	const totalAllowances = earningsRows.reduce((sum, row) => sum + normalizeNumber(row.amount), 0);
	const totalDeductions = deductionRows.reduce((sum, row) => sum + normalizeNumber(row.amount), 0);
	const gross = basic + totalAllowances;
	const net = gross - totalDeductions;

	const rows = [
		{ label: "Basic Salary", amount: toCurrency(basic) },
		...earningsRows.map((row) => ({ label: asText(row.name, "Allowance"), amount: toCurrency(row.amount) })),
		{ label: "Total Earnings", amount: toCurrency(gross) },
		...deductionRows.map((row) => ({ label: asText(row.name, "Deduction"), amount: `(${toCurrency(row.amount)})` })),
		{ label: "Total Deductions", amount: `(${toCurrency(totalDeductions)})` },
		{ label: "Net Pay", amount: toCurrency(net) },
	];

	y = drawPayslipTable(doc, rows, { startY: y + 2 });
	drawSignatureBlock(doc, signer, { startY: y + 4 });
}

export async function generateHrDocumentPdf({
	type,
	employee = {},
	values = {},
	branding = {},
	signer = {},
	recipientSigner = {},
	template = null,
	payroll = {},
}) {
	const normalizedType = asText(type, "");
	if (!normalizedType) {
		throw new Error("Document type is required.");
	}

	const doc = new jsPDF({ unit: "mm", format: "a4" });
	const logoDataUrl = await loadImageAsDataUrl(branding.logoUrl || branding.document_logo_url);
	const payloadValues = {
		...values,
		branding,
	};

	switch (normalizedType) {
		case "offer_letter":
			buildStandardDocument(doc, normalizedType, employee, payloadValues, signer, recipientSigner, template, {
				subtitle: `${asText(employee.name)} (${asText(employee.id)})`,
				dateLabel: `Date: ${toDateLabel(values.letter_date)}`,
				includeRecipient: true,
				recipientLabel: "Candidate acknowledgment,",
				logoDataUrl,
			});
			break;
		case "employment_contract":
			buildStandardDocument(doc, normalizedType, employee, payloadValues, signer, recipientSigner, template, {
				subtitle: `Contract No: ${asText(values.contract_number)}`,
				dateLabel: `Date: ${toDateLabel(values.letter_date)}`,
				includeRecipient: true,
				recipientLabel: "Employee acknowledgment,",
				logoDataUrl,
			});
			break;
		case "payslip":
			buildPayslip(doc, employee, payloadValues, signer, template, { payroll, logoDataUrl });
			break;
		case "warning_letter":
			buildStandardDocument(doc, normalizedType, employee, payloadValues, signer, recipientSigner, template, {
				subtitle: `Reference: ${asText(values.warning_level)}`,
				dateLabel: `Date: ${toDateLabel(values.letter_date)}`,
				logoDataUrl,
			});
			break;
		case "termination_letter":
			buildStandardDocument(doc, normalizedType, employee, payloadValues, signer, recipientSigner, template, {
				subtitle: `${asText(employee.name)} (${asText(employee.id)})`,
				dateLabel: `Date: ${toDateLabel(values.letter_date)}`,
				logoDataUrl,
			});
			break;
		default:
			throw new Error(`Unsupported document type: ${normalizedType}`);
	}

	addPageFooter(doc, asText(branding.documentFooterText, ""));
	if (normalizedType === "payslip") {
		drawWatermark(
			doc,
			asText(template?.header_json?.watermark_setting_key ? branding.defaultWatermark : branding.defaultWatermark, ""),
			{ fontSize: 34 },
		);
	}

	return {
		doc,
		filename: buildFilename(normalizedType, employee.id),
	};
}

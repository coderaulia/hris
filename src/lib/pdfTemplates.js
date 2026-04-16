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

export function drawLetterhead(doc, branding = {}, options = {}) {
	const companyName = asText(branding.companyName || branding.company_name, "Company");
	const appName = asText(branding.appName || branding.app_name, "HR Performance Suite");
	const title = asText(options.title, "HR Document");
	const subtitle = asText(options.subtitle, "");
	const dateLabel = asText(options.dateLabel, "");

	let y = PAGE.marginTop;
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
	y = ensureSpace(doc, y, 34);

	doc.setFont("helvetica", "normal");
	doc.setFontSize(11);
	doc.text("Approved by,", PAGE.marginX, y);

	y += 18;
	doc.setFont("helvetica", "bold");
	doc.text(asText(signer.name, "HR Representative"), PAGE.marginX, y);

	y += 5;
	doc.setFont("helvetica", "normal");
	doc.setFontSize(10);
	doc.text(formatSignerRole(signer.role), PAGE.marginX, y);
	return y + 4;
}

function addPageFooter(doc) {
	const pages = doc.getNumberOfPages();
	for (let i = 1; i <= pages; i += 1) {
		doc.setPage(i);
		doc.setFont("helvetica", "normal");
		doc.setFontSize(9);
		doc.text(`Page ${i} of ${pages}`, PAGE.width - PAGE.marginX, PAGE.height - 7, {
			align: "right",
		});
	}
}

function multilineText(value) {
	return asText(value, "").replace(/\r\n/g, "\n");
}

function buildOfferLetter(doc, employee, values, signer) {
	let y = drawLetterhead(doc, values.branding, {
		title: documentTitle("offer_letter"),
		subtitle: `${asText(employee.name)} (${asText(employee.id)})`,
		dateLabel: `Date: ${toDateLabel(values.letter_date)}`,
	});

	y = drawBodyText(doc, [
		`Dear ${asText(employee.name)},`,
		`We are pleased to offer you the position of ${asText(employee.position)} in the ${asText(employee.department)} department, effective ${toDateLabel(values.start_date)}.`,
		`Your probation period will run for ${asText(values.probation_period)}.`,
		{ text: "Compensation Details", bold: true, spacingAfter: 1.8 },
		`Basic Salary: ${toCurrency(values.basic_salary)}`,
		`Fixed Allowance: ${toCurrency(values.fixed_allowance)}`,
		`Total Monthly Gross: ${toCurrency(normalizeNumber(values.basic_salary) + normalizeNumber(values.fixed_allowance))}`,
	], { startY: y });

	drawSignatureBlock(doc, signer, { startY: y + 6 });
}

function buildEmploymentContract(doc, employee, values, signer) {
	let y = drawLetterhead(doc, values.branding, {
		title: documentTitle("employment_contract"),
		subtitle: `Contract No: ${asText(values.contract_number)}`,
		dateLabel: `Date: ${toDateLabel(values.letter_date)}`,
	});

	y = drawBodyText(doc, [
		`This agreement is made between ${asText(values.branding.companyName || values.branding.company_name, "Company")} and ${asText(employee.name)} for the role of ${asText(employee.position)} under ${asText(employee.department)}.`,
		`Contract start date: ${toDateLabel(values.contract_start_date)}.`,
		`Contract duration: ${asText(values.contract_duration)}.`,
		`Work location: ${asText(values.work_location)}.`,
		`Base salary: ${toCurrency(values.basic_salary)} per month.`,
	], { startY: y });

	drawSignatureBlock(doc, signer, { startY: y + 6 });
}

function buildPayslip(doc, employee, values, signer) {
	let y = drawLetterhead(doc, values.branding, {
		title: documentTitle("payslip"),
		subtitle: `${asText(employee.name)} (${asText(employee.id)})`,
		dateLabel: `Period: ${toMonthLabel(values.period)} | Pay Date: ${toDateLabel(values.pay_date)}`,
	});

	y = drawBodyText(doc, [
		`Position: ${asText(employee.position)}`,
		`Department: ${asText(employee.department)}`,
	], { startY: y, });

	const basic = normalizeNumber(values.basic_salary);
	const allowances = normalizeNumber(values.allowances);
	const deductions = normalizeNumber(values.deductions);
	const gross = basic + allowances;
	const net = gross - deductions;

	y = drawPayslipTable(doc, [
		{ label: "Basic Salary", amount: toCurrency(basic) },
		{ label: "Allowances", amount: toCurrency(allowances) },
		{ label: "Gross Earnings", amount: toCurrency(gross) },
		{ label: "Deductions", amount: `(${toCurrency(deductions)})` },
		{ label: "Net Pay", amount: toCurrency(net) },
	], { startY: y + 2 });

	drawSignatureBlock(doc, signer, { startY: y + 4 });
}

function buildWarningLetter(doc, employee, values, signer) {
	let y = drawLetterhead(doc, values.branding, {
		title: documentTitle("warning_letter"),
		subtitle: `Reference: ${asText(values.warning_level)}`,
		dateLabel: `Date: ${toDateLabel(values.letter_date)}`,
	});

	y = drawBodyText(doc, [
		`To: ${asText(employee.name)} (${asText(employee.position)})`,
		`This letter is issued as ${asText(values.warning_level)} based on the following findings:`,
		multilineText(values.offense_details),
		`This warning remains valid for ${asText(values.validity_period)} from the date of issuance.`,
	], { startY: y });

	if (asText(values.corrective_actions, "")) {
		y = drawBodyText(doc, [
			{ text: "Corrective Actions", bold: true, spacingAfter: 1.8 },
			multilineText(values.corrective_actions),
		], { startY: y + 1 });
	}

	drawSignatureBlock(doc, signer, { startY: y + 4 });
}

function buildTerminationLetter(doc, employee, values, signer) {
	let y = drawLetterhead(doc, values.branding, {
		title: documentTitle("termination_letter"),
		subtitle: `${asText(employee.name)} (${asText(employee.id)})`,
		dateLabel: `Date: ${toDateLabel(values.letter_date)}`,
	});

	y = drawBodyText(doc, [
		`Dear ${asText(employee.name)},`,
		`This letter confirms the termination of your employment as ${asText(employee.position)} effective ${toDateLabel(values.last_working_day)}.`,
		{ text: "Reason", bold: true, spacingAfter: 1.8 },
		multilineText(values.termination_reason),
	], { startY: y });

	if (asText(values.severance_details, "")) {
		y = drawBodyText(doc, [
			{ text: "Severance Details", bold: true, spacingAfter: 1.8 },
			multilineText(values.severance_details),
		], { startY: y + 1 });
	}

	drawSignatureBlock(doc, signer, { startY: y + 4 });
}

export function generateHrDocumentPdf({
	type,
	employee = {},
	values = {},
	branding = {},
	signer = {},
}) {
	const normalizedType = asText(type, "");
	if (!normalizedType) {
		throw new Error("Document type is required.");
	}

	const doc = new jsPDF({ unit: "mm", format: "a4" });
	const payloadValues = {
		...values,
		branding,
	};

	switch (normalizedType) {
		case "offer_letter":
			buildOfferLetter(doc, employee, payloadValues, signer);
			break;
		case "employment_contract":
			buildEmploymentContract(doc, employee, payloadValues, signer);
			break;
		case "payslip":
			buildPayslip(doc, employee, payloadValues, signer);
			break;
		case "warning_letter":
			buildWarningLetter(doc, employee, payloadValues, signer);
			break;
		case "termination_letter":
			buildTerminationLetter(doc, employee, payloadValues, signer);
			break;
		default:
			throw new Error(`Unsupported document type: ${normalizedType}`);
	}

	addPageFooter(doc);

	return {
		doc,
		filename: buildFilename(normalizedType, employee.id),
	};
}

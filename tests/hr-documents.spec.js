import { test, expect } from "@playwright/test";
import { credentials, currentPeriod, loginAs, openSidebarLink } from "./support/app.js";
import {
	encodeFilterValue,
	fetchEmployeeByEmail,
	restRequest,
	signInAs,
} from "./support/supabase-api.js";

function todayIso() {
	return new Date().toISOString().slice(0, 10);
}

function slugify(value) {
	return String(value || "")
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

async function retry(action, attempts = 3, waitMs = 700) {
	let lastError = null;
	for (let attempt = 1; attempt <= attempts; attempt += 1) {
		try {
			return await action();
		} catch (error) {
			lastError = error;
			if (attempt < attempts) {
				await new Promise((resolve) => setTimeout(resolve, waitMs));
			}
		}
	}
	throw lastError;
}

async function openDocumentsWorkspace(page) {
	await openSidebarLink(page, "HR Tools", "HR Documents");
	await page.evaluate(async () => {
		if (!document.getElementById("tab-documents")?.classList.contains("active")) {
			await window.__app.switchTab("tab-documents");
		}
	});
	await expect(page.locator("#tab-documents")).toBeVisible();
}

async function pickFirstEmployee(page, selector = "#doc-employee-select") {
	return page.locator(selector).evaluate((select) => {
		const option = [...select.options].find((item) => item.value);
		if (!option) return { value: "", name: "" };
		select.value = option.value;
		select.dispatchEvent(new Event("change", { bubbles: true }));
		return {
			value: option.value,
			name: String(option.textContent || "").split(" - ")[0].trim(),
		};
	});
}

async function pickAlternativeSigner(page) {
	return page.locator("#doc-signer-select").evaluate((select) => {
		const options = [...select.options].filter((item) => item.value);
		const option = options[1] || options[0];
		if (!option) return { value: "", name: "" };
		select.value = option.value;
		select.dispatchEvent(new Event("change", { bubbles: true }));
		return {
			value: option.value,
			name: String(option.textContent || "").split(" - ")[0].trim(),
		};
	});
}

async function waitForDocumentGenerateLog({
	token,
	actorEmployeeId,
	documentType,
	entityId,
	notBeforeMs,
	timeoutMs = 15000,
}) {
	const startedAt = Date.now();
	while (Date.now() - startedAt < timeoutMs) {
		const result = await restRequest(token, {
			path: `admin_activity_log?select=action,entity_type,entity_id,actor_employee_id,details,created_at&action=eq.document.generate&actor_employee_id=eq.${encodeFilterValue(actorEmployeeId)}&order=created_at.desc&limit=5`,
			prefer: "",
		});

		if (result.ok && Array.isArray(result.data) && result.data.length > 0) {
			const match = result.data.find((row) => {
				const rowType = String(row?.details?.document_type || "");
				const rowEntityId = String(row?.entity_id || "");
				const rowCreatedAtMs = Date.parse(String(row?.created_at || ""));
				return (
					rowType === documentType &&
					rowEntityId === String(entityId) &&
					Number.isFinite(rowCreatedAtMs) &&
					rowCreatedAtMs >= Number(notBeforeMs || 0)
				);
			});
			if (match) return match;
		}

		await new Promise((resolve) => setTimeout(resolve, 600));
	}

	throw new Error(
		`Timed out waiting for activity log entry document.generate (${documentType}, entity ${entityId}).`,
	);
}

async function fetchEmployeeDocumentStateOrNull(token, employeeId) {
	const result = await restRequest(token, {
		path: `employees?select=employee_id,name,active_sp_level,active_sp_until,active_sp_reason&employee_id=eq.${encodeFilterValue(employeeId)}`,
		prefer: "",
	});

	if (!result.ok) return null;
	if (!Array.isArray(result.data) || result.data.length === 0) return null;
	return result.data[0];
}

test("hr can generate payslip with payroll breakdown, watermark preview, and activity log", async ({
	page,
}) => {
	await loginAs(page, "hr");
	await openDocumentsWorkspace(page);

	await expect(page.locator("#doc-preview")).toContainText(
		"Select document type and complete the subject details to start preview.",
	);

	await page.locator("#doc-type-select").selectOption("payslip");

	const selectedEmployee = await pickFirstEmployee(page);
	expect(selectedEmployee.value).not.toBe("");

	await page.locator('[data-doc-field="period"]').fill(currentPeriod());
	await page.locator('[data-doc-field="pay_date"]').fill(todayIso());
	await page.locator('[data-doc-field="basic_salary"]').fill("12000000");
	await page.locator('[data-doc-payroll-name="earnings:0"]').fill("Transport Allowance");
	await page.locator('[data-doc-payroll-amount="earnings:0"]').fill("2500000");
	await page.locator('[data-doc-payroll-name="deductions:0"]').fill("PPh21");
	await page.locator('[data-doc-payroll-amount="deductions:0"]').fill("500000");

	await expect(page.locator("#doc-validation-feedback")).toContainText("Ready to export PDF");
	await expect(page.locator("#doc-preview")).toContainText("Payslip");
	await expect(page.locator("#doc-preview")).toContainText(selectedEmployee.name);
	await expect(page.locator("#doc-preview")).toContainText("Confidential Document");
	await expect(page.locator("#doc-preview")).toContainText("Transport Allowance");
	await expect(page.locator("#doc-preview")).toContainText("Net Pay");

	const superadminToken = await retry(() => signInAs("superadmin"));
	const hrProfile = await retry(() => fetchEmployeeByEmail(credentials.hr.email));
	const actionStartedAtMs = Date.now();

	await page.locator("#doc-download-btn").click();
	await expect(page.locator(".swal2-toast")).toContainText(/PDF exported/i);

	const logRow = await waitForDocumentGenerateLog({
		token: superadminToken,
		actorEmployeeId: hrProfile.employee_id,
		documentType: "payslip",
		entityId: selectedEmployee.value,
		notBeforeMs: actionStartedAtMs,
	});

	expect(logRow.action).toBe("document.generate");
	expect(logRow.entity_type).toBe("employee_document");
	expect(String(logRow.entity_id)).toBe(String(selectedEmployee.value));
	expect(String(logRow.details?.filename || "")).toMatch(/^payslip_.*\.pdf$/i);
	expect(String(logRow.details?.document_type || "")).toBe("payslip");
});

test("offer letter supports manual candidate entry, signer selection, and manual-subject logging", async ({
	page,
}) => {
	await loginAs(page, "hr");
	await openDocumentsWorkspace(page);

	const candidateName = `Candidate ${Date.now()}`;
	const expectedEntityId = `manual-${slugify(candidateName)}`;

	await page.locator("#doc-type-select").selectOption("offer_letter");
	await expect(page.locator("#doc-subject-mode")).toHaveValue("manual");

	await page.locator("#doc-manual-name").fill(candidateName);
	await page.locator("#doc-manual-position").fill("QA Engineer");
	await page.locator("#doc-manual-department").fill("Engineering");
	await page.locator('[data-doc-field="nomor_surat"]').fill("001/HR/IV/2026");
	await page.locator('[data-doc-field="start_date"]').fill(todayIso());
	await page.locator('[data-doc-field="contract_type"]').selectOption("PKWTT");
	await page.locator('[data-doc-field="basic_salary"]').fill("9000000");
	await page.locator('[data-doc-field="probation_duration"]').fill("3 months");
	await page.locator('[data-doc-field="benefits"]').fill("Laptop\nPrivate insurance");

	const signer = await pickAlternativeSigner(page);
	expect(signer.value).not.toBe("");
	await page.locator("#doc-signer-role-override").fill("Talent Acquisition Lead");

	await expect(page.locator("#doc-preview")).toContainText(candidateName);
	await expect(page.locator("#doc-preview")).toContainText("Candidate acknowledgment");
	await expect(page.locator("#doc-preview")).toContainText("Talent Acquisition Lead");
	await expect(page.locator("#doc-download-btn")).toBeEnabled();

	const superadminToken = await retry(() => signInAs("superadmin"));
	const hrProfile = await retry(() => fetchEmployeeByEmail(credentials.hr.email));
	const actionStartedAtMs = Date.now();

	await page.locator("#doc-download-btn").click();
	await expect(page.locator(".swal2-toast")).toContainText(/PDF exported/i);

	const logRow = await waitForDocumentGenerateLog({
		token: superadminToken,
		actorEmployeeId: hrProfile.employee_id,
		documentType: "offer_letter",
		entityId: expectedEntityId,
		notBeforeMs: actionStartedAtMs,
	});

	expect(String(logRow.details?.subject_mode || "")).toBe("manual");
	expect(String(logRow.details?.employee_name || "")).toBe(candidateName);
});

test("employment contract switches fields between PKWT and PKWTT", async ({ page }) => {
	await loginAs(page, "hr");
	await openDocumentsWorkspace(page);

	await page.locator("#doc-type-select").selectOption("employment_contract");
	const selectedEmployee = await pickFirstEmployee(page);
	expect(selectedEmployee.value).not.toBe("");

	await page.locator('[data-doc-field="contract_type"]').selectOption("PKWTT");
	await expect(page.locator('[data-doc-field="probation_duration"]')).toBeVisible();
	await expect(page.locator('[data-doc-field="contract_duration"]')).toHaveCount(0);

	await page.locator('[data-doc-field="probation_duration"]').fill("3 months");
	await page.locator('[data-doc-field="contract_type"]').selectOption("PKWT");
	await expect(page.locator('[data-doc-field="contract_duration"]')).toBeVisible();
	await expect(page.locator('[data-doc-field="probation_duration"]')).toHaveCount(0);
});

test("warning letter updates active SP badge and logs warning metadata", async ({ page }) => {
	await loginAs(page, "hr");
	await openDocumentsWorkspace(page);

	await page.locator("#doc-type-select").selectOption("warning_letter");
	const selectedEmployee = await pickFirstEmployee(page);
	expect(selectedEmployee.value).not.toBe("");

	await page.locator('[data-doc-field="warning_level"]').selectOption("SP1");
	await page.locator('[data-doc-field="offense_details"]').fill("Repeated attendance violation.");
	await page.locator('[data-doc-field="offense_impact"]').fill("Operational disruption for the team.");
	await page.locator('[data-doc-field="validity_period"]').fill("6 months");
	await page.locator('[data-doc-field="corrective_actions"]').fill("Employee must improve attendance discipline.");

	const superadminToken = await retry(() => signInAs("superadmin"));
	const hrProfile = await retry(() => fetchEmployeeByEmail(credentials.hr.email));
	const actionStartedAtMs = Date.now();

	await page.locator("#doc-download-btn").click();
	await expect(page.locator(".swal2-toast")).toContainText(/PDF exported/i);

	const logRow = await waitForDocumentGenerateLog({
		token: superadminToken,
		actorEmployeeId: hrProfile.employee_id,
		documentType: "warning_letter",
		entityId: selectedEmployee.value,
		notBeforeMs: actionStartedAtMs,
	});

	expect(String(logRow.details?.active_sp_level || "")).toBe("SP1");
	await page.evaluate(async () => {
		await window.__app.switchTab("tab-employees");
	});
	await expect(
		page.locator("#employee-list-body tr").filter({ hasText: selectedEmployee.name }).first(),
	).toContainText("SP1");

	const employeeState = await fetchEmployeeDocumentStateOrNull(superadminToken, selectedEmployee.value);
	if (employeeState) {
		expect(String(employeeState.active_sp_level || "")).toBe("SP1");
		expect(String(employeeState.active_sp_reason || "")).toContain("Repeated attendance violation");
	}
});

test("termination export logs legal basis and sanction metadata", async ({ page }) => {
	await loginAs(page, "hr");
	await openDocumentsWorkspace(page);

	await page.locator("#doc-type-select").selectOption("termination_letter");
	const selectedEmployee = await pickFirstEmployee(page);
	expect(selectedEmployee.value).not.toBe("");

	await page.locator('[data-doc-field="last_working_day"]').fill(todayIso());
	await page.locator('[data-doc-field="termination_reason"]').fill("Serious misconduct investigation result.");
	await page.locator('[data-doc-field="legal_basis"]').fill("UU Ketenagakerjaan");
	await page.locator('[data-doc-field="company_policy_basis"]').fill("Peraturan Perusahaan Pasal 10");
	await page.locator('[data-doc-field="outcome_summary"]').fill("Trust relationship with the company can no longer continue.");
	await page.locator('[data-doc-field="sanction_text"]').fill("Employment is terminated effective immediately.");

	const superadminToken = await retry(() => signInAs("superadmin"));
	const hrProfile = await retry(() => fetchEmployeeByEmail(credentials.hr.email));
	const actionStartedAtMs = Date.now();

	await page.locator("#doc-download-btn").click();
	await expect(page.locator(".swal2-toast")).toContainText(/PDF exported/i);

	const logRow = await waitForDocumentGenerateLog({
		token: superadminToken,
		actorEmployeeId: hrProfile.employee_id,
		documentType: "termination_letter",
		entityId: selectedEmployee.value,
		notBeforeMs: actionStartedAtMs,
	});

	expect(String(logRow.details?.termination_legal_basis || "")).toBe("UU Ketenagakerjaan");
	expect(String(logRow.details?.termination_company_policy || "")).toBe(
		"Peraturan Perusahaan Pasal 10",
	);
	expect(String(logRow.details?.termination_sanction || "")).toContain(
		"Employment is terminated",
	);
});

test("non-HR role cannot operate documents workspace even with direct tab switch", async ({
	page,
}) => {
	await loginAs(page, "manager");

	await expect(
		page.locator(".sidebar-group").filter({ hasText: "HR Tools" }),
	).toHaveCount(0);

	await page.evaluate(async () => {
		await window.__app.switchTab("tab-documents");
	});

	await expect(page.locator("#doc-access-denied")).toBeVisible();
	await expect(page.locator("#doc-download-btn")).toBeDisabled();
	await expect(page.locator("#doc-preview")).toContainText(
		"You do not have access to this workspace.",
	);
});

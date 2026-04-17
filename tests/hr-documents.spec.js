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
			path: `admin_activity_log?select=action,entity_type,entity_id,actor_employee_id,details,created_at&action=eq.document.generate&actor_employee_id=eq.${encodeFilterValue(actorEmployeeId)}&order=created_at.desc&limit=1`,
			prefer: "",
		});

		if (result.ok && Array.isArray(result.data) && result.data.length > 0) {
			const row = result.data[0];
			const rowType = String(row?.details?.document_type || "");
			const rowEntityId = String(row?.entity_id || "");
			const rowCreatedAtMs = Date.parse(String(row?.created_at || ""));
			if (
				rowType === documentType &&
				rowEntityId === String(entityId) &&
				Number.isFinite(rowCreatedAtMs) &&
				rowCreatedAtMs >= Number(notBeforeMs || 0)
			) {
				return row;
			}
		}

		await new Promise((resolve) => setTimeout(resolve, 600));
	}

	throw new Error(
		`Timed out waiting for activity log entry document.generate (${documentType}, entity ${entityId}).`,
	);
}

test("hr documents workspace supports preview + export + activity logging", async ({
	page,
}) => {
	await loginAs(page, "hr");
	await openSidebarLink(page, "HR Tools", "HR Documents");
	await page.evaluate(async () => {
		if (!document.getElementById("tab-documents")?.classList.contains("active")) {
			await window.__app.switchTab("tab-documents");
		}
	});

	await expect(page.locator("#tab-documents")).toBeVisible();
	await expect(page.locator("#doc-preview")).toContainText(
		"Select document type and complete the subject details to start preview.",
	);

	await page.locator("#doc-type-select").selectOption("payslip");

	const selectedEmployee = await page.locator("#doc-employee-select").evaluate((select) => {
		const option = [...select.options].find((item) => item.value);
		if (!option) return { value: "", name: "" };
		select.value = option.value;
		select.dispatchEvent(new Event("change", { bubbles: true }));
		return {
			value: option.value,
			name: String(option.textContent || "").split(" - ")[0].trim(),
		};
	});

	expect(selectedEmployee.value).not.toBe("");

	await page.locator('[data-doc-field="period"]').fill(currentPeriod());
	await page.locator('[data-doc-field="pay_date"]').fill(todayIso());
	await page.locator('[data-doc-field="basic_salary"]').fill("12000000");
	await page.locator('[data-doc-payroll-name="earnings:0"]').fill("Transport Allowance");
	await page.locator('[data-doc-payroll-amount="earnings:0"]').fill("2500000");
	await page.locator('[data-doc-payroll-name="deductions:0"]').fill("PPh21");
	await page.locator('[data-doc-payroll-amount="deductions:0"]').fill("500000");

	await expect(page.locator("#doc-validation-feedback")).toContainText(
		"Ready to export PDF",
	);
	await expect(page.locator("#doc-preview")).toContainText("Payslip");
	await expect(page.locator("#doc-preview")).toContainText(selectedEmployee.name);
	await expect(page.locator("#doc-preview")).toContainText("Net Pay");
	await expect(page.locator("#doc-download-btn")).toBeEnabled();

	const superadminToken = await retry(() => signInAs("superadmin"));
	const hrProfile = await retry(() => fetchEmployeeByEmail(credentials.hr.email));
	const actionStartedAtMs = Date.now();

	await page.locator("#doc-download-btn").click();
	await expect(page.locator(".swal2-toast")).toContainText(/PDF exported/i);

	const expectedEntityId = String(selectedEmployee.value);

	const logRow = await waitForDocumentGenerateLog({
		token: superadminToken,
		actorEmployeeId: hrProfile.employee_id,
		documentType: "payslip",
		entityId: expectedEntityId,
		notBeforeMs: actionStartedAtMs,
	});

	expect(logRow.action).toBe("document.generate");
	expect(logRow.entity_type).toBe("employee_document");
	expect(String(logRow.entity_id)).toBe(expectedEntityId);
	expect(String(logRow.details?.filename || "")).toMatch(/^payslip_.*\.pdf$/i);
	expect(String(logRow.details?.document_type || "")).toBe("payslip");
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

import { test, expect } from "@playwright/test";
import {
	loginAs,
	openSidebarLink,
	expectSuccessToast,
	uniqueLabel,
	currentPeriod,
} from "./support/app.js";
import {
	signInAs,
	restRequest,
	encodeFilterValue,
} from "./support/supabase-api.js";

test("manager KPI definition moves from submitted to approved through governance", async ({
	browser,
}) => {
	const period = currentPeriod();
	const kpiName = uniqueLabel("pw-regression-kpi");

	const superadminContext = await browser.newContext();
	const superadminPage = await superadminContext.newPage();
	await loginAs(superadminPage, "superadmin");
	await openSidebarLink(superadminPage, "Assessment & KPI", "KPI Input");

	const approvalToggle = superadminPage.locator(
		"#kpi-approval-required-toggle",
	);
	if (!(await approvalToggle.isChecked())) {
		// Wait for element to be clickable
		await approvalToggle.waitFor({ state: "visible", timeout: 10000 });
		await approvalToggle.check();
		await superadminPage
			.getByRole("button", { name: /Save Governance Rule/i })
			.click();
		await expectSuccessToast(superadminPage, /KPI governance rule saved/i);
	}

	const managerContext = await browser.newContext();
	const managerPage = await managerContext.newPage();
	await loginAs(managerPage, "manager");
	await openSidebarLink(managerPage, "Assessment & KPI", "KPI Input");

	await managerPage.locator("#kpi-def-name").fill(kpiName);
	await managerPage
		.locator("#kpi-def-desc")
		.fill("Playwright regression KPI approval flow");
	await managerPage
		.locator("#kpi-def-category")
		.selectOption({ label: "Frontend Engineer" });
	await managerPage.locator("#kpi-def-effective-period").fill(period);
	await managerPage.locator("#kpi-def-unit").selectOption("Count");
	await managerPage.locator("#kpi-def-target").fill("12");
	await managerPage
		.locator("#kpi-def-request-note")
		.fill("Regression coverage for manager approval queue.");
	await managerPage.getByRole("button", { name: /^Save$/i }).click();

	await expectSuccessToast(managerPage, /submitted for HR approval/i);
	await expect(managerPage.locator("#kpi-pending-approvals")).toContainText(
		kpiName,
	);

	const managerToken = await signInAs("manager");
	const pendingVersion = await restRequest(managerToken, {
		path: `kpi_definition_versions?select=id,name,status,effective_period,kpi_definition_id&name=eq.${encodeFilterValue(kpiName)}&effective_period=eq.${encodeFilterValue(period)}&order=version_no.desc&limit=1`,
		prefer: "",
	});

	expect(pendingVersion.ok).toBe(true);
	expect(pendingVersion.data[0].status).toBe("pending");

	await superadminPage.reload();
	await expect(superadminPage.locator("#main-app")).toBeVisible();
	await openSidebarLink(superadminPage, "Assessment & KPI", "KPI Input");

	const pendingCard = superadminPage
		.locator("#kpi-pending-approvals .border.rounded")
		.filter({ hasText: kpiName })
		.first();
	await expect(pendingCard).toBeVisible();
	await pendingCard.locator(".btn-outline-success").click();
	await expectSuccessToast(superadminPage, /approved/i);

	const superadminToken = await signInAs("superadmin");
	const approvedDefinition = await restRequest(superadminToken, {
		path: `kpi_definitions?select=id,name,approval_status,effective_period&name=eq.${encodeFilterValue(kpiName)}&limit=1`,
		prefer: "",
	});

	expect(approvedDefinition.ok).toBe(true);
	expect(approvedDefinition.data[0].approval_status).toBe("approved");

	await managerContext.close();
	await superadminContext.close();
});

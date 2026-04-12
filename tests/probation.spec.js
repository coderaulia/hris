import { test, expect } from "@playwright/test";
import { loginAs, openSidebarLink, expectSuccessToast } from "./support/app.js";

test("probation and PIP flow covers create, extend, and close states", async ({
	page,
}) => {
	await loginAs(page, "manager");
	await openSidebarLink(page, "Records", "Probation & PIP");

	await page.locator("#probation-period-filter").fill("2026-03");

	await page
		.getByRole("button", { name: /Generate Probation Drafts/i })
		.click();
	await expectSuccessToast(page, /Probation draft generation complete/i);

	const probationRows = page.locator("#probation-reviews-body tr");
	await expect(probationRows.first()).toBeVisible();
	await probationRows.first().locator(".btn-outline-primary").click();

	// Wait for probation review modal to appear
	await page.waitForSelector(".swal2-popup", {
		state: "visible",
		timeout: 10000,
	});
	await expect(page.locator(".swal2-popup")).toContainText(
		"Probation Review Form",
	);
	await page.locator("#pr-manage-1").fill("18");
	await page.locator("#pr-qual-1").fill("Regression review note for month 1.");
	await page.locator("#pr-decision").selectOption("extend");
	await page
		.locator("#pr-summary")
		.fill(
			"Probation extended for another review cycle during regression test.",
		);
	await page.locator(".swal2-confirm").click();

	await expectSuccessToast(page, /Probation review updated/i);
	await expect(page.locator("#probation-reviews-body")).toContainText(
		/extend/i,
	);

	await page.getByRole("button", { name: /Generate PIP/i }).click();
	await expectSuccessToast(page, /PIP generation complete/i);

	const pipRows = page.locator("#pip-plans-body tr");
	await expect(pipRows.first()).toBeVisible();
	await pipRows.first().locator(".btn-outline-primary").click();

	// Wait for PIP status modal to appear
	await page.waitForSelector(".swal2-popup", {
		state: "visible",
		timeout: 10000,
	});
	await expect(page.locator(".swal2-popup")).toContainText(
		"Update PIP Status",
	);
	await page.locator(".swal2-popup select").selectOption("completed");
	await page.locator(".swal2-confirm").click();

	// Wait for PIP summary modal to appear
	await page.waitForSelector(".swal2-popup", {
		state: "visible",
		timeout: 10000,
	});
	await expect(page.locator(".swal2-popup")).toContainText(
		"PIP Summary / Update Note",
	);
	await page
		.locator(".swal2-popup textarea")
		.fill("Closed by Playwright regression coverage.");
	await page.locator(".swal2-confirm").click();

	await expectSuccessToast(page, /PIP plan updated/i);
	await expect(page.locator("#pip-plans-body")).toContainText(/completed/i);
});

import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function localDateParts(date = new Date(), timeZone = "UTC") {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value || `${date.getFullYear()}`;
  const month = parts.find((part) => part.type === "month")?.value || pad2(date.getMonth() + 1);
  const day = parts.find((part) => part.type === "day")?.value || pad2(date.getDate());
  const monthKey = `${year}-${month}`;
  const today = `${monthKey}-${day}`;
  const monthLabel = new Intl.DateTimeFormat("en-US", {
    month: "long",
    timeZone,
    year: "numeric",
  }).format(date);
  return { monthKey, monthLabel, today };
}

function shiftMonthKey(monthKey: string, offset: number) {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}`;
}

function threeDayRangeWithoutSeededExchange(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  for (let startDay = 1; startDay <= daysInMonth - 2; startDay += 1) {
    const dates = [startDay, startDay + 1, startDay + 2].map(
      (day) => `${monthKey}-${pad2(day)}`
    );
    const avoidsSeededFridayAndSundayExchanges = dates.every((date) => {
      const dayOfWeek = new Date(`${date}T12:00:00.000Z`).getUTCDay();
      return dayOfWeek !== 0 && dayOfWeek !== 5;
    });
    if (avoidsSeededFridayAndSundayExchanges) return dates;
  }
  throw new Error(`Could not find a three-day exchange-free range in ${monthKey}.`);
}

test("records login and report workflow", async ({ page }) => {
  test.setTimeout(60_000);
  const currentCalendar = localDateParts();
  const calendarDay = (day: number) => `${currentCalendar.monthKey}-${pad2(day)}`;

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Your custody case, organized." })).toBeVisible();
  const openRecordsWorkspace = page.getByRole("link", { name: "Open records workspace" });
  await expect(openRecordsWorkspace).toHaveAttribute("href", "/records");
  await Promise.all([
    page.waitForURL(/\/records$/),
    openRecordsWorkspace.click(),
  ]);
  const loginPassword = page.getByLabel("Password", { exact: true });
  await expect(loginPassword).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(loginPassword).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Hide password" }).click();
  await expect(loginPassword).toHaveAttribute("type", "password");
  const enterWorkspace = page.getByRole("button", { name: "Enter records workspace" });
  await expect(enterWorkspace).toBeEnabled();
  await enterWorkspace.click();

  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  await expect(
    page
      .getByText("This tool helps organize records and does not provide legal advice.")
      .filter({ visible: true })
  ).toBeVisible();
  await expect(page.getByText("Late exchanges").first()).toBeVisible();
  await page.getByLabel("From date").fill("2026-01-01");
  await page.getByLabel("To date").fill("2026-01-31");

  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Calendar", exact: true })).toBeVisible();
  await expect(page.getByText(`Monthly custody calendar: ${currentCalendar.monthLabel}`)).toBeVisible();
  await expect(page.getByText("Case timezone: UTC")).toBeVisible();
  await expect(page.getByLabel("Calendar month")).toHaveValue(currentCalendar.monthKey);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByLabel("Calendar month")).toHaveValue(shiftMonthKey(currentCalendar.monthKey, 1));
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await expect(page.getByLabel("Calendar month")).toHaveValue(currentCalendar.monthKey);
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(page.getByLabel("Calendar month")).toHaveValue(currentCalendar.monthKey);
  await expect(page.getByRole("button", { name: `Edit calendar day ${currentCalendar.today}` })).toBeVisible();
  await expect(page.getByText("Add or edit date range")).toBeVisible();
  await expect(page.getByRole("button", { name: "Export calendar PDF" })).toBeVisible();
  await page.getByLabel("Child will be with").selectOption("Alternate caregiver");
  const roseRangeColor = page.getByRole("button", {
    name: "Date range calendar color: Rose",
  });
  await roseRangeColor.click();
  await expect(roseRangeColor).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Assigned automatically for Alternate caregiver")).toHaveCount(0);
  await expect(page.getByLabel("Exchange time")).toHaveCount(0);
  await page.getByLabel("Exchange day").selectOption("start");
  await page.getByLabel("Exchange time").fill("17:00");
  await page.getByLabel("Exchange direction").selectOption("other_parent_to_me");
  await page.getByRole("button", { name: "Save date range" }).click();
  await expect(page.getByRole("status")).toContainText("Custody schedule saved for 1 day");
  await expect(page.getByText("Alternate caregiver days", { exact: true })).toBeVisible();
  await expect(page.getByText("Custody days by caregiver label", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Calendar records by source", { exact: true })).toHaveCount(0);
  const paintedDay = page.getByRole("button", { name: `Edit calendar day ${currentCalendar.today}` });
  await expect(paintedDay).toBeVisible();
  const paintedCaregiverLabel = paintedDay.getByText("Alternate caregiver", { exact: true });
  await expect(paintedCaregiverLabel).toBeVisible();
  await expect(paintedCaregiverLabel).toHaveCSS("background-color", "rgb(190, 18, 60)");
  const fivePmMarker = paintedDay.locator('[data-exchange-time-marker="17:00"]');
  await expect(fivePmMarker).toHaveCount(1);
  const fivePmPosition = await fivePmMarker.evaluate((element) =>
    Number.parseFloat((element as HTMLElement).style.left)
  );
  expect(fivePmPosition).toBeCloseTo(70.8333, 4);
  await page.getByRole("button", { name: "Clear selected day" }).click();
  await expect(page.getByText("Custody day color cleared.")).toBeVisible();
  await expect(paintedDay.getByText("Alternate caregiver", { exact: true })).toHaveCount(0);

  const [rangeStartDate, rangeMiddleDate, rangeEndDate] =
    threeDayRangeWithoutSeededExchange(currentCalendar.monthKey);
  await page.getByLabel("Start date", { exact: true }).fill(rangeStartDate);
  await page.getByLabel("End date", { exact: true }).fill(rangeEndDate);
  await page.getByLabel("Child will be with").selectOption("Alternate caregiver");
  await page.getByLabel("Exchange day").selectOption("end");
  await page.getByLabel("Exchange time").fill("18:00");
  await page.getByLabel("Exchange direction").selectOption("me_to_other_parent");
  await page.getByRole("button", { name: "Save date range" }).click();
  await expect(page.getByRole("status")).toContainText("Custody schedule saved for 3 days");
  const rangeStartDay = page.getByRole("button", { name: `Edit calendar day ${rangeStartDate}` });
  const rangeMiddleDay = page.getByRole("button", { name: `Edit calendar day ${rangeMiddleDate}` });
  const rangeEndDay = page.getByRole("button", { name: `Edit calendar day ${rangeEndDate}` });
  await expect(rangeStartDay.getByText("Alternate caregiver", { exact: true })).toBeVisible();
  await expect(rangeMiddleDay.getByText("Alternate caregiver", { exact: true })).toBeVisible();
  await expect(rangeEndDay.getByText("Alternate caregiver", { exact: true })).toBeVisible();
  await expect(rangeStartDay.locator('[data-exchange-time-marker="18:00"]')).toHaveCount(0);
  await expect(rangeMiddleDay.locator('[data-exchange-time-marker="18:00"]')).toHaveCount(0);
  await expect(rangeEndDay.locator('[data-exchange-time-marker="18:00"]')).toHaveCount(1);
  await rangeEndDay.click();
  await expect(page.getByLabel("Child will be with")).toHaveValue("Alternate caregiver");
  await expect(page.getByLabel("Exchange day")).toHaveValue("start");
  await expect(page.getByLabel("Exchange time")).toHaveValue("18:00");

  await page.getByTestId("calendar-color-tools").locator("summary").click();
  await page.getByLabel("Caregiver for color tools").selectOption("Alternate caregiver");
  const bluePaintColor = page.getByRole("button", {
    name: "Paint calendar color: Blue",
  });
  await bluePaintColor.click();
  await expect(bluePaintColor).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Automatic color", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Multi-day paint: Off" }).click();
  await expect(page.getByRole("button", { name: "Multi-day paint: On" })).toHaveAttribute("aria-pressed", "true");
  const dragStartDay = page.getByRole("button", { name: `Edit calendar day ${calendarDay(9)}` });
  const dragMiddleDay = page.getByRole("button", { name: `Edit calendar day ${calendarDay(10)}` });
  const dragEndDay = page.getByRole("button", { name: `Edit calendar day ${calendarDay(11)}` });
  await dragStartDay.scrollIntoViewIfNeeded();
  const startBox = await dragStartDay.boundingBox();
  const middleBox = await dragMiddleDay.boundingBox();
  const endBox = await dragEndDay.boundingBox();
  if (!startBox || !middleBox || !endBox) throw new Error("Calendar drag test days are not visible.");
  await page.mouse.move(startBox.x + startBox.width / 2, startBox.y + startBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(middleBox.x + middleBox.width / 2, middleBox.y + middleBox.height / 2, { steps: 4 });
  await page.mouse.move(endBox.x + endBox.width / 2, endBox.y + endBox.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByText("3 custody days colored.")).toBeVisible();
  await expect(dragStartDay.getByText("Alternate caregiver", { exact: true })).toBeVisible();
  await expect(dragMiddleDay.getByText("Alternate caregiver", { exact: true })).toBeVisible();
  await expect(dragEndDay.getByText("Alternate caregiver", { exact: true })).toBeVisible();
  await expect(dragStartDay.getByText("Alternate caregiver", { exact: true })).toHaveCSS(
    "background-color",
    "rgb(37, 99, 235)"
  );
  await page.reload();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await expect(page.getByLabel("Calendar month")).toHaveValue(currentCalendar.monthKey);
  await expect(page.getByRole("button", { name: `Edit calendar day ${calendarDay(9)}` }).getByText("Alternate caregiver", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: `Edit calendar day ${calendarDay(10)}` }).getByText("Alternate caregiver", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: `Edit calendar day ${calendarDay(11)}` }).getByText("Alternate caregiver", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Import", exact: true })).toBeVisible();
  await expect(page.getByText("Assisted review queue")).toHaveCount(0);
  await expect(page.getByText(/Vacation schedule:/)).toHaveCount(0);
  const scheduleSetup = page.locator("details").filter({ hasText: "Optional calendar schedule setup" });
  await expect(scheduleSetup).not.toHaveAttribute("open", "");
  await expect(scheduleSetup).not.toContainText("Open only when needed");
  await expect(scheduleSetup.getByTestId("calendar-schedule-setup-chevron")).toBeVisible();

  const fileImportForm = page.getByTestId("file-upload-form");
  await fileImportForm.getByLabel("File category").selectOption("message_archive");
  await fileImportForm.locator("input[name=files]").setInputFiles({
    name: "message-archive.html",
    mimeType: "text/html",
    buffer: Buffer.from("<html><body>Synthetic reviewed message archive</body></html>"),
  });
  await fileImportForm.getByRole("button", { name: "Save files to Files" }).click();
  await expect(page.getByText("1 file record saved to Files.")).toBeVisible();

  await fileImportForm.getByLabel("File category").selectOption("document");
  await fileImportForm.locator("input[name=files]").setInputFiles({
    name: "imported-document.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Synthetic imported document"),
  });
  await fileImportForm.locator("textarea[name=description]").fill("Imported through Document intake");
  await fileImportForm.getByRole("button", { name: "Save files to Files" }).click();
  await expect(page.getByText("1 file record saved to Files.")).toBeVisible();

  await page.locator("nav").getByRole("button", { name: /^Files/ }).click();
  await expect(page.getByRole("heading", { name: "Files", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "message-archive.html", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "imported-document.txt", exact: true })).toBeVisible();
  await page.locator("input[name=file]").setInputFiles({
    name: "files-tab-document.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Synthetic files tab document"),
  });
  await page.locator("textarea[name=description]").fill("Uploaded through Files tab");
  await page.getByRole("button", { name: "Save file record" }).click();
  await expect(page.getByText("files-tab-document.txt")).toBeVisible();
  await page.getByLabel("From date").fill("2026-05-01");
  await page.getByLabel("To date").fill("2026-06-15");

  await page.locator("nav").getByRole("button", { name: /^Timeline/ }).click();
  await expect(page.getByRole("heading", { name: "Timeline", exact: true })).toBeVisible();
  await expect(page.getByText("Case timeline")).toBeVisible();
  await expect(page.getByRole("button", { name: "Export timeline CSV" })).toBeVisible();
  await expect(page.getByText("Lawyer/court export")).toBeVisible();
  await expect(page.getByText("Timeline records by type")).toBeVisible();
  const timelineDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export timeline CSV" }).click();
  const timelineDownload = await timelineDownloadPromise;
  const timelinePath = await timelineDownload.path();
  if (!timelinePath) throw new Error("Timeline CSV download did not produce a file.");
  const timelineCsv = await readFile(timelinePath, "utf8");
  expect(timelineCsv.split("\n")[0]).toContain("date,time,type,source,title");
  expect(timelineCsv.trim().split("\n").length).toBeGreaterThan(1);
  await page.getByLabel("From date").fill("2030-01-01");
  await page.getByLabel("To date").fill("2030-01-31");
  await page.getByLabel("Show").selectOption("logged_exchange");
  await expect(page.getByRole("button", { name: "Export timeline CSV" })).toBeDisabled();
  await page.getByLabel("From date").fill("2026-05-01");
  await page.getByLabel("To date").fill("2026-06-15");
  const lateExchange = page.locator("details").filter({ hasText: "Logged exchange: completed late" }).first();
  await expect(lateExchange).toBeVisible();
  await lateExchange.locator("summary").click();
  await expect(lateExchange.getByText("Recorded arrival at 6:32 PM.")).toBeVisible();
  await lateExchange.getByRole("button", { name: "Delete timeline item Logged exchange: completed late" }).click();
  await expect(page.getByText("Logged exchange deleted from timeline.")).toBeVisible();
  await expect(page.getByText("Logged exchange: completed late")).toHaveCount(0);

  await page.getByRole("button", { name: "Exchanges", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Exchanges", exact: true })).toBeVisible();
  const addExchangePanel = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Log exchange outcome" }),
  });
  await expect(addExchangePanel.getByRole("button", { name: "Manage recurring exchange schedule" })).toBeVisible();
  await expect(addExchangePanel.getByLabel("Scheduled time source")).toBeVisible();
  await expect(addExchangePanel.getByLabel("Arriving / drop-off party")).toBeVisible();
  await expect(addExchangePanel.getByLabel("Who was late?")).toBeVisible();
  const scheduledExchange = addExchangePanel.getByLabel("Scheduled exchange (optional)");
  await scheduledExchange.selectOption({ index: 1 });
  await expect(addExchangePanel.getByLabel("Scheduled exchange date")).not.toHaveValue("");
  await expect(addExchangePanel.getByLabel("Location")).toHaveValue("Community center entrance");
  await expect(page.locator("#exchange-rule-form")).toHaveCount(0);
  await addExchangePanel.getByRole("button", { name: "Manage recurring exchange schedule" }).click();
  await expect(page.getByRole("heading", { name: "Calendar", exact: true })).toBeVisible();
  await expect(page.locator("#recurring-exchange-schedule")).toHaveAttribute("open", "");
  await page.getByRole("button", { name: "Exchanges", exact: true }).click();

  await page.getByRole("button", { name: "Edit exchange log 2026-05-01" }).click();
  const editExchangePanel = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Edit saved exchange" }),
  });
  await editExchangePanel.getByLabel("Scheduled time source").selectOption("written_agreement");
  await editExchangePanel.getByLabel("Who was late?").selectOption("not_applicable");
  await editExchangePanel.getByRole("button", { name: "Update exchange details" }).click();
  await expect(page.getByRole("status")).toContainText("Exchange details updated and saved");

  const loggedExchangePanel = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Logged exchanges" }),
  });
  const editedExchangeRow = loggedExchangePanel.locator("tr").filter({ hasText: "2026-05-01" });
  await expect(editedExchangeRow).toContainText("Not applicable");
  await expect(editedExchangeRow).toContainText("Written agreement");

  await page.getByRole("button", { name: "Child Support", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Child Support", exact: true })).toBeVisible();
  await expect(page.getByText("Past-due periods")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Calculated obligation ledger" })).toBeVisible();

  await page.getByRole("button", { name: "Expenses", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Expenses", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Delete expense School supply receipt" }).click();
  await expect(page.getByText("Expense record deleted.")).toBeVisible();

  await page.getByRole("button", { name: "Reports", exact: true }).click();
  await expect(
    page.getByRole("article").getByRole("heading", { name: "Exchange Lateness & Responsibility Report" })
  ).toBeVisible();
  await expect(page.getByText(/CSV contains the report's dated record rows in a clean table/)).toBeVisible();
  await expect(page.getByText("Pre-export privacy review")).toBeVisible();
  await expect(page.getByRole("button", { name: "Download report JSON" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Download CSV" })).toBeDisabled();
  await page.getByLabel(/Names, file titles/).check();
  await page.getByLabel(/Payment references/).check();
  await page.getByLabel(/Notes are factual/).check();
  await expect(page.getByRole("button", { name: "Download CSV" })).toBeEnabled();
  const reportDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV" }).click();
  const reportDownload = await reportDownloadPromise;
  const reportPath = await reportDownload.path();
  if (!reportPath) throw new Error("Exchange report CSV download did not produce a file.");
  const reportCsv = await readFile(reportPath, "utf8");
  expect(reportCsv.split("\n")[0]).toContain("Scheduled source");
  expect(reportCsv.split("\n")[0]).toContain("Arriving / drop-off party");
  expect(reportCsv.split("\n")[0]).toContain("Late party");
  expect(reportCsv).not.toContain("chart_data");

  const additionalReportTypes = [
    ["facetime_cancellations", "FaceTime Cancellation Report"],
    ["incident_timeline", "Issue Timeline Report"],
    ["filing_facetime_correlation", "Filing / FaceTime Timing Report"],
    ["combined_attorney_summary", "Attorney Issue Summary"],
    ["combined_court_packet", "Combined Court Issue Packet"],
  ] as const;

  for (const [value, title] of additionalReportTypes) {
    await page.getByLabel("Report type").selectOption(value);
    await expect(page.getByRole("article").getByRole("heading", { name: title })).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download CSV" }).click();
    const download = await downloadPromise;
    const path = await download.path();
    if (!path) throw new Error(`${title} CSV download did not produce a file.`);
    const csv = await readFile(path, "utf8");
    expect(csv).not.toContain("chart_data");
  }
});

test("mobile child support records are visible, editable, and deletable", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/records");
  await page.getByRole("button", { name: "Enter records workspace" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Child Support", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Child Support", exact: true })).toBeVisible();
  await expect(page.getByTestId("support-history-chart")).toHaveAttribute(
    "data-months",
    "2026-02,2026-03,2026-04,2026-05,2026-06,2026-07"
  );

  const orderForm = page.locator("#child-support-order-form");
  await orderForm.getByLabel("Order nickname").fill("Mobile support order");
  await orderForm.getByLabel("Amount due each payment").fill("675");
  await orderForm.getByLabel("Order start date").fill("2026-06-01");
  await orderForm.getByLabel("First payment due").fill("2026-06-01");
  await orderForm.getByRole("button", { name: "Save support order" }).click();

  await expect(page.getByRole("status")).toContainText("Child support order saved");
  const ordersPanel = page.getByTestId("mobile-support-orders");
  await expect(ordersPanel).toContainText("Mobile support order");
  await expect(ordersPanel).toContainText("$675.00");

  await ordersPanel.getByRole("button", { name: "Edit support order Mobile support order" }).click();
  await expect(page.getByRole("heading", { name: "Edit child support order" })).toBeVisible();
  await orderForm.getByLabel("Amount due each payment").fill("700");
  await orderForm.getByRole("button", { name: "Update support order" }).click();
  await expect(page.getByRole("status")).toContainText("Child support order updated");
  await expect(ordersPanel).toContainText("$700.00");

  const paymentForm = page.locator("#child-support-payment-form");
  await paymentForm.locator('select[name="childSupportOrderId"]').selectOption({ label: "Mobile support order" });
  await expect(paymentForm.getByLabel("Applies to obligation due date")).toHaveValue("");
  await paymentForm.getByLabel("Applies to obligation due date").fill("2026-07-01");
  await paymentForm.getByLabel("Amount due").fill("700");
  await paymentForm.getByLabel("Amount paid").fill("350");
  await paymentForm.getByLabel("Status").selectOption("partial");
  await paymentForm.getByRole("button", { name: "Save payment record" }).click();

  const paymentsPanel = page.getByTestId("mobile-support-payments");
  await expect(paymentsPanel).toContainText("$350.00");
  const obligationLedger = page
    .getByRole("heading", { name: "Calculated obligation ledger", exact: true })
    .locator("..")
    .locator("..");
  const julyObligation = obligationLedger
    .locator("table tr")
    .filter({ hasText: "Mobile support order" })
    .filter({ hasText: "2026-07-01" });
  await expect(julyObligation).toContainText("partial");
  await expect(julyObligation).toContainText("$350.00");
  await paymentsPanel.getByRole("button", { name: "Edit payment record 2026-07-01 for $700.00" }).click();
  await paymentForm.getByLabel("Amount paid").fill("700");
  await paymentForm.getByLabel("Status").selectOption("paid");
  await paymentForm.getByRole("button", { name: "Update payment record" }).click();
  await expect(paymentsPanel).toContainText("$700.00");
  await expect(julyObligation).toContainText("paid");
  await expect(julyObligation).toContainText("$0.00");

  await paymentsPanel.getByRole("button", { name: "Delete payment record 2026-07-01 for $700.00" }).click();
  await expect(page.getByRole("status")).toContainText("Payment record deleted");
  await ordersPanel.getByRole("button", { name: "Delete support order Mobile support order" }).click();
  await expect(page.getByRole("status")).toContainText("Child support order deleted");
  await expect(ordersPanel).not.toContainText("Mobile support order");
});

test("mobile quick issue saves directly to editable report notes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "l2f.records.session.v1",
      JSON.stringify({
        userId: "user-demo-parent-a",
        caseId: "stale-session-case-id",
        email: "demo@example.com",
        authMode: "local",
      })
    );
  });
  await page.goto("/records");
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Import", exact: true }).click();
  const quickIssueForm = page.getByTestId("quick-issue-form");
  const issueText = "Missed call issue for attorney follow-up.";
  await quickIssueForm.getByLabel("Issue type").selectOption("communication");
  await quickIssueForm.getByLabel("What happened or needs attention?").fill(issueText);
  await quickIssueForm.getByRole("button", { name: "Save issue" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Issue saved to Notes and included in reports for attorney review"
  );

  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await expect(page.getByText(issueText, { exact: true })).toHaveCount(2);
  const notesPanel = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Notes", exact: true, level: 2 }),
  });
  await expect(notesPanel.getByText(/total records$/)).not.toHaveText("0 total records");
  await page.getByRole("button", { name: `Edit note ${issueText}` }).click();
  const noteForm = page.locator("#date-note-form");
  await noteForm.getByLabel("Title").fill("Updated attorney follow-up issue");
  await noteForm.getByRole("button", { name: "Update note" }).click();
  await expect(page.getByText("Updated attorney follow-up issue", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Delete note Updated attorney follow-up issue" }).click();
  await expect(page.getByRole("status")).toContainText("Date based note deleted");
});

test("optional calendar setup uses a simple arrow disclosure", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "l2f.records.session.v1",
      JSON.stringify({
        userId: "user-demo-parent-a",
        caseId: "case-demo-parenting-plan",
        email: "demo@example.com",
        authMode: "local",
      })
    );
  });
  await page.goto("/records");
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Import", exact: true }).click();

  const scheduleSetup = page
    .locator("details")
    .filter({ hasText: "Optional calendar schedule setup" });
  await expect(scheduleSetup).not.toHaveAttribute("open", "");
  await expect(scheduleSetup).not.toContainText("Open only when needed");
  await expect(scheduleSetup.getByTestId("calendar-schedule-setup-chevron")).toBeVisible();

  await scheduleSetup.locator("summary").click();
  await expect(scheduleSetup).toHaveAttribute("open", "");
});

test("mobile screenshot exhibit builder preserves order and generates a protected local PDF", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    window.createImageBitmap = async () => {
      throw new Error("Load failed");
    };
    window.localStorage.setItem(
      "l2f.records.session.v1",
      JSON.stringify({
        userId: "user-demo-parent-a",
        caseId: "case-demo-parenting-plan",
        email: "demo@example.com",
        authMode: "local",
      })
    );
  });
  await page.goto("/records");
  await expect(page.locator("nav").getByRole("button", { name: "Screenshot PDFs", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Create a screenshot PDF" }).click();
  const builder = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Screenshot exhibit builder" }),
  });
  await expect(builder).toBeVisible();
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64"
  );
  await builder.getByLabel("Screenshots").setInputFiles([
    { name: "first.png", mimeType: "image/png", buffer: png },
    { name: "second.png", mimeType: "image/png", buffer: png },
  ]);
  await expect(builder.getByText("1. first.png")).toBeVisible();
  await expect(builder.getByText("2. second.png")).toBeVisible();
  await builder.getByRole("button", { name: "Move first.png down" }).click();
  await expect(builder.getByText("1. second.png")).toBeVisible();
  await expect(builder.getByText("2. first.png")).toBeVisible();
  await builder.getByLabel("Exhibit label").fill("Exhibit A");
  const builderCheckboxes = builder.locator('input[type="checkbox"]');
  await expect(builderCheckboxes).toHaveCount(4);
  const checkboxSizes = await builderCheckboxes.evaluateAll((checkboxes) =>
    checkboxes.map((checkbox) => {
      const rect = checkbox.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    })
  );
  expect(checkboxSizes).toEqual([
    { width: 16, height: 16 },
    { width: 16, height: 16 },
    { width: 16, height: 16 },
    { width: 16, height: 16 },
  ]);
  await builder.getByRole("button", { name: "Generate PDF" }).click();
  await expect(builder.getByRole("status")).toContainText("PDF generated with 3 pages");
  await expect(builder.getByRole("button", { name: "Regenerate PDF" })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await builder.getByRole("button", { name: "Download or share PDF" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("my_custody_case_exhibit_Exhibit-A.pdf");
  const downloadedPdfPath = await download.path();
  expect(downloadedPdfPath).not.toBeNull();
  const downloadedPdf = await readFile(downloadedPdfPath!);
  expect(downloadedPdf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  expect(downloadedPdf.byteLength).toBeGreaterThan(2_000);
  expect(downloadedPdf.toString("latin1")).toContain("/Subtype /Image");
  await builder.getByRole("button", { name: "Save PDF to Files" }).click();
  await expect(builder.getByRole("status")).toContainText("Sign in before saving a generated exhibit to Files");
  await page.locator("nav").getByRole("button", { name: "Attorney Access", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Attorney access", exact: true })).toBeVisible();
  const fitsViewport = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(fitsViewport).toBe(true);
});

test("dashboard counters open their inputs and use structured records in the selected range", async ({
  page,
}) => {
  const { today } = localDateParts();

  await page.goto("/records");
  await page.getByRole("button", { name: "Enter records workspace" }).click();

  const lateExchangeCard = page.getByRole("button", {
    name: /^Log or review exchanges: Late exchanges,/,
  });
  await expect(lateExchangeCard).toContainText("0");
  await lateExchangeCard.click();

  const exchangeForm = page.locator("form").filter({
    has: page.getByRole("button", { name: "Save exchange outcome" }),
  });
  await expect(exchangeForm.getByLabel("Scheduled exchange date")).toHaveValue(today);
  await expect(exchangeForm.getByLabel("Actual date")).toHaveValue(today);
  await exchangeForm.getByLabel("Actual time").fill("18:15");
  await exchangeForm.getByRole("button", { name: "Save exchange outcome" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Exchange outcome saved. It appears below"
  );

  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: /^Log or review exchanges: Late exchanges, 1$/,
    })
  ).toBeVisible();

  await page
    .getByRole("button", {
      name: /^Log FaceTime outcome: No FaceTime conducted, 0$/,
    })
    .click();
  const faceTimeForm = page.getByTestId("facetime-outcome-form");
  await expect(faceTimeForm.getByLabel("Date", { exact: true })).toHaveValue(today);
  await faceTimeForm.getByLabel("FaceTime outcome").selectOption("attempted_unanswered");
  await faceTimeForm
    .getByLabel("A message or notice came after the call attempt.")
    .check();
  await faceTimeForm.getByLabel("Details (optional)").fill(
    "The attempted call was not answered."
  );
  await faceTimeForm.getByRole("button", { name: "Save FaceTime outcome" }).click();
  await expect(page.getByRole("status")).toContainText(
    "FaceTime outcome saved and reflected in the dashboard date range"
  );

  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: /^Log FaceTime outcome: No FaceTime conducted, 1$/,
    })
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: /^Log FaceTime outcome: Post call notices, 1$/,
    })
  ).toBeVisible();

  await page.locator("nav").getByRole("button", { name: /^Timeline/ }).click();
  await expect(page.getByRole("button", { name: /JSON/i })).toHaveCount(0);
});

test("lawyer court summary and charts export a populated PDF file", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/records");
  await page.getByRole("button", { name: "Enter records workspace" }).click();
  await page.getByLabel("From date").fill("2026-05-01", { force: true });
  await page.getByLabel("To date").fill("2026-06-15", { force: true });
  await page.locator("nav").getByRole("button", { name: /^Timeline/ }).click();

  const exportPanel = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Lawyer/court export", exact: true }),
  });
  await expect(exportPanel.getByText("Timeline records by type", { exact: true })).toBeVisible();
  await expect(exportPanel.getByRole("button", { name: "Download JSON" })).toHaveCount(0);

  const downloadPromise = page.waitForEvent("download");
  await exportPanel.getByRole("button", { name: "Print / save PDF" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(
    "my_custody_case_timeline-2026-05-01-2026-06-15.pdf"
  );
  const downloadedPdfPath = await download.path();
  expect(downloadedPdfPath).not.toBeNull();
  const downloadedPdf = await readFile(downloadedPdfPath!);
  expect(downloadedPdf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  expect(downloadedPdf.byteLength).toBeGreaterThan(5_000);
});

test("mobile exchange status indicators have readable horizontal spacing", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/records");
  await page.getByRole("button", { name: "Enter records workspace" }).click();
  await page.getByRole("button", { name: "Exchanges", exact: true }).click();

  const addExchangePanel = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Log exchange outcome" }),
  });
  await addExchangePanel.getByRole("button", { name: "Save exchange outcome" }).click();

  const loggedExchangePanel = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Logged exchanges" }),
  });
  const completedLateStatus = loggedExchangePanel.getByText("completed late", { exact: true }).first();
  await expect(completedLateStatus).toBeVisible();
  const spacing = await completedLateStatus.evaluate((element) => {
    const style = window.getComputedStyle(element);
    return {
      paddingLeft: style.paddingLeft,
      paddingRight: style.paddingRight,
      whiteSpace: style.whiteSpace,
    };
  });
  expect(spacing).toEqual({
    paddingLeft: "12px",
    paddingRight: "12px",
    whiteSpace: "nowrap",
  });
});

test("attorney portal is a separate read-only mobile experience", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "l2f.records.session.v1",
      JSON.stringify({
        userId: "user-demo-parent-a",
        caseId: "case-demo-parenting-plan",
        email: "counsel@example.com",
        authMode: "local",
      })
    );
    window.sessionStorage.setItem("l2f.attorney.access", "opaque-access");
  });
  const now = "2026-07-18T00:00:00.000Z";
  const dataset = {
    users: [],
    matters: [{
      id: "shared-case",
      userId: "shared-owner",
      caseName: "Parenting Plan Records",
      childDisplayLabels: ["Child 1"],
      userRoleLabel: "Parent A",
      otherParentLabel: "Parent B",
      timezone: "UTC",
      createdAt: now,
      updatedAt: now,
    }],
    exchangeRules: [],
    scheduleExceptions: [],
    custodyDayAssignments: [],
    exchangeLogs: [],
    dateNotes: [{
      id: "note-1",
      caseId: "shared-case",
      userId: "shared-owner",
      noteDate: "2026-07-10",
      category: "other",
      title: "Shared issue",
      body: "User-provided note for review.",
      tags: [],
      includeInReports: true,
      createdAt: now,
      updatedAt: now,
    }],
    evidenceItems: [{
      id: "file-1",
      caseId: "shared-case",
      userId: "shared-owner",
      originalFileName: "shared-file.pdf",
      storedFileName: "",
      fileType: "application/pdf",
      fileSize: 1024,
      uploadedAt: now,
      tags: [],
      includeInReports: true,
      malwareScanStatus: "clean",
      createdAt: now,
      updatedAt: now,
    }],
    childSupportOrders: [],
    childSupportPayments: [],
    expenseItems: [],
    timelineDesignations: [],
    auditLogs: [],
  };
  await page.route("**/api/records/attorney/portal", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().postDataJSON()).toEqual({ accessHandle: "opaque-access" });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        accessHandle: "opaque-access",
        projection: {
          dataset,
          evidence: [{
            ...dataset.evidenceItems[0],
            downloadHandle: "opaque-evidence",
          }],
          sharedAt: now,
        },
        updatedAt: now,
        accessExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        readOnly: true,
      }),
    });
  });
  await page.route("**/api/records/auth/csrf", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ token: "csrf" }),
  }));
  await page.route("**/api/records/attorney/portal/action", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true }),
  }));

  await page.goto("/attorney");
  await expect(page.getByText("Read-only attorney guest", { exact: true })).toBeVisible();
  await expect(page.getByText(/You may return as often as needed before then/)).toBeVisible();
  await expect(page.getByText(/You cannot create, edit, delete, upload/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Settings", exact: true })).toHaveCount(0);
  await expect(page.getByText("Request account deletion")).toHaveCount(0);
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await expect(page.getByText("Shared issue")).toBeVisible();
  await expect(page.getByRole("button", { name: /Edit|Delete|Upload/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Reports", exact: true }).click();
  await page.getByRole("button", { name: "Generate report preview" }).click();
  await expect(page.getByRole("status")).toContainText("Read-only report preview generated");
  const fitsViewport = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(fitsViewport).toBe(true);
});

test("a signed-in invited attorney is granted access automatically", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "l2f.records.session.v1",
      JSON.stringify({
        userId: "attorney-user",
        caseId: "case-demo-parenting-plan",
        email: "counsel@example.test",
        authMode: "local",
      })
    );
  });

  let acceptanceCalls = 0;
  await page.route("**/api/records/auth/csrf", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ token: "csrf" }),
  }));
  await page.route("**/api/records/attorney/accept/prepare", async (route) => {
    expect(route.request().postDataJSON()).toEqual({ token: "private-invitation-token" });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });
  await page.route("**/api/records/attorney/accept", async (route) => {
    acceptanceCalls += 1;
    expect(route.request().method()).toBe("POST");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        accessHandle: "new-opaque-access",
        accessExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    });
  });
  await page.route("**/api/records/attorney/portal", (route) => route.fulfill({
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({ error: "Portal fixture intentionally stopped after acceptance." }),
  }));

  await page.goto("/attorney/accept#token=private-invitation-token");
  await page.waitForURL(/\/attorney$/);

  expect(acceptanceCalls).toBe(1);
  expect(await page.evaluate(() => window.sessionStorage.getItem("l2f.attorney.access")))
    .toBe("new-opaque-access");
});

test("attorney email callback takes priority over an ambient signed-in session", async ({ page }) => {
  await page.goto("/records");
  await page.getByRole("button", { name: "Enter records workspace" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();

  await page.goto(
    "/records?auth=attorney-invite&next=%2Fattorney%2Faccept&invite=1&attorney_token=onboarding-token-long-enough#access_token=mailbox-access-token-long-enough&refresh_token=mailbox-refresh-token-long-enough&type=invite&expires_in=3600"
  );

  await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
  expect(page.url()).toContain("auth=attorney-invite");
  expect(page.url()).toContain("attorney_token=onboarding-token-long-enough");
  expect(page.url()).toContain("type=invite");
  await expect(page).not.toHaveURL(/\/attorney\/accept$/);
});

test("mobile create flows stay visible across every record tab and reload with a stale case session", async ({ page }) => {
  test.setTimeout(60_000);
  const currentCalendar = localDateParts();
  const expectPhoneWidth = async () => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  };
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "l2f.records.session.v1",
      JSON.stringify({
        userId: "user-demo-parent-a",
        caseId: "stale-session-case-id",
        email: "demo@example.com",
        authMode: "local",
      })
    );
  });
  await page.goto("/records");
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();

  const expenseName = "Persistence audit expense";
  await page.getByRole("button", { name: "Expenses", exact: true }).click();
  await expectPhoneWidth();
  const expenseForm = page.locator("#expense-record-form");
  await expenseForm.getByLabel("Description").fill(expenseName);
  await expenseForm.getByLabel("Amount", { exact: true }).fill("42.75");
  await expenseForm.getByRole("button", { name: "Save expense" }).click();
  await expect(page.getByRole("status")).toContainText("Expense record saved. It appears below");
  await expect(page.getByText(expenseName, { exact: true })).toBeVisible();
  await expect(page.getByTestId("expense-category-chart")).toHaveAttribute(
    "data-total",
    "161.97"
  );
  const expenseExportPanel = page
    .getByRole("heading", { name: "Lawyer/court export", exact: true })
    .locator("xpath=ancestor::section[1]");
  await expect(expenseExportPanel.getByRole("button", { name: "Print / save PDF" })).toBeEnabled();
  await expect(expenseExportPanel).not.toContainText("No records match the selected date range.");

  const noteTitle = "Persistence audit note";
  const noteBody = "This note verifies that a newly created record remains visible after reload.";
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await expectPhoneWidth();
  const noteForm = page.locator("#date-note-form");
  await noteForm.getByLabel("Title").fill(noteTitle);
  await noteForm.getByLabel("What happened?").fill(noteBody);
  await noteForm.getByRole("button", { name: "Save note" }).click();
  await expect(page.getByRole("status")).toContainText("Date based note saved successfully");
  await expect(page.getByText(noteTitle, { exact: true })).toBeVisible();

  const exchangeRuleName = "Persistence audit exchange rule";
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await expectPhoneWidth();
  await page.getByText("Recurring exchange schedule (optional)", { exact: true }).click();
  const exchangeRuleForm = page.locator("#exchange-rule-form");
  await exchangeRuleForm.getByLabel("Schedule name").fill(exchangeRuleName);
  await exchangeRuleForm.getByLabel("Scheduled time").fill("18:00");
  await exchangeRuleForm.getByLabel("Starts").fill("2026-08-01");
  await exchangeRuleForm.getByRole("button", { name: "Save recurring exchange" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Recurring exchange saved for calendar and report comparisons"
  );
  await expect(page.getByText(exchangeRuleName, { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Exchanges", exact: true }).click();
  await expectPhoneWidth();
  const exchangeLogForm = page.locator("form").filter({
    has: page.getByRole("button", { name: "Save exchange outcome" }),
  });
  await exchangeLogForm.getByLabel("Scheduled exchange date").fill("2026-08-14");
  await exchangeLogForm.getByLabel("Actual date").fill("2026-08-14");
  await exchangeLogForm.getByRole("button", { name: "Save exchange outcome" }).click();
  await expect(page.getByRole("status")).toContainText("Exchange outcome saved. It appears below");
  const loggedExchanges = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Logged exchanges", exact: true }),
  });
  await expect(loggedExchanges).toContainText("2026-08-14");

  const fileName = "persistence-audit-file.txt";
  await page.locator("nav").getByRole("button", { name: /^Files/ }).click();
  await expectPhoneWidth();
  await page.locator("input[name=file]").setInputFiles({
    name: fileName,
    mimeType: "text/plain",
    buffer: Buffer.from("Synthetic persistence audit file"),
  });
  await page.locator("textarea[name=description]").fill("Persistence audit file description");
  await page.getByRole("button", { name: "Save file record" }).click();
  await expect(page.getByRole("status")).toContainText("File metadata saved with allow list validation");
  await expect(page.getByText(fileName, { exact: true })).toBeVisible();

  const supportOrderName = "Persistence audit support order";
  await page.getByRole("button", { name: "Child Support", exact: true }).click();
  await expectPhoneWidth();
  const supportOrderForm = page.locator("#child-support-order-form");
  await supportOrderForm.getByLabel("Order nickname").fill(supportOrderName);
  await supportOrderForm.getByLabel("Amount due each payment").fill("321");
  await supportOrderForm.getByRole("button", { name: "Save support order" }).click();
  await expect(page.getByRole("status")).toContainText("Child support order saved. It appears below");
  await expect(page.getByTestId("mobile-support-orders")).toContainText(supportOrderName);

  const supportPaymentForm = page.locator("#child-support-payment-form");
  await supportPaymentForm.locator('select[name="childSupportOrderId"]').selectOption({ label: supportOrderName });
  await supportPaymentForm.getByLabel("Applies to obligation due date").fill("2026-08-15");
  await supportPaymentForm.getByLabel("Amount due").fill("321");
  await supportPaymentForm.getByLabel("Amount paid").fill("123");
  await supportPaymentForm.getByLabel("Status").selectOption("partial");
  await supportPaymentForm.getByRole("button", { name: "Save payment record" }).click();
  await expect(page.getByRole("status")).toContainText("Payment record saved. It appears below");
  await expect(page.getByTestId("mobile-support-payments")).toContainText("$123.00");

  const caregiverName = "Alternate caregiver";
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await expectPhoneWidth();
  await page.getByLabel("Child will be with").selectOption(caregiverName);
  await page.getByRole("button", { name: "Save date range" }).click();
  await expect(page.getByRole("status")).toContainText("Custody schedule saved for 1 day");
  await expect(
    page.getByRole("button", { name: `Edit calendar day ${currentCalendar.today}` }).getByText(caregiverName)
  ).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Expenses", exact: true }).click();
  await expectPhoneWidth();
  await expect(page.getByText(expenseName, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await expectPhoneWidth();
  await expect(page.getByText(noteTitle, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await expectPhoneWidth();
  await page.getByText("Recurring exchange schedule (optional)", { exact: true }).click();
  await expect(page.getByText(exchangeRuleName, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Exchanges", exact: true }).click();
  await expectPhoneWidth();
  await expect(loggedExchanges).toContainText("2026-08-14");
  await page.locator("nav").getByRole("button", { name: /^Files/ }).click();
  await expectPhoneWidth();
  await expect(page.getByText(fileName, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Child Support", exact: true }).click();
  await expectPhoneWidth();
  await expect(page.getByTestId("mobile-support-orders")).toContainText(supportOrderName);
  await expect(page.getByTestId("mobile-support-payments")).toContainText("$123.00");
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await expectPhoneWidth();
  await expect(
    page.getByRole("button", { name: `Edit calendar day ${currentCalendar.today}` }).getByText(caregiverName)
  ).toBeVisible();

  const matterName = "Persistence audit matter";
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expectPhoneWidth();
  const createMatterPanel = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Create custody matter", exact: true }),
  });
  await createMatterPanel.getByLabel("Case name").fill(matterName);
  await createMatterPanel.getByRole("button", { name: "Create matter" }).click();
  await expect(page.getByRole("status")).toContainText("Custody matter created, saved, and selected");
  await expect(page.getByTestId("workspace-header")).toContainText(matterName);
});

test("mobile notes and file actions contain long synthetic labels without horizontal scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/records");
  await page.getByRole("button", { name: "Enter records workspace" }).click();

  const longNoteTitle = `QA_${"x".repeat(130)}`;
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  const noteForm = page.locator("#date-note-form");
  await noteForm.getByLabel("Title").fill(longNoteTitle);
  await noteForm.getByLabel("What happened?").fill(`QA_${"unbroken_body_".repeat(18)}`);
  await noteForm.getByLabel("Tags").fill(`QA_${"t".repeat(35)}`);
  await noteForm.getByRole("button", { name: "Save note" }).click();
  await expect(page.getByRole("status")).toContainText("Date based note saved successfully");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);

  const longFileName = `QA-${"evidence-label-".repeat(14)}.txt`;
  await page.locator("nav").getByRole("button", { name: /^Files/ }).click();
  await page.locator("input[name=file]").setInputFiles({
    name: longFileName,
    mimeType: "text/plain",
    buffer: Buffer.from("Synthetic mobile overflow regression file"),
  });
  await page.getByRole("button", { name: "Save file record" }).click();
  await expect(page.getByRole("status")).toContainText("File metadata saved with allow list validation");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);

  await page.getByRole("button", { name: `Delete file ${longFileName}` }).click();
  await expect(page.getByRole("status")).toContainText("File metadata deleted");
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await page.getByRole("button", { name: `Delete note ${longNoteTitle}` }).click();
  await expect(page.getByRole("status")).toContainText("Date based note deleted");
});

test("iPhone record tabs keep every tile and data-entry control inside the workspace", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/records");
  await page.getByRole("button", { name: "Enter records workspace" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();

  const tabs = [
    "Dashboard",
    "Calendar",
    "Import",
    "Timeline",
    "Exchanges",
    "Notes",
    "Files",
    "Screenshot PDFs",
    "Child Support",
    "Expenses",
    "Reports",
    "Attorney Access",
    "Settings",
  ];
  const nav = page.locator("aside nav");
  const workspace = page.locator(".records-workspace-content");

  for (const width of [320, 375, 390]) {
    await page.setViewportSize({ width, height: 844 });

    for (const tab of tabs) {
      await nav.getByRole("button").filter({ hasText: tab }).click();
      await expect(page.getByRole("heading", { name: tab, exact: true }).first()).toBeVisible();
      await expect(
        workspace.locator("[placeholder]"),
        `${tab} still contains placeholder copy at ${width}px`
      ).toHaveCount(0);

      if (tab === "Files") {
        await expect(
          workspace.getByRole("heading", { name: "Private file attachment", exact: true })
        ).toBeVisible();
        await expect(
          workspace.getByRole("heading", { name: "Screenshot exhibit builder", exact: true })
        ).toHaveCount(0);
      }

      if (tab === "Screenshot PDFs") {
        await expect(
          workspace.getByRole("heading", { name: "Screenshot exhibit builder", exact: true })
        ).toBeVisible();
        await expect(
          workspace.getByRole("heading", { name: "Private file attachment", exact: true })
        ).toHaveCount(0);
      }

      const layoutOverflow = await workspace.evaluate((workspace) => {
        const workspaceRect = workspace.getBoundingClientRect();
        const visible = (element: Element) => {
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
        };
        const describe = (element: Element) =>
          element.getAttribute("name") ||
          element.getAttribute("aria-label") ||
          element.querySelector("h2,h3")?.textContent?.trim() ||
          element.tagName;

        const tiles = Array.from(workspace.querySelectorAll("section")).filter(visible);
        const controls = Array.from(
          workspace.querySelectorAll("input,select,textarea,button")
        ).filter((element) => visible(element) && !element.closest(".records-table-scroll"));
        const candidates = [...tiles, ...controls];

        return candidates.flatMap((element) => {
          const rect = element.getBoundingClientRect();
          const panel = element.matches("section") ? workspace : element.closest("section") || workspace;
          const bounds = panel.getBoundingClientRect();
          const outsideWorkspace =
            rect.left < workspaceRect.left - 1 || rect.right > workspaceRect.right + 1;
          const outsidePanel = rect.left < bounds.left - 1 || rect.right > bounds.right + 1;
          if (!outsideWorkspace && !outsidePanel) return [];

          return [{
            element: describe(element),
            elementLeft: rect.left,
            elementRight: rect.right,
            panelLeft: bounds.left,
            panelRight: bounds.right,
            workspaceLeft: workspaceRect.left,
            workspaceRight: workspaceRect.right,
          }];
        });
      });

      expect(layoutOverflow, `${tab} has a tile or control outside its panel at ${width}px`).toEqual([]);

      const dateControlOverflow = await workspace
        .locator('input[type="date"]:visible, input[type="time"]:visible, input[type="datetime-local"]:visible')
        .evaluateAll((inputs) =>
        inputs.flatMap((input) => {
          const element = input as HTMLInputElement;
          const rect = element.getBoundingClientRect();
          const container = element.closest("label") || element.closest("section");
          const bounds = container?.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          const outsideContainer = Boolean(
            bounds && (rect.left < bounds.left - 1 || rect.right > bounds.right + 1)
          );
          const clipsNativeContents = ["hidden", "clip"].includes(style.overflowX);
          const hasShrinkableInlineSize = Number.parseFloat(style.minInlineSize || style.minWidth) === 0;

          if (!outsideContainer && clipsNativeContents && hasShrinkableInlineSize) return [];

          return [{
            name: element.name || element.getAttribute("aria-label") || element.type,
            elementLeft: rect.left,
            elementRight: rect.right,
            containerLeft: bounds?.left,
            containerRight: bounds?.right,
            minInlineSize: style.minInlineSize,
            overflowX: style.overflowX,
          }];
        })
      );
      expect(
        dateControlOverflow,
        `${tab} has a native date or time control that can escape its field at ${width}px`
      ).toEqual([]);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
        `${tab} widens the page at ${width}px`
      ).toBe(width);
    }
  }

  await page.getByRole("button", { name: "Options", exact: true }).click();
  const dateOptionsOverflow = await page
    .locator('#mobile-workspace-options input[type="date"]:visible')
    .evaluateAll((inputs) =>
      inputs.flatMap((input) => {
        const element = input as HTMLInputElement;
        const rect = element.getBoundingClientRect();
        const panel = element.closest("#mobile-workspace-options");
        const bounds = panel?.getBoundingClientRect();
        if (bounds && rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1) return [];
        return [{
          name: element.getAttribute("aria-label") || "date",
          elementLeft: rect.left,
          elementRight: rect.right,
          panelLeft: bounds?.left,
          panelRight: bounds?.right,
        }];
      })
    );
  expect(dateOptionsOverflow, "mobile date-range controls escape the options panel").toEqual([]);
  await page.getByRole("button", { name: "Done", exact: true }).click();

  await nav.getByRole("button").filter({ hasText: "Notes" }).click();
  const noteCard = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Notes", exact: true, level: 2 }),
  }).locator("div.rounded-md").filter({ hasText: "School pickup note" }).first();
  const titleBox = await noteCard.getByRole("heading", { name: "School pickup note" }).boundingBox();
  const editBox = await noteCard.getByRole("button", { name: "Edit note School pickup note" }).boundingBox();
  expect(titleBox).not.toBeNull();
  expect(editBox).not.toBeNull();
  expect(editBox!.y).toBeGreaterThanOrEqual(titleBox!.y + titleBox!.height);
});

test("workspace tab changes support native and browser back navigation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/records");
  await page.getByRole("button", { name: "Enter records workspace" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Notes", exact: true }).first()).toBeVisible();

  await page.goBack();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();

  await page.goForward();
  await expect(page.getByRole("heading", { name: "Notes", exact: true }).first()).toBeVisible();
});

test("settings use structured time zone selectors for profiles and cases", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/records");
  await page.getByRole("button", { name: "Enter records workspace" }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();

  const accountSettings = page
    .getByRole("heading", { name: "Account settings", exact: true })
    .locator("..")
    .locator("..");
  const profileTimeZone = accountSettings.getByLabel("Time zone");
  await expect(profileTimeZone).toHaveJSProperty("tagName", "SELECT");
  await expect(profileTimeZone.locator('option[value="America/Anchorage"]')).toHaveText(
    "Alaska Time — most of Alaska"
  );
  await profileTimeZone.selectOption("America/Anchorage");
  await accountSettings.getByRole("button", { name: "Update profile" }).click();
  await expect(page.getByRole("status")).toContainText("Account settings updated and saved");

  const caseSettings = page
    .getByRole("heading", { name: "Selected case settings", exact: true })
    .locator("..")
    .locator("..");
  const caseTimeZone = caseSettings.getByLabel("Case time zone");
  await expect(caseTimeZone).toHaveJSProperty("tagName", "SELECT");
  await caseTimeZone.selectOption("America/Anchorage");
  await caseSettings.getByRole("button", { name: "Save selected case" }).click();
  await expect(page.getByRole("status")).toContainText("Selected case settings updated and saved");

  const createMatter = page
    .getByRole("heading", { name: "Create custody matter", exact: true })
    .locator("..")
    .locator("..");
  await expect(createMatter.getByLabel("Time zone")).toHaveJSProperty("tagName", "SELECT");
  await expect(page.locator('input[name="timezone"]')).toHaveCount(0);

  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await expect(page.getByText("Case timezone: America/Anchorage")).toBeVisible();
});

test("advanced data backup keeps JSON out of the primary export flow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/records");
  await page.getByRole("button", { name: "Enter records workspace" }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();

  const backup = page.getByTestId("advanced-data-backup");
  await expect(backup).not.toHaveAttribute("open", "");
  await expect(backup.getByRole("button", { name: "Download JSON backup" })).not.toBeVisible();
  await backup.locator("summary").click();
  await expect(backup).toHaveAttribute("open", "");

  const downloadPromise = page.waitForEvent("download");
  await backup.getByRole("button", { name: "Download JSON backup" }).click();
  const download = await downloadPromise;
  const path = await download.path();
  if (!path) throw new Error("Advanced JSON backup did not produce a file.");
  const body = JSON.parse(await readFile(path, "utf8")) as {
    format?: string;
    schemaVersion?: number;
    data?: { matters?: unknown[]; auditLogs?: unknown[] };
  };
  expect(body).toMatchObject({
    format: "custody_folio_selected_case_backup",
    schemaVersion: 1,
  });
  expect(body.data?.matters?.length).toBeGreaterThan(0);
  expect(body.data?.auditLogs?.length).toBeGreaterThan(0);
});

test("saved information records expose working edit and delete controls", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/records");
  await page.getByRole("button", { name: "Enter records workspace" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await page.getByText("Recurring exchange schedule (optional)", { exact: true }).click();
  await page.getByRole("button", { name: "Edit recurring exchange Friday evening exchange" }).click();
  const ruleForm = page.locator("#exchange-rule-form");
  await ruleForm.getByLabel("Schedule name").fill("Updated Friday exchange");
  await ruleForm.getByRole("button", { name: "Update recurring exchange" }).click();
  await expect(page.getByRole("status")).toContainText("Recurring exchange updated");
  await expect(page.getByText("Updated Friday exchange", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await page.getByRole("button", { name: "Edit note School pickup note" }).click();
  const noteForm = page.locator("#date-note-form");
  await noteForm.getByLabel("Title").fill("Updated school pickup note");
  await noteForm.getByRole("button", { name: "Update note" }).click();
  await expect(page.getByRole("status")).toContainText("Date based note updated");
  await expect(page.getByText("Updated school pickup note", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Delete note Updated school pickup note" }).click();
  await expect(page.getByRole("status")).toContainText("Date based note deleted");

  await page.locator("nav").getByRole("button", { name: /^Files/ }).click();
  await page.getByRole("button", { name: "Edit file information demo-payment-portal-screenshot.png" }).click();
  const evidenceEditor = page.locator("form").filter({
    has: page.getByRole("button", { name: "Update file information" }),
  });
  await evidenceEditor.getByLabel("File name").fill("May child support portal.pdf");
  await evidenceEditor.getByRole("button", { name: "Update file information" }).click();
  await expect(page.getByRole("status")).toContainText("Keep the original .png file extension");

  await evidenceEditor.getByLabel("File name").fill("May child support portal.png");
  await evidenceEditor.getByLabel("Description").fill("Updated file description");
  await evidenceEditor.getByRole("button", { name: "Update file information" }).click();
  await expect(page.getByRole("status")).toContainText("File information updated");
  await expect(page.getByText("May child support portal.png", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Original upload: demo-payment-portal-screenshot.png", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Edit file information May child support portal.png" })
  ).toBeVisible();
  await expect(page.getByText("Updated file description", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Expenses", exact: true }).click();
  await page.getByRole("button", { name: "Edit expense School supply receipt" }).click();
  const expenseForm = page.locator("#expense-record-form");
  await expenseForm.getByLabel("Amount", { exact: true }).fill("99.50");
  await expenseForm.getByRole("button", { name: "Update expense" }).click();
  await expect(page.getByRole("status")).toContainText("Expense record updated");
  await expect(page.getByText("$99.50", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Delete expense School supply receipt" }).click();
  await expect(page.getByRole("status")).toContainText("Expense record deleted");
});

test("records account recovery and deletion paths are reachable", async ({ page }) => {
  await page.goto("/records?auth=recovery");

  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Enter records workspace" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Forgot password?" })).toHaveCount(0);

  await page.getByRole("button", { name: "Enter records workspace" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();

  const accountDeletion = page.getByRole("link", { name: "Delete my account" });
  await expect(accountDeletion).toBeVisible();
  await expect(accountDeletion).toHaveAttribute("href", "/account/delete");

  const privacyDeletion = page.getByRole("link", { name: "Privacy and deletion policy" });
  await expect(privacyDeletion).toBeVisible();
  await expect(privacyDeletion).toHaveAttribute("href", "/privacy");

  const deletionCsrf = "synthetic-deletion-csrf";
  let deletionRequest: { confirmation?: string } | null = null;
  let deletionCsrfHeader = "";
  await page.route("**/api/records/auth/session", (route) =>
    route.fulfill({
      contentType: "application/json",
      status: 200,
      body: JSON.stringify({ session: { email: "synthetic-reviewer@example.test" } }),
    })
  );
  await page.route("**/api/records/auth/csrf", (route) =>
    route.fulfill({
      contentType: "application/json",
      headers: { "Set-Cookie": `l2f-records-csrf=${deletionCsrf}; Path=/; SameSite=Strict` },
      status: 200,
      body: JSON.stringify({ token: deletionCsrf }),
    })
  );
  await page.route("**/api/records/account/deletion-request", async (route) => {
    deletionRequest = route.request().postDataJSON() as { confirmation?: string };
    deletionCsrfHeader = route.request().headers()["x-l2f-csrf"] || "";
    await route.fulfill({
      contentType: "application/json",
      status: 200,
      body: JSON.stringify({
        ok: true,
        clearLocalSession: true,
        deletedAt: "2026-07-22T12:00:00.000Z",
        message: "Your account and active Custody Folio records were permanently deleted.",
      }),
    });
  });

  await accountDeletion.click();
  await expect(page).toHaveURL(/\/account\/delete$/);
  await expect(page.getByRole("heading", { name: "Delete Account", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Permanently delete account" })).toBeVisible();
  await expect(page.getByText("Signed in as synthetic-reviewer@example.test.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Email support instead" })).toHaveAttribute(
    "href",
    "mailto:support@custodyfolio.com?subject=Custody%20Folio%20account%20deletion%20request"
  );
  await expect(page.getByRole("link", { name: "Email deletion support" })).toHaveAttribute(
    "href",
    "mailto:support@custodyfolio.com?subject=Custody%20Folio%20account%20deletion%20request"
  );
  await expect(page.getByText("What happens when you confirm")).toBeVisible();
  const permanentDelete = page.getByRole("button", { name: "Permanently delete my account" });
  await expect(permanentDelete).toBeDisabled();
  await page.getByRole("checkbox").check();
  await expect(permanentDelete).toBeEnabled();
  await permanentDelete.click();
  await expect(page.getByRole("heading", { name: "Account deleted" })).toBeVisible();
  await expect(page.getByText("Your account and active Custody Folio records were permanently deleted.")).toBeVisible();
  expect(deletionRequest).toEqual({ confirmation: "DELETE" });
  expect(deletionCsrfHeader).toBe(deletionCsrf);

  await page.goto("/records");
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();

  await privacyDeletion.click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole("heading", { name: "Privacy Policy" })).toBeVisible();

  await page.goto("/records");
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  await expect(page.getByLabel("Case name").first()).toHaveValue("Parenting Plan Records");

  await page.getByRole("button", { name: "Delete selected case" }).click();
  await expect(page.getByText("Selected case deleted.")).toBeVisible();
  await expect(page.getByText("Create or select a custody matter before setting a case timezone.")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  await expect(page.locator('select[aria-label="Case"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Create case", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  await expect(page.getByText("Create or select a custody matter before setting a case timezone.")).toBeVisible();
});

test("mobile workspace header stays compact and exposes its full controls", async ({ page }) => {
  const currentCalendar = localDateParts();
  const [year, month] = currentCalendar.monthKey.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const shortMonth = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, 1))
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/records");

  const enterWorkspace = page.getByRole("button", { name: "Enter records workspace" });
  await expect(enterWorkspace).toBeEnabled();
  await enterWorkspace.click();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();

  const header = page.getByTestId("workspace-header");
  const collapsedBox = await header.boundingBox();
  expect(collapsedBox?.height).toBeLessThanOrEqual(72);
  await expect(page.getByText(`Parenting Plan Records | ${shortMonth} 1-${lastDay}`)).toBeVisible();
  await expect(page.getByLabel("Date range preset")).not.toBeVisible();

  await page.getByRole("button", { name: "Options", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Workspace options", exact: true })).toBeVisible();
  await expect(page.locator('select[aria-label="Case"]')).toHaveCount(0);
  await expect(page.getByTestId("case-summary")).toBeVisible();
  await expect(page.getByTestId("case-summary")).toContainText("Parenting Plan Records");
  await expect(page.getByLabel("Date range preset")).toBeVisible();
  await expect(page.getByLabel("From date")).toBeVisible();
  await expect(page.getByLabel("To date")).toBeVisible();
  const rangeDateCenters = await page
    .getByTestId("range-date-value")
    .evaluateAll((values) =>
      values.map((value) => {
        const control = value.closest('[data-testid="range-date-control"]');
        if (!control) return Number.POSITIVE_INFINITY;
        const valueBox = value.getBoundingClientRect();
        const controlBox = control.getBoundingClientRect();
        return Math.abs(
          (valueBox.left + valueBox.right) / 2 -
          (controlBox.left + controlBox.right) / 2
        );
      })
    );
  expect(rangeDateCenters).toHaveLength(2);
  expect(rangeDateCenters.every((offset) => offset <= 1)).toBe(true);
  await expect(page.getByRole("button", { name: "Logout", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Workspace options", exact: true })).not.toBeVisible();
  const restoredBox = await header.boundingBox();
  expect(restoredBox?.height).toBeLessThanOrEqual(72);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test("a restored session never flashes the login screen", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "l2f.records.session.v1",
      JSON.stringify({
        userId: "user-demo-parent-a",
        caseId: "case-demo-parenting-plan",
        email: "demo@example.com",
        authMode: "local",
      })
    );
    (window as typeof window & { __sawRecordsSignIn?: boolean }).__sawRecordsSignIn = false;
    const observer = new MutationObserver(() => {
      const sawSignIn = Array.from(document.querySelectorAll("h1,h2")).some(
        (element) => element.textContent?.trim() === "Sign in"
      );
      if (sawSignIn) {
        (window as typeof window & { __sawRecordsSignIn?: boolean }).__sawRecordsSignIn = true;
      }
    });
    observer.observe(document, { childList: true, subtree: true });
  });

  await page.goto("/records");
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as typeof window & { __sawRecordsSignIn?: boolean }).__sawRecordsSignIn
    )
  ).toBe(false);
});

test("timeline designations explain automatic labels and remain editable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  async function openSeedTimeline() {
    await page.getByRole("button", { name: "Options", exact: true }).click();
    await page.getByLabel("From date").fill("2026-05-01");
    await page.getByLabel("To date").fill("2026-06-15");
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await page.locator("aside nav button").filter({ hasText: "Timeline" }).click();
    await expect(page.getByRole("heading", { name: "Timeline controls", exact: true })).toBeVisible();
  }

  await page.goto("/records");
  await page.getByRole("button", { name: "Enter records workspace" }).click();
  await openSeedTimeline();

  await expect(
    page.getByText(
      "The app suggests these from each record. Expand any timeline item to change its designation or return it to Automatic."
    )
  ).toBeVisible();

  let schoolNote = page.locator("details").filter({ hasText: "School pickup note" }).first();
  await schoolNote.locator("summary").click();
  const designationLabel = "Timeline designation for School pickup note";
  await expect(page.getByLabel(designationLabel)).toHaveValue("automatic");
  await expect(
    schoolNote.getByText(
      "This is an automatic suggestion based on the source record. You can change it here."
    )
  ).toBeVisible();

  await page.getByLabel(designationLabel).selectOption("critical");
  await expect(page.getByRole("status")).toContainText(
    "Timeline designation changed to Critical"
  );
  schoolNote = page.locator("details").filter({ hasText: "School pickup note" }).first();
  await expect(
    schoolNote.locator("span").filter({ hasText: /^Critical$/ }).first()
  ).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  await openSeedTimeline();
  schoolNote = page.locator("details").filter({ hasText: "School pickup note" }).first();
  await schoolNote.locator("summary").click();
  await expect(page.getByLabel(designationLabel)).toHaveValue("critical");

  await page.getByLabel(designationLabel).selectOption("automatic");
  await expect(page.getByRole("status")).toContainText(
    "Timeline designation returned to the automatic suggestion"
  );
  await expect(page.getByLabel(designationLabel)).toHaveValue("automatic");
  await expect(
    schoolNote.locator("span").filter({ hasText: /^Neutral$/ }).first()
  ).toBeVisible();
});

test("mobile calendar, policy menu, and timeline labels remain usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/records");

  const enterWorkspace = page.getByRole("button", { name: "Enter records workspace" });
  await expect(enterWorkspace).toBeEnabled();
  await enterWorkspace.click();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Calendar", exact: true })).toBeVisible();
  const calendarScroll = page.getByTestId("calendar-scroll");
  await expect(calendarScroll).toBeVisible();
  const calendarMetrics = await calendarScroll.evaluate((element) => {
    const day = element.querySelector<HTMLElement>("[data-calendar-day]");
    const selectedDay = element.querySelector<HTMLElement>('[data-calendar-selected="true"]');
    const weekendCells = element.querySelectorAll<HTMLElement>('[data-calendar-weekend="true"]');
    const weekendShading = element.querySelectorAll<HTMLElement>('[data-testid="calendar-weekend-shading"]');
    const exposedBlankCells = element.querySelectorAll<HTMLElement>(
      'button:disabled:not([data-calendar-day]):not([aria-hidden="true"])'
    );
    const scrollerRect = element.getBoundingClientRect();
    const selectedRect = selectedDay?.getBoundingClientRect();
    return {
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      dayWidth: day?.getBoundingClientRect().width || 0,
      touchAction: day ? window.getComputedStyle(day).touchAction : "",
      selectedDayVisible: Boolean(
        selectedRect &&
          selectedRect.left >= scrollerRect.left &&
          selectedRect.right <= scrollerRect.right
      ),
      selectedUsesInsetHighlight: selectedDay?.classList.contains("ring-inset") || false,
      selectedUsesOffsetHighlight: selectedDay?.classList.contains("ring-offset-1") || false,
      weekendCellCount: weekendCells.length,
      weekendShadingCount: weekendShading.length,
      exposedBlankCellCount: exposedBlankCells.length,
    };
  });
  expect(calendarMetrics.scrollWidth).toBeLessThanOrEqual(calendarMetrics.clientWidth + 1);
  expect(calendarMetrics.dayWidth).toBeGreaterThanOrEqual(35);
  expect(calendarMetrics.dayWidth).toBeLessThanOrEqual(50);
  expect(calendarMetrics.touchAction).toBe("pan-y");
  expect(calendarMetrics.selectedDayVisible).toBe(true);
  expect(calendarMetrics.selectedUsesInsetHighlight).toBe(true);
  expect(calendarMetrics.selectedUsesOffsetHighlight).toBe(false);
  expect(calendarMetrics.weekendCellCount).toBeGreaterThanOrEqual(8);
  expect(calendarMetrics.weekendShadingCount).toBe(calendarMetrics.weekendCellCount);
  expect(calendarMetrics.exposedBlankCellCount).toBe(0);
  await expect(page.locator('[data-calendar-weekend-header="true"]')).toHaveCount(2);
  await expect(page.getByText("Weekend", { exact: true })).toBeVisible();
  const colorTools = page.getByTestId("calendar-color-tools");
  await expect(colorTools).not.toHaveAttribute("open", "");
  await colorTools.locator("summary").click();
  await expect(colorTools).toHaveAttribute("open", "");
  const mobileBluePaintColor = page.getByRole("button", {
    name: "Paint calendar color: Blue",
  });
  await mobileBluePaintColor.click();
  await expect(mobileBluePaintColor).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Automatic color", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Multi-day paint: Off" })).toHaveAttribute("aria-pressed", "false");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);

  const policyFooter = page.getByTestId("workspace-policy-footer");
  await expect(policyFooter).toBeVisible();
  await expect(page.getByRole("link", { name: "Privacy", exact: true })).toBeVisible();
  await expect(policyFooter).toContainText("Records are private by default");
  await expect(policyFooter).toContainText("This tool helps organize records and does not provide legal advice");
  const policyFooterBox = await policyFooter.boundingBox();
  expect(policyFooterBox?.height).toBeLessThanOrEqual(220);

  const timelineNavButton = page.locator("aside nav button").filter({ hasText: "Timeline" });
  await expect(timelineNavButton).toHaveCount(1);
  await timelineNavButton.click();
  await expect(page.getByRole("heading", { name: "Timeline", exact: true })).toBeVisible();
  const timelineControls = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Timeline controls", exact: true }),
  });
  await expect(
    timelineControls.locator("span").filter({ hasText: /^Recorded issue$/ }).first()
  ).toBeVisible();
  await expect(page.getByText("Needs review", { exact: true })).toHaveCount(0);
});

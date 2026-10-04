// Headless UI test (Playwright): start a career, run a 4-week plan, auto-run to season end,
// exercise every tab, resolve an event if one appears, reload persistence, no console errors.
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push("console: " + m.text()); });
  const shots = path.resolve(__dirname, "../../.shots");
  fs.mkdirSync(shots, { recursive: true });
  await page.goto("file://" + path.resolve(__dirname, "../index.html"));
  await page.fill("#name", "佐藤 大和"); await page.fill("#seed", "2026");
  await page.click('.origin[data-o="junior"]'); await page.click("#start");
  await page.waitForSelector(".topbar");
  await page.screenshot({ path: shots + "/00_home.png", fullPage: true });
  // open the planner, pick the first enterable tournament card in week 1
  await page.click('.rail .nav[data-tab="plan"]');
  await page.waitForSelector(".planner");
  const card = await page.$(".pcol .tcard:not(.disabled)");
  if (card) { await card.click(); await page.waitForSelector(".tcard.sel"); }
  await page.screenshot({ path: shots + "/01_plan.png", fullPage: true });
  let viewers = 0;
  // wait for a run to finish, driving the live match viewer when it appears
  async function settle() {
    for (let i = 0; i < 400; i++) {
      const v = await page.$(".viewer");
      if (v) {
        viewers++;
        if (viewers === 1) { await page.waitForTimeout(1200); await page.screenshot({ path: shots + "/09_viewer.png", fullPage: false }); await page.selectOption("#v-planSel", "aggressive"); }
        await page.click("#v-skip"); await page.click("#v-done"); continue;
      }
      if (await page.$('.rail .nav.active[data-tab="report"]')) return;
      await page.waitForTimeout(50);
    }
    throw new Error("run did not settle");
  }
  await page.click('[data-run="4"]');
  await settle();
  await page.screenshot({ path: shots + "/02_report.png", fullPage: true });
  const bb = await page.$("[data-bracket]");
  if (bb) { await bb.click(); await page.waitForSelector(".bracket"); await page.waitForTimeout(400); await page.screenshot({ path: shots + "/13_bracket.png", fullPage: false }); const mine = await page.$("[data-bmine]"); if (mine) { await mine.click(); await page.waitForSelector(".bracket"); } await page.click("[data-close]"); console.log("bracket opened"); }
  async function closeModals() {
    for (let i = 0; i < 5; i++) {
      const choice = await page.$("[data-choice]");
      if (choice) { await choice.click(); continue; }
      const close = await page.$("[data-close]");
      if (close) { await close.click(); continue; }
      break;
    }
  }
  await closeModals();
  // team: hire first coach, enable physio
  await page.click('.rail .nav[data-tab="team"]');
  const hire = await page.$("[data-hire]"); if (hire) await hire.click();
  await page.check('[data-staff="physio"]');
  const lockedCount = await page.$$eval("[data-staff][disabled]", (els) => els.length);
  console.log("locked staff slots:", lockedCount);
  await page.screenshot({ path: shots + "/03_team.png", fullPage: true });
  // auto-run with only season/injury/event stops until the season modal shows
  await page.click('.rail .nav[data-tab="plan"]');
  for (const k of ["stopTournament", "stopMilestone", "stopInjury", "stopRival"]) { const cb = await page.$(`[data-set="${k}"]`); if (cb) await cb.uncheck(); }
  let seasonSeen = false, eventSeen = false;
  for (let i = 0; i < 12 && !seasonSeen; i++) {
    await page.click('.rail .nav[data-tab="plan"]');
    const btn = await page.$("[data-auto]") || await page.$('[data-run="1"]');
    await btn.click();
    await settle();
    const modal = await page.$(".modal");
    if (modal) {
      const txt = await modal.textContent();
      if (txt.includes("シーズン総括")) { seasonSeen = true; await page.screenshot({ path: shots + "/04_season.png", fullPage: false }); }
      else if (await page.$("[data-choice]")) { eventSeen = true; await page.screenshot({ path: shots + "/05_event.png", fullPage: false }); }
      await closeModals();
    }
  }
  // player modal from the ranking table
  await page.click('.rail .nav[data-tab="ranking"]');
  await page.click("[data-player]");
  await page.waitForSelector(".modal");
  console.log("player modal:", (await page.textContent(".modal")).replace(/\s+/g, " ").slice(0, 80));
  await page.screenshot({ path: shots + "/12_player_modal.png", fullPage: false });
  await page.click("[data-close]");
  for (const t of ["ranking", "calendar", "player", "finance", "records", "settings"]) {
    await page.click(`.rail .nav[data-tab="${t}"]`);
    await page.waitForSelector("#content .panel");
    await page.screenshot({ path: shots + `/06_${t}.png`, fullPage: t === "player" });
  }
  const header = (await page.textContent(".topbar")).replace(/\s+/g, " ");
  console.log("header:", header.slice(0, 200));
  console.log("season modal:", seasonSeen, "| event seen:", eventSeen, "| live viewers:", viewers);
  await page.reload(); await page.waitForSelector(".topbar");
  console.log("reload ok");
  await browser.close();
  if (errors.length) { console.log("ERRORS:\n" + errors.join("\n")); process.exit(1); }
  console.log("no console errors");
})().catch((e) => { console.error(e); process.exit(1); });

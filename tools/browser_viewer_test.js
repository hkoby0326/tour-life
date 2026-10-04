// Loads a save of a top-ranked player and checks the live match viewer renders and reacts.
const path = require("path"); const fs = require("fs"); const { chromium } = require("playwright");
(async () => {
  const save = fs.readFileSync(process.argv[2], "utf8");
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push("console: " + m.text()); });
  await page.addInitScript((sv) => { localStorage.setItem("tourlife_v1", sv); }, save);
  await page.goto("file://" + path.resolve(__dirname, "../index.html"));
  await page.waitForSelector(".topbar");
  await page.click('.rail .nav[data-tab="plan"]');
  await page.waitForSelector(".planner");
  const shots = path.resolve(__dirname, "../../.shots");
  let viewers = 0, screenshotDone = false;
  await page.click('[data-run="4"]');
  for (let i = 0; i < 600; i++) {
    const v = await page.$(".viewer");
    if (v) {
      viewers++;
      if (!screenshotDone) {
        await page.waitForTimeout(1500);
        await page.click("#v-play"); // pause
        await page.click("#v-set"); // finish the set -> between-sets banner
        await page.screenshot({ path: shots + "/09_viewer.png", fullPage: false });
        const banner = await page.textContent("#v-banner");
        console.log("banner after set:", banner.trim().slice(0, 60));
        await page.selectOption("#v-planSel", "aggressive");
        const feed = await page.textContent("#v-feed");
        console.log("feed has plan switch:", feed.includes("攻撃的"));
        screenshotDone = true;
      }
      await page.click("#v-skip"); await page.click("#v-done"); continue;
    }
    if (await page.$('.rail .nav.active[data-tab="report"]')) break;
    await page.waitForTimeout(50);
  }
  console.log("viewers:", viewers);
  for (let i = 0; i < 5; i++) { const ch = await page.$("[data-choice]"); if (ch) { await ch.click(); continue; } const cl = await page.$("[data-close]"); if (cl) { await cl.click(); continue; } break; }
  await page.click('.rail .nav[data-tab="finance"]');
  await page.screenshot({ path: shots + "/10_finance.png", fullPage: true });
  await page.click('.rail .nav[data-tab="report"]');
  await page.screenshot({ path: shots + "/11_report_top.png", fullPage: false });
  await browser.close();
  if (errors.length) { console.log("ERRORS:\n" + errors.join("\n")); process.exit(1); }
  console.log("no console errors");
})().catch((e) => { console.error(e); process.exit(1); });

// Phone viewport (390x844) smoke test with screenshots of the main screens.
const path = require("path"); const fs = require("fs"); const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push("console: " + m.text()); });
  const shots = path.resolve(__dirname, "../../.shots/m"); fs.mkdirSync(shots, { recursive: true });
  const save = process.argv[2] ? fs.readFileSync(process.argv[2], "utf8") : null;
  if (save) await page.addInitScript((sv) => { localStorage.setItem("tourlife_v1", sv); }, save);
  await page.goto("file://" + path.resolve(__dirname, "../index.html"));
  if (!save) { await page.screenshot({ path: shots + "/setup.png" }); await page.fill("#name", "佐藤 大和"); await page.click('.origin[data-o="junior"]'); await page.click("#start"); }
  await page.waitForSelector(".topbar");
  await page.screenshot({ path: shots + "/home.png" });
  await page.click('.rail .nav[data-tab="plan"]'); await page.waitForSelector(".planner");
  await page.screenshot({ path: shots + "/plan.png" });
  await page.click('[data-wtab="1"]'); await page.waitForSelector(".pcol.active");
  await page.click("[data-more]"); await page.waitForSelector("[data-goto]"); await page.waitForTimeout(350); await page.screenshot({ path: shots + "/more.png" });
  await page.click('[data-goto="team"]'); await page.waitForSelector("#content .panel"); await page.screenshot({ path: shots + "/team.png" });
  await page.click('.rail .nav[data-tab="plan"]'); await page.waitForSelector(".planner");
  let viewers = 0, shotV = false;
  await page.click('[data-run="4"]');
  for (let i = 0; i < 600; i++) {
    const v = await page.$(".viewer");
    if (v) { viewers++; if (!shotV) { await page.waitForTimeout(1200); await page.screenshot({ path: shots + "/viewer.png" }); shotV = true; } await page.click("#v-skip"); await page.click("#v-done"); continue; }
    if (await page.$('.rail .nav.active[data-tab="report"]')) break;
    await page.waitForTimeout(50);
  }
  for (let i = 0; i < 4; i++) { const ch = await page.$("[data-choice]"); if (ch) { await ch.click(); continue; } const cl = await page.$("[data-close]"); if (cl) { await cl.click(); continue; } break; }
  await page.screenshot({ path: shots + "/report.png" });
  const bb = await page.$("[data-bracket]"); if (bb) { await bb.click(); await page.waitForSelector(".bracket"); await page.waitForTimeout(400); await page.screenshot({ path: shots + "/bracket.png" }); await page.click("[data-close]"); }
  await page.click("[data-more]"); await page.waitForSelector("[data-goto]"); await page.click('[data-goto="player"]'); await page.waitForSelector(".radar"); await page.screenshot({ path: shots + "/player.png", fullPage: true });
  await page.click('.rail .nav[data-tab="ranking"]'); await page.waitForSelector("#content .panel"); await page.screenshot({ path: shots + "/ranking.png" });
  const hasHScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  console.log("viewers:", viewers, "| horizontal page scroll:", hasHScroll);
  await browser.close();
  if (errors.length) { console.log("ERRORS:\n" + errors.join("\n")); process.exit(1); }
  if (hasHScroll) { console.log("FAIL: page scrolls horizontally"); process.exit(1); }
  console.log("mobile ok");
})().catch((e) => { console.error(e); process.exit(1); });

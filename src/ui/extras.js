// Profile extras (UI-6) and season "wrapped" cards, hall of fame, share card (UI-7).
(function () {
  const U = TL.UI, W = U.W, D = U.D;
  const { esc, flag, money, signed } = U;
  const AXES = [["serve", "サーブ"], ["return", "リターン"], ["fh", "フォア"], ["bh", "バック"], ["net", "ネット"], ["speed", "スピード"], ["stamina", "スタミナ"], ["power", "パワー"], ["clutch", "クラッチ"], ["focus", "集中"], ["durability", "耐久"]];
  // Radar chart of the 11 attributes; optional second series (e.g. rival) in red.
  U.radarSvg = function (attrs, attrs2) {
    const n = AXES.length, cx = 110, cy = 105, R = 78;
    const pt = (i, v) => { const a = -Math.PI / 2 + (i / n) * Math.PI * 2; const r = (R * v) / 100; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
    const ring = (v) => AXES.map((_, i) => pt(i, v).join(",")).join(" ");
    const poly = (a) => AXES.map(([k], i) => pt(i, a[k] || 0).join(",")).join(" ");
    const labels = AXES.map(([k, l], i) => { const [x, y] = pt(i, 122); return `<text x="${x.toFixed(1)}" y="${(y + 3).toFixed(1)}">${l}</text>`; }).join("");
    const axes = AXES.map((_, i) => { const [x, y] = pt(i, 100); return `<line class="axis" x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`; }).join("");
    return `<svg class="radar" viewBox="0 0 220 215">${[25, 50, 75, 100].map((v) => `<polygon class="grid" points="${ring(v)}"/>`).join("")}${axes}${attrs2 ? `<polygon class="area2" points="${poly(attrs2)}"/>` : ""}<polygon class="area" points="${poly(attrs)}"/>${labels}</svg>`;
  };
  const CAT_ICON = { GS: ["🏆", "gs", "グランドスラム"], FINALS: ["👑", "gs", "ATPファイナルズ"], M1000L: ["🥇", "m", "ATP 1000"], M1000S: ["🥇", "m", "ATP 1000"], A500L: ["🏅", "f", "ATP 500"], A500: ["🏅", "f", "ATP 500"], A250: ["🎖", "t", "ATP 250"], A250B: ["🎖", "t", "ATP 250"] };
  U.trophyCase = function (titles) {
    const groups = { gs: 0, m: 0, f: 0, t: 0, lower: 0 };
    const oly = U.human().stats.oly;
    for (const t of titles) { const c = CAT_ICON[t.cat]; if (c) groups[c[1]]++; else groups.lower++; }
    const cell = (ic, n, l, cls) => `<div class="trophy ${cls} ${n ? "" : "empty"}"><div class="ic">${ic}</div><div class="n">${n}</div><div class="l">${l}</div></div>`;
    return `<div class="trophies">${cell("🏆", groups.gs, "GS・Finals", "gs")}${cell("🥇", groups.m, "ATP 1000", "m")}${cell("🏅", groups.f, "ATP 500", "f")}${cell("🎖", groups.t, "ATP 250", "t")}${cell("🏵", groups.lower, "CH・ITF", "")}${oly && (oly.g || oly.s || oly.b) ? cell("🥇🥈🥉", `${oly.g}/${oly.s}/${oly.b}`, "五輪 金/銀/銅", "gs") : ""}</div>
      ${titles.length ? `<div class="titlelist">${titles.slice().reverse().slice(0, 24).map((t) => `<span class="pill ${t.surface}">${U.cal(t.year)} ${esc(t.name)}</span>`).join("")}${titles.length > 24 ? `<span class="pill">+${titles.length - 24}</span>` : ""}</div>` : '<p class="small muted" style="margin-top:8px">まだタイトルがない</p>'}`;
  };
  U.timelineHtml = function (seasons, current) {
    const cells = seasons.map((z) => `<div class="yr"><div class="muted">${z.calendarYear || z.y}<br><span class="tiny">${z.age}歳</span></div><div class="r ${z.rank && z.rank <= 10 ? "top10" : z.rank && z.rank <= 50 ? "top50" : ""}">${z.rank ? z.rank : "-"}</div><div>${z.w}-${z.l}</div>${(z.titles && z.titles.length) || z.titles > 0 ? `<div class="t">🏆×${Array.isArray(z.titles) ? z.titles.length : z.titles}</div>` : ""}${z.injuries && z.injuries.length ? `<div class="i">🩹×${z.injuries.length}</div>` : ""}</div>`);
    if (current) cells.push(`<div class="yr now"><div class="muted">${U.cal()}<br><span class="tiny">${current.age}歳</span></div><div class="r ${current.rank && current.rank <= 10 ? "top10" : current.rank && current.rank <= 50 ? "top50" : ""}">${current.rank || "-"}</div><div>${current.w}-${current.l}</div><div class="tiny muted">進行中</div></div>`);
    return `<div class="timeline">${cells.join("") || '<span class="muted small">まだシーズンを終えていない</span>'}</div>`;
  };

  // ---------- season wrapped ----------
  U.seasonHtml = function (z) {
    const S = U.S, me = U.human();
    const ATTRL = U.ATTRL;
    const growth = (z.attrDelta || []).slice(0, 3);
    const cards = [
      `<div class="wrapped c1"><div class="k">${z.calendarYear} Season</div><div class="big">${z.rank ? z.rank + "位" : "—"}</div><div class="mid">年末ランキング</div><div class="sub">${z.w}勝${z.l}敗 ・ ${z.tournaments || 0}大会 ・ タイトル${z.titles.length}${z.upsets ? ` ・ 金星${z.upsets}` : ""}<br>年間賞金 ${money(z.prize)}</div></div>`,
      `<div class="wrapped c2"><div class="k">Best match</div><div class="mid">${esc(z.bestWin)}</div>${z.titles.length ? `<div class="sub"><b>優勝</b><br>${z.titles.map(esc).join("<br>")}</div>` : '<div class="sub">今季はタイトルなし。来季に</div>'}</div>`,
      `<div class="wrapped c3"><div class="k">Growth</div>${growth.length ? `<div class="list">${growth.map(([k, v]) => `<div><b>${ATTRL[k]}</b> ${signed(v)}</div>`).join("")}</div>` : '<div class="mid">成長なし</div>'}<div class="sub">${esc(z.coach)}${z.ovrDelta !== null && z.ovrDelta !== undefined ? `<br>総合 ${signed(z.ovrDelta)}` : ""}</div></div>`,
      z.rivalH2H ? `<div class="wrapped c4"><div class="k">Rival</div><div class="mid">${esc(z.rivalH2H.name)}</div><div class="big">${z.rivalH2H.w}-${z.rivalH2H.l}</div><div class="sub">今季の対戦 ・ 相手は${z.rivalH2H.rank ? z.rivalH2H.rank + "位" : "ランク外"}、今季${z.rivalH2H.titles}勝</div></div>` : null,
      `<div class="wrapped c5"><div class="k">Next season</div><div class="mid">来季の防衛ポイント</div><div class="list"><div>1〜3月 <b>${z.defend[0]}</b></div><div>4〜6月 <b>${z.defend[1]}</b></div><div>7〜9月 <b>${z.defend[2]}</b></div><div>10〜12月 <b>${z.defend[3]}</b></div></div><div class="sub">${z.injuries && z.injuries.length ? `今季の怪我: ${z.injuries.map(esc).join("、")}<br>` : ""}資金 ${money(z.money)} ・ チームタブに新しいコーチ候補</div></div>`,
      `<div class="wrapped c6"><div class="k">The tour</div><div class="mid">年末No.1 ${esc(z.no1)}</div><div class="sub">${z.gsWinners.map(esc).join("<br>")}${z.retired.length ? `<br><br>引退: ${z.retired.map(esc).join("、")}` : ""}${z.newcomer ? `<br>${esc(z.newcomer)}` : ""}</div></div>`,
    ].filter(Boolean);
    U.wrappedIdx = 0;
    U.wrappedCards = cards;
    return `<div id="wrap-host">${cards[0]}</div><div class="wnav"><button class="small" data-wprev>前へ</button><div class="wdots" id="wrap-dots">${cards.map((_, i) => `<i class="${i === 0 ? "on" : ""}"></i>`).join("")}</div><button class="small" data-wnext>次へ</button></div><div class="row" style="margin-top:10px;justify-content:space-between"><button class="small" data-share>画像で保存</button><button class="primary" data-close>閉じる</button></div>`;
  };
  U.bindWrapped = function (root) {
    const host = root.querySelector("#wrap-host"); if (!host) return;
    const show = (i) => { U.wrappedIdx = (i + U.wrappedCards.length) % U.wrappedCards.length; host.innerHTML = U.wrappedCards[U.wrappedIdx]; root.querySelectorAll("#wrap-dots i").forEach((d, k) => d.classList.toggle("on", k === U.wrappedIdx)); };
    root.querySelector("[data-wprev]").onclick = () => show(U.wrappedIdx - 1);
    root.querySelector("[data-wnext]").onclick = () => show(U.wrappedIdx + 1);
    host.onclick = () => show(U.wrappedIdx + 1);
    let x0 = null;
    host.ontouchstart = (e) => { x0 = e.touches[0].clientX; };
    host.ontouchend = (e) => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) show(U.wrappedIdx + (dx < 0 ? 1 : -1)); x0 = null; };
    const sh = root.querySelector("[data-share]"); if (sh) sh.onclick = () => U.shareCard();
  };

  // ---------- share card (canvas → PNG) ----------
  U.shareCard = function (ep) {
    const S = U.S, me = U.human();
    const e = ep || S.human.epilogue;
    const W2 = 1080, H2 = 1350;
    const cv = document.createElement("canvas"); cv.width = W2; cv.height = H2;
    const g = cv.getContext("2d");
    const grad = g.createLinearGradient(0, 0, W2, H2); grad.addColorStop(0, "#0f172a"); grad.addColorStop(0.6, "#1d4ed8"); grad.addColorStop(1, "#22d3ee");
    g.fillStyle = grad; g.fillRect(0, 0, W2, H2);
    g.fillStyle = "rgba(0,0,0,.35)"; g.fillRect(60, 60, W2 - 120, H2 - 120);
    const font = (w, s) => { g.font = `${w} ${s}px Inter, "Noto Sans JP", sans-serif`; };
    g.fillStyle = "#fff"; g.textAlign = "left";
    font(800, 34); g.fillText("TOUR LIFE", 110, 140);
    font(900, 72); g.fillText(me.name, 110, 240);
    font(500, 32); g.fillStyle = "rgba(255,255,255,.85)"; g.fillText(`${D.COUNTRIES[me.country].name} ・ ${W.age(S, me)}歳 ・ ${U.ORIGINS[S.config.origin].name}`, 110, 295);
    if (e && e.tag) { font(800, 48); g.fillStyle = "#fbbf24"; g.fillText(`「${e.tag}」`, 110, 380); }
    const st = me.stats;
    const kpis = [[st.bestRank ? st.bestRank + "位" : "-", "最高ランキング"], [String(st.titles), "タイトル"], [String(st.gs), "グランドスラム"], [String(st.weeksNo1), "No.1 在位週"], [`${st.w}-${st.l}`, "通算成績"], [money(st.prize), "生涯賞金"]];
    kpis.forEach(([v, l], i) => { const x = 110 + (i % 3) * 300, y = 520 + Math.floor(i / 3) * 170; g.fillStyle = "#fff"; font(900, 56); g.fillText(v, x, y); g.fillStyle = "rgba(255,255,255,.7)"; font(500, 24); g.fillText(l, x, y + 36); });
    // rank timeline
    const seasons = S.history.seasons;
    if (seasons.length >= 1) {
      const x0 = 110, y0 = 900, w = W2 - 220, h = 200;
      g.strokeStyle = "rgba(255,255,255,.25)"; g.lineWidth = 2; g.strokeRect(x0, y0, w, h);
      const ranks = seasons.map((z) => z.rank || 400);
      const maxR = Math.max(...ranks, 50);
      g.strokeStyle = "#fbbf24"; g.lineWidth = 6; g.lineJoin = "round"; g.beginPath();
      ranks.forEach((r, i) => { const x = x0 + (seasons.length === 1 ? w / 2 : (i / (seasons.length - 1)) * w); const y = y0 + (Math.log(r) / Math.log(maxR)) * h; i ? g.lineTo(x, y) : g.moveTo(x, y); });
      g.stroke();
      g.fillStyle = "rgba(255,255,255,.7)"; font(500, 22); g.fillText(`年末ランキングの推移 ${seasons[0].calendarYear}〜${seasons[seasons.length - 1].calendarYear}`, x0, y0 - 14);
    }
    font(500, 24); g.fillStyle = "rgba(255,255,255,.6)"; g.fillText(`${U.cal()}年 第${S.week}週 ・ hkoby0326.github.io/tour-life`, 110, H2 - 100);
    cv.toBlob((blob) => {
      const file = new File([blob], `tourlife_${me.name}.png`, { type: "image/png" });
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file], title: "Tour Life" }).catch(() => {}); return; }
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
    }, "image/png");
    U.toast("キャリアカードを画像で保存しました", "green");
  };
  // Grand Slam / Masters / Finals performance timeline (v2.5), Wikipedia-style.
  U.bigTimelineHtml = function (p, opts) {
    const S = U.S;
    const tl = W.bigTimeline(S, p);
    if (!tl) return `<p class="small muted">まだグランドスラム・マスターズの出場記録がない${p.isHuman ? "" : "（記録は v2.5 以降）"}。</p>`;
    let years = tl.years;
    if (p.isHuman) { const all = []; for (let y = Math.min(years[0], S.year); y <= S.year; y++) all.push(y); years = all; }
    if (opts && opts.last) years = years.slice(-opts.last);
    const drawN = (cat) => Math.pow(2, Math.ceil(Math.log2(D.CATS[cat].draw)));
    // convert "R64" etc. into the round number for that event's draw size
    const label = (code, cat) => {
      if (!code) return "";
      if (code === "W" || code === "F" || code === "SF" || code === "QF" || code === "RR") return code;
      if (code === "Q") return "Q";
      const n = parseInt(code.slice(1), 10);
      return Math.round(Math.log2(drawN(cat)) - Math.log2(n) + 1) + "R";
    };
    const cls = (code) => (code === "W" ? "w" : code === "F" ? "f" : code === "SF" ? "sf" : code === "QF" ? "qf" : code === "Q" ? "q" : code === "RR" ? "rr" : code ? "e" : "a");
    const groups = [["GS", "グランドスラム"], ["M1000", "マスターズ1000"], ["FINALS", "ATPファイナルズ"]];
    const head = `<tr><th class="sticky">大会</th>${years.map((y) => `<th class="num">${U.cal(y)}</th>`).join("")}<th class="num">最高</th><th class="num">優勝</th></tr>`;
    let body = "";
    for (const [g, gl] of groups) {
      const rows = tl.rows.filter((r) => (g === "M1000" ? r.cat.startsWith("M1000") : r.cat === g));
      if (opts && opts.compact && !rows.some((r) => r.played)) continue;
      body += `<tr class="grp"><td class="sticky">${gl}</td><td colspan="${years.length + 2}"></td></tr>`;
      for (const r of rows) {
        if (opts && opts.compact && !r.played) continue;
        body += `<tr><td class="sticky"><span class="sdot2 ${r.surface}"></span>${esc(r.name)}</td>${years.map((y) => { const c = r.cells[y]; const future = y === S.year && r.week >= S.week; return `<td class="cell ${cls(c)}">${c ? label(c, r.cat) : p.isHuman && !future ? "A" : ""}</td>`; }).join("")}<td class="num small">${r.best ? label(r.best, r.cat) : "-"}</td><td class="num small ${r.titles ? "gold" : "muted"}">${r.titles || "-"}</td></tr>`;
      }
    }
    body += `<tr class="sum"><td class="sticky">GS 勝敗</td>${years.map((y) => { const x = tl.gsWL[y]; return `<td class="num small">${x && x[0] + x[1] ? `${x[0]}-${x[1]}` : ""}</td>`; }).join("")}<td></td><td></td></tr>`;
    if (p.isHuman) body += `<tr class="sum"><td class="sticky">年末順位</td>${years.map((y) => `<td class="num small">${tl.yearEnd[y] || (y === S.year ? (p.rank || "-") + "*" : "")}</td>`).join("")}<td></td><td></td></tr>`;
    return `<div class="tscroll"><table class="ptl">${head}${body}</table></div>
      <p class="tiny muted" style="margin-top:4px">W 優勝 ・ F 準優勝 ・ SF ベスト4 ・ QF ベスト8 ・ 1R〜4R 敗退ラウンド ・ RR ラウンドロビン敗退 ・ Q 予選敗退${p.isHuman ? " ・ A 不出場 ・ * 現在" : ""}</p>`;
  };
})();

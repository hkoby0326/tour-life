(function () {
  const U = TL.UI;
  window.addEventListener("error", (ev) => { if (U.showFatal) U.showFatal(ev.error || ev.message, "エラーが発生しました"); });
  window.addEventListener("unhandledrejection", (ev) => { if (U.showFatal) U.showFatal(ev.reason, "エラーが発生しました"); });
  try { U.load(); U.render(); if (U.loadError) U.showFatal(U.loadError.e, "セーブデータの読み込みに失敗"); }
  catch (e) { console.error(e); if (U.showFatal) U.showFatal(e, "起動時にエラー"); }
})();

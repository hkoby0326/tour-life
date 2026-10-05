// Sponsor brands (all fictional). Unlocked by current ranking; pay scales with ranking at signing.
(function (g) {
  const D = g.TL.DATA;
  D.SPONSOR_CATS = { racket: "ラケット", apparel: "ウエア", shoes: "シューズ", other: "その他" };
  D.SPONSOR_SHARE = { racket: 0.3, apparel: 0.35, shoes: 0.15, other: 0.1 };
  // perk: serve/ret/rally = in-match component bonus; injury = injury-rate multiplier; recovery = fatigue recovery per week;
  // travel = travel-cost multiplier; rehab = rehab-cost multiplier; focus = obligation (focus penalty while signed)
  D.SPONSORS = {
    racket: [
      { id: "nova", name: "ノヴァ・ラケッツ", unlock: 400, tier: 0.45, perk: { rally: 0.3 }, bonus: { title: 5 }, desc: "若手向けの新興ブランド。契約は小さいが縛りも少ない" },
      { id: "blade", name: "ブレイドワークス", unlock: 150, tier: 0.7, perk: { serve: 0.5 }, bonus: { title: 15, m1000: 40 }, desc: "攻撃型フレーム。サーブに乗る" },
      { id: "zenith", name: "ゼニス", unlock: 60, tier: 0.85, perk: { rally: 0.6, serve: 0.3 }, bonus: { title: 20, m1000: 50, gs: 150 }, desc: "ツアーで最も使われているフレーム。バランス型" },
      { id: "apollon", name: "アポロン・プロ", unlock: 15, tier: 1.0, perk: { serve: 0.6, rally: 0.6, ret: 0.3, focus: 0.3 }, bonus: { title: 30, m1000: 100, gs: 400 }, desc: "トップ選手専用ライン。撮影・イベントの義務が多い（集中力 −0.3）" },
    ],
    apparel: [
      { id: "courtline", name: "コートライン", unlock: 400, tier: 0.45, perk: {}, bonus: { title: 5 }, desc: "量販ブランド。支給品のみ、現金は少ない" },
      { id: "velos", name: "ヴェロス", unlock: 120, tier: 0.7, perk: { recovery: 1 }, bonus: { title: 15, gs: 100 }, desc: "機能素材で疲労回復 ＋1/週" },
      { id: "aero", name: "エアロ・スポーツ", unlock: 40, tier: 0.85, perk: { recovery: 2, focus: 0.3 }, bonus: { title: 25, m1000: 60, gs: 250 }, desc: "世界的ブランド。回復 ＋2/週、撮影義務（集中力 −0.3）" },
      { id: "lux", name: "ルクス・アスレチカ", unlock: 10, tier: 1.0, perk: { recovery: 2, focus: 0.6 }, bonus: { title: 40, m1000: 120, gs: 500 }, desc: "ラグジュアリー路線。最高額だが露出義務が重い（集中力 −0.6）" },
    ],
    shoes: [
      { id: "grip", name: "グリップマスター", unlock: 400, tier: 0.45, perk: { injury: 0.97 }, bonus: { title: 3 }, desc: "堅実な定番。怪我 ×0.97" },
      { id: "stride", name: "ストライド", unlock: 150, tier: 0.7, perk: { injury: 0.95, ret: 0.3 }, bonus: { title: 10 }, desc: "軽量モデル。怪我 ×0.95、リターン ＋0.3" },
      { id: "aerofoot", name: "エアロ・フット", unlock: 50, tier: 0.85, perk: { injury: 0.92, recovery: 1 }, bonus: { title: 15, gs: 100 }, desc: "怪我 ×0.92、回復 ＋1/週" },
      { id: "velosfoot", name: "ヴェロス・プロフット", unlock: 15, tier: 1.0, perk: { injury: 0.9, ret: 0.4 }, bonus: { title: 25, m1000: 60, gs: 200 }, desc: "選手ごとに成形。怪我 ×0.9、リターン ＋0.4" },
    ],
    other: [
      { id: "bank", name: "地元銀行", unlock: 300, tier: 0.5, perk: {}, bonus: { title: 5 }, desc: "母国の地方銀行。小さいが安定" },
      { id: "hydro", name: "ハイドロ・ドリンク", unlock: 200, tier: 0.6, perk: { recovery: 1 }, bonus: { title: 5 }, desc: "スポーツドリンク。回復 ＋1/週" },
      { id: "insure", name: "セーフガード保険", unlock: 150, tier: 0.6, perk: { rehab: 0.6 }, bonus: {}, desc: "治療・リハビリ費 −40%" },
      { id: "skyway", name: "スカイウェイ航空", unlock: 100, tier: 0.8, perk: { travel: 0.8, lag: 1 }, bonus: {}, desc: "移動費 −20%、長距離移動の疲労 −1" },
      { id: "crypto", name: "クリプト取引所", unlock: 80, tier: 1.6, perk: { focus: 0.3 }, bonus: { gs: 300 }, risky: true, desc: "破格の契約金。ただし年20%で破綻し契約消滅、評判低下（集中力 −1）" },
      { id: "auto", name: "オートモビル・ノルド", unlock: 30, tier: 1.0, perk: { travel: 0.9 }, bonus: { gs: 200 }, desc: "高級車メーカー。移動費 −10%" },
      { id: "watch", name: "タイムピース・ジュネーヴ", unlock: 50, tier: 1.3, perk: {}, bonus: { gs: 500, m1000: 100 }, desc: "高級時計。GS優勝ボーナスが大きい" },
    ],
  };
  D.SPONSOR_MAX_OTHER = 2;
})(typeof globalThis !== "undefined" ? globalThis : window);

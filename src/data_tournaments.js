// Tournament categories, the ATP calendar (approximation of the 2026 tour)
// and the procedural lower-tier (Challenger / ITF) schedule.
// Points tables follow the current ATP Rulebook as closely as practical;
// numbers marked approx are simplified.
(function (g) {
  const TL = (g.TL = g.TL || {});
  const D = (TL.DATA = TL.DATA || {});

  // points[i]: i=0 winner, 1 finalist, 2 SF, 3 QF, 4 R16, 5 R32, 6 R64, 7 R128
  // prize in thousands of USD, same indexing. qPts: points for qualifying.
  D.CATS = {
    GS: { label: "グランドスラム", short: "GS", tier: 9, draw: 128, q: 16, qRounds: 3, wc: 8, bo5: true, weeks: 2,
      points: [2000, 1300, 800, 400, 200, 100, 50, 10], qPts: 25,
      prize: [3600, 1900, 1000, 560, 330, 200, 130, 85], qPrize: 20 },
    M1000L: { label: "ATP 1000", short: "1000", tier: 8, draw: 96, q: 12, qRounds: 2, wc: 5, bo5: false, weeks: 2,
      points: [1000, 650, 400, 200, 100, 50, 30, 10], qPts: 20,
      prize: [1100, 590, 330, 180, 95, 55, 32, 20], qPrize: 10 },
    M1000S: { label: "ATP 1000", short: "1000", tier: 8, draw: 56, q: 7, qRounds: 2, wc: 4, bo5: false, weeks: 1,
      points: [1000, 650, 400, 200, 100, 50, 10], qPts: 20,
      prize: [1000, 530, 290, 150, 80, 45, 25], qPrize: 10 },
    A500L: { label: "ATP 500", short: "500", tier: 7, draw: 48, q: 6, qRounds: 2, wc: 4, bo5: false, weeks: 1,
      points: [500, 330, 200, 100, 50, 25, 0], qPts: 10,
      prize: [480, 260, 140, 75, 40, 22, 14], qPrize: 6 },
    A500: { label: "ATP 500", short: "500", tier: 7, draw: 32, q: 4, qRounds: 2, wc: 3, bo5: false, weeks: 1,
      points: [500, 330, 200, 100, 50, 0], qPts: 10,
      prize: [450, 240, 130, 70, 36, 20], qPrize: 6 },
    A250: { label: "ATP 250", short: "250", tier: 6, draw: 28, q: 4, qRounds: 2, wc: 3, bo5: false, weeks: 1,
      points: [250, 165, 100, 50, 25, 0], qPts: 6,
      prize: [150, 88, 52, 30, 17, 10], qPrize: 3 },
    A250B: { label: "ATP 250", short: "250", tier: 6, draw: 32, q: 4, qRounds: 2, wc: 3, bo5: false, weeks: 1,
      points: [250, 165, 100, 50, 25, 0], qPts: 6,
      prize: [150, 88, 52, 30, 17, 10], qPrize: 3 },
    CH175: { label: "Challenger 175", short: "CH175", tier: 5, draw: 32, q: 0, qRounds: 0, wc: 3, bo5: false, weeks: 1,
      points: [175, 100, 60, 32, 15, 0], qPts: 0, prize: [40, 23, 13, 7.5, 4.3, 2.6] },
    CH125: { label: "Challenger 125", short: "CH125", tier: 4, draw: 32, q: 0, qRounds: 0, wc: 3, bo5: false, weeks: 1,
      points: [125, 75, 45, 25, 13, 0], qPts: 0, prize: [25, 14.5, 8.5, 5, 2.9, 1.7] },
    CH100: { label: "Challenger 100", short: "CH100", tier: 4, draw: 32, q: 0, qRounds: 0, wc: 3, bo5: false, weeks: 1,
      points: [100, 60, 35, 20, 10, 0], qPts: 0, prize: [19, 11, 6.5, 3.8, 2.2, 1.3] },
    CH75: { label: "Challenger 75", short: "CH75", tier: 3, draw: 32, q: 0, qRounds: 0, wc: 3, bo5: false, weeks: 1,
      points: [75, 44, 26, 14, 7, 0], qPts: 0, prize: [12, 7, 4.2, 2.5, 1.5, 0.9] },
    CH50: { label: "Challenger 50", short: "CH50", tier: 3, draw: 32, q: 0, qRounds: 0, wc: 3, bo5: false, weeks: 1,
      points: [50, 30, 17, 9, 4, 0], qPts: 0, prize: [8, 4.7, 2.8, 1.7, 1.0, 0.6] },
    M25: { label: "ITF M25", short: "M25", tier: 2, draw: 32, q: 0, qRounds: 0, wc: 4, bo5: false, weeks: 1,
      points: [25, 16, 8, 3, 1, 0], qPts: 0, prize: [3.6, 2.1, 1.25, 0.73, 0.43, 0.26] },
    M15: { label: "ITF M15", short: "M15", tier: 1, draw: 32, q: 0, qRounds: 0, wc: 4, bo5: false, weeks: 1,
      points: [10, 6, 4, 2, 1, 0], qPts: 0, prize: [2.16, 1.27, 0.75, 0.44, 0.26, 0.16] },
    FINALS: { label: "ATP Finals", short: "Finals", tier: 10, draw: 8, q: 0, qRounds: 0, wc: 0, bo5: false, weeks: 1,
      points: [1500], qPts: 0, prize: [4800] },
  };

  D.SURFACES = { hard: "ハード", clay: "クレー", grass: "芝", indoor: "インドア" };

  // region: OCE, ASIA, EU, NA, SA, MEA
  D.COUNTRIES = {
    JPN: { name: "日本", region: "ASIA" }, USA: { name: "アメリカ", region: "NA" }, ESP: { name: "スペイン", region: "EU" },
    FRA: { name: "フランス", region: "EU" }, ITA: { name: "イタリア", region: "EU" }, GBR: { name: "イギリス", region: "EU" },
    AUS: { name: "オーストラリア", region: "OCE" }, GER: { name: "ドイツ", region: "EU" }, ARG: { name: "アルゼンチン", region: "SA" },
    SRB: { name: "セルビア", region: "EU" }, CHN: { name: "中国", region: "ASIA" }, BRA: { name: "ブラジル", region: "SA" },
    CAN: { name: "カナダ", region: "NA" }, SUI: { name: "スイス", region: "EU" }, NED: { name: "オランダ", region: "EU" },
    CZE: { name: "チェコ", region: "EU" }, RUS: { name: "ロシア", region: "EU" }, GRE: { name: "ギリシャ", region: "EU" },
    NOR: { name: "ノルウェー", region: "EU" }, DEN: { name: "デンマーク", region: "EU" }, POL: { name: "ポーランド", region: "EU" },
    BUL: { name: "ブルガリア", region: "EU" }, CRO: { name: "クロアチア", region: "EU" }, AUT: { name: "オーストリア", region: "EU" },
    BEL: { name: "ベルギー", region: "EU" }, POR: { name: "ポルトガル", region: "EU" }, HUN: { name: "ハンガリー", region: "EU" },
    KAZ: { name: "カザフスタン", region: "ASIA" }, CHI: { name: "チリ", region: "SA" }, COL: { name: "コロンビア", region: "SA" },
    MEX: { name: "メキシコ", region: "NA" }, KOR: { name: "韓国", region: "ASIA" }, IND: { name: "インド", region: "ASIA" },
    RSA: { name: "南アフリカ", region: "MEA" }, QAT: { name: "カタール", region: "MEA" }, UAE: { name: "UAE", region: "MEA" },
    MAR: { name: "モロッコ", region: "MEA" }, MON: { name: "モナコ", region: "EU" }, SWE: { name: "スウェーデン", region: "EU" },
    FIN: { name: "フィンランド", region: "EU" }, ROU: { name: "ルーマニア", region: "EU" }, BIH: { name: "ボスニア", region: "EU" },
    TPE: { name: "台湾", region: "ASIA" }, HKG: { name: "香港", region: "ASIA" }, NZL: { name: "ニュージーランド", region: "OCE" },
    TUN: { name: "チュニジア", region: "MEA" }, EGY: { name: "エジプト", region: "MEA" }, TUR: { name: "トルコ", region: "EU" },
    PER: { name: "ペルー", region: "SA" }, URU: { name: "ウルグアイ", region: "SA" }, ECU: { name: "エクアドル", region: "SA" },
  };
  D.PLAYABLE_COUNTRIES = ["JPN", "USA", "ESP", "FRA", "ITA", "GBR", "AUS", "GER", "ARG", "SRB", "CHN", "BRA", "CAN", "SUI"];

  // ATP tour calendar. week = starting week (1..52). Two-week events block the next week too.
  // [week, id, name, cat, surface, country]
  const C = [
    [1, "brisbane", "ブリスベン", "A250B", "hard", "AUS"],
    [1, "hongkong", "香港", "A250", "hard", "HKG"],
    [2, "adelaide", "アデレード", "A250", "hard", "AUS"],
    [2, "auckland", "オークランド", "A250", "hard", "NZL"],
    [3, "ao", "全豪オープン", "GS", "hard", "AUS"],
    [5, "montpellier", "モンペリエ", "A250", "indoor", "FRA"],
    [6, "rotterdam", "ロッテルダム", "A500", "indoor", "NED"],
    [6, "dallas", "ダラス", "A500", "indoor", "USA"],
    [6, "buenosaires", "ブエノスアイレス", "A250", "clay", "ARG"],
    [7, "doha", "ドーハ", "A500", "hard", "QAT"],
    [7, "rio", "リオデジャネイロ", "A500", "clay", "BRA"],
    [7, "delray", "デルレイビーチ", "A250", "hard", "USA"],
    [7, "marseille", "マルセイユ", "A250", "indoor", "FRA"],
    [8, "dubai", "ドバイ", "A500", "hard", "UAE"],
    [8, "acapulco", "アカプルコ", "A500", "hard", "MEX"],
    [8, "santiago", "サンティアゴ", "A250", "clay", "CHI"],
    [9, "indianwells", "インディアンウェルズ", "M1000L", "hard", "USA"],
    [11, "miami", "マイアミ", "M1000L", "hard", "USA"],
    [13, "houston", "ヒューストン", "A250", "clay", "USA"],
    [13, "marrakech", "マラケシュ", "A250", "clay", "MAR"],
    [13, "bucharest", "ブカレスト", "A250", "clay", "ROU"],
    [14, "montecarlo", "モンテカルロ", "M1000S", "clay", "MON"],
    [15, "barcelona", "バルセロナ", "A500L", "clay", "ESP"],
    [15, "munich", "ミュンヘン", "A500", "clay", "GER"],
    [16, "madrid", "マドリード", "M1000L", "clay", "ESP"],
    [18, "rome", "ローマ", "M1000L", "clay", "ITA"],
    [20, "hamburg", "ハンブルク", "A500", "clay", "GER"],
    [20, "geneva", "ジュネーブ", "A250", "clay", "SUI"],
    [21, "rg", "全仏オープン", "GS", "clay", "FRA"],
    [23, "stuttgart", "シュツットガルト", "A250", "grass", "GER"],
    [23, "hertogenbosch", "スヘルトーヘンボス", "A250", "grass", "NED"],
    [24, "halle", "ハレ", "A500", "grass", "GER"],
    [24, "queens", "クイーンズ", "A500", "grass", "GBR"],
    [25, "eastbourne", "イーストボーン", "A250", "grass", "GBR"],
    [25, "mallorca", "マヨルカ", "A250", "grass", "ESP"],
    [26, "wimbledon", "ウィンブルドン", "GS", "grass", "GBR"],
    [28, "bastad", "ボスタード", "A250", "clay", "SWE"],
    [28, "gstaad", "グシュタード", "A250", "clay", "SUI"],
    [28, "loscabos", "ロスカボス", "A250", "hard", "MEX"],
    [29, "umag", "ウマグ", "A250", "clay", "CRO"],
    [29, "atlanta", "アトランタ", "A250", "hard", "USA"],
    [30, "washington", "ワシントン", "A500L", "hard", "USA"],
    [30, "kitzbuhel", "キッツビューエル", "A250", "clay", "AUT"],
    [31, "canada", "カナダ", "M1000L", "hard", "CAN"],
    [33, "cincinnati", "シンシナティ", "M1000L", "hard", "USA"],
    [34, "winstonsalem", "ウィンストンセーラム", "A250B", "hard", "USA"],
    [35, "uso", "全米オープン", "GS", "hard", "USA"],
    [37, "chengdu", "成都", "A250", "hard", "CHN"],
    [37, "hangzhou", "杭州", "A250", "hard", "CHN"],
    [38, "tokyo", "ジャパンオープン（東京）", "A500", "hard", "JPN"],
    [38, "beijing", "北京", "A500", "hard", "CHN"],
    [39, "shanghai", "上海", "M1000L", "hard", "CHN"],
    [41, "almaty", "アルマトイ", "A250", "indoor", "KAZ"],
    [41, "brussels", "ブリュッセル", "A250", "indoor", "BEL"],
    [41, "stockholm", "ストックホルム", "A250", "indoor", "SWE"],
    [42, "vienna", "ウィーン", "A500", "indoor", "AUT"],
    [42, "basel", "バーゼル", "A500", "indoor", "SUI"],
    [43, "paris", "パリ", "M1000S", "indoor", "FRA"],
    [44, "metz", "メス", "A250", "indoor", "FRA"],
    [44, "athens", "アテネ", "A250", "indoor", "GRE"],
    [45, "finals", "ATPファイナルズ", "FINALS", "indoor", "ITA"],
  ];
  D.ATP_CALENDAR = C.map((r) => ({ week: r[0], id: r[1], name: r[2], cat: r[3], surface: r[4], country: r[5] }));

  // Lower tiers (procedural but fixed): per week a list of [cat, country, surface].
  // Japan gets a realistic set of home events for the WC story.
  const EU_CLAY = ["ITA", "ESP", "FRA", "GER", "CZE", "AUT", "CRO", "POR", "ROU", "HUN", "SRB", "BIH", "POL", "TUR"];
  const EU_HARD = ["FRA", "GER", "GBR", "NED", "BEL", "SUI", "FIN", "SWE", "POL", "ITA", "ESP"];
  const NA = ["USA", "USA", "CAN", "MEX", "USA"];
  const SA = ["ARG", "BRA", "CHI", "COL", "PER", "URU", "ECU"];
  const ASIA = ["CHN", "KOR", "IND", "KAZ", "TPE", "JPN"];
  const MEA = ["TUN", "EGY", "QAT", "MAR", "RSA", "UAE"];

  function cyc(list, i) {
    return list[((i % list.length) + list.length) % list.length];
  }
  const LOWER = {};
  for (let w = 1; w <= 47; w++) {
    const list = [];
    const season = w <= 8 ? "early" : w <= 21 ? "clay" : w <= 27 ? "grass" : w <= 36 ? "nahard" : "indoor";
    const chA = w % 2 === 0 ? "CH125" : "CH100";
    const chB = w % 3 === 0 ? "CH75" : "CH50";
    if (w % 6 === 0) list.push(["CH175", season === "clay" ? cyc(EU_CLAY, w) : cyc(NA, w), season === "clay" ? "clay" : "hard"]);
    if (season === "early") {
      list.push([chA, cyc(ASIA, w), "hard"], [chB, cyc(EU_HARD, w), "indoor"]);
      list.push(["M25", cyc(MEA, w), "hard"], ["M15", cyc(EU_HARD, w + 3), "indoor"], ["M15", cyc(SA, w), "clay"]);
    } else if (season === "clay") {
      list.push([chA, cyc(EU_CLAY, w), "clay"], [chB, cyc(SA, w), "clay"]);
      list.push(["M25", cyc(EU_CLAY, w + 5), "clay"], ["M15", cyc(MEA, w), "hard"], ["M15", cyc(EU_CLAY, w + 9), "clay"]);
    } else if (season === "grass") {
      list.push([chA, cyc(EU_HARD, w), "grass"], [chB, cyc(NA, w), "hard"]);
      list.push(["M25", cyc(EU_CLAY, w), "clay"], ["M15", cyc(ASIA, w), "hard"], ["M15", cyc(EU_HARD, w + 2), "grass"]);
    } else if (season === "nahard") {
      list.push([chA, cyc(NA, w), "hard"], [chB, cyc(EU_CLAY, w), "clay"]);
      list.push(["M25", cyc(NA, w + 1), "hard"], ["M15", cyc(EU_CLAY, w + 4), "clay"], ["M15", cyc(ASIA, w), "hard"]);
    } else {
      list.push([chA, cyc(ASIA, w), "hard"], [chB, cyc(EU_HARD, w), "indoor"]);
      list.push(["M25", cyc(EU_HARD, w + 1), "indoor"], ["M15", cyc(MEA, w), "hard"], ["M15", cyc(SA, w), "clay"]);
    }
    LOWER[w] = list;
  }
  // Japanese home events (approximate real schedule): Challengers in autumn, ITF in spring.
  LOWER[10].push(["M15", "JPN", "hard"]);
  LOWER[19].push(["M25", "JPN", "hard"]);
  LOWER[36].push(["M25", "JPN", "hard"]);
  LOWER[44].push(["CH125", "JPN", "hard"]); // 横浜
  LOWER[46].push(["CH100", "JPN", "hard"]); // 神戸
  LOWER[47].push(["CH75", "JPN", "hard"]); // 四日市
  D.LOWER_CALENDAR = LOWER;

  const CITY = {
    JPN: ["横浜", "神戸", "四日市", "柏", "つくば", "甲府"], USA: ["タラハシー", "サラソタ", "シャンペーン", "ティブロン", "ノックスビル", "シカゴ"],
    CAN: ["グランビー", "ドラモンビル"], MEX: ["モンテレイ", "レオン"], ESP: ["マルベージャ", "セビリア", "マジョルカ", "ポズエロ"],
    FRA: ["エクスアンプロヴァンス", "リヨン", "ポー", "ブレスト", "ケンペール"], ITA: ["ナポリ", "トリエステ", "ペルージャ", "トディ", "ロンバルディア"],
    GER: ["ハイルブロン", "ブラウンシュヴァイク", "イスマニング"], GBR: ["ノッティンガム", "イルクリー", "グラスゴー", "ラフバラ"],
    NED: ["アルクマール"], BEL: ["モンス"], SUI: ["ルガーノ"], FIN: ["ヘルシンキ"], SWE: ["ファルン"], POL: ["シュチェチン"],
    CZE: ["プロステヨフ", "オストラバ"], AUT: ["トゥルン", "マウトハウゼン"], CRO: ["ザグレブ", "スプリト"], POR: ["オエイラス", "リスボン"],
    ROU: ["ヤシ"], HUN: ["ブダペスト"], SRB: ["ノヴィサド"], BIH: ["サラエボ"], TUR: ["アンタルヤ", "イスタンブール"],
    ARG: ["ブエノスアイレス", "コルドバ", "ビジャマリア"], BRA: ["サンパウロ", "カンピナス", "フロリアノポリス"], CHI: ["コンセプシオン"], COL: ["ボゴタ", "バランキージャ"],
    PER: ["リマ"], URU: ["モンテビデオ"], ECU: ["グアヤキル"], CHN: ["深圳", "広州", "珠海"], KOR: ["ソウル", "釜山"], IND: ["ベンガルール", "プネー"],
    KAZ: ["アスタナ"], TPE: ["台北"], TUN: ["モナスティル"], EGY: ["シャルムエルシェイク"], QAT: ["ドーハ"], MAR: ["メクネス"], RSA: ["ポチェフストローム"], UAE: ["ドバイ"],
  };
  D.cityFor = function (country, i) {
    const l = CITY[country] || [D.COUNTRIES[country] ? D.COUNTRIES[country].name : country];
    return l[((i % l.length) + l.length) % l.length];
  };
})(typeof globalThis !== "undefined" ? globalThis : window);

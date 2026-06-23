import pptxgen from "pptxgenjs";

// ──────────────────────────────────────────────
// 既存スライドデザイン（紺色背景）を踏襲した
// 2枚（想定地震 / 被害例）の .pptx を新規生成する。
//
// pptxgenjs は既存 .pptx の編集ができないため、
// 講師が本編デッキの該当ページ（スライド2・3）に
// 差し込むための差し替え用2枚を出力する方式。
// ──────────────────────────────────────────────

export type Earthquake = {
  name: string;
  magnitude: string;
  intensity: string;
  probability: string;
};

export const INTENSITY_LEVELS = ["5弱", "5強", "6弱", "6強", "7"] as const;
export type IntensityKey = (typeof INTENSITY_LEVELS)[number];
export const DAMAGE_TYPES = [
  "移動・転倒物",
  "ガラスの破損・落下",
  "天井材等落下物",
  "建物倒壊",
] as const;
export type DamageType = (typeof DAMAGE_TYPES)[number];

export type SlideData = {
  pref: string;
  city: string;
  facility?: string;
  earthquakes: Earthquake[];
  source1?: string;
  damageRisks: Record<DamageType, IntensityKey>;
  source2?: string;
};

// プレビュー（App.tsx）と同一の配色
const NAVY = "1a3a5c";
const NAVY_LINE = "2d5a7a";
const RISK_LEVEL_OF: Record<IntensityKey, number> = {
  "5弱": 1,
  "5強": 2,
  "6弱": 3,
  "6強": 4,
  "7": 5,
};
const RISK_COLORS = ["", "e8f4fd", "fff3cd", "ffd6a0", "ffb3b3", "ff8080"];
const RISK_TEXT_COLORS = ["", "1a5276", "7d6608", "a04000", "922b21", "7b241c"];
const CIRCLED = "①②③④⑤⑥⑦⑧";

export function buildPptx(data: SlideData): pptxgen {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 inch (16:9)
  pptx.defineSlideMaster({
    title: "NAVY",
    background: { color: NAVY },
  });

  // ── スライド① 想定されている地震 ─────────────
  const s1 = pptx.addSlide({ masterName: "NAVY" });
  s1.addText("まずは、国や県・市の想定資料（根拠資料）から", {
    x: 0.6,
    y: 0.45,
    w: 12.1,
    h: 0.35,
    fontSize: 12,
    color: "7fb3d3",
    align: "left",
  });
  const facilityPart = data.facility ? `にある${data.facility}` : "";
  s1.addText(`${data.pref}${data.city}${facilityPart}で想定されている地震`, {
    x: 0.6,
    y: 0.85,
    w: 12.1,
    h: 0.7,
    fontSize: 26,
    bold: true,
    color: "ffffff",
    align: "left",
  });

  const eqs = data.earthquakes.filter((eq) => eq.name);
  if (eqs.length) {
    const eqRuns: pptxgen.TextProps[] = eqs.map((eq, i) => {
      const parts = `${CIRCLED[i] ?? "・"} ${eq.name}   M${eq.magnitude}   震度${eq.intensity}${
        eq.probability ? `   ${eq.probability}` : ""
      }`;
      return {
        text: parts,
        options: { fontSize: 16, color: "ffffff", bullet: false, paraSpaceAfter: 10 },
      };
    });
    s1.addText(eqRuns, {
      x: 0.8,
      y: 1.8,
      w: 11.7,
      h: 4.2,
      align: "left",
      valign: "top",
    });
  } else {
    s1.addText("（想定地震が未入力です）", {
      x: 0.8,
      y: 1.8,
      w: 11.7,
      h: 1,
      fontSize: 16,
      color: "a8d0e8",
    });
  }

  if (data.source1) {
    s1.addText(`出典：${data.source1}`, {
      x: 0.6,
      y: 6.9,
      w: 12.1,
      h: 0.4,
      fontSize: 10,
      color: "5a8ab0",
      align: "left",
    });
  }

  // ── スライド② 想定される地震被害例 ───────────
  const s2 = pptx.addSlide({ masterName: "NAVY" });
  s2.addText("この場所で想定される地震被害例", {
    x: 0.6,
    y: 0.5,
    w: 12.1,
    h: 0.7,
    fontSize: 26,
    bold: true,
    color: "ffffff",
    align: "left",
  });

  // ヘッダー行
  const header: pptxgen.TableRow = [
    {
      text: "被害種別",
      options: {
        color: "7fb3d3",
        fill: { color: NAVY },
        align: "left",
        valign: "middle",
        fontSize: 13,
      },
    },
    ...INTENSITY_LEVELS.map((lvl) => ({
      text: `震度${lvl}`,
      options: {
        color: "7fb3d3",
        fill: { color: NAVY },
        align: "center" as const,
        valign: "middle" as const,
        fontSize: 13,
      },
    })),
  ];

  const bodyRows: pptxgen.TableRow[] = DAMAGE_TYPES.map((type) => {
    const startLevel = RISK_LEVEL_OF[data.damageRisks[type]] ?? 0;
    const cells: pptxgen.TableRow = [
      {
        text: type,
        options: {
          color: "e0eaf2",
          fill: { color: NAVY },
          align: "left",
          valign: "middle",
          fontSize: 14,
        },
      },
    ];
    INTENSITY_LEVELS.forEach((lvl) => {
      const cellLevel = RISK_LEVEL_OF[lvl];
      const isRisk = cellLevel >= startLevel;
      cells.push({
        text: isRisk ? "●" : "",
        options: {
          align: "center",
          valign: "middle",
          fontSize: 18,
          bold: true,
          color: isRisk ? RISK_TEXT_COLORS[cellLevel] : NAVY,
          fill: { color: isRisk ? RISK_COLORS[cellLevel] : NAVY },
        },
      });
    });
    return cells;
  });

  s2.addTable([header, ...bodyRows], {
    x: 0.6,
    y: 1.6,
    w: 12.1,
    rowH: [0.5, 0.7, 0.7, 0.7, 0.7],
    colW: [3.3, 1.76, 1.76, 1.76, 1.76, 1.76],
    border: { type: "solid", color: NAVY_LINE, pt: 0.5 },
    valign: "middle",
  });

  s2.addText("リスク小 ←──────────→ リスク大", {
    x: 0.6,
    y: 5.9,
    w: 12.1,
    h: 0.35,
    fontSize: 11,
    color: "5a8ab0",
    align: "left",
  });

  if (data.source2) {
    s2.addText(`出典：${data.source2}`, {
      x: 0.6,
      y: 6.9,
      w: 12.1,
      h: 0.4,
      fontSize: 10,
      color: "5a8ab0",
      align: "left",
    });
  }

  return pptx;
}

export async function downloadPptx(data: SlideData): Promise<void> {
  const pptx = buildPptx(data);
  const safe = `${data.pref}${data.city}`.replace(/[\\/:*?"<>|]/g, "");
  await pptx.writeFile({ fileName: `防災講座スライド_${safe || "出力"}.pptx` });
}

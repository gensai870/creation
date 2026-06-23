import { useState, useRef } from "react";
import { downloadPptx } from "./utils/slideGenerator";
import { downloadPdf } from "./utils/pdfGenerator";

const PREFECTURES = ["北海道","青森県","岩手県","宮城県","秋田県","山形県","福島県","茨城県","栃木県","群馬県","埼玉県","千葉県","東京都","神奈川県","新潟県","富山県","石川県","福井県","山梨県","長野県","岐阜県","静岡県","愛知県","三重県","滋賀県","京都府","大阪府","兵庫県","奈良県","和歌山県","鳥取県","島根県","岡山県","広島県","山口県","徳島県","香川県","愛媛県","高知県","福岡県","佐賀県","長崎県","熊本県","大分県","宮崎県","鹿児島県","沖縄県"];

const RISK_LEVELS = {
  "5弱": { level: 1, label: "震度5弱" },
  "5強": { level: 2, label: "震度5強" },
  "6弱": { level: 3, label: "震度6弱" },
  "6強": { level: 4, label: "震度6強" },
  "7":   { level: 5, label: "震度7" },
};

const DAMAGE_TYPES = ["移動・転倒物", "ガラスの破損・落下", "天井材等落下物", "建物倒壊"] as const;

type IntensityKey = keyof typeof RISK_LEVELS;
// Object.keys は数値的キー("7")を先頭に並べてしまうため、表示順は明示配列で固定する
const INTENSITY_ORDER: IntensityKey[] = ["5弱", "5強", "6弱", "6強", "7"];
type DamageType = (typeof DAMAGE_TYPES)[number];
type Earthquake = { name: string; magnitude: string; intensity: string; probability: string };
type EarthquakeData = {
  pref?: string;
  city?: string;
  earthquakes?: Earthquake[];
  source1?: string;
  damageRisks?: Record<DamageType, IntensityKey>;
  source2?: string;
};

const RISK_COLORS = [
  "", // unused index 0
  "#e8f4fd", // 5弱 - very light blue
  "#fff3cd", // 5強 - light yellow
  "#ffd6a0", // 6弱 - light orange
  "#ffb3b3", // 6強 - light red
  "#ff8080", // 7   - stronger red
];
const RISK_TEXT_COLORS = ["", "#1a5276","#7d6608","#a04000","#922b21","#7b241c"];

export default function App() {
  const [step, setStep] = useState(1);
  const [pref, setPref] = useState("");
  const [city, setCity] = useState("");
  const [facility, setFacility] = useState("");
  const [earthquakes, setEarthquakes] = useState<Earthquake[]>([
    { name: "", magnitude: "", intensity: "", probability: "" },
  ]);
  const [damageRisks, setDamageRisks] = useState<Record<DamageType, IntensityKey>>({
    "移動・転倒物": "6弱",
    "ガラスの破損・落下": "6弱",
    "天井材等落下物": "6強",
    "建物倒壊": "7",
  });
  const [source1, setSource1] = useState("");
  const [source2, setSource2] = useState("");
  const [promptCopied, setPromptCopied] = useState(false);
  const [autoLoading, setAutoLoading] = useState(false);
  const [autoLoaded, setAutoLoaded] = useState(false);

  const addEarthquake = () => setEarthquakes([...earthquakes, { name: "", magnitude: "", intensity: "", probability: "" }]);
  const removeEarthquake = (i: number) => setEarthquakes(earthquakes.filter((_, idx) => idx !== i));
  const updateEQ = (i: number, field: keyof Earthquake, val: string) => {
    const updated = [...earthquakes];
    updated[i][field] = val;
    setEarthquakes(updated);
  };

  const chromePropmt = `【訪問先】${pref}${city}　施設名：${facility || "（未入力）"}

以下のサイトを順番に確認して、最新の情報を収集してください：
1. 国土交通省ハザードマップポータル (disaportal.gsi.go.jp)
2. ${pref} 防災・地震被害想定ページ
3. ${city} ハザードマップ・防災情報ページ（市区町村役場サイト）

収集する情報：

■ 想定されている地震（番号付きで列挙）
- 断層名・地震名
- 想定マグニチュード（M〇〇）
- 想定震度（〇弱〜〇強）
- 発生確率（30年以内など、あれば）
- 出典サイト名・更新日

■ 想定される地震被害例（震度別のリスク）
- 移動・転倒物のリスクが出始める震度
- ガラスの破損・落下が起きる震度
- 天井材等落下物が起きる震度
- 建物倒壊が起きる震度
- 出典サイト名・更新日

最新のデータを優先し、複数ある場合はすべて列挙してください。`;

  const loadFromJson = async () => {
    setAutoLoading(true);
    try {
      const res = await fetch("/earthquake_data.json?t=" + Date.now());
      if (!res.ok) throw new Error("ファイルが見つかりません");
      const data: EarthquakeData = await res.json();
      if (data.pref) setPref(data.pref);
      if (data.city) setCity(data.city);
      if (data.earthquakes?.length) setEarthquakes(data.earthquakes);
      if (data.source1) setSource1(data.source1);
      if (data.damageRisks) setDamageRisks(data.damageRisks);
      if (data.source2) setSource2(data.source2);
      setAutoLoaded(true);
      setStep(2);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      alert("自動読み込み失敗：\n" + msg + "\n\nスクレイパーを実行してから試してください。");
    } finally {
      setAutoLoading(false);
    }
  };

  const copyPrompt = () => {
    navigator.clipboard.writeText(chromePropmt);
    setPromptCopied(true);
    setTimeout(() => setPromptCopied(false), 2000);
  };

  const [pptxBusy, setPptxBusy] = useState(false);
  const handleDownloadPptx = async () => {
    setPptxBusy(true);
    try {
      await downloadPptx({ pref, city, facility, earthquakes, source1, damageRisks, source2 });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      alert("PowerPoint生成に失敗しました：\n" + msg);
    } finally {
      setPptxBusy(false);
    }
  };

  const slide1Ref = useRef<HTMLDivElement>(null);
  const slide2Ref = useRef<HTMLDivElement>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const handleDownloadPdf = async () => {
    setPdfBusy(true);
    try {
      const safe = `${pref}${city}`.replace(/[\\/:*?"<>|]/g, "");
      await downloadPdf([slide1Ref.current, slide2Ref.current], `防災講座スライド_${safe || "出力"}.pdf`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      alert("PDF生成に失敗しました：\n" + msg);
    } finally {
      setPdfBusy(false);
    }
  };

  const canProceedStep1 = pref && city;
  const canProceedStep2 = earthquakes.some(eq => eq.name && eq.magnitude && eq.intensity);

  const getRiskLevel = (damageType: DamageType) => RISK_LEVELS[damageRisks[damageType]]?.level || 0;

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "1.5rem 1rem", fontFamily: "var(--font-sans)" }}>
      <h2 style={{ fontSize: 20, fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 0.25rem" }}>
        Disaster Deck AI
      </h2>
      <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "0 0 1.5rem" }}>
        講座スライド（想定地震・被害例）の自動差し替えツール
      </p>

      {/* ステップ表示 */}
      <div style={{ display: "flex", gap: 0, marginBottom: "1.5rem" }}>
        {["地域入力", "想定地震", "被害リスク", "プレビュー"].map((label, i) => {
          const s = i + 1;
          const active = step === s;
          const done = step > s;
          return (
            <div key={s} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{
                width: "100%", height: 3,
                background: done ? "#1D9E75" : active ? "#378ADD" : "var(--color-border-tertiary)",
                marginBottom: 6,
                borderRadius: i === 0 ? "4px 0 0 4px" : i === 3 ? "0 4px 4px 0" : 0
              }} />
              <span style={{ fontSize: 11, color: done ? "#1D9E75" : active ? "#378ADD" : "var(--color-text-tertiary)", fontWeight: active ? 500 : 400 }}>
                {label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Step 1: 地域入力 */}
      {step === 1 && (
        <div>
          <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-lg)", padding: "1rem 1.25rem", marginBottom: "1rem", border: "0.5px solid var(--color-border-tertiary)" }}>
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "0 0 1rem" }}>
              講演会の訪問先を入力してください。入力後、Claude in Chrome 用のクローリングプロンプトを生成します。
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>都道府県</label>
                <select value={pref} onChange={e => setPref(e.target.value)} style={{ width: "100%" }}>
                  <option value="">選択してください</option>
                  {PREFECTURES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>市区町村</label>
                <input value={city} onChange={e => setCity(e.target.value)} placeholder="例：渋谷区" style={{ width: "100%" }} />
              </div>
            </div>
            <div>
              <label style={{ fontSize: 12, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>施設名（任意）</label>
              <input value={facility} onChange={e => setFacility(e.target.value)} placeholder="例：ニチイ学館 渋谷支部" style={{ width: "100%" }} />
            </div>
          </div>

          {pref && city && (
            <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "1rem 1.25rem", marginBottom: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)" }}>
                  Claude in Chrome 用プロンプト
                </span>
                <button onClick={copyPrompt} style={{ fontSize: 12, padding: "4px 12px" }}>
                  {promptCopied ? "✓ コピー完了" : "コピー ↗"}
                </button>
              </div>
              <pre style={{ fontSize: 11, color: "var(--color-text-secondary)", background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "0.75rem", margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                {chromePropmt}
              </pre>
              <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", margin: "8px 0 0" }}>
                ① このプロンプトをコピー → ② Claude in Chrome に貼り付けてクローリング → ③ 結果をもとに次のステップを入力
              </p>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button
              onClick={loadFromJson}
              disabled={!canProceedStep1 || autoLoading}
              style={{ padding: "8px 20px", opacity: canProceedStep1 ? 1 : 0.4, background: autoLoaded ? "var(--color-background-success)" : undefined, color: autoLoaded ? "var(--color-text-success)" : undefined }}
            >
              {autoLoading ? "読み込み中…" : autoLoaded ? "✓ 自動読み込み済み" : "スクレイパー結果を自動読み込み ↗"}
            </button>
            <button onClick={() => setStep(2)} disabled={!canProceedStep1} style={{ padding: "8px 24px", opacity: canProceedStep1 ? 1 : 0.4 }}>
              次へ：想定地震を入力 →
            </button>
          </div>
        </div>
      )}

      {/* Step 2: 想定地震 */}
      {step === 2 && (
        <div>
          <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-lg)", padding: "1rem 1.25rem", marginBottom: "1rem", border: "0.5px solid var(--color-border-tertiary)" }}>
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "0 0 1rem" }}>
              Claude in Chrome で収集した「想定されている地震」を入力してください。
            </p>

            {earthquakes.map((eq, i) => (
              <div key={i} style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-md)", padding: "0.75rem 1rem", marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-secondary)" }}>地震 {i + 1}</span>
                  {earthquakes.length > 1 && (
                    <button onClick={() => removeEarthquake(i)} style={{ fontSize: 11, padding: "2px 8px", color: "var(--color-text-danger)" }}>削除</button>
                  )}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
                  <div>
                    <label style={{ fontSize: 11, color: "var(--color-text-secondary)", display: "block", marginBottom: 3 }}>断層名・地震名</label>
                    <input value={eq.name} onChange={e => updateEQ(i, "name", e.target.value)} placeholder="例：都心南部直下地震" style={{ width: "100%" }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: "var(--color-text-secondary)", display: "block", marginBottom: 3 }}>規模（M）</label>
                    <input value={eq.magnitude} onChange={e => updateEQ(i, "magnitude", e.target.value)} placeholder="例：7.3" style={{ width: "100%" }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: "var(--color-text-secondary)", display: "block", marginBottom: 3 }}>想定震度</label>
                    <input value={eq.intensity} onChange={e => updateEQ(i, "intensity", e.target.value)} placeholder="例：6弱〜6強" style={{ width: "100%" }} />
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: "var(--color-text-secondary)", display: "block", marginBottom: 3 }}>発生確率（任意）</label>
                  <input value={eq.probability} onChange={e => updateEQ(i, "probability", e.target.value)} placeholder="例：30年以内に70%程度" style={{ width: "100%" }} />
                </div>
              </div>
            ))}

            <button onClick={addEarthquake} style={{ fontSize: 12, padding: "6px 16px", width: "100%", marginTop: 4 }}>
              ＋ 地震を追加
            </button>

            <div style={{ marginTop: 12 }}>
              <label style={{ fontSize: 12, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>出典・更新日</label>
              <input value={source1} onChange={e => setSource1(e.target.value)} placeholder="例：東京都防災ホームページ（2024年3月更新）" style={{ width: "100%" }} />
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <button onClick={() => setStep(1)} style={{ padding: "8px 16px" }}>← 戻る</button>
            <button onClick={() => setStep(3)} disabled={!canProceedStep2} style={{ padding: "8px 24px", opacity: canProceedStep2 ? 1 : 0.4 }}>
              次へ：被害リスクを入力 →
            </button>
          </div>
        </div>
      )}

      {/* Step 3: 被害リスク */}
      {step === 3 && (
        <div>
          <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-lg)", padding: "1rem 1.25rem", marginBottom: "1rem", border: "0.5px solid var(--color-border-tertiary)" }}>
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "0 0 1rem" }}>
              各リスクが「発生し始める震度」を設定してください。
            </p>

            {DAMAGE_TYPES.map(type => (
              <div key={type} style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-md)", padding: "0.75rem 1rem", marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, color: "var(--color-text-primary)", fontWeight: 500 }}>{type}</span>
                <div style={{ display: "flex", gap: 6 }}>
                  {INTENSITY_ORDER.map(lvl => (
                    <button
                      key={lvl}
                      onClick={() => setDamageRisks({ ...damageRisks, [type]: lvl })}
                      style={{
                        fontSize: 11,
                        padding: "4px 10px",
                        background: damageRisks[type] === lvl ? RISK_COLORS[RISK_LEVELS[lvl].level] : "transparent",
                        color: damageRisks[type] === lvl ? RISK_TEXT_COLORS[RISK_LEVELS[lvl].level] : "var(--color-text-secondary)",
                        border: damageRisks[type] === lvl ? `1.5px solid ${RISK_TEXT_COLORS[RISK_LEVELS[lvl].level]}` : "0.5px solid var(--color-border-tertiary)",
                        borderRadius: "var(--border-radius-md)",
                        fontWeight: damageRisks[type] === lvl ? 500 : 400,
                      }}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            <div style={{ marginTop: 12 }}>
              <label style={{ fontSize: 12, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>出典・更新日</label>
              <input value={source2} onChange={e => setSource2(e.target.value)} placeholder="例：東京都被害想定（2022年5月公表）" style={{ width: "100%" }} />
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <button onClick={() => setStep(2)} style={{ padding: "8px 16px" }}>← 戻る</button>
            <button onClick={() => setStep(4)} style={{ padding: "8px 24px" }}>
              プレビューを確認 →
            </button>
          </div>
        </div>
      )}

      {/* Step 4: プレビュー */}
      {step === 4 && (
        <div>
          {/* スライド① */}
          <p style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 6 }}>スライド①プレビュー：想定されている地震</p>
          <div ref={slide1Ref} style={{
            background: "#1a3a5c",
            borderRadius: "var(--border-radius-lg)",
            padding: "1.5rem 1.75rem",
            marginBottom: "1.25rem",
            border: "0.5px solid var(--color-border-tertiary)",
            minHeight: 200,
          }}>
            <p style={{ fontSize: 11, color: "#7fb3d3", margin: "0 0 0.5rem", letterSpacing: "0.05em" }}>
              まずは、国や県・市の想定資料（根拠資料）から
            </p>
            <h3 style={{ fontSize: 16, fontWeight: 500, color: "#ffffff", margin: "0 0 1.25rem", lineHeight: 1.4 }}>
              {pref}{city}{facility ? `にある${facility}` : ""}で想定されている地震
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {earthquakes.filter(eq => eq.name).map((eq, i) => (
                <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                  <span style={{ fontSize: 13, color: "#7fb3d3", minWidth: 20 }}>{"①②③④⑤⑥⑦⑧"[i]}</span>
                  <span style={{ fontSize: 13, color: "#ffffff", fontWeight: 500 }}>{eq.name}</span>
                  <span style={{ fontSize: 12, color: "#a8d0e8" }}>M{eq.magnitude}</span>
                  <span style={{ fontSize: 12, color: "#ffd580" }}>震度{eq.intensity}</span>
                  {eq.probability && <span style={{ fontSize: 11, color: "#7fb3d3" }}>{eq.probability}</span>}
                </div>
              ))}
            </div>
            {source1 && <p style={{ fontSize: 10, color: "#5a8ab0", marginTop: "1rem", marginBottom: 0 }}>出典：{source1}</p>}
          </div>

          {/* スライド② */}
          <p style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 6 }}>スライド②プレビュー：想定される地震被害例</p>
          <div ref={slide2Ref} style={{
            background: "#1a3a5c",
            borderRadius: "var(--border-radius-lg)",
            padding: "1.5rem 1.75rem",
            marginBottom: "1.25rem",
            border: "0.5px solid var(--color-border-tertiary)",
            minHeight: 200,
          }}>
            <h3 style={{ fontSize: 16, fontWeight: 500, color: "#ffffff", margin: "0 0 1.25rem" }}>
              この場所で想定される地震被害例
            </h3>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                <thead>
                  <tr>
                    <th style={{ width: "28%", fontSize: 11, color: "#7fb3d3", padding: "6px 8px", textAlign: "left", borderBottom: "0.5px solid #2d5a7a", fontWeight: 400 }}>被害種別</th>
                    {INTENSITY_ORDER.map(lvl => (
                      <th key={lvl} style={{ fontSize: 11, color: "#7fb3d3", padding: "6px 6px", textAlign: "center", borderBottom: "0.5px solid #2d5a7a", fontWeight: 400 }}>
                        震度{lvl}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DAMAGE_TYPES.map(type => {
                    const riskLevel = getRiskLevel(type);
                    return (
                      <tr key={type}>
                        <td style={{ fontSize: 12, color: "#e0eaf2", padding: "7px 8px", borderBottom: "0.5px solid #2d5a7a" }}>{type}</td>
                        {INTENSITY_ORDER.map(lvl => {
                          const cellLevel = RISK_LEVELS[lvl].level;
                          const isRisk = cellLevel >= riskLevel;
                          return (
                            <td key={lvl} style={{
                              padding: "7px 6px",
                              textAlign: "center",
                              borderBottom: "0.5px solid #2d5a7a",
                              background: isRisk ? RISK_COLORS[cellLevel] : "transparent",
                              borderRadius: 2,
                            }}>
                              {isRisk && (
                                <span style={{ fontSize: 14, color: RISK_TEXT_COLORS[cellLevel] }}>●</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ display: "flex", gap: 16, marginTop: 10 }}>
              <span style={{ fontSize: 10, color: "#5a8ab0" }}>リスク小 ←────────→ リスク大</span>
            </div>
            {source2 && <p style={{ fontSize: 10, color: "#5a8ab0", marginTop: 8, marginBottom: 0 }}>出典：{source2}</p>}
          </div>

          {/* 操作ボタン */}
          <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-lg)", padding: "1rem 1.25rem", border: "0.5px solid var(--color-border-tertiary)", marginBottom: "1rem" }}>
            <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 0.75rem" }}>
              内容を確認して、スライドデータをダウンロードしてください。
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleDownloadPptx}
                disabled={pptxBusy}
                style={{ flex: 1, padding: "10px 16px", fontWeight: 500, opacity: pptxBusy ? 0.5 : 1 }}
              >
                {pptxBusy ? "生成中…" : "PowerPoint (.pptx) ↗"}
              </button>
              <button
                onClick={handleDownloadPdf}
                disabled={pdfBusy}
                style={{ flex: 1, padding: "10px 16px", opacity: pdfBusy ? 0.5 : 1 }}
              >
                {pdfBusy ? "生成中…" : "PDF ↗"}
              </button>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <button onClick={() => setStep(3)} style={{ padding: "8px 16px" }}>← 戻る</button>
            <button onClick={() => { setStep(1); setPref(""); setCity(""); setFacility(""); setEarthquakes([{ name: "", magnitude: "", intensity: "", probability: "" }]); setDamageRisks({ "移動・転倒物": "6弱", "ガラスの破損・落下": "6弱", "天井材等落下物": "6強", "建物倒壊": "7" }); setSource1(""); setSource2(""); }} style={{ padding: "8px 16px" }}>
              最初からやり直す
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

import html2canvas from "html2canvas";
import jsPDF from "jspdf";

// ──────────────────────────────────────────────
// プレビュー上の紺色スライド（2枚）を html2canvas で
// 画像化し、横向き(16:9相当)PDF の各ページに配置する。
// 既存スライドは編集せず、差し替え用2枚のみを出力。
// ──────────────────────────────────────────────

export async function downloadPdf(
  slides: (HTMLElement | null)[],
  fileName: string,
): Promise<void> {
  const targets = slides.filter((el): el is HTMLElement => !!el);
  if (!targets.length) throw new Error("出力対象のスライドが見つかりません");

  // 16:9 のランドスケープ。pt 単位、960x540pt = 13.33x7.5inch 相当。
  const PAGE_W = 960;
  const PAGE_H = 540;
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: [PAGE_W, PAGE_H] });

  for (let i = 0; i < targets.length; i++) {
    const canvas = await html2canvas(targets[i], {
      scale: 2,
      backgroundColor: "#1a3a5c",
      useCORS: true,
      logging: false,
    });
    const img = canvas.toDataURL("image/png");

    // アスペクト比を保ってページ中央に収める
    const ratio = Math.min(PAGE_W / canvas.width, PAGE_H / canvas.height);
    const w = canvas.width * ratio;
    const h = canvas.height * ratio;
    const x = (PAGE_W - w) / 2;
    const y = (PAGE_H - h) / 2;

    if (i > 0) pdf.addPage([PAGE_W, PAGE_H], "landscape");
    pdf.addImage(img, "PNG", x, y, w, h);
  }

  pdf.save(fileName);
}

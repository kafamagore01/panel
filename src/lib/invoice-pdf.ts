import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import {
  PDFDocument,
  rgb,
  type PDFFont,
  type PDFPage,
  type RGB,
} from "pdf-lib";
import { formatDate, formatMoney } from "@/lib/format";

const A4: [number, number] = [595.28, 841.89];
const PAGE_MARGIN = 42;
const REGULAR_FONT_PATH = path.join(
  process.cwd(),
  "node_modules",
  "@expo-google-fonts",
  "noto-sans",
  "400Regular",
  "NotoSans_400Regular.ttf"
);
const BOLD_FONT_PATH = path.join(
  process.cwd(),
  "node_modules",
  "@expo-google-fonts",
  "noto-sans",
  "700Bold",
  "NotoSans_700Bold.ttf"
);

const COLORS = {
  ink: rgb(0.078, 0.094, 0.129),
  muted: rgb(0.392, 0.455, 0.545),
  subtle: rgb(0.58, 0.631, 0.706),
  primary: rgb(0.322, 0.404, 1),
  primaryDark: rgb(0.259, 0.329, 0.882),
  primarySoft: rgb(0.941, 0.949, 1),
  border: rgb(0.886, 0.91, 0.941),
  surface: rgb(0.973, 0.98, 0.988),
  surfaceStrong: rgb(0.949, 0.961, 0.976),
  white: rgb(1, 1, 1),
  success: rgb(0.059, 0.624, 0.431),
  successSoft: rgb(0.91, 0.976, 0.949),
  danger: rgb(0.898, 0.282, 0.302),
  dangerSoft: rgb(0.992, 0.922, 0.925),
  warning: rgb(0.851, 0.466, 0.024),
  warningSoft: rgb(1, 0.957, 0.875),
} satisfies Record<string, RGB>;

const STATUS_LABELS: Record<string, string> = {
  issued: "Düzenlendi",
  partial: "Kısmi Ödendi",
  paid: "Ödendi",
  overdue: "Gecikmiş",
  void: "İptal",
};

export type InvoicePdfData = {
  invoiceNo: string;
  status: string;
  issuedOn: Date;
  dueOn: Date;
  currency: string;
  subtotal: number;
  taxTotal: number;
  total: number;
  paidTotal: number;
  balanceDue: number;
  description: string | null;
  notes: string | null;
  workspaceName: string;
  customer: {
    legalName: string;
    tradeName: string | null;
    taxNumber: string | null;
    taxOffice: string | null;
    billingAddress: string | null;
    email: string | null;
    phone: string | null;
  };
  project: {
    code: string;
    name: string;
    branchName: string | null;
  } | null;
};

let fontFilesPromise:
  | Promise<{ regular: Uint8Array; bold: Uint8Array }>
  | undefined;

function loadFontFiles() {
  fontFilesPromise ??= Promise.all([
    readFile(REGULAR_FONT_PATH),
    readFile(BOLD_FONT_PATH),
  ]).then(([regular, bold]) => ({ regular, bold }));
  return fontFilesPromise;
}

function normalizedText(value: string | null | undefined, fallback = "-") {
  const clean = value?.replace(/\s+/g, " ").trim();
  return clean || fallback;
}

function pdfMoney(value: number, currency: string) {
  return formatMoney(value, currency).replace(/\u00a0/g, " ");
}

function wrapText(font: PDFFont, text: string, size: number, maxWidth: number) {
  const words = normalizedText(text).split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }

    if (current) lines.push(current);
    current = word;
  }

  if (current) lines.push(current);
  return lines;
}

function truncateLine(font: PDFFont, text: string, size: number, maxWidth: number) {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;

  let value = text;
  while (
    value.length > 1 &&
    font.widthOfTextAtSize(`${value}...`, size) > maxWidth
  ) {
    value = value.slice(0, -1);
  }
  return `${value.trimEnd()}...`;
}

function drawWrappedText({
  page,
  font,
  text,
  x,
  y,
  size,
  maxWidth,
  color = COLORS.ink,
  lineHeight = size * 1.35,
  maxLines = 4,
}: {
  page: PDFPage;
  font: PDFFont;
  text: string;
  x: number;
  y: number;
  size: number;
  maxWidth: number;
  color?: RGB;
  lineHeight?: number;
  maxLines?: number;
}) {
  const wrapped = wrapText(font, text, size, maxWidth);
  const lines = wrapped.slice(0, maxLines);
  if (wrapped.length > maxLines && lines.length > 0) {
    lines[lines.length - 1] = truncateLine(
      font,
      lines[lines.length - 1],
      size,
      maxWidth
    );
  }

  lines.forEach((line, index) => {
    page.drawText(line, {
      x,
      y: y - index * lineHeight,
      size,
      font,
      color,
    });
  });
}

function drawRightText(
  page: PDFPage,
  font: PDFFont,
  text: string,
  right: number,
  y: number,
  size: number,
  color = COLORS.ink
) {
  page.drawText(text, {
    x: right - font.widthOfTextAtSize(text, size),
    y,
    size,
    font,
    color,
  });
}

function drawCard(
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  height: number
) {
  page.drawRectangle({
    x,
    y,
    width,
    height,
    color: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 0.75,
  });
}

function workspaceInitials(value: string) {
  const parts = normalizedText(value)
    .split(" ")
    .filter(Boolean)
    .slice(0, 2);
  return parts.map((part) => part[0]).join("").toLocaleUpperCase("tr-TR");
}

function statusTone(status: string) {
  if (status === "paid") {
    return { background: COLORS.successSoft, foreground: COLORS.success };
  }
  if (status === "void") {
    return { background: COLORS.dangerSoft, foreground: COLORS.danger };
  }
  if (status === "overdue" || status === "partial") {
    return { background: COLORS.warningSoft, foreground: COLORS.warning };
  }
  return { background: COLORS.primarySoft, foreground: COLORS.primaryDark };
}

function drawCenteredText(
  page: PDFPage,
  font: PDFFont,
  text: string,
  centerX: number,
  y: number,
  size: number,
  color: RGB
) {
  page.drawText(text, {
    x: centerX - font.widthOfTextAtSize(text, size) / 2,
    y,
    size,
    font,
    color,
  });
}

function fitTextSize(
  font: PDFFont,
  text: string,
  preferredSize: number,
  minSize: number,
  maxWidth: number
) {
  let size = preferredSize;
  while (size > minSize && font.widthOfTextAtSize(text, size) > maxWidth) {
    size -= 0.25;
  }
  return size;
}

export async function createInvoicePdf(data: InvoicePdfData) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);

  const fontFiles = await loadFontFiles();
  const [regular, bold] = await Promise.all([
    pdf.embedFont(fontFiles.regular),
    pdf.embedFont(fontFiles.bold),
  ]);

  pdf.setTitle("Fatura " + data.invoiceNo);
  pdf.setAuthor(data.workspaceName);
  pdf.setSubject(data.invoiceNo + " numaralı fatura");
  pdf.setCreator("Operasyon Merkezi");
  pdf.setProducer("Operasyon Merkezi");

  const page = pdf.addPage(A4);
  const [pageWidth, pageHeight] = A4;
  const contentRight = pageWidth - PAGE_MARGIN;
  const contentWidth = pageWidth - PAGE_MARGIN * 2;

  page.drawRectangle({
    x: 0,
    y: 0,
    width: pageWidth,
    height: pageHeight,
    color: COLORS.white,
  });

  const headerBottom = 674;
  page.drawRectangle({
    x: 0,
    y: headerBottom,
    width: pageWidth,
    height: pageHeight - headerBottom,
    color: COLORS.ink,
  });
  page.drawRectangle({
    x: 0,
    y: headerBottom,
    width: 9,
    height: pageHeight - headerBottom,
    color: COLORS.primary,
  });
  page.drawCircle({
    x: 562,
    y: 822,
    size: 88,
    color: COLORS.primary,
    opacity: 0.14,
  });
  page.drawCircle({
    x: 500,
    y: 675,
    size: 58,
    color: COLORS.primary,
    opacity: 0.08,
  });

  const initials = workspaceInitials(data.workspaceName);
  page.drawCircle({
    x: 64,
    y: 790,
    size: 21,
    color: COLORS.primary,
  });
  drawCenteredText(page, bold, initials, 64, 786, 10.5, COLORS.white);

  page.drawText(
    truncateLine(bold, normalizedText(data.workspaceName), 16, 292),
    {
      x: 96,
      y: 797,
      size: 16,
      font: bold,
      color: COLORS.white,
    }
  );
  page.drawText("OPERASYON MERKEZİ", {
    x: 96,
    y: 775,
    size: 8,
    font: bold,
    color: COLORS.subtle,
  });

  drawRightText(page, bold, "FATURA", contentRight, 797, 24, COLORS.white);
  drawRightText(
    page,
    regular,
    truncateLine(regular, data.invoiceNo, 9.5, 190),
    contentRight,
    776,
    9.5,
    rgb(0.78, 0.82, 0.9)
  );

  const statusLabel = STATUS_LABELS[data.status] ?? data.status;
  const tone = statusTone(data.status);
  const statusWidth = Math.max(
    78,
    bold.widthOfTextAtSize(statusLabel, 8.2) + 24
  );
  const statusX = contentRight - statusWidth;
  page.drawText("BELGE DURUMU", {
    x: statusX,
    y: 748,
    size: 6.3,
    font: bold,
    color: COLORS.subtle,
  });
  page.drawRectangle({
    x: statusX,
    y: 714,
    width: statusWidth,
    height: 25,
    color: tone.background,
  });
  page.drawRectangle({
    x: statusX,
    y: 714,
    width: 3,
    height: 25,
    color: tone.foreground,
  });
  page.drawText(statusLabel, {
    x: statusX + 11,
    y: 722.5,
    size: 8.2,
    font: bold,
    color: tone.foreground,
  });

  const sellerX = PAGE_MARGIN;
  const sellerWidth = 248;
  const buyerX = 304;
  const buyerWidth = contentRight - buyerX;
  const partyY = 548;
  const partyHeight = 100;

  drawCard(page, sellerX, partyY, sellerWidth, partyHeight);
  drawCard(page, buyerX, partyY, buyerWidth, partyHeight);
  page.drawRectangle({
    x: sellerX,
    y: partyY + partyHeight - 3,
    width: 52,
    height: 3,
    color: COLORS.primary,
  });
  page.drawRectangle({
    x: buyerX,
    y: partyY + partyHeight - 3,
    width: 52,
    height: 3,
    color: COLORS.primary,
  });

  page.drawText("DÜZENLEYEN", {
    x: sellerX + 15,
    y: 627,
    size: 7,
    font: bold,
    color: COLORS.primaryDark,
  });
  drawWrappedText({
    page,
    font: bold,
    text: normalizedText(data.workspaceName),
    x: sellerX + 15,
    y: 604,
    size: 11.5,
    maxWidth: sellerWidth - 30,
    lineHeight: 14,
    maxLines: 2,
  });
  page.drawText("Dijital operasyon ve hizmet yönetimi", {
    x: sellerX + 15,
    y: 566,
    size: 7.3,
    font: regular,
    color: COLORS.muted,
  });

  const legalName = normalizedText(data.customer.legalName);
  const tradeName = normalizedText(data.customer.tradeName, "");
  const taxDetails = [data.customer.taxOffice, data.customer.taxNumber]
    .map((value) => normalizedText(value, ""))
    .filter(Boolean)
    .join(" / ");
  const contactDetails = [data.customer.email, data.customer.phone]
    .map((value) => normalizedText(value, ""))
    .filter(Boolean)
    .join(" / ");
  const customerDetails = [
    tradeName && tradeName !== legalName ? tradeName : "",
    taxDetails,
    data.customer.billingAddress,
    contactDetails,
  ]
    .map((value) => normalizedText(value, ""))
    .filter(Boolean)
    .join("  |  ");

  page.drawText("ALICI / MÜŞTERİ", {
    x: buyerX + 15,
    y: 627,
    size: 7,
    font: bold,
    color: COLORS.primaryDark,
  });
  drawWrappedText({
    page,
    font: bold,
    text: legalName,
    x: buyerX + 15,
    y: 604,
    size: 11.5,
    maxWidth: buyerWidth - 30,
    lineHeight: 14,
    maxLines: 2,
  });
  drawWrappedText({
    page,
    font: regular,
    text: customerDetails || "Müşteri iletişim bilgisi belirtilmedi.",
    x: buyerX + 15,
    y: 566,
    size: 7.2,
    maxWidth: buyerWidth - 30,
    color: COLORS.muted,
    lineHeight: 9.5,
    maxLines: 2,
  });

  const metaY = 478;
  const metaHeight = 52;
  page.drawRectangle({
    x: PAGE_MARGIN,
    y: metaY,
    width: contentWidth,
    height: metaHeight,
    color: COLORS.white,
    borderColor: COLORS.border,
    borderWidth: 0.75,
  });
  const metaItems = [
    { label: "DÜZENLEME TARİHİ", value: formatDate(data.issuedOn) },
    { label: "SON ÖDEME TARİHİ", value: formatDate(data.dueOn) },
    { label: "PARA BİRİMİ", value: data.currency.toLocaleUpperCase("tr-TR") },
  ];
  const metaColumnWidth = contentWidth / metaItems.length;
  metaItems.forEach((item, index) => {
    const x = PAGE_MARGIN + index * metaColumnWidth;
    if (index > 0) {
      page.drawLine({
        start: { x, y: metaY + 10 },
        end: { x, y: metaY + metaHeight - 10 },
        thickness: 0.75,
        color: COLORS.border,
      });
    }
    page.drawText(item.label, {
      x: x + 15,
      y: 509,
      size: 6.6,
      font: bold,
      color: COLORS.subtle,
    });
    page.drawText(item.value, {
      x: x + 15,
      y: 490,
      size: 9.3,
      font: bold,
      color: COLORS.ink,
    });
  });

  page.drawText("HİZMET DETAYI", {
    x: PAGE_MARGIN,
    y: 452,
    size: 7.2,
    font: bold,
    color: COLORS.primaryDark,
  });
  page.drawLine({
    start: { x: 128, y: 455 },
    end: { x: contentRight, y: 455 },
    thickness: 0.75,
    color: COLORS.border,
  });

  const tableHeaderY = 409;
  const tableBodyY = 326;
  const tableBodyHeight = 83;
  page.drawRectangle({
    x: PAGE_MARGIN,
    y: tableHeaderY,
    width: contentWidth,
    height: 28,
    color: COLORS.primarySoft,
  });
  page.drawRectangle({
    x: PAGE_MARGIN,
    y: tableBodyY,
    width: contentWidth,
    height: tableBodyHeight,
    color: COLORS.white,
    borderColor: COLORS.border,
    borderWidth: 0.75,
  });

  const columnXs = [318, 402, 476];
  columnXs.forEach((x) => {
    page.drawLine({
      start: { x, y: tableBodyY },
      end: { x, y: tableBodyY + tableBodyHeight },
      thickness: 0.6,
      color: COLORS.border,
    });
  });

  page.drawText("HİZMET / AÇIKLAMA", {
    x: 56,
    y: 419,
    size: 6.8,
    font: bold,
    color: COLORS.primaryDark,
  });
  drawRightText(page, bold, "ARA TOPLAM", 391, 419, 6.6, COLORS.primaryDark);
  drawRightText(page, bold, "KDV", 465, 419, 6.6, COLORS.primaryDark);
  drawRightText(page, bold, "TOPLAM", 541, 419, 6.6, COLORS.primaryDark);

  const description = normalizedText(data.description, "Hizmet Bedeli");
  const projectLine = data.project
    ? [data.project.code, data.project.name, data.project.branchName]
        .filter(Boolean)
        .join(" / ")
    : "";
  drawWrappedText({
    page,
    font: bold,
    text: description,
    x: 56,
    y: 374,
    size: 9.3,
    maxWidth: 246,
    lineHeight: 12.5,
    maxLines: 2,
  });
  if (projectLine) {
    page.drawText(truncateLine(regular, projectLine, 7.1, 246), {
      x: 56,
      y: 344,
      size: 7.1,
      font: regular,
      color: COLORS.muted,
    });
  }

  const subtotalText = pdfMoney(data.subtotal, data.currency);
  const taxText = pdfMoney(data.taxTotal, data.currency);
  const totalText = pdfMoney(data.total, data.currency);
  drawRightText(
    page,
    regular,
    subtotalText,
    391,
    363,
    fitTextSize(regular, subtotalText, 8.1, 6.5, 66)
  );
  drawRightText(
    page,
    regular,
    taxText,
    465,
    363,
    fitTextSize(regular, taxText, 8.1, 6.5, 58)
  );
  drawRightText(
    page,
    bold,
    totalText,
    541,
    363,
    fitTextSize(bold, totalText, 8.4, 6.5, 61)
  );

  const normalTotalRows = [
    { label: "Ara Toplam", value: data.subtotal },
    { label: "KDV Toplamı", value: data.taxTotal },
    ...(data.paidTotal > 0
      ? [{ label: "Ödenen Tutar", value: data.paidTotal }]
      : []),
  ];
  const balanceHeight = data.paidTotal > 0 ? 40 : 0;
  const summaryTop = 304;
  const summaryHeight = normalTotalRows.length * 26 + 72 + balanceHeight;
  const summaryY = summaryTop - summaryHeight;
  const notesX = PAGE_MARGIN;
  const notesWidth = 263;
  const totalsX = 321;
  const totalsWidth = contentRight - totalsX;

  page.drawRectangle({
    x: notesX,
    y: summaryY,
    width: notesWidth,
    height: summaryHeight,
    color: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 0.75,
  });
  page.drawRectangle({
    x: notesX,
    y: summaryTop - 3,
    width: 54,
    height: 3,
    color: COLORS.primary,
  });
  page.drawText("NOTLAR", {
    x: notesX + 15,
    y: summaryTop - 27,
    size: 7,
    font: bold,
    color: COLORS.primaryDark,
  });
  drawWrappedText({
    page,
    font: regular,
    text: normalizedText(
      data.notes,
      "Bu faturaya ait ek bir not bulunmuyor."
    ),
    x: notesX + 15,
    y: summaryTop - 50,
    size: 7.7,
    maxWidth: notesWidth - 30,
    color: COLORS.muted,
    lineHeight: 11,
    maxLines: Math.max(5, Math.floor((summaryHeight - 62) / 11)),
  });

  page.drawRectangle({
    x: totalsX,
    y: summaryY,
    width: totalsWidth,
    height: summaryHeight,
    color: COLORS.white,
    borderColor: COLORS.border,
    borderWidth: 0.75,
  });
  normalTotalRows.forEach((row, index) => {
    const rowY = summaryTop - 34 - index * 26;
    const rowText = pdfMoney(row.value, data.currency);
    const rowFont =
      index === normalTotalRows.length - 1 && data.paidTotal > 0
        ? bold
        : regular;
    page.drawText(row.label, {
      x: totalsX + 15,
      y: rowY,
      size: 7.7,
      font: regular,
      color: COLORS.muted,
    });
    drawRightText(
      page,
      rowFont,
      rowText,
      contentRight - 14,
      rowY,
      fitTextSize(rowFont, rowText, 8.2, 6.8, 95),
      COLORS.ink
    );
    if (index < normalTotalRows.length - 1) {
      page.drawLine({
        start: { x: totalsX + 15, y: rowY - 10 },
        end: { x: contentRight - 14, y: rowY - 10 },
        thickness: 0.5,
        color: COLORS.border,
      });
    }
  });

  const grandTotalY = summaryY + 12 + balanceHeight;
  page.drawRectangle({
    x: totalsX + 10,
    y: grandTotalY,
    width: totalsWidth - 20,
    height: 48,
    color: COLORS.ink,
  });
  page.drawText("GENEL TOPLAM", {
    x: totalsX + 24,
    y: grandTotalY + 29,
    size: 6.6,
    font: bold,
    color: COLORS.subtle,
  });
  const grandTotalText = pdfMoney(data.total, data.currency);
  drawRightText(
    page,
    bold,
    grandTotalText,
    contentRight - 24,
    grandTotalY + 13,
    fitTextSize(bold, grandTotalText, 13.5, 9.5, 118),
    COLORS.white
  );

  if (data.paidTotal > 0) {
    const balancePaid = data.balanceDue <= 0;
    page.drawRectangle({
      x: totalsX + 10,
      y: summaryY + 12,
      width: totalsWidth - 20,
      height: 32,
      color: balancePaid ? COLORS.successSoft : COLORS.primarySoft,
    });
    page.drawText(balancePaid ? "BAKİYE KAPANDI" : "KALAN BAKİYE", {
      x: totalsX + 24,
      y: summaryY + 23,
      size: 6.8,
      font: bold,
      color: balancePaid ? COLORS.success : COLORS.primaryDark,
    });
    const balanceText = pdfMoney(data.balanceDue, data.currency);
    drawRightText(
      page,
      bold,
      balanceText,
      contentRight - 24,
      summaryY + 21,
      fitTextSize(bold, balanceText, 9.3, 7.2, 92),
      balancePaid ? COLORS.success : COLORS.primaryDark
    );
  }

  page.drawLine({
    start: { x: PAGE_MARGIN, y: 72 },
    end: { x: contentRight, y: 72 },
    thickness: 0.75,
    color: COLORS.border,
  });
  page.drawRectangle({
    x: PAGE_MARGIN,
    y: 48,
    width: 3,
    height: 12,
    color: COLORS.primary,
  });
  page.drawText("ELEKTRONİK BELGE", {
    x: PAGE_MARGIN + 10,
    y: 52,
    size: 6.5,
    font: bold,
    color: COLORS.primaryDark,
  });
  page.drawText("Operasyon Merkezi tarafından anlık oluşturulmuştur.", {
    x: PAGE_MARGIN + 89,
    y: 52,
    size: 6.5,
    font: regular,
    color: COLORS.muted,
  });
  drawRightText(
    page,
    regular,
    data.invoiceNo + "  |  1 / 1",
    contentRight,
    52,
    6.5,
    COLORS.muted
  );

  return pdf.save();
}

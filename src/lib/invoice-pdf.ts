import { readFile } from "node:fs/promises";
import path from "node:path";
import * as fontkit from "@pdf-lib/fontkit";
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
  muted: rgb(0.39, 0.435, 0.51),
  primary: rgb(0.322, 0.404, 1),
  primaryDark: rgb(0.22, 0.286, 0.82),
  primarySoft: rgb(0.937, 0.945, 1),
  border: rgb(0.86, 0.88, 0.91),
  surface: rgb(0.972, 0.976, 0.984),
  white: rgb(1, 1, 1),
  success: rgb(0.08, 0.53, 0.36),
  danger: rgb(0.88, 0.2, 0.31),
  warning: rgb(0.82, 0.48, 0.08),
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

function statusColor(status: string) {
  if (status === "paid") return COLORS.success;
  if (status === "void") return COLORS.danger;
  if (status === "overdue") return COLORS.warning;
  return COLORS.primaryDark;
}

export async function createInvoicePdf(data: InvoicePdfData) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);

  const fontFiles = await loadFontFiles();
  const [regular, bold] = await Promise.all([
    pdf.embedFont(fontFiles.regular),
    pdf.embedFont(fontFiles.bold),
  ]);

  pdf.setTitle(`Fatura ${data.invoiceNo}`);
  pdf.setAuthor(data.workspaceName);
  pdf.setSubject(`${data.invoiceNo} numaralı fatura`);
  pdf.setCreator("Operasyon Merkezi");
  pdf.setProducer("Operasyon Merkezi");

  const page = pdf.addPage(A4);
  const [pageWidth] = A4;
  const contentRight = pageWidth - PAGE_MARGIN;

  page.drawRectangle({
    x: 0,
    y: 748,
    width: pageWidth,
    height: A4[1] - 748,
    color: COLORS.primary,
  });
  page.drawRectangle({
    x: 0,
    y: 748,
    width: 9,
    height: A4[1] - 748,
    color: COLORS.primaryDark,
  });

  page.drawText(
    truncateLine(bold, normalizedText(data.workspaceName), 17, 300),
    {
      x: PAGE_MARGIN,
      y: 799,
      size: 17,
      font: bold,
      color: COLORS.white,
    }
  );
  page.drawText("OPERASYON MERKEZİ", {
    x: PAGE_MARGIN,
    y: 778,
    size: 8,
    font: regular,
    color: rgb(0.85, 0.88, 1),
  });
  drawRightText(page, bold, "FATURA", contentRight, 798, 25, COLORS.white);
  drawRightText(
    page,
    regular,
    data.invoiceNo,
    contentRight,
    775,
    10,
    rgb(0.9, 0.92, 1)
  );

  drawCard(page, PAGE_MARGIN, 620, 244, 107);
  page.drawText("FATURAYI DÜZENLEYEN", {
    x: PAGE_MARGIN + 14,
    y: 706,
    size: 7.5,
    font: bold,
    color: COLORS.primaryDark,
  });
  drawWrappedText({
    page,
    font: bold,
    text: normalizedText(data.workspaceName),
    x: PAGE_MARGIN + 14,
    y: 683,
    size: 12,
    maxWidth: 216,
    maxLines: 2,
  });
  page.drawText("Operasyon Merkezi", {
    x: PAGE_MARGIN + 14,
    y: 642,
    size: 8.5,
    font: regular,
    color: COLORS.muted,
  });

  drawCard(page, 303, 620, 250, 107);
  page.drawText("SAYIN", {
    x: 317,
    y: 706,
    size: 7.5,
    font: bold,
    color: COLORS.primaryDark,
  });
  drawWrappedText({
    page,
    font: bold,
    text: normalizedText(data.customer.legalName),
    x: 317,
    y: 683,
    size: 11.5,
    maxWidth: 221,
    maxLines: 2,
  });
  const customerDetails = [
    [data.customer.taxOffice, data.customer.taxNumber].filter(Boolean).join(" / "),
    data.customer.billingAddress,
    data.customer.email ?? data.customer.phone,
  ]
    .map((value) => normalizedText(value, ""))
    .filter(Boolean)
    .join("  |  ");
  drawWrappedText({
    page,
    font: regular,
    text: customerDetails || "Müşteri iletişim bilgisi belirtilmedi.",
    x: 317,
    y: 648,
    size: 7.5,
    maxWidth: 221,
    color: COLORS.muted,
    lineHeight: 10,
    maxLines: 2,
  });

  drawCard(page, PAGE_MARGIN, 552, 511, 48);
  const detailColumns = [
    { label: "DÜZENLEME TARİHİ", value: formatDate(data.issuedOn) },
    { label: "SON ÖDEME TARİHİ", value: formatDate(data.dueOn) },
    {
      label: "DURUM",
      value: STATUS_LABELS[data.status] ?? data.status,
      color: statusColor(data.status),
    },
  ];
  detailColumns.forEach((detail, index) => {
    const x = PAGE_MARGIN + 14 + index * 170;
    if (index > 0) {
      page.drawLine({
        start: { x: x - 14, y: 560 },
        end: { x: x - 14, y: 592 },
        thickness: 0.7,
        color: COLORS.border,
      });
    }
    page.drawText(detail.label, {
      x,
      y: 582,
      size: 6.8,
      font: bold,
      color: COLORS.muted,
    });
    page.drawText(detail.value, {
      x,
      y: 565,
      size: 9.2,
      font: bold,
      color: detail.color ?? COLORS.ink,
    });
  });

  page.drawRectangle({
    x: PAGE_MARGIN,
    y: 493,
    width: 511,
    height: 31,
    color: COLORS.primarySoft,
  });
  page.drawText("HİZMET / AÇIKLAMA", {
    x: 54,
    y: 504,
    size: 7.2,
    font: bold,
    color: COLORS.primaryDark,
  });
  drawRightText(page, bold, "ARA TOPLAM", 394, 504, 7.2, COLORS.primaryDark);
  drawRightText(page, bold, "KDV", 474, 504, 7.2, COLORS.primaryDark);
  drawRightText(page, bold, "TOPLAM", 543, 504, 7.2, COLORS.primaryDark);

  page.drawRectangle({
    x: PAGE_MARGIN,
    y: 419,
    width: 511,
    height: 74,
    color: COLORS.white,
    borderColor: COLORS.border,
    borderWidth: 0.75,
  });
  const descriptionParts = [
    normalizedText(data.description, "Hizmet Bedeli"),
    data.project
      ? `${data.project.code} / ${data.project.name}${
          data.project.branchName ? ` / ${data.project.branchName}` : ""
        }`
      : "",
  ].filter(Boolean);
  drawWrappedText({
    page,
    font: bold,
    text: descriptionParts[0],
    x: 54,
    y: 463,
    size: 9.2,
    maxWidth: 235,
    maxLines: 2,
  });
  if (descriptionParts[1]) {
    drawWrappedText({
      page,
      font: regular,
      text: descriptionParts[1],
      x: 54,
      y: 435,
      size: 7.2,
      maxWidth: 235,
      color: COLORS.muted,
      maxLines: 1,
    });
  }
  drawRightText(
    page,
    regular,
    pdfMoney(data.subtotal, data.currency),
    394,
    454,
    8.2
  );
  drawRightText(
    page,
    regular,
    pdfMoney(data.taxTotal, data.currency),
    474,
    454,
    8.2
  );
  drawRightText(
    page,
    bold,
    pdfMoney(data.total, data.currency),
    543,
    454,
    8.4
  );

  const totalRows = [
    { label: "Ara Toplam", value: data.subtotal, bold: false },
    { label: "KDV Toplamı", value: data.taxTotal, bold: false },
    ...(data.paidTotal > 0
      ? [{ label: "Ödenen", value: data.paidTotal, bold: false }]
      : []),
    { label: "Genel Toplam", value: data.total, bold: true },
    ...(data.paidTotal > 0
      ? [{ label: "Kalan Bakiye", value: data.balanceDue, bold: true }]
      : []),
  ];
  const totalsHeight = totalRows.length * 26 + 20;
  const totalsY = 388 - totalsHeight;
  drawCard(page, 330, totalsY, 223, totalsHeight);
  totalRows.forEach((row, index) => {
    const rowY = totalsY + totalsHeight - 28 - index * 26;
    const rowFont = row.bold ? bold : regular;
    const rowColor = row.bold ? COLORS.ink : COLORS.muted;
    page.drawText(row.label, {
      x: 344,
      y: rowY,
      size: row.bold ? 9.2 : 8.2,
      font: rowFont,
      color: rowColor,
    });
    drawRightText(
      page,
      rowFont,
      pdfMoney(row.value, data.currency),
      539,
      rowY,
      row.bold ? 9.2 : 8.2,
      rowColor
    );
    if (row.label === "Genel Toplam" && index > 0) {
      page.drawLine({
        start: { x: 344, y: rowY + 17 },
        end: { x: 539, y: rowY + 17 },
        thickness: 0.7,
        color: COLORS.border,
      });
    }
  });

  page.drawText("NOTLAR", {
    x: PAGE_MARGIN,
    y: 372,
    size: 7.5,
    font: bold,
    color: COLORS.primaryDark,
  });
  drawWrappedText({
    page,
    font: regular,
    text: normalizedText(data.notes, "Bu faturaya ait ek bir not bulunmuyor."),
    x: PAGE_MARGIN,
    y: 351,
    size: 8,
    maxWidth: 257,
    color: COLORS.muted,
    lineHeight: 11,
    maxLines: 7,
  });

  page.drawLine({
    start: { x: PAGE_MARGIN, y: 68 },
    end: { x: contentRight, y: 68 },
    thickness: 0.75,
    color: COLORS.border,
  });
  page.drawText("Bu belge Operasyon Merkezi tarafından elektronik olarak oluşturulmuştur.", {
    x: PAGE_MARGIN,
    y: 49,
    size: 7,
    font: regular,
    color: COLORS.muted,
  });
  drawRightText(page, regular, "Sayfa 1 / 1", contentRight, 49, 7, COLORS.muted);

  return pdf.save();
}

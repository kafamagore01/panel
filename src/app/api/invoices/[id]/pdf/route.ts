import { z } from "zod";
import { requirePermission, PermissionError } from "@/lib/auth/permissions";
import { getTenantDb } from "@/lib/db/tenant";
import { createInvoicePdf } from "@/lib/invoice-pdf";
import { toNumber } from "@/lib/format";

export const runtime = "nodejs";

type Snapshot = Record<string, unknown>;

function snapshotValue(
  snapshot: Snapshot | null,
  key: string,
  fallback: string | null
) {
  const value = snapshot?.[key];
  return typeof value === "string" && value.trim() ? value : fallback;
}

export async function GET(
  _request: Request,
  context: RouteContext<"/api/invoices/[id]/pdf">
) {
  try {
    await requirePermission("module.view");
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) {
      return new Response("Geçersiz fatura kimliği.", { status: 400 });
    }

    const db = await getTenantDb();
    const invoice = await db.invoice.findUnique({
      where: { id },
      include: {
        workspace: { select: { name: true } },
        customer: {
          select: {
            legal_name: true,
            trade_name: true,
            tax_number: true,
            tax_office: true,
            billing_address: true,
            email: true,
            phone: true,
          },
        },
        project: {
          select: {
            code: true,
            name: true,
            branch_name: true,
          },
        },
      },
    });

    if (!invoice) {
      return new Response("Fatura bulunamadı.", { status: 404 });
    }

    const snapshot =
      invoice.customer_snapshot &&
      typeof invoice.customer_snapshot === "object" &&
      !Array.isArray(invoice.customer_snapshot)
        ? (invoice.customer_snapshot as Snapshot)
        : null;

    const pdfBytes = await createInvoicePdf({
      invoiceNo: invoice.invoice_no,
      status: invoice.status,
      issuedOn: invoice.issued_on,
      dueOn: invoice.due_on,
      currency: invoice.currency,
      subtotal: toNumber(invoice.subtotal),
      taxTotal: toNumber(invoice.tax_total),
      total: toNumber(invoice.total),
      paidTotal: toNumber(invoice.paid_total),
      balanceDue: toNumber(invoice.balance_due),
      description: invoice.description,
      notes: invoice.notes,
      workspaceName: invoice.workspace.name,
      customer: {
        legalName:
          snapshotValue(snapshot, "legal_name", invoice.customer.legal_name) ??
          invoice.customer.legal_name,
        tradeName: snapshotValue(
          snapshot,
          "trade_name",
          invoice.customer.trade_name
        ),
        taxNumber: snapshotValue(
          snapshot,
          "tax_number",
          invoice.customer.tax_number
        ),
        taxOffice: snapshotValue(
          snapshot,
          "tax_office",
          invoice.customer.tax_office
        ),
        billingAddress: snapshotValue(
          snapshot,
          "billing_address",
          invoice.customer.billing_address
        ),
        email: snapshotValue(snapshot, "email", invoice.customer.email),
        phone: invoice.customer.phone,
      },
      project: invoice.project
        ? {
            code: invoice.project.code,
            name: invoice.project.name,
            branchName: invoice.project.branch_name,
          }
        : null,
    });

    const filename = `${invoice.invoice_no.replace(/[^A-Za-z0-9_-]/g, "_")}.pdf`;
    const body = pdfBytes.buffer.slice(
      pdfBytes.byteOffset,
      pdfBytes.byteOffset + pdfBytes.byteLength
    ) as ArrayBuffer;

    return new Response(body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
        "Content-Length": String(pdfBytes.byteLength),
      },
    });
  } catch (error) {
    if (error instanceof PermissionError) {
      return new Response(error.message, { status: error.status });
    }
    console.error(error);
    return new Response("PDF oluşturulurken beklenmeyen bir hata oluştu.", {
      status: 500,
    });
  }
}

/**
 * E-posta gönderim soyutlaması.
 * Sürücü EMAIL_DRIVER ortam değişkeni ile seçilir: "smtp" (Nodemailer) | "resend".
 */
import { safeHttpRequest } from "@/lib/security/ssrf-guard";
import { requireEnvironmentVariable } from "@/lib/env";

export type SendEmailOptions = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export async function sendEmail(options: SendEmailOptions): Promise<void> {
  const driver = process.env.EMAIL_DRIVER ?? "smtp";
  if (driver === "resend") {
    await sendWithResend(options);
  } else {
    await sendWithSmtp(options);
  }
}

async function sendWithSmtp(options: SendEmailOptions): Promise<void> {
  const nodemailer = (await import("nodemailer9")).default;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text,
  });
}

async function sendWithResend(options: SendEmailOptions): Promise<void> {
  const apiKey = requireEnvironmentVariable("RESEND_API_KEY");
  const response = await safeHttpRequest("https://api.resend.com/emails", {
    method: "POST",
    allowedProtocols: ["https:"],
    redirect: "error",
    timeoutMs: 10_000,
    maxResponseBytes: 4_096,
    bodyLimitMode: "truncate",
    subject: "Resend API",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? "no-reply@example.com",
      to: [options.to],
      subject: options.subject,
      html: options.html,
      text: options.text,
    }),
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Resend e-posta gönderimi HTTP ${response.status} ile başarısız.`);
  }
}

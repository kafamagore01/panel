/**
 * E-posta gönderim soyutlaması.
 * Sürücü EMAIL_DRIVER ortam değişkeni ile seçilir: "smtp" (Nodemailer) | "resend".
 */

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
  const nodemailer = (await import("nodemailer")).default;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
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
  const { Resend } = await import("resend");
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: process.env.EMAIL_FROM ?? "no-reply@example.com",
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text,
  });
  if (error) {
    throw new Error(`Resend e-posta gönderimi başarısız: ${error.message}`);
  }
}

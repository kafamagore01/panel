/** Basit, satır içi stillenmiş e-posta şablonları. */

export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] ?? character
  );
}

function singleLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function safeHttpUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.toString();
    }
  } catch {
    // Aşağıdaki güvenli fallback kullanılır.
  }
  return "#";
}

function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="tr">
  <body style="margin:0;padding:32px 16px;background:#f4f5f7;font-family:Segoe UI,Arial,sans-serif;color:#141821;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:22px;padding:32px;">
      <div style="display:inline-block;background:#5267ff;color:#ffffff;font-weight:800;border-radius:12px;padding:8px 14px;margin-bottom:16px;">PT</div>
      <h1 style="font-size:20px;margin:0 0 16px;">${escapeHtml(title)}</h1>
      ${body}
      <p style="font-size:12px;color:#64748b;margin-top:32px;">
        Bu e-posta Operasyon Merkezi tarafından gönderilmiştir. Siz talep etmediyseniz dikkate almayın.
      </p>
    </div>
  </body>
</html>`;
}

export function otpEmail(code: string): { subject: string; html: string; text: string } {
  const safeCode = escapeHtml(code);
  return {
    subject: `Doğrulama kodunuz: ${singleLine(code)}`,
    html: layout(
      "Doğrulama Kodu",
      `<p>Giriş işleminizi tamamlamak için aşağıdaki kodu kullanın. Kod <strong>10 dakika</strong> geçerlidir.</p>
       <p style="font-size:32px;font-weight:800;letter-spacing:8px;background:#f4f5f7;border-radius:12px;padding:16px;text-align:center;">${safeCode}</p>`
    ),
    text: `Doğrulama kodunuz: ${code} (10 dakika geçerlidir)`,
  };
}

export function inviteEmail(params: {
  workspaceName: string;
  inviterName: string;
  email: string;
  tempPassword: string;
  loginUrl: string;
}): { subject: string; html: string; text: string } {
  const { workspaceName, inviterName, email, tempPassword, loginUrl } = params;
  const safeWorkspaceName = escapeHtml(workspaceName);
  const safeInviterName = escapeHtml(inviterName);
  const safeEmail = escapeHtml(email);
  const safePassword = escapeHtml(tempPassword);
  const normalizedLoginUrl = safeHttpUrl(loginUrl);
  const safeLoginUrl = escapeHtml(normalizedLoginUrl);
  return {
    subject: `${singleLine(workspaceName)} çalışma alanına davet edildiniz`,
    html: layout(
      "Çalışma Alanı Daveti",
      `<p><strong>${safeInviterName}</strong> sizi <strong>${safeWorkspaceName}</strong> çalışma alanına davet etti.</p>
       <p>Giriş bilgileriniz:</p>
       <p style="background:#f4f5f7;border-radius:12px;padding:16px;">
         E-posta: <strong>${safeEmail}</strong><br/>
         Geçici parola: <strong>${safePassword}</strong>
       </p>
       <p>İlk girişte parolanızı değiştirmeniz istenecektir.</p>
       <p><a href="${safeLoginUrl}" style="display:inline-block;background:#5267ff;color:#ffffff;text-decoration:none;border-radius:12px;padding:12px 24px;font-weight:600;">Panele Giriş Yap</a></p>`
    ),
    text: `${singleLine(inviterName)} sizi ${singleLine(workspaceName)} çalışma alanına davet etti. E-posta: ${singleLine(email)} Geçici parola: ${singleLine(tempPassword)} Giriş: ${normalizedLoginUrl}`,
  };
}

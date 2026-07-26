import assert from "node:assert/strict";
import test from "node:test";
import { escapeHtml, inviteEmail } from "./templates";

test("HTML metakarakterlerini encode eder", () => {
  assert.equal(
    escapeHtml(`<img src=x onerror="alert('x')">&`),
    "&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;&amp;"
  );
});

test("davet alanları HTML veya attribute enjeksiyonu üretemez", () => {
  const mail = inviteEmail({
    workspaceName: `Acme</strong><img src=x onerror=alert(1)>`,
    inviterName: `<script>alert(1)</script>`,
    email: `x@example.com"><img src=x>`,
    tempPassword: `<b>secret</b>`,
    loginUrl: `javascript:alert(1)`,
  });
  assert.ok(!mail.html.includes("<script>"));
  assert.ok(!mail.html.includes("<img src=x"));
  assert.ok(!mail.html.includes("javascript:"));
  assert.ok(mail.html.includes('href="#"'));
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  assertSafeWebhookUrl,
  isBlockedIp,
  resolveSafeHostname,
  safeHttpRequest,
  SsrfError,
} from "./ssrf-guard";

test("özel, loopback ve ayrılmış IPv4 aralıklarını engeller", () => {
  for (const address of [
    "0.0.0.1",
    "10.1.2.3",
    "100.64.0.1",
    "127.0.0.1",
    "169.254.169.254",
    "172.31.255.255",
    "192.168.1.1",
    "198.18.0.1",
    "224.0.0.1",
    "255.255.255.255",
  ]) {
    assert.equal(isBlockedIp(address), true, address);
  }
});

test("genel IPv4 adreslerini kabul eder", () => {
  assert.equal(isBlockedIp("1.1.1.1"), false);
  assert.equal(isBlockedIp("8.8.8.8"), false);
});

test("IPv6 özel ve özel amaçlı aralıkların tamamını engeller", () => {
  for (const address of [
    "::",
    "::1",
    "fc00::1",
    "fdff::1",
    "fe80::1",
    "fe90::1",
    "febf::1",
    "fec0::1",
    "ff02::1",
    "2001:db8::1",
    "2002:7f00:1::",
    "::ffff:127.0.0.1",
    "::ffff:192.168.1.1",
    "::ffff:c0a8:1",
  ]) {
    assert.equal(isBlockedIp(address), true, address);
  }
});

test("genel IPv6 adreslerini kabul eder", () => {
  assert.equal(isBlockedIp("2606:4700:4700::1111"), false);
  assert.equal(isBlockedIp("2001:4860:4860::8888"), false);
});

test("URL içindeki alternatif loopback yazımlarını bağlantıdan önce reddeder", async () => {
  for (const url of [
    "http://127.0.0.1/",
    "http://2130706433/",
    "http://0177.0.0.1/",
    "http://[::1]/",
    "http://[::ffff:7f00:1]/",
  ]) {
    await assert.rejects(
      safeHttpRequest(url, {
        allowedProtocols: ["http:", "https:"],
        timeoutMs: 100,
      }),
      SsrfError,
      url
    );
  }
});

test("HTTPS zorunlu akışta protokol ve URL credential bilgilerini reddeder", async () => {
  await assert.rejects(
    assertSafeWebhookUrl("http://8.8.8.8/hook"),
    SsrfError
  );
  await assert.rejects(
    assertSafeWebhookUrl("https://user:pass@8.8.8.8/hook"),
    SsrfError
  );
});

test("literal genel IP DNS'e gitmeden güvenli hedef olarak çözülür", async () => {
  const result = await resolveSafeHostname("8.8.8.8");
  assert.deepEqual(result, [{ address: "8.8.8.8", family: 4 }]);
});

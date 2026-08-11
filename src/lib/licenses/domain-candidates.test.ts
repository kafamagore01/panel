import assert from "node:assert/strict";
import test from "node:test";
import { buildLicenseDomainCandidates } from "./domain-candidates";

test("domain adaylarını kaynaklarıyla tekilleştirir", () => {
  const result = buildLicenseDomainCandidates({
    liveUrl: "https://Example.com/app",
    adminUrl: "https://admin.example.com/login",
    inventoryDomains: [
      { name: "example.com", normalized_name: "example.com" },
      { name: "other.test", normalized_name: "other.test" },
    ],
  });

  assert.deepEqual(result, [
    { domain: "admin.example.com", sources: ["Proje yönetim adresi"] },
    {
      domain: "example.com",
      sources: ["Proje canlı adresi", "Domainler kaydı"],
    },
    { domain: "other.test", sources: ["Domainler kaydı"] },
  ]);
});

test("geçersiz ve boş URL/domain değerlerini yok sayar", () => {
  assert.deepEqual(
    buildLicenseDomainCandidates({ liveUrl: "not a domain", adminUrl: null }),
    []
  );
});

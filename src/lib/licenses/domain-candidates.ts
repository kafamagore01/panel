import { normalizeDomain } from "@/lib/domain";

export type LicenseDomainCandidate = {
  domain: string;
  sources: string[];
};

export type LicenseProjectOption = {
  id: string;
  label: string;
  product_name: string;
  domain_candidates: LicenseDomainCandidate[];
};

export type DomainInventoryRecord = {
  name: string;
  normalized_name: string;
};

/**
 * Proje URL'leri ile Domainler envanterindeki kayıtları tekilleştirir.
 * Aynı host birden fazla yerde kayıtlıysa kullanıcıya tek seçenek olarak gösterilir.
 */
export function buildLicenseDomainCandidates(input: {
  liveUrl?: string | null;
  adminUrl?: string | null;
  inventoryDomains?: DomainInventoryRecord[];
}): LicenseDomainCandidate[] {
  const candidates = new Map<string, Set<string>>();

  const add = (raw: string | null | undefined, source: string) => {
    if (!raw) return;
    const normalized = normalizeDomain(raw);
    if (!normalized) return;
    const sources = candidates.get(normalized) ?? new Set<string>();
    sources.add(source);
    candidates.set(normalized, sources);
  };

  add(input.liveUrl, "Proje canlı adresi");
  add(input.adminUrl, "Proje yönetim adresi");
  for (const record of input.inventoryDomains ?? []) {
    add(record.normalized_name || record.name, "Domainler kaydı");
  }

  return [...candidates.entries()]
    .map(([domain, sources]) => ({ domain, sources: [...sources] }))
    .sort((a, b) => a.domain.localeCompare(b.domain, "tr"));
}

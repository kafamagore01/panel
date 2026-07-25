const BRANCH_SUFFIX_PATTERN = /(?:\s*-\s*|\s+)şube$/iu;

export function normalizeBranchName(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(BRANCH_SUFFIX_PATTERN, "")
    .trim()
    .toLocaleUpperCase("tr-TR");
}

export function buildBranchLegalName(
  parentLegalName: string,
  branchName: string
): string {
  const normalizedParentName = parentLegalName.trim().replace(/\s+/g, " ");
  const normalizedBranchName = normalizeBranchName(branchName);

  if (!normalizedParentName || !normalizedBranchName) return "";
  return `${normalizedParentName} - ${normalizedBranchName} ŞUBE`;
}

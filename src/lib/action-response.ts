import type { ZodError } from "zod";

/** Tüm Server Action mutasyonlarının standart yanıt tipi. */
export type ActionResponse<T = unknown> =
  | { success: true; message?: string; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

export function ok<T>(data: T, message?: string): ActionResponse<T> {
  return { success: true, data, message };
}

export function fail(
  error: string,
  fieldErrors?: Record<string, string[]>
): ActionResponse<never> {
  return { success: false, error, fieldErrors };
}

export function zodFail(error: ZodError): ActionResponse<never> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return {
    success: false,
    error: "Form doğrulaması başarısız. Lütfen alanları kontrol edin.",
    fieldErrors,
  };
}

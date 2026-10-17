/**
 * A readable line for a failed call. Supabase errors keep their message, code and details in
 * fields that some consoles print as `{}`, so spell them out.
 */
export function errorText(e: unknown): string {
  if (!e || typeof e !== 'object') return String(e);
  const err = e as { name?: unknown; message?: unknown; code?: unknown; details?: unknown; hint?: unknown; status?: unknown };
  const parts = [
    typeof err.name === 'string' && err.name !== 'Error' ? err.name : '',
    typeof err.message === 'string' ? err.message : '',
    err.code ? `(code ${String(err.code)})` : '',
    err.status ? `(status ${String(err.status)})` : '',
    typeof err.details === 'string' && err.details ? `details: ${err.details}` : '',
    typeof err.hint === 'string' && err.hint ? `hint: ${err.hint}` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' ') : JSON.stringify(e);
}

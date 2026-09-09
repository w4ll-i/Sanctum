/**
 * HaveIBeenPwned breach detection using k-anonymity.
 *
 * Only the first 5 characters of the SHA-1 hash are sent to the HIBP API.
 * The server NEVER sees the full password or hash — the browser does the check locally.
 *
 * Spec: https://haveibeenpwned.com/API/v3#SearchingPwnedPasswordsByRange
 */

const HIBP_CACHE = new Map(); // prefix → response text (in-memory cache)

/**
 * Check a plaintext password against HIBP.
 * @returns {number} Number of times found in breaches (0 = safe)
 */
export async function checkPasswordBreach(password) {
  if (!password) return 0;

  const hashBuffer = await crypto.subtle.digest(
    'SHA-1',
    new TextEncoder().encode(password)
  );
  const hashHex = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();

  const prefix = hashHex.slice(0, 5);
  const suffix = hashHex.slice(5);

  // Use cache to avoid hammering the API for the same prefix
  let responseText = HIBP_CACHE.get(prefix);
  if (!responseText) {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'Add-Padding': 'true' },
    });
    if (!res.ok) throw new Error('HIBP API unavailable');
    responseText = await res.text();
    HIBP_CACHE.set(prefix, responseText);
  }

  for (const line of responseText.split('\r\n')) {
    const [lineSuffix, count] = line.split(':');
    if (lineSuffix?.trim() === suffix) {
      return Number.parseInt(count, 10);
    }
  }
  return 0;
}

/**
 * Batch check multiple passwords.
 * Processes sequentially to avoid hammering the API.
 * @param {Array<{id, password}>} items
 * @returns {Map<id, count>}
 */
export async function checkPasswordsBatch(items, onProgress) {
  const results = new Map();
  for (let i = 0; i < items.length; i++) {
    const { id, password } = items[i];
    try {
      const count = await checkPasswordBreach(password);
      results.set(id, count);
    } catch {
      results.set(id, -1); // -1 = check failed
    }
    onProgress?.(i + 1, items.length);
    // Small delay to be polite to the API
    if (i < items.length - 1) await new Promise(r => setTimeout(r, 80));
  }
  return results;
}

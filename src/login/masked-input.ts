// The masked secret field. The real text stays in memory; the field only ever
// draws bullets. After each edit the host redraws the field as bullets, so the
// value it reports starts with the bullets that were already there.

export const BULLET = "•";

// The field's text for a secret: one bullet per character.
export function maskOf(secret: string): string {
  return BULLET.repeat(secret.length);
}

// The new secret after an edit: the bullets still at the front keep their
// characters, and whatever was typed, pasted or deleted after them is taken as
// given.
export function applyInput(secret: string, value: string): string {
  let kept = 0;
  while (kept < value.length && value[kept] === BULLET) kept += 1;
  return secret.slice(0, kept) + value.slice(kept);
}

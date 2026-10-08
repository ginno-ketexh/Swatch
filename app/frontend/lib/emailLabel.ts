export function emailLabel(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0 || at === email.length - 1) return "Signed in";
  return `${email[0]}…@${email[at + 1]}…`;
}

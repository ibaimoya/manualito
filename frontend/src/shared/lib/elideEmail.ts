/**
 * Acorta emails larguísimos conservando el dominio visible
 * ("aaaaaaaaaaaaaaaaaa…@gmail.com"), que orienta más que un corte CSS a
 * ciegas. "localMax" se ajusta al hueco: 18 cabe en el perfil, la sidebar
 * necesita menos.
 */
export function elideEmail(email: string, localMax = 18): string {
  const at = email.lastIndexOf('@');
  if (at <= localMax) return email;
  return `${email.slice(0, localMax)}…${email.slice(at)}`;
}

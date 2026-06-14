import type { ReactNode } from 'react';

/** Resalta la primera coincidencia de "query" en "name" (insensible a mayúsculas). */
export function highlightMatch(name: string, query: string, minChars = 1): ReactNode {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0 || needle.length < minChars) return name;
  const index = name.toLowerCase().indexOf(needle);
  if (index === -1) return name;
  return (
    <>
      {name.slice(0, index)}
      <mark className="rounded-[3px] bg-primary-100 px-px text-primary-700">
        {name.slice(index, index + needle.length)}
      </mark>
      {name.slice(index + needle.length)}
    </>
  );
}

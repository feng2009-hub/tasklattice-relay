export type MultiSelectOption = {
  description?: string;
  disabled?: boolean;
  label: string;
  meta?: string;
  value: string;
};

export function filterOptionsByPrefix(
  options: readonly MultiSelectOption[],
  query: string,
) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return [...options];
  return options.filter((option) =>
    option.label.toLocaleLowerCase().startsWith(normalizedQuery),
  );
}

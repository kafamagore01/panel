export function parseOptionValue<
  const TOptions extends readonly { value: string }[],
>(
  input: string | undefined,
  options: TOptions
): TOptions[number]["value"] | undefined {
  if (!input) return undefined;
  return options.some((option) => option.value === input)
    ? (input as TOptions[number]["value"])
    : undefined;
}

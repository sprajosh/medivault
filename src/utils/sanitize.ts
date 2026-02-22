export function sanitizeTextInput(value: string): string {
  return value.replace(/\s+/g, " ").trimStart();
}

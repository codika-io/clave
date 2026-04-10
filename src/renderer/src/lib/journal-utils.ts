/** Strip XML-like tags and clean up display text */
export function cleanSummary(text: string): string {
  return text.replace(/<\/?[a-zA-Z][a-zA-Z0-9_-]*>/g, '').trim()
}

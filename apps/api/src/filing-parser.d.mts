export type SectionHeading = { index: number; line: number; heading: string };
export function cleanFilingText(html: string): string;
export function findSectionHeading(text: string, patterns: RegExp[]): SectionHeading | null;
export function extractItemSection(text: string, patterns: RegExp[]): string | null;

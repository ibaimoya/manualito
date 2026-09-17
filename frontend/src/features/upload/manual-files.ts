export const MB = 1_000_000;
export const MAX_PAGES = 30;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

type FileIssue =
  | 'mixedFiles'
  | 'pdfAlreadyAdded'
  | 'imagesAlreadyAdded'
  | 'unsupportedImage'
  | 'pdfTooLarge'
  | 'imageTooLarge'
  | 'tooManyPages'
  | 'totalTooLarge';

type FileSelection = { files: File[]; issue?: FileIssue; max?: number };

export function selectManualFiles(current: File[], incoming: File[]): FileSelection {
  if (!incoming.length) return { files: [] };
  if (current.some((file) => file.type === 'application/pdf')) {
    return { files: [], issue: 'pdfAlreadyAdded' };
  }
  const pdfs = incoming.filter((file) => file.type === 'application/pdf');
  if (pdfs.length) return selectPdf(current, incoming);

  const files = incoming.filter((file) => IMAGE_TYPES.has(file.type));
  if (files.some((file) => file.size > 30 * MB)) {
    return { files: [], issue: 'imageTooLarge', max: 30 };
  }
  if (current.length + files.length > MAX_PAGES) {
    return { files: [], issue: 'tooManyPages', max: MAX_PAGES };
  }
  if ([...current, ...files].reduce((total, file) => total + file.size, 0) > 95 * MB) {
    return { files: [], issue: 'totalTooLarge', max: 95 };
  }
  return { files, issue: files.length < incoming.length ? 'unsupportedImage' : undefined };
}

function selectPdf(current: File[], incoming: File[]): FileSelection {
  if (incoming.length !== 1) return { files: [], issue: 'mixedFiles' };
  if (current.length) return { files: [], issue: 'imagesAlreadyAdded' };
  if (incoming[0]!.size > 95 * MB) return { files: [], issue: 'pdfTooLarge', max: 95 };
  return { files: incoming };
}

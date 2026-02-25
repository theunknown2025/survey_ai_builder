import { SavedSurvey } from '../../../lib/surveyApi';

/**
 * Copy public link to clipboard
 */
export async function copyLink(savedSurvey: SavedSurvey): Promise<void> {
  try {
    await navigator.clipboard.writeText(savedSurvey.publicLink);
  } catch (error) {
    // Fallback for browsers that don't support clipboard API
    const textArea = document.createElement('textarea');
    textArea.value = savedSurvey.publicLink;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
    } catch (err) {
      throw new Error('Failed to copy link to clipboard');
    } finally {
      document.body.removeChild(textArea);
    }
  }
}

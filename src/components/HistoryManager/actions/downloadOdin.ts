import { SavedSurvey } from '../../../lib/surveyApi';

/**
 * Download ODIN file
 */
export function downloadOdin(savedSurvey: SavedSurvey): void {
  try {
    const blob = new Blob([savedSurvey.odinContent], {
      type: 'text/plain;charset=utf-8',
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${savedSurvey.title.replace(/[^a-zA-Z0-9]/g, '_')}_${savedSurvey._id || Date.now()}.odin`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    throw new Error(`Failed to download ODIN file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

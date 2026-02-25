import { SavedSurvey } from '../../../lib/surveyApi';

/**
 * Download survey as JSON file
 */
export function downloadJson(savedSurvey: SavedSurvey): void {
  try {
    const blob = new Blob([savedSurvey.surveyJson], {
      type: 'application/json;charset=utf-8',
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${savedSurvey.title.replace(/[^a-zA-Z0-9]/g, '_')}_${savedSurvey._id || Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    throw new Error(`Failed to download JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

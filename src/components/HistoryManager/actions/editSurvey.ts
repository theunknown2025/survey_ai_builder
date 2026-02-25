import { SavedSurvey } from '../../../lib/surveyApi';
import { Survey } from '../../../types/survey';

/**
 * Get survey data for editing
 */
export function getSurveyForEdit(savedSurvey: SavedSurvey): Survey {
  try {
    const survey: Survey = JSON.parse(savedSurvey.surveyJson);
    return survey;
  } catch (error) {
    throw new Error(`Failed to parse survey JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

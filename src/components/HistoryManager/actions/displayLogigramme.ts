import { SavedSurvey } from '../../../lib/mongodb';
import { Logigramme } from '../../../types/survey';

/**
 * Extract and return logigramme from saved survey
 */
export function displayLogigramme(savedSurvey: SavedSurvey): Logigramme | null {
  try {
    const survey = JSON.parse(savedSurvey.surveyJson);
    return survey.logigramme || null;
  } catch (error) {
    throw new Error(`Failed to parse survey JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

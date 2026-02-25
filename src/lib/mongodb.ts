/**
 * MongoDB API client
 * Connects to the Express backend that uses MongoDB directly.
 * The backend server runs on port 3001 (or PORT env variable).
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export interface SavedSurvey {
  _id?: string;
  title: string;
  surveyJson: string; // JSON string of the full survey
  odinContent: string; // ODIN file content
  publicLink: string; // Public test link from Nfield
  createdAt: Date | string;
  updatedAt: Date | string;
}

/**
 * Save survey to MongoDB via backend API
 */
export async function saveSurvey(
  title: string,
  surveyJson: string,
  odinContent: string,
  publicLink: string
): Promise<SavedSurvey> {
  const survey: Omit<SavedSurvey, '_id'> = {
    title,
    surveyJson,
    odinContent,
    publicLink,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const response = await fetch(`${API_BASE_URL}/api/surveys`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(survey),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(`Failed to save survey: ${error.error || response.statusText}`);
  }

  return (await response.json()) as SavedSurvey;
}

export async function getAllSurveys(): Promise<SavedSurvey[]> {
  const response = await fetch(`${API_BASE_URL}/api/surveys`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(`Failed to load surveys: ${error.error || response.statusText}`);
  }

  return (await response.json()) as SavedSurvey[];
}

export async function getSurveyById(id: string): Promise<SavedSurvey | null> {
  const response = await fetch(`${API_BASE_URL}/api/surveys/${id}`);

  if (!response.ok) {
    if (response.status === 404) return null;
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(`Failed to load survey: ${error.error || response.statusText}`);
  }

  return (await response.json()) as SavedSurvey;
}

export async function deleteSurvey(id: string): Promise<boolean> {
  const response = await fetch(`${API_BASE_URL}/api/surveys/${id}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(`Failed to delete survey: ${error.error || response.statusText}`);
  }

  return true;
}

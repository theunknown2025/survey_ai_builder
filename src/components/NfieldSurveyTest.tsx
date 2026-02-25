import { useState, useEffect, useCallback } from 'react';
import { Survey } from '../types/survey';
import {
  getNfieldToken,
  listSurveys,
  createSurvey,
  uploadScript,
  publishSurvey,
  getPublicIds,
  getTestLinkFromPublicIds,
  type NfieldConfig,
} from '../api/nfield';
import { generateNipoFile } from '../utils/generateNipoFile';
import { ExternalLink, Loader2, RefreshCw, CheckCircle, XCircle } from 'lucide-react';

const NFIELD_CONFIG: NfieldConfig = {
  domain: 'ic',
  username: 'nursyte_dev',
  password: 'X$Js82Tpm8KP',
  baseUrl: 'https://api.nfieldmr.com',
};

const SURVEY_GROUP_ID = '3';

type ConnectionStatus = 'idle' | 'checking' | 'connected' | 'disconnected' | 'error';

interface NfieldSurveyTestProps {
  /** Full survey (title + logigramme) for script generation and Nfield push */
  survey: Survey | null;
  /** Callback when survey is started and test link is available */
  onSurveyStarted?: (testLink: string) => void;
}

export default function NfieldSurveyTest({ survey, onSurveyStarted }: NfieldSurveyTestProps) {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [startSurveyLoading, setStartSurveyLoading] = useState(false);
  const [startSurveyError, setStartSurveyError] = useState<string | null>(null);
  const [testLink, setTestLink] = useState<string | null>(null);

  const checkConnection = useCallback(async () => {
    setConnectionStatus('checking');
    setConnectionError(null);
    try {
      await getNfieldToken(NFIELD_CONFIG);
      await listSurveys(NFIELD_CONFIG);
      setConnectionStatus('connected');
    } catch (err) {
      setConnectionStatus('error');
      setConnectionError(err instanceof Error ? err.message : 'Connection failed');
    }
  }, []);

  useEffect(() => {
    checkConnection();
  }, [checkConnection]);

  const handleStartSurvey = useCallback(async () => {
    if (testLink) {
      window.open(testLink, '_blank', 'noopener,noreferrer');
      return;
    }
    if (!survey?.logigramme) {
      setStartSurveyError('No survey or logigramme to push to Nfield.');
      return;
    }
    setStartSurveyLoading(true);
    setStartSurveyError(null);
    try {
      const scriptContent = generateNipoFile({ ...survey, logigramme: survey.logigramme });
      const title = survey.title?.trim() || 'Survey';

      // V2/token - already validated by connection check; listSurveys/createSurvey use ensureToken
      const surveys = await listSurveys(NFIELD_CONFIG);
      const existing = surveys.find((s) => s.Name && s.Name.toLowerCase() === title.toLowerCase());
      let surveyId: string;

      if (existing?.SurveyId) {
        surveyId = existing.SurveyId;
        await uploadScript(NFIELD_CONFIG, surveyId, scriptContent);
        await publishSurvey(NFIELD_CONFIG, surveyId);
      } else {
        // Use 'Online' survey type as it's required for script uploads (CAWI/web surveys)
        const created = await createSurvey(NFIELD_CONFIG, title, SURVEY_GROUP_ID, 'Online');
        surveyId = created.SurveyId;
        await uploadScript(NFIELD_CONFIG, surveyId, scriptContent);
        await publishSurvey(NFIELD_CONFIG, surveyId);
      }

      const publicIds = await getPublicIds(NFIELD_CONFIG, surveyId);
      const url = getTestLinkFromPublicIds(publicIds);
      if (!url) throw new Error('No test URL in publicIds response');
      setTestLink(url);
      onSurveyStarted?.(url);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setStartSurveyError(err instanceof Error ? err.message : 'Failed to start survey in Nfield');
    } finally {
      setStartSurveyLoading(false);
    }
  }, [survey, testLink]);

  const isConnected = connectionStatus === 'connected';
  const isChecking = connectionStatus === 'checking';

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Test in Nfield</h3>

      {/* Connection status */}
      <div className="flex items-center justify-between mb-4 p-4 rounded-lg bg-gray-50 border border-gray-200">
        <div className="flex items-center gap-3">
          {connectionStatus === 'checking' && (
            <Loader2 className="w-5 h-5 text-blue-600 animate-spin" aria-hidden />
          )}
          {connectionStatus === 'connected' && (
            <CheckCircle className="w-5 h-5 text-green-600" aria-hidden />
          )}
          {(connectionStatus === 'error' || connectionStatus === 'disconnected') && (
            <XCircle className="w-5 h-5 text-red-600" aria-hidden />
          )}
          {connectionStatus === 'idle' && (
            <Loader2 className="w-5 h-5 text-gray-400 animate-spin" aria-hidden />
          )}
          <div>
            <p className="font-medium text-gray-900">
              {isChecking && 'Checking Nfield…'}
              {isConnected && 'Nfield connected'}
              {(connectionStatus === 'error' || connectionStatus === 'disconnected') && 'Nfield not connected'}
              {connectionStatus === 'idle' && 'Checking…'}
            </p>
            {connectionError && (
              <p className="text-sm text-red-600 mt-0.5">{connectionError}</p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={checkConnection}
          disabled={isChecking}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} />
          Check
        </button>
      </div>

      {/* APIs used (informational) */}
      <p className="text-xs text-gray-500 mb-4">
        Uses: v2/token, v2/surveys (create/list, Online, groupId {SURVEY_GROUP_ID}), script upload, publish, publicIds.
      </p>

      {/* Start Survey */}
      {startSurveyError && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {startSurveyError}
        </div>
      )}
      <button
        type="button"
        onClick={handleStartSurvey}
        disabled={startSurveyLoading || !isConnected || !survey?.logigramme}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {startSurveyLoading ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <ExternalLink className="w-5 h-5" />
        )}
        Start Survey
      </button>
      {!survey?.logigramme && (
        <p className="mt-2 text-sm text-amber-600">Generate a logigramme first to push to Nfield.</p>
      )}
    </div>
  );
}

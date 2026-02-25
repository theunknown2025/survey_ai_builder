import { useState, useRef } from 'react';
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
import { ExternalLink, Loader2, CheckCircle, XCircle, Upload, FileText } from 'lucide-react';

// Nfield API Configuration
const NFIELD_CONFIG: NfieldConfig = {
  domain: 'ic',
  username: 'nursyte_dev',
  password: 'X$Js82Tpm8KP',
  baseUrl: 'https://api.nfieldmr.com',
};

const SURVEY_GROUP_ID = '3';

export default function TestOdinScript() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [testLink, setTestLink] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('');
  const [odinScript, setOdinScript] = useState<string>('');
  const [surveyName, setSurveyName] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check if it's a .odin file
    if (!file.name.toLowerCase().endsWith('.odin')) {
      setError('Please select a .odin file');
      return;
    }

    setFileName(file.name);
    // Use filename (without extension) as default survey name
    const nameWithoutExt = file.name.replace(/\.odin$/i, '');
    setSurveyName(nameWithoutExt);

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setOdinScript(content);
      setError(null);
    };
    reader.onerror = () => {
      setError('Failed to read file');
    };
    reader.readAsText(file);
  };

  const handleTestSurvey = async () => {
    if (!odinScript) {
      setError('Please select a .odin file first');
      return;
    }

    if (!surveyName.trim()) {
      setError('Please enter a survey name');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(false);
    setTestLink(null);
    setStatus('');

    try {
      setStatus('Connecting to Nfield...');
      await getNfieldToken(NFIELD_CONFIG);

      setStatus('Checking for existing survey...');
      const surveys = await listSurveys(NFIELD_CONFIG);
      const existing = surveys.find(
        (s) => s.Name && s.Name.toLowerCase() === surveyName.trim().toLowerCase()
      );

      let surveyId: string;

      if (existing?.SurveyId) {
        setStatus('Found existing survey, updating script...');
        surveyId = existing.SurveyId;
        await uploadScript(NFIELD_CONFIG, surveyId, odinScript);
        setStatus('Publishing survey...');
        await publishSurvey(NFIELD_CONFIG, surveyId);
      } else {
        setStatus('Creating new survey...');
        const created = await createSurvey(NFIELD_CONFIG, surveyName.trim(), SURVEY_GROUP_ID);
        surveyId = created.SurveyId;
        setStatus('Uploading ODIN script...');
        await uploadScript(NFIELD_CONFIG, surveyId, odinScript);
        setStatus('Publishing survey...');
        await publishSurvey(NFIELD_CONFIG, surveyId);
      }

      setStatus('Getting test link...');
      const publicIds = await getPublicIds(NFIELD_CONFIG, surveyId);
      const url = getTestLinkFromPublicIds(publicIds);
      
      if (!url) {
        throw new Error('No test URL found in publicIds response');
      }

      setTestLink(url);
      setSuccess(true);
      setStatus('Survey uploaded and published successfully!');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to upload survey';
      setError(errorMessage);
      setStatus(`Error: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenTestLink = () => {
    if (testLink) {
      window.open(testLink, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Test ODIN Script Upload</h2>
        <p className="text-gray-600 text-sm">
          Upload a .odin file to Nfield, publish it, and get a test link.
        </p>
      </div>

      <div className="space-y-4">
        {/* File Upload */}
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 hover:border-blue-400 transition-colors">
          <input
            ref={fileInputRef}
            type="file"
            accept=".odin"
            onChange={handleFileSelect}
            className="hidden"
            id="odin-file-input"
          />
          <label
            htmlFor="odin-file-input"
            className="cursor-pointer flex flex-col items-center justify-center gap-2"
          >
            <Upload className="w-8 h-8 text-gray-400" />
            <span className="text-sm font-medium text-gray-700">
              {fileName ? fileName : 'Click to select .odin file'}
            </span>
            <span className="text-xs text-gray-500">Select a .odin file to upload</span>
          </label>
        </div>

        {/* Survey Name Input */}
        {odinScript && (
          <div>
            <label htmlFor="survey-name" className="block text-sm font-medium text-gray-700 mb-2">
              Survey Name
            </label>
            <input
              id="survey-name"
              type="text"
              value={surveyName}
              onChange={(e) => setSurveyName(e.target.value)}
              placeholder="Enter survey name"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        )}

        {/* File Preview */}
        {odinScript && (
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-4 h-4 text-gray-600" />
              <span className="text-sm font-medium text-gray-700">File loaded: {fileName}</span>
            </div>
            <p className="text-xs text-gray-500">
              {odinScript.split('\n').length} lines loaded
            </p>
          </div>
        )}
        {/* Status Display */}
        {status && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800">{status}</p>
          </div>
        )}

        {/* Success Message */}
        {success && testLink && (
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <p className="font-semibold text-green-900">Survey uploaded successfully!</p>
            </div>
            <button
              onClick={handleOpenTestLink}
              className="mt-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              Open Test Survey
            </button>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <XCircle className="w-5 h-5 text-red-600" />
              <p className="font-semibold text-red-900">Upload Failed</p>
            </div>
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* Test Survey Button */}
        <button
          onClick={handleTestSurvey}
          disabled={loading || !odinScript}
          className="w-full px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Processing...</span>
            </>
          ) : (
            <>
              <Upload className="w-5 h-5" />
              <span>Upload & Publish Survey</span>
            </>
          )}
        </button>

        {/* Configuration Info */}
        <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <h3 className="font-semibold text-gray-900 mb-2 text-sm">Configuration:</h3>
          <div className="text-xs text-gray-600 space-y-1">
            <p><strong>Domain:</strong> {NFIELD_CONFIG.domain}</p>
            <p><strong>Username:</strong> {NFIELD_CONFIG.username}</p>
            <p><strong>Base URL:</strong> {NFIELD_CONFIG.baseUrl}</p>
            <p><strong>Survey Group ID:</strong> {SURVEY_GROUP_ID}</p>
            {surveyName && <p><strong>Survey Name:</strong> {surveyName}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

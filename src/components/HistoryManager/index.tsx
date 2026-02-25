import { useState, useEffect } from 'react';
import { SavedSurvey, getAllSurveys, deleteSurvey } from '../../lib/mongodb';
import { 
  Eye, 
  Network, 
  Edit, 
  Download, 
  Copy, 
  Trash2, 
  Loader2, 
  ExternalLink,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { displaySurvey } from './actions/displaySurvey';
import { displayLogigramme } from './actions/displayLogigramme';
import { getSurveyForEdit } from './actions/editSurvey';
import { downloadJson } from './actions/downloadJson';
import { downloadOdin } from './actions/downloadOdin';
import { copyLink } from './actions/copyLink';
import { Survey, Logigramme } from '../../types/survey';

interface HistoryManagerProps {
  onEditSurvey?: (survey: Survey) => void;
  onDisplayLogigramme?: (logigramme: Logigramme) => void;
}

export default function HistoryManager({ onEditSurvey, onDisplayLogigramme }: HistoryManagerProps) {
  const [surveys, setSurveys] = useState<SavedSurvey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    loadSurveys();
  }, []);

  const loadSurveys = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getAllSurveys();
      setSurveys(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load surveys');
    } finally {
      setLoading(false);
    }
  };

  const handleDisplay = (savedSurvey: SavedSurvey) => {
    try {
      const survey = displaySurvey(savedSurvey);
      // You can show this in a modal or navigate to a display view
      alert(`Survey: ${survey.title}\n\nDisplaying survey data. Implement modal or view here.`);
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Failed to display survey'}`);
    }
  };

  const handleDisplayLogigramme = (savedSurvey: SavedSurvey) => {
    try {
      const logigramme = displayLogigramme(savedSurvey);
      if (!logigramme) {
        alert('No logigramme found in this survey.');
        return;
      }
      if (onDisplayLogigramme) {
        onDisplayLogigramme(logigramme);
      } else {
        alert(`Logigramme found with ${logigramme.nodes.length} nodes and ${logigramme.edges.length} edges.`);
      }
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Failed to display logigramme'}`);
    }
  };

  const handleEdit = (savedSurvey: SavedSurvey) => {
    try {
      const survey = getSurveyForEdit(savedSurvey);
      if (onEditSurvey) {
        onEditSurvey(survey);
      } else {
        alert(`Edit survey: ${survey.title}\n\nImplement edit functionality here.`);
      }
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Failed to load survey for editing'}`);
    }
  };

  const handleDownloadJson = (savedSurvey: SavedSurvey) => {
    try {
      downloadJson(savedSurvey);
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Failed to download JSON'}`);
    }
  };

  const handleDownloadOdin = (savedSurvey: SavedSurvey) => {
    try {
      downloadOdin(savedSurvey);
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Failed to download ODIN file'}`);
    }
  };

  const handleCopyLink = async (savedSurvey: SavedSurvey) => {
    try {
      await copyLink(savedSurvey);
      setCopySuccess(savedSurvey._id || null);
      setTimeout(() => setCopySuccess(null), 2000);
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Failed to copy link'}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this survey? This action cannot be undone.')) {
      return;
    }

    try {
      setDeletingId(id);
      await deleteSurvey(id);
      await loadSurveys();
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Failed to delete survey'}`);
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-blue-50">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading survey history...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-blue-50">
        <div className="text-center max-w-md">
          <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Error Loading History</h2>
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={loadSurveys}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gradient-to-br from-blue-50 via-white to-blue-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Survey History</h2>
          <p className="text-gray-600">
            View and manage your saved surveys. {surveys.length} survey{surveys.length !== 1 ? 's' : ''} saved.
          </p>
        </div>

        {surveys.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
            <p className="text-gray-500 text-lg mb-2">No surveys saved yet</p>
            <p className="text-gray-400 text-sm">
              Start a survey and click "Save Survey" to add it to your history.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {surveys.map((survey) => (
              <div
                key={survey._id}
                className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">{survey.title}</h3>
                    <p className="text-sm text-gray-500">
                      Created: {formatDate(survey.createdAt)}
                    </p>
                    {survey.publicLink && (
                      <a
                        href={survey.publicLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1 mt-2"
                      >
                        <ExternalLink className="w-4 h-4" />
                        Open Survey Link
                      </a>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => handleDisplay(survey)}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-all flex items-center gap-2 text-sm font-medium"
                    title="Display Survey"
                  >
                    <Eye className="w-4 h-4" />
                    Display
                  </button>

                  <button
                    onClick={() => handleDisplayLogigramme(survey)}
                    className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-all flex items-center gap-2 text-sm font-medium"
                    title="Display Logigramme"
                  >
                    <Network className="w-4 h-4" />
                    Display Logigramme
                  </button>

                  <button
                    onClick={() => handleEdit(survey)}
                    className="px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-all flex items-center gap-2 text-sm font-medium"
                    title="Edit Survey"
                  >
                    <Edit className="w-4 h-4" />
                    Edit Survey
                  </button>

                  <button
                    onClick={() => handleDownloadJson(survey)}
                    className="px-4 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-all flex items-center gap-2 text-sm font-medium"
                    title="Download JSON"
                  >
                    <Download className="w-4 h-4" />
                    Download JSON
                  </button>

                  <button
                    onClick={() => handleDownloadOdin(survey)}
                    className="px-4 py-2 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition-all flex items-center gap-2 text-sm font-medium"
                    title="Download ODIN"
                  >
                    <Download className="w-4 h-4" />
                    Download ODIN
                  </button>

                  <button
                    onClick={() => handleCopyLink(survey)}
                    className={`px-4 py-2 rounded-lg transition-all flex items-center gap-2 text-sm font-medium ${
                      copySuccess === survey._id
                        ? 'bg-green-100 text-green-700'
                        : 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                    }`}
                    title="Copy Public Link"
                  >
                    {copySuccess === survey._id ? (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        Copy Link
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => survey._id && handleDelete(survey._id)}
                    disabled={deletingId === survey._id}
                    className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-all flex items-center gap-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Delete Survey"
                  >
                    {deletingId === survey._id ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Deleting...
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4" />
                        Delete
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

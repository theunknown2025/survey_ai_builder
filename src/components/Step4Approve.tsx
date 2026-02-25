import { CheckCircle, FileJson, FileText } from 'lucide-react';
import { Survey } from '../types/survey';
import { downloadNipoFile } from '../utils/generateNipoFile';

interface Step4ApproveProps {
  survey: Survey;
  onBack: () => void;
  onStartNew: () => void;
}

export default function Step4Approve({ survey, onBack, onStartNew }: Step4ApproveProps) {
  const handleDownloadJSON = () => {
    const surveyJSON = {
      title: survey.title,
      context: survey.context,
      logigramme: survey.logigramme,
      questions: survey.logigramme?.nodes
        .filter(node => node.type === 'question')
        .map((node, index) => ({
          id: node.id,
          number: index + 1,
          question: node.label,
          type: node.questionType,
          options: node.options || [],
          imageUrl: node.imageUrl,
          imageAlt: node.imageAlt,
        })),
      generatedAt: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(surveyJSON, null, 2)], {
      type: 'application/json',
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `survey-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadNipo = () => {
    try {
      downloadNipoFile(survey);
    } catch (error) {
      console.error('Error downloading Nipo file:', error);
      alert(error instanceof Error ? error.message : 'Failed to generate Nipo file. Please try again.');
    }
  };

  const questionCount = survey.logigramme?.nodes.filter(n => n.type === 'question').length || 0;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
          <CheckCircle className="w-10 h-10 text-green-600" />
        </div>
        <h2 className="text-3xl font-bold text-gray-900 mb-2">Survey Approved!</h2>
        <p className="text-gray-600">
          Your survey is ready to be exported and used.
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 mb-6">
        <h3 className="text-xl font-bold text-gray-900 mb-4">Survey Summary</h3>

        <div className="space-y-4">
          <div className="flex justify-between py-3 border-b border-gray-200">
            <span className="text-gray-600 font-medium">Title</span>
            <span className="text-gray-900 font-semibold">{survey.title || 'Untitled Survey'}</span>
          </div>

          <div className="flex justify-between py-3 border-b border-gray-200">
            <span className="text-gray-600 font-medium">Total Questions</span>
            <span className="text-gray-900 font-semibold">{questionCount}</span>
          </div>

          <div className="flex justify-between py-3 border-b border-gray-200">
            <span className="text-gray-600 font-medium">Status</span>
            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
              Completed
            </span>
          </div>

          <div className="py-3">
            <span className="text-gray-600 font-medium block mb-2">Context</span>
            <p className="text-gray-700 text-sm bg-gray-50 p-4 rounded-lg">
              {survey.context}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-6">
        <h3 className="text-lg font-bold text-blue-900 mb-2">Export Options</h3>
        <p className="text-blue-800 text-sm mb-4">
          Export your survey in your preferred format.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            onClick={handleDownloadJSON}
            className="w-full p-4 border-2 border-blue-200 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-all flex items-center gap-4 group bg-white"
          >
            <div className="p-3 bg-blue-100 rounded-lg group-hover:bg-blue-200 transition-colors">
              <FileJson className="w-6 h-6 text-blue-600" />
            </div>
            <div className="flex-1 text-left">
              <div className="font-semibold text-gray-900">JSON File</div>
              <div className="text-sm text-gray-600">
                Standard JSON format for integration
              </div>
            </div>
          </button>

          <button
            onClick={handleDownloadNipo}
            className="w-full p-4 border-2 border-purple-200 rounded-lg hover:border-purple-400 hover:bg-purple-50 transition-all flex items-center gap-4 group bg-white"
          >
            <div className="p-3 bg-purple-100 rounded-lg group-hover:bg-purple-200 transition-colors">
              <FileText className="w-6 h-6 text-purple-600" />
            </div>
            <div className="flex-1 text-left">
              <div className="font-semibold text-gray-900">ODIN File</div>
              <div className="text-sm text-gray-600">
                ODIN/Nipo format for survey platforms
              </div>
            </div>
          </button>
        </div>
      </div>

      <div className="flex justify-between">
        <button
          onClick={onBack}
          className="px-6 py-3 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-all"
        >
          Back to Preview
        </button>
        <button
          onClick={onStartNew}
          className="px-6 py-3 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-all"
        >
          Create New Survey
        </button>
      </div>
    </div>
  );
}

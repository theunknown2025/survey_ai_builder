import { useState } from 'react';
import { ClipboardList, LayoutGrid, Eye, TestTube } from 'lucide-react';
import Sidebar from './components/Sidebar';
import Step1Context from './components/Step1Context';
import Step2Logigramme from './components/Step2Logigramme';
import Step3Preview from './components/Step3Preview';
import Step4Approve from './components/Step4Approve';
import TestOdinScript from './components/TestOdinScript';
import HistoryManager from './components/HistoryManager';
import Profile from './components/Profile';
import { Survey, Logigramme } from './types/survey';

type Tab = 'logigramme' | 'preview' | 'test';
type View = 'new-survey' | 'history' | 'profile';

function App() {
  // Main app component with sidebar layout
  const [activeView, setActiveView] = useState<View>('new-survey');
  const [activeTab, setActiveTab] = useState<Tab>('logigramme');
  const [context, setContext] = useState('');
  const [originalContext, setOriginalContext] = useState('');
  const [logigramme, setLogigramme] = useState<Logigramme | null>(null);
  const [survey, setSurvey] = useState<Survey>({
    title: 'Untitled Survey',
    context: '',
    status: 'draft',
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [showApprove, setShowApprove] = useState(false);


  const handleLogigrammeUpdate = async () => {
    // No database operations - logigramme is stored in state only
  };

  const handlePreviewApprove = async () => {
    setSurvey({ ...survey, status: 'completed' });
    setShowApprove(true);
  };

  const handleStartNew = () => {
    setContext('');
    setOriginalContext('');
    setLogigramme(null);
    setShowApprove(false);
    setActiveTab('logigramme');
    setSurvey({
      title: 'Untitled Survey',
      context: '',
      status: 'draft',
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50">
      <div className="flex h-screen">
        {/* Navigation Sidebar */}
        <Sidebar activeView={activeView} onViewChange={setActiveView} />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-200 bg-white">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
              <ClipboardList className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Survey Generator</h1>
          </div>

          {/* Content based on active view */}
          {activeView === 'new-survey' && (
            <div className="flex flex-1 overflow-hidden">
              {/* Left Sidebar - 30% - Chat/Context */}
              <div className="w-[30%] border-r border-gray-200 bg-white flex flex-col">
                <div className="p-6 flex-1 flex flex-col min-h-0">
                  <Step1Context
                    context={context}
                    setContext={setContext}
                    isGenerating={isGenerating}
                    originalContext={originalContext}
                    setOriginalContext={setOriginalContext}
                    logigramme={logigramme}
                    setLogigramme={setLogigramme}
                    onLogigrammeGenerated={() => setActiveTab('logigramme')}
                    onStartNew={handleStartNew}
                  />
                </div>
              </div>

              {/* Right Side - 70% - Tabs */}
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Tabs */}
                <div className="border-b border-gray-200 bg-white px-6">
                  <div className="flex gap-1">
                    {logigramme && (
                      <>
                        <button
                          onClick={() => setActiveTab('logigramme')}
                          className={`flex items-center gap-2 px-4 py-3 font-medium transition-all border-b-2 ${
                            activeTab === 'logigramme'
                              ? 'border-blue-600 text-blue-600'
                              : 'border-transparent text-gray-500 hover:text-gray-700'
                          }`}
                        >
                          <LayoutGrid className="w-5 h-5" />
                          Logigramme
                        </button>
                        <button
                          onClick={() => setActiveTab('preview')}
                          className={`flex items-center gap-2 px-4 py-3 font-medium transition-all border-b-2 ${
                            activeTab === 'preview'
                              ? 'border-blue-600 text-blue-600'
                              : 'border-transparent text-gray-500 hover:text-gray-700'
                          }`}
                        >
                          <Eye className="w-5 h-5" />
                          Preview
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => setActiveTab('test')}
                      className={`flex items-center gap-2 px-4 py-3 font-medium transition-all border-b-2 ${
                        activeTab === 'test'
                          ? 'border-blue-600 text-blue-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      <TestTube className="w-5 h-5" />
                      Test Survey
                    </button>
                  </div>
                </div>

                {/* Tab Content */}
                <div className="flex-1 overflow-y-auto">
                  {logigramme ? (
                    <>
                      {activeTab === 'logigramme' && (
                        <div className="p-6">
                          <Step2Logigramme
                            logigramme={logigramme}
                            setLogigramme={(newLogigramme) => {
                              setLogigramme(newLogigramme);
                              handleLogigrammeUpdate();
                            }}
                            onNext={() => setActiveTab('preview')}
                            onBack={() => {}}
                            context={context}
                          />
                        </div>
                      )}

                      {activeTab === 'preview' && (
                        <div className="p-6">
                          <Step3Preview
                            logigramme={logigramme}
                            onNext={handlePreviewApprove}
                            onBack={() => setActiveTab('logigramme')}
                            survey={{ ...survey, logigramme: logigramme ?? survey.logigramme }}
                          />
                        </div>
                      )}

                      {activeTab === 'test' && (
                        <div className="p-6">
                          <TestOdinScript />
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      {activeTab === 'test' ? (
                        <div className="p-6">
                          <TestOdinScript />
                        </div>
                      ) : (
                        <div className="flex-1 flex items-center justify-center">
                          <div className="text-center">
                            <p className="text-gray-500 text-lg mb-2">No logigramme generated yet</p>
                            <p className="text-gray-400 text-sm">Provide context on the left and generate a logigramme to get started</p>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeView === 'history' && <HistoryManager />}

          {activeView === 'profile' && <Profile />}
        </div>
      </div>

      {/* Approve Modal */}
      {showApprove && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <Step4Approve
              survey={{ ...survey, logigramme: logigramme || undefined }}
              onBack={() => setShowApprove(false)}
              onStartNew={handleStartNew}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

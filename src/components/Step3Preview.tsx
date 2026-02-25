import { useState, useEffect } from 'react';
import { Logigramme, Node, Edge, Section, Survey } from '../types/survey';
import { Star, ChevronRight, Info, AlertCircle, Sparkles, Loader2, Save, CheckCircle } from 'lucide-react';
import NfieldSurveyTest from './NfieldSurveyTest';
import { generateNipoFile } from '../utils/generateNipoFile';
import { validateOdinFile, fixOdinErrors } from '../utils/errorHandler';
import { saveSurvey } from '../lib/mongodb';
import { LANGUAGES } from './LanguageModal';

interface Step3PreviewProps {
  logigramme: Logigramme | null;
  onNext: () => void;
  onBack: () => void;
  /** Full survey (title + logigramme) for Nfield test block */
  survey?: Survey | null;
}

export default function Step3Preview({ logigramme, onNext, onBack, survey }: Step3PreviewProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentNodeId, setCurrentNodeId] = useState<string | null>(null);
  const [visitedNodes, setVisitedNodes] = useState<Set<string>>(new Set());
  const [currentSection, setCurrentSection] = useState<Section | null>(null);
  const [isCompleted, setIsCompleted] = useState(false);
  const [selectedPreviewLanguage, setSelectedPreviewLanguage] = useState<string | null>(null);
  const [odinErrors, setOdinErrors] = useState<string[]>([]);
  const [odinContent, setOdinContent] = useState<string>('');
  const [isFixing, setIsFixing] = useState(false);
  const [fixedOdinContent, setFixedOdinContent] = useState<string>('');
  const [publicLink, setPublicLink] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!logigramme) return;
    
    // Set default preview language to primary language
    if (logigramme.languages && logigramme.languages.length > 0) {
      setSelectedPreviewLanguage(logigramme.languages[0]);
    }
    
    // Find start node
    const startNode = logigramme.nodes.find(n => n.type === 'start');
    if (startNode) {
      setCurrentNodeId(startNode.id);
      setVisitedNodes(new Set([startNode.id]));
      
      // Find first question after start (could be language selection question)
      const startEdge = logigramme.edges.find(e => e.from === startNode.id);
      if (startEdge) {
        // If we have a selected language and the target is a language-specific node, use it
        let targetId = startEdge.to;
        if (selectedPreviewLanguage && logigramme.languages && logigramme.languages.length > 1) {
          // Check if this is the language selection question
          if (startEdge.to === 'q_language_selection') {
            targetId = startEdge.to;
          } else {
            // Try to find language-specific version
            const langSpecificTarget = logigramme.nodes.find(n => 
              n.id === `${startEdge.to}_${selectedPreviewLanguage}`
            );
            if (langSpecificTarget) {
              targetId = langSpecificTarget.id;
            }
          }
        }
        setCurrentNodeId(targetId);
        setVisitedNodes(new Set([startNode.id, targetId]));
      }
    }

    // Generate and validate ODIN file
    try {
      const fullSurvey = survey ?? { title: 'Survey', context: '', status: 'draft', logigramme };
      const generatedOdin = generateNipoFile(fullSurvey);
      setOdinContent(generatedOdin);
      const errors = validateOdinFile(generatedOdin);
      setOdinErrors(errors);
      setFixedOdinContent(''); // Reset fixed content when regenerating
    } catch (error) {
      console.error('Error generating ODIN file:', error);
      setOdinErrors([`Failed to generate ODIN file: ${error instanceof Error ? error.message : 'Unknown error'}`]);
    }
  }, [logigramme, survey]);

  useEffect(() => {
    if (!logigramme || !currentNodeId) return;
    
    // Find current section
    const currentNode = logigramme.nodes.find(n => n.id === currentNodeId);
    if (currentNode?.sectionId && logigramme.sections) {
      const section = logigramme.sections.find(s => s.id === currentNode.sectionId);
      setCurrentSection(section || null);
    }
  }, [currentNodeId, logigramme]);

  if (!logigramme) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">No survey to preview.</p>
      </div>
    );
  }

  const currentNode = logigramme.nodes.find(n => n.id === currentNodeId);
  
  // Filter questions based on selected language
  let questionNodes = logigramme.nodes.filter(node => node.type === 'question');
  
  // If multiple languages and a language is selected, filter to show only that language's nodes
  if (logigramme.languages && logigramme.languages.length > 1 && selectedPreviewLanguage) {
    questionNodes = questionNodes.filter(node => {
      // Include language selection question
      if (node.id === 'q_language_selection') return true;
      // Include nodes for the selected language
      return node.id.endsWith(`_${selectedPreviewLanguage}`);
    });
  } else if (logigramme.languages && logigramme.languages.length > 1) {
    // If no language selected but multiple languages exist, show primary language
    const primaryLang = logigramme.languages[0];
    questionNodes = questionNodes.filter(node => {
      if (node.id === 'q_language_selection') return true;
      return node.id.endsWith(`_${primaryLang}`);
    });
  }
  
  // Get next node based on answer
  const getNextNode = (nodeId: string, answer: string): string | null => {
    // Get the base node ID (remove language suffix if present)
    const baseNodeId = nodeId.includes('_') ? nodeId.split('_').slice(0, -1).join('_') : nodeId;
    
    // Find edges from this node (could be language-specific or base)
    let edges = logigramme.edges.filter(e => e.from === nodeId || e.from === baseNodeId);
    
    // If we have a selected language, prefer language-specific edges
    if (selectedPreviewLanguage) {
      const langSpecificEdges = logigramme.edges.filter(e => 
        e.from === `${baseNodeId}_${selectedPreviewLanguage}` || e.from === nodeId
      );
      if (langSpecificEdges.length > 0) {
        edges = langSpecificEdges;
      }
    }
    
    // Find edge matching the answer
    const matchingEdge = edges.find(e => e.label === answer || (!e.label && edges.length === 1));
    
    if (matchingEdge) {
      // If we have a selected language, try to find language-specific target node
      let targetNodeId = matchingEdge.to;
      if (selectedPreviewLanguage && !targetNodeId.endsWith(`_${selectedPreviewLanguage}`)) {
        const langSpecificTarget = logigramme.nodes.find(n => 
          n.id === `${targetNodeId}_${selectedPreviewLanguage}`
        );
        if (langSpecificTarget) {
          targetNodeId = langSpecificTarget.id;
        }
      }
      
      const nextNode = logigramme.nodes.find(n => n.id === targetNodeId);
      if (nextNode?.type === 'end') {
        setIsCompleted(true);
        return null;
      }
      return targetNodeId;
    }
    
    // If no matching edge, try to find any edge
    if (edges.length > 0) {
      let targetNodeId = edges[0].to;
      if (selectedPreviewLanguage && !targetNodeId.endsWith(`_${selectedPreviewLanguage}`)) {
        const langSpecificTarget = logigramme.nodes.find(n => 
          n.id === `${targetNodeId}_${selectedPreviewLanguage}`
        );
        if (langSpecificTarget) {
          targetNodeId = langSpecificTarget.id;
        }
      }
      
      const nextNode = logigramme.nodes.find(n => n.id === targetNodeId);
      if (nextNode?.type === 'end') {
        setIsCompleted(true);
        return null;
      }
      return targetNodeId;
    }
    
    return null;
  };

  const handleAnswer = (nodeId: string, answer: string) => {
    setAnswers({ ...answers, [nodeId]: answer });
    
    // Check if this is the language selection question
    const currentNode = logigramme.nodes.find(n => n.id === nodeId);
    if (currentNode?.id === 'q_language_selection') {
      // Find the selected language code from the answer (language native name)
      const selectedLang = logigramme.languages?.find(lang => {
        const langInfo = LANGUAGES.find(l => l.code === lang);
        return langInfo?.nativeName === answer;
      });
      
      if (selectedLang) {
        setSelectedPreviewLanguage(selectedLang);
        
        // Find the language-specific first question for this language
        const langEdge = logigramme.edges.find(e => 
          e.from === nodeId && e.label === answer
        );
        
        if (langEdge) {
          // The edge should point to the language-specific first question
          setCurrentNodeId(langEdge.to);
          setVisitedNodes(prev => new Set([...prev, langEdge.to]));
          return;
        }
      }
    }
    
    // Move to next node
    const nextNodeId = getNextNode(nodeId, answer);
    if (nextNodeId) {
      setCurrentNodeId(nextNodeId);
      setVisitedNodes(prev => new Set([...prev, nextNodeId]));
    } else {
      setIsCompleted(true);
    }
  };

  // Get node for current language (nodes have language suffix like q1_en, q1_ar)
  const getNodeForLanguage = (baseNodeId: string, langCode: string | null): Node | null => {
    if (!langCode || !logigramme) return null;
    
    // If node already has language suffix, use it directly
    if (baseNodeId.endsWith(`_${langCode}`)) {
      return logigramme.nodes.find(n => n.id === baseNodeId) || null;
    }
    
    // Otherwise, find the language-specific version
    const langSpecificId = `${baseNodeId}_${langCode}`;
    return logigramme.nodes.find(n => n.id === langSpecificId) || null;
  };

  // Get translated content for a node
  const getNodeLabel = (node: Node, langCode: string | null): string => {
    // If node has language suffix, use it directly
    if (langCode && node.id.endsWith(`_${langCode}`)) {
      return node.label;
    }
    
    // Try to find language-specific node
    const langNode = getNodeForLanguage(node.id, langCode);
    if (langNode) {
      return langNode.label;
    }
    
    // Fallback to original
    return node.label;
  };

  // Get translated options for a node
  const getNodeOptions = (node: Node, langCode: string | null): string[] => {
    // If node has language suffix, use it directly
    if (langCode && node.id.endsWith(`_${langCode}`)) {
      return node.options || [];
    }
    
    // Try to find language-specific node
    const langNode = getNodeForLanguage(node.id, langCode);
    if (langNode) {
      return langNode.options || [];
    }
    
    // Fallback to original
    return node.options || [];
  };

  // Get translated section title/description
  const getSectionTitle = (section: Section, langCode: string | null): string => {
    // Sections are updated in place during translation, so just return the title
    return section.title;
  };

  const getSectionDescription = (section: Section, langCode: string | null): string => {
    // Sections are updated in place during translation, so just return the description
    return section.description;
  };

  const renderQuestion = (node: Node) => {
    const answer = answers[node.id] || '';
    const hasAnswer = !!answer;
    const displayLabel = getNodeLabel(node, selectedPreviewLanguage);
    const displayOptions = getNodeOptions(node, selectedPreviewLanguage);

    switch (node.questionType) {
      case 'multiple-choice':
        return (
          <div className="space-y-2">
            {displayOptions.map((option, idx) => (
              <label
                key={idx}
                className={`flex items-center gap-3 p-3 border-2 rounded-lg cursor-pointer transition-all ${
                  answer === option
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-300 hover:bg-gray-50'
                }`}
              >
                <input
                  type="radio"
                  name={node.id}
                  value={option}
                  checked={answer === option}
                  onChange={(e) => handleAnswer(node.id, e.target.value)}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="text-gray-700">{option}</span>
                {answer === option && (
                  <ChevronRight className="w-5 h-5 text-blue-600 ml-auto" />
                )}
              </label>
            ))}
          </div>
        );

      case 'yes-no':
        // Get translated yes/no options or use defaults
        const yesNoOptions = displayOptions.length >= 2 
          ? displayOptions.slice(0, 2)
          : (selectedPreviewLanguage === 'ar' 
              ? ['نعم', 'لا'] 
              : selectedPreviewLanguage === 'fr'
              ? ['Oui', 'Non']
              : ['Yes', 'No']);
        return (
          <div className="flex gap-4">
            {yesNoOptions.map((option) => (
              <label
                key={option}
                className={`flex-1 flex items-center justify-center gap-3 p-4 border-2 rounded-lg cursor-pointer transition-all ${
                  answer === option
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-300 hover:bg-gray-50'
                }`}
              >
                <input
                  type="radio"
                  name={node.id}
                  value={option}
                  checked={answer === option}
                  onChange={(e) => handleAnswer(node.id, e.target.value)}
                  className="w-5 h-5 text-blue-600"
                />
                <span className="text-gray-700 font-medium">{option}</span>
              </label>
            ))}
          </div>
        );

      case 'rating':
        return (
          <div className="flex gap-2 justify-center">
            {[1, 2, 3, 4, 5].map((rating) => (
              <button
                key={rating}
                onClick={() => handleAnswer(node.id, rating.toString())}
                className={`p-2 transition-all ${
                  parseInt(answer) >= rating ? 'text-yellow-500' : 'text-gray-300'
                }`}
              >
                <Star className="w-8 h-8 fill-current" />
              </button>
            ))}
            {hasAnswer && (
              <div className="ml-4 flex items-center text-sm text-gray-600">
                <ChevronRight className="w-5 h-5 text-blue-600" />
              </div>
            )}
          </div>
        );

      case 'text':
        return (
          <div className="space-y-3">
            <textarea
              value={answer}
              onChange={(e) => setAnswers({ ...answers, [node.id]: e.target.value })}
              placeholder="Enter your answer here..."
              rows={4}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
            {hasAnswer && (
              <button
                onClick={() => {
                  const nextNodeId = getNextNode(node.id, answer);
                  if (nextNodeId) {
                    setCurrentNodeId(nextNodeId);
                    setVisitedNodes(prev => new Set([...prev, nextNodeId]));
                  } else {
                    setIsCompleted(true);
                  }
                }}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
              >
                Continue
                <ChevronRight className="w-5 h-5" />
              </button>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  // Calculate progress
  const totalQuestions = questionNodes.length;
  const answeredQuestions = Object.keys(answers).length;
  const progress = totalQuestions > 0 ? (answeredQuestions / totalQuestions) * 100 : 0;

  // Get visited sections
  const visitedSections = new Set<string>();
  visitedNodes.forEach(nodeId => {
    const node = logigramme.nodes.find(n => n.id === nodeId);
    if (node?.sectionId) {
      visitedSections.add(node.sectionId);
    }
  });

  if (isCompleted) {
    return (
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Preview Survey</h2>
        
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 mb-6">
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-2">Survey Completed!</h3>
            <p className="text-gray-600 mb-6">
              You've answered {answeredQuestions} question{answeredQuestions !== 1 ? 's' : ''} following the conditional flow.
            </p>
            <div className="space-y-2 text-left max-w-md mx-auto">
              <h4 className="font-semibold text-gray-900 mb-3">Your Answers:</h4>
              {Object.entries(answers).map(([nodeId, answer]) => {
                const node = logigramme.nodes.find(n => n.id === nodeId);
                return node ? (
                  <div key={nodeId} className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-sm font-medium text-gray-700">{node.label}</p>
                    <p className="text-sm text-gray-600 mt-1">Answer: {answer}</p>
                  </div>
                ) : null;
              })}
            </div>
          </div>
        </div>

      {/* ODIN File Errors Section */}
      {odinErrors.length > 0 && (
        <div className="bg-red-50 border-2 border-red-300 rounded-lg p-6 mb-6 shadow-sm">
          <div className="flex items-start gap-3 mb-4">
            <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-bold text-red-900 mb-3 text-lg">
                ODIN File Errors Found ({odinErrors.length})
              </h3>
              <div className="space-y-2 mb-6 max-h-60 overflow-y-auto">
                {odinErrors.map((error, idx) => (
                  <div key={idx} className="text-sm text-red-800 bg-red-100 rounded px-3 py-2 border border-red-200">
                    {error}
                  </div>
                ))}
              </div>
              <button
                onClick={async () => {
                  if (!odinContent) return;
                  
                  setIsFixing(true);
                  try {
                    const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
                    if (!apiKey) {
                      throw new Error('OpenAI API key is not configured');
                    }

                    const fixed = await fixOdinErrors(odinContent, odinErrors, apiKey);
                    
                    // Re-validate the fixed content
                    const newErrors = validateOdinFile(fixed);
                    
                    // Update the ODIN content with fixed version
                    setOdinContent(fixed);
                    
                    // Clear errors if fixed successfully - this will make the error section disappear
                    if (newErrors.length === 0) {
                      setOdinErrors([]);
                      setFixedOdinContent('');
                    } else {
                      setOdinErrors(newErrors);
                      setFixedOdinContent(fixed);
                    }
                  } catch (error) {
                    console.error('Error fixing ODIN file:', error);
                    alert(error instanceof Error ? error.message : 'Failed to fix ODIN file. Please try again.');
                  } finally {
                    setIsFixing(false);
                  }
                }}
                disabled={isFixing || !odinContent}
                className="w-full px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg font-bold text-base hover:from-purple-700 hover:to-blue-700 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-3"
              >
                {isFixing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Fixing with AI...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    <span>Fix with AI</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

        <div className="mt-6 space-y-4">
          <NfieldSurveyTest 
            survey={survey ?? (logigramme ? { title: 'Survey', context: '', status: 'draft', logigramme } : null)} 
            onSurveyStarted={(link) => setPublicLink(link)}
          />
          
          {/* Save Survey Button */}
          {publicLink && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-blue-900 mb-1">Survey Started Successfully</h4>
                  <p className="text-sm text-blue-700">Save this survey to your history for future access.</p>
                </div>
                <button
                  onClick={async () => {
                    if (!survey && !logigramme) return;
                    
                    setIsSaving(true);
                    setSaveError(null);
                    setSaveSuccess(false);
                    
                    try {
                      const fullSurvey = survey ?? { title: 'Survey', context: '', status: 'draft', logigramme };
                      const surveyJson = JSON.stringify(fullSurvey);
                      const odin = odinContent || generateNipoFile(fullSurvey);
                      
                      await saveSurvey(
                        fullSurvey.title || 'Untitled Survey',
                        surveyJson,
                        odin,
                        publicLink
                      );
                      
                      setSaveSuccess(true);
                      setTimeout(() => setSaveSuccess(false), 3000);
                    } catch (error) {
                      setSaveError(error instanceof Error ? error.message : 'Failed to save survey');
                    } finally {
                      setIsSaving(false);
                    }
                  }}
                  disabled={isSaving || saveSuccess}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : saveSuccess ? (
                    <>
                      <CheckCircle className="w-5 h-5" />
                      <span>Saved!</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-5 h-5" />
                      <span>Save Survey</span>
                    </>
                  )}
                </button>
              </div>
              {saveError && (
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                  {saveError}
                </div>
              )}
            </div>
          )}
          
          <div className="flex justify-end">
            <button
              onClick={onNext}
              className="px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-all"
            >
              Approve & Export
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!currentNode) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">Loading survey...</p>
      </div>
    );
  }

  const currentNodeIsQuestion = currentNode.type === 'question';
  const questionNumber = Array.from(visitedNodes).filter(id => {
    const node = logigramme.nodes.find(n => n.id === id);
    return node?.type === 'question';
  }).length;

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Preview Survey</h2>
      <p className="text-gray-600 mb-4">
        This preview follows the conditional branching flow. Answer questions to see how the survey adapts.
      </p>

      {/* Language Selector */}
      {logigramme.languages && logigramme.languages.length > 1 && (
        <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
          <p className="text-xs font-semibold text-gray-700 mb-2">Preview Language:</p>
          <div className="flex flex-wrap gap-2">
            {logigramme.languages.map((langCode) => {
              const lang = LANGUAGES.find(l => l.code === langCode);
              if (!lang) return null;
              const isSelected = selectedPreviewLanguage === langCode;
              return (
                <button
                  key={langCode}
                  onClick={() => setSelectedPreviewLanguage(langCode)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {lang.nativeName}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Current Section Info */}
      {currentSection && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-blue-900 mb-1">
                {getSectionTitle(currentSection, selectedPreviewLanguage)}
              </h3>
              <p className="text-sm text-blue-700">
                {getSectionDescription(currentSection, selectedPreviewLanguage)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Sections Progress */}
      {logigramme.sections && logigramme.sections.length > 0 && (
        <div className="mb-6 flex gap-2 flex-wrap">
          {logigramme.sections.map((section) => {
            const isVisited = visitedSections.has(section.id);
            const isCurrent = currentSection?.id === section.id;
            return (
              <div
                key={section.id}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  isCurrent
                    ? 'bg-blue-600 text-white'
                    : isVisited
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-500'
                }`}
              >
                {getSectionTitle(section, selectedPreviewLanguage)}
              </div>
            );
          })}
        </div>
      )}

      {/* Current Question */}
      {currentNodeIsQuestion && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 mb-6">
          <div className="flex gap-3 mb-6">
            <div className="flex-shrink-0 w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-lg">
              {questionNumber}
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-semibold text-gray-900 mb-1">
                {getNodeLabel(currentNode, selectedPreviewLanguage)}
              </h3>
              <p className="text-sm text-gray-500 capitalize">{currentNode.questionType}</p>
            </div>
          </div>

          {currentNode.imageUrl && (
            <div className="ml-12 mb-4">
              <img
                src={currentNode.imageUrl}
                alt={currentNode.imageAlt || 'Question illustration'}
                className="max-h-64 rounded-lg object-contain border border-gray-200 bg-gray-50"
              />
            </div>
          )}

          <div className="ml-12">
            {renderQuestion(currentNode)}
          </div>
        </div>
      )}

      {/* Visited Questions Summary */}
      {visitedNodes.size > 1 && (
        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Questions Answered:</h4>
          <div className="space-y-1">
            {Array.from(visitedNodes)
              .filter(id => {
                const node = logigramme.nodes.find(n => n.id === id);
                return node?.type === 'question';
              })
              .map((nodeId, idx) => {
                const node = logigramme.nodes.find(n => n.id === nodeId);
                const answer = answers[nodeId];
                return node ? (
                  <div key={nodeId} className="text-sm text-gray-600 flex items-center gap-2">
                    <span className="w-6 h-6 bg-green-100 text-green-700 rounded-full flex items-center justify-center text-xs font-medium">
                      {idx + 1}
                    </span>
                    <span className="flex-1">{getNodeLabel(node, selectedPreviewLanguage)}</span>
                    {answer && (
                      <span className="text-gray-500 text-xs">→ {answer}</span>
                    )}
                  </div>
                ) : null;
              })}
          </div>
        </div>
      )}

        {/* ODIN File Errors Section */}
        {odinErrors.length > 0 && (
          <div className="bg-red-50 border-2 border-red-300 rounded-lg p-6 mb-6 shadow-sm">
            <div className="flex items-start gap-3 mb-4">
              <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-bold text-red-900 mb-3 text-lg">
                  ODIN File Errors Found ({odinErrors.length})
                </h3>
                <div className="space-y-2 mb-6 max-h-60 overflow-y-auto">
                  {odinErrors.map((error, idx) => (
                    <div key={idx} className="text-sm text-red-800 bg-red-100 rounded px-3 py-2 border border-red-200">
                      {error}
                    </div>
                  ))}
                </div>
                <button
                  onClick={async () => {
                    if (!odinContent) return;
                    
                    setIsFixing(true);
                    try {
                      const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
                      if (!apiKey) {
                        throw new Error('OpenAI API key is not configured');
                      }

                      const fixed = await fixOdinErrors(odinContent, odinErrors, apiKey);
                      
                      // Re-validate the fixed content
                      const newErrors = validateOdinFile(fixed);
                      
                      // Update the ODIN content with fixed version
                      setOdinContent(fixed);
                      
                      // Clear errors if fixed successfully - this will make the error section disappear
                      if (newErrors.length === 0) {
                        setOdinErrors([]);
                        setFixedOdinContent('');
                      } else {
                        setOdinErrors(newErrors);
                        setFixedOdinContent(fixed);
                      }
                    } catch (error) {
                      console.error('Error fixing ODIN file:', error);
                      alert(error instanceof Error ? error.message : 'Failed to fix ODIN file. Please try again.');
                    } finally {
                      setIsFixing(false);
                    }
                  }}
                  disabled={isFixing || !odinContent}
                  className="w-full px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg font-bold text-base hover:from-purple-700 hover:to-blue-700 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-3"
                >
                  {isFixing ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Fixing with AI...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5" />
                      <span>Fix with AI</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 space-y-4">
          <NfieldSurveyTest 
            survey={survey ?? (logigramme ? { title: 'Survey', context: '', status: 'draft', logigramme } : null)} 
            onSurveyStarted={(link) => setPublicLink(link)}
          />
          
          {/* Save Survey Button */}
          {publicLink && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-blue-900 mb-1">Survey Started Successfully</h4>
                  <p className="text-sm text-blue-700">Save this survey to your history for future access.</p>
                </div>
                <button
                  onClick={async () => {
                    if (!survey && !logigramme) return;
                    
                    setIsSaving(true);
                    setSaveError(null);
                    setSaveSuccess(false);
                    
                    try {
                      const fullSurvey = survey ?? { title: 'Survey', context: '', status: 'draft', logigramme };
                      const surveyJson = JSON.stringify(fullSurvey);
                      const odin = odinContent || generateNipoFile(fullSurvey);
                      
                      await saveSurvey(
                        fullSurvey.title || 'Untitled Survey',
                        surveyJson,
                        odin,
                        publicLink
                      );
                      
                      setSaveSuccess(true);
                      setTimeout(() => setSaveSuccess(false), 3000);
                    } catch (error) {
                      setSaveError(error instanceof Error ? error.message : 'Failed to save survey');
                    } finally {
                      setIsSaving(false);
                    }
                  }}
                  disabled={isSaving || saveSuccess}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : saveSuccess ? (
                    <>
                      <CheckCircle className="w-5 h-5" />
                      <span>Saved!</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-5 h-5" />
                      <span>Save Survey</span>
                    </>
                  )}
                </button>
              </div>
              {saveError && (
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                  {saveError}
                </div>
              )}
            </div>
          )}
          
          <div className="flex justify-end">
            <button
              onClick={onNext}
              className="px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-all"
            >
              Approve & Export
            </button>
          </div>
        </div>
    </div>
  );
}

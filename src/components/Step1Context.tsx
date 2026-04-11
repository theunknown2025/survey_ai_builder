import { useState, useRef, useEffect } from 'react';
import { Loader2, Send, Sparkles, User, Bot, Plus, UploadCloud, Languages } from 'lucide-react';
import { Logigramme } from '../types/survey';
import { generateLogigramme } from '../utils/generateLogigramme';
import { updateLogigramme } from '../utils/updateLogigramme';
import {
  fileToSurveyContext,
  OPENAI_MAX_INPUT_TOKENS,
  SUPPORTED_FILE_EXTENSIONS,
} from '../utils/fileToSurveyContext';
import LanguageModal, { Language, LANGUAGES } from './LanguageModal';
import { translateLogigramme, addLanguageSelectionQuestion } from '../utils/translateLogigramme';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface Step1ContextProps {
  context: string;
  setContext: (context: string) => void;
  isGenerating: boolean;
  originalContext?: string;
  setOriginalContext?: (context: string) => void;
  logigramme: Logigramme | null;
  setLogigramme: (logigramme: Logigramme) => void;
  onLogigrammeGenerated?: () => void;
  onStartNew?: () => void;
}

export default function Step1Context({
  context,
  setContext,
  isGenerating,
  originalContext,
  setOriginalContext,
  logigramme,
  setLogigramme,
  onLogigrammeGenerated,
  onStartNew,
}: Step1ContextProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [selectedLanguages, setSelectedLanguages] = useState<Language[]>(['en']);
  const [isLanguageModalOpen, setIsLanguageModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Initialize with welcome message if no messages
  useEffect(() => {
    if (messages.length === 0 && !isProcessing) {
      setMessages([
        {
          id: 'welcome',
          role: 'assistant',
          content: logigramme
            ? "I can help you update your survey. What would you like to change or add?"
            : "Hello! I can help you create a survey. Please describe what you'd like to survey about, and I'll generate a logigramme for you.",
          timestamp: new Date(),
        },
      ]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logigramme]); // Only depend on logigramme to avoid infinite loops

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isProcessing) return;

    const userMessage: Message = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: inputMessage.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputMessage('');
    setIsProcessing(true);

    try {
      const apiKey = import.meta.env.VITE_OPENAI_API_KEY;

      if (!apiKey) {
        throw new Error('OpenAI API key is not configured');
      }

      let updatedLogigramme: Logigramme;
      let assistantResponse: string;

      if (logigramme) {
        // Update existing logigramme
        assistantResponse = `Updating your survey based on: "${userMessage.content}"...`;
        setMessages((prev) => [
          ...prev,
          {
            id: `assistant_${Date.now()}`,
            role: 'assistant',
            content: assistantResponse,
            timestamp: new Date(),
          },
        ]);

        updatedLogigramme = await updateLogigramme(logigramme, userMessage.content, apiKey);
        setLogigramme(updatedLogigramme);
        
        assistantResponse = `✓ I've updated your survey based on your request. The changes have been applied to the logigramme.`;
      } else {
        // Generate new logigramme
        if (!context.trim()) {
          // First message - set as context
          setContext(userMessage.content);
          if (!originalContext && setOriginalContext) {
            setOriginalContext(userMessage.content);
          }
        }

        assistantResponse = `Generating your survey logigramme... This may take a moment.`;
        setMessages((prev) => [
          ...prev,
          {
            id: `assistant_${Date.now()}`,
            role: 'assistant',
            content: assistantResponse,
            timestamp: new Date(),
          },
        ]);

        const currentContext = context || userMessage.content;
        const primaryLanguage = selectedLanguages[0] || 'en';
        
        // Generate in primary language first
        const languageContext = selectedLanguages.length > 0
          ? `${currentContext}\n\n[Write all survey question wording in ${LANGUAGES.find(l => l.code === primaryLanguage)?.nativeName || primaryLanguage}. Do not add a question asking respondents to choose their preferred language for the survey—that is handled by the platform.]`
          : currentContext;
        
        updatedLogigramme = await generateLogigramme(languageContext, apiKey);
        updatedLogigramme.languages = selectedLanguages;
        
        // Translate to additional languages and create separate nodes for each language
        const translatedVersions = new Map<Language, Logigramme>();
        
        if (selectedLanguages.length > 1) {
          const additionalLanguages = selectedLanguages.slice(1);
          
          for (let i = 0; i < additionalLanguages.length; i++) {
            const targetLang = additionalLanguages[i];
            const langName = LANGUAGES.find(l => l.code === targetLang)?.nativeName || targetLang;
            
            // Update message to show translation progress
            setMessages((prev) => {
              const updated = [...prev];
              const lastIndex = updated.length - 1;
              if (updated[lastIndex]?.role === 'assistant') {
                updated[lastIndex] = {
                  ...updated[lastIndex],
                  content: `Generating your survey logigramme...\n\nTranslating to ${langName} (${i + 1}/${additionalLanguages.length})...`,
                };
              }
              return updated;
            });
            
            // Translate the logigramme
            const translated = await translateLogigramme(updatedLogigramme, targetLang, apiKey);
            translatedVersions.set(targetLang, translated);
          }
        }
        
        // Create language-specific nodes for all languages
        const { createLanguageSpecificNodes } = await import('../utils/translateLogigramme');
        updatedLogigramme = createLanguageSpecificNodes(updatedLogigramme, selectedLanguages, translatedVersions);
        
        setLogigramme(updatedLogigramme);
        setContext(currentContext);
        if (!originalContext && setOriginalContext) {
          setOriginalContext(currentContext);
        }

        const langSummary = selectedLanguages.length > 1
          ? ` in ${selectedLanguages.length} languages (${selectedLanguages.map(l => LANGUAGES.find(lang => lang.code === l)?.nativeName || l).join(', ')})`
          : '';
        assistantResponse = `✓ I've created your survey logigramme${langSummary}! You can now view it in the Logigramme tab. Feel free to ask me to make changes or additions.`;
        
        if (onLogigrammeGenerated) {
          onLogigrammeGenerated();
        }
      }

      // Update the last assistant message with final response
      setMessages((prev) => {
        const updated = [...prev];
        const lastIndex = updated.length - 1;
        if (updated[lastIndex]?.role === 'assistant') {
          updated[lastIndex] = {
            ...updated[lastIndex],
            content: assistantResponse,
          };
        }
        return updated;
      });
    } catch (error) {
      console.error('Error processing message:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to process your request. Please try again.';
      
      setMessages((prev) => [
        ...prev,
        {
          id: `error_${Date.now()}`,
          role: 'assistant',
          content: `❌ Error: ${errorMessage}`,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsProcessing(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleEnhancePrompt = async () => {
    if (!inputMessage.trim() || isEnhancing || isProcessing) return;

    setIsEnhancing(true);
    try {
      const apiKey = import.meta.env.VITE_OPENAI_API_KEY;

      if (!apiKey) {
        throw new Error('OpenAI API key is not configured');
      }

      // Call OpenAI to enhance the prompt
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: `You are an expert at improving survey prompts and context descriptions. Your task is to enhance the provided text by:
- Adding more specific details and clarity
- Expanding on the purpose and goals
- Suggesting relevant areas to explore
- Improving the overall quality and level of detail
- Making it more comprehensive while keeping it focused
- Ensuring it's clear and actionable

Return ONLY the enhanced text, without any additional explanations or markdown formatting.`
            },
            {
              role: 'user',
              content: `Enhance and improve the following survey prompt. Make it more detailed, specific, and comprehensive so that an survey generator better generate the survey properly:\n\n${inputMessage}`
            }
          ],
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to enhance prompt');
      }

      const data = await response.json();
      const enhancedText = data.choices[0]?.message?.content?.trim();

      if (!enhancedText) {
        throw new Error('No enhanced text returned from OpenAI');
      }

      setInputMessage(enhancedText);
      inputRef.current?.focus();
    } catch (error) {
      console.error('Error enhancing prompt:', error);
      alert(error instanceof Error ? error.message : 'Failed to enhance prompt. Please try again.');
    } finally {
      setIsEnhancing(false);
    }
  };

  const handleFileButtonClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || isProcessing || isEnhancing) return;

    const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
    if (!apiKey) {
      alert('OpenAI API key is not configured');
      return;
    }

    // Display a user message indicating the upload
    const uploadMessage: Message = {
      id: `user_upload_${Date.now()}`,
      role: 'user',
      content: `Uploaded document: ${file.name}`,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, uploadMessage]);
    setIsProcessing(true);

    try {
      const { context: fileContext, tokens } = await fileToSurveyContext(file);

      // Token limit check before calling OpenAI
      if (tokens > OPENAI_MAX_INPUT_TOKENS) {
        setMessages((prev) => [
          ...prev,
          {
            id: `assistant_upload_too_large_${Date.now()}`,
            role: 'assistant',
            content:
              `❌ The uploaded document is too large for the AI model to process in a single request.\n` +
              `Estimated tokens: ${tokens.toLocaleString()} (limit ~${OPENAI_MAX_INPUT_TOKENS.toLocaleString()} tokens).\n` +
              `Please upload a shorter document or split it into smaller parts.`,
            timestamp: new Date(),
          },
        ]);
        return;
      }

      // Include a short preview of the document in the chat
      const previewMaxChars = 1000;
      const preview =
        fileContext.length > previewMaxChars
          ? `${fileContext.slice(0, previewMaxChars)}\n\n...[truncated]`
          : fileContext;

      setMessages((prev) => [
        ...prev,
        {
          id: `assistant_upload_preview_${Date.now()}`,
          role: 'assistant',
          content:
            `I've read your document "${file.name}". I'll use its content as the survey context.\n\n` +
            `Here is a preview of the extracted text:\n\n${preview}`,
          timestamp: new Date(),
        },
        {
          id: `assistant_upload_generating_${Date.now()}`,
          role: 'assistant',
          content: 'Generating your survey logigramme from the uploaded document... This may take a moment.',
          timestamp: new Date(),
        },
      ]);

      // Use the extracted text as the main context and generate the logigramme
      const primaryLanguage = selectedLanguages[0] || 'en';
      
      // Generate in primary language first
      const languageContext = selectedLanguages.length > 0
        ? `${fileContext}\n\n[Write all survey question wording in ${LANGUAGES.find(l => l.code === primaryLanguage)?.nativeName || primaryLanguage}. Do not add a question asking respondents to choose their preferred language for the survey—that is handled by the platform.]`
        : fileContext;
      
      let updatedLogigramme = await generateLogigramme(languageContext, apiKey);
      updatedLogigramme.languages = selectedLanguages;
      
      // Translate to additional languages and create separate nodes for each language
      const translatedVersions = new Map<Language, Logigramme>();
      
      if (selectedLanguages.length > 1) {
        const additionalLanguages = selectedLanguages.slice(1);
        
        for (let i = 0; i < additionalLanguages.length; i++) {
          const targetLang = additionalLanguages[i];
          const langName = LANGUAGES.find(l => l.code === targetLang)?.nativeName || targetLang;
          
          // Update message to show translation progress
          setMessages((prev) => {
            const updated = [...prev];
            const lastIndex = updated.length - 1;
            if (updated[lastIndex]?.role === 'assistant') {
              updated[lastIndex] = {
                ...updated[lastIndex],
                content: `Generating your survey logigramme from the uploaded document...\n\nTranslating to ${langName} (${i + 1}/${additionalLanguages.length})...`,
              };
            }
            return updated;
          });
          
          // Translate the logigramme
          const translated = await translateLogigramme(updatedLogigramme, targetLang, apiKey);
          translatedVersions.set(targetLang, translated);
        }
      }
      
      // Create language-specific nodes for all languages
      const { createLanguageSpecificNodes } = await import('../utils/translateLogigramme');
      updatedLogigramme = createLanguageSpecificNodes(updatedLogigramme, selectedLanguages, translatedVersions);
      
      setLogigramme(updatedLogigramme);
      setContext(fileContext);
      if (!originalContext && setOriginalContext) {
        setOriginalContext(fileContext);
      }

      if (onLogigrammeGenerated) {
        onLogigrammeGenerated();
      }

        // Final confirmation message
        const langSummary = selectedLanguages.length > 1
          ? ` in ${selectedLanguages.length} languages (${selectedLanguages.map(l => LANGUAGES.find(lang => lang.code === l)?.nativeName || l).join(', ')})`
          : '';
        setMessages((prev) => [
          ...prev,
          {
            id: `assistant_upload_done_${Date.now()}`,
            role: 'assistant',
            content:
              `✓ I have created your survey logigramme from the uploaded document${langSummary}. You can now view it in the Logigramme tab and ask for any changes.`,
            timestamp: new Date(),
          },
        ]);
    } catch (error) {
      console.error('Error processing uploaded file:', error);
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to process the uploaded file. Please try again with a different document.';
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant_upload_error_${Date.now()}`,
          role: 'assistant',
          content: `❌ Error while processing the uploaded document: ${message}`,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStartNew = () => {
    if (window.confirm('Are you sure you want to start a new survey? This will clear all current progress.')) {
      // Clear local state first
      setMessages([]);
      setInputMessage('');
      setIsProcessing(false);
      
      // Reset parent state if callback provided
      if (onStartNew) {
        onStartNew();
      } else {
        // Fallback: reset directly if no callback
        setLogigramme(null);
        setContext('');
        if (setOriginalContext) {
          setOriginalContext('');
        }
      }
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xl font-bold text-gray-900">Chat</h2>
          {logigramme && (
            <button
              onClick={handleStartNew}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-lg transition-all font-medium"
              title="Start a new survey"
            >
              <Plus className="w-4 h-4" />
              New Survey
            </button>
          )}
        </div>
        <p className="text-sm text-gray-600">
          {logigramme
            ? 'Ask me to update or modify your survey'
            : 'Describe your survey and I\'ll create it for you'}
        </p>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto mb-4 space-y-4 pr-2">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-3 ${
              message.role === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            {message.role === 'assistant' && (
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                <Bot className="w-5 h-5 text-blue-600" />
              </div>
            )}
            
            <div
              className={`max-w-[85%] rounded-lg px-4 py-2 ${
                message.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-900'
              }`}
            >
              <p className="text-sm whitespace-pre-wrap break-words">
                {message.content}
              </p>
              <p
                className={`text-xs mt-1 ${
                  message.role === 'user' ? 'text-blue-100' : 'text-gray-500'
                }`}
              >
                {message.timestamp.toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>

            {message.role === 'user' && (
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                <User className="w-5 h-5 text-gray-600" />
              </div>
            )}
          </div>
        ))}
        
        {isProcessing && (
          <div className="flex gap-3 justify-start">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
              <Bot className="w-5 h-5 text-blue-600" />
            </div>
            <div className="bg-gray-100 rounded-lg px-4 py-2">
              <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-gray-200 pt-4">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={
                logigramme
                  ? 'Ask me to update your survey...'
                  : 'Describe your survey idea...'
              }
              rows={3}
              disabled={isProcessing || isEnhancing}
              className="w-full px-4 py-2 pr-20 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none disabled:bg-gray-100 disabled:cursor-not-allowed"
            />
            <div className="absolute right-2 bottom-2 flex gap-1">
              <button
                type="button"
                onClick={() => setIsLanguageModalOpen(true)}
                disabled={isProcessing || isEnhancing}
                className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md disabled:opacity-60 disabled:cursor-not-allowed transition-all relative"
                title={`Selected languages: ${selectedLanguages.map(l => LANGUAGES.find(lang => lang.code === l)?.nativeName || l).join(', ')}`}
              >
                <Languages className="w-4 h-4" />
                {selectedLanguages.length > 1 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-blue-600 text-white text-xs rounded-full flex items-center justify-center">
                    {selectedLanguages.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={handleFileButtonClick}
                disabled={isProcessing || isEnhancing}
                className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                title={`Upload document to turn into a survey (${SUPPORTED_FILE_EXTENSIONS.join(', ')})`}
              >
                <UploadCloud className="w-4 h-4" />
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept={SUPPORTED_FILE_EXTENSIONS.join(',')}
              className="hidden"
              onChange={handleFileUpload}
            />
          </div>
          <div className="flex flex-col gap-2 self-end">
            <button
              onClick={handleEnhancePrompt}
              disabled={!inputMessage.trim() || isEnhancing || isProcessing}
              className="px-3 py-2 bg-purple-50 text-purple-700 rounded-lg font-medium hover:bg-purple-100 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-1.5"
              title="Enhance your prompt with AI"
            >
              {isEnhancing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              <span className="text-xs">Enhance</span>
            </button>
            <button
              onClick={handleSendMessage}
              disabled={!inputMessage.trim() || isProcessing || isEnhancing}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
              {isProcessing ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>

      {/* Language Selection Modal */}
      <LanguageModal
        isOpen={isLanguageModalOpen}
        onClose={() => setIsLanguageModalOpen(false)}
        selectedLanguages={selectedLanguages}
        onLanguagesChange={setSelectedLanguages}
      />
    </div>
  );
}

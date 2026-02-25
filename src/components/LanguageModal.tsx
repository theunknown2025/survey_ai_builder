import { X } from 'lucide-react';

export type Language = 'ar' | 'fr' | 'en';

export interface LanguageOption {
  code: Language;
  name: string;
  nativeName: string;
}

export const LANGUAGES: LanguageOption[] = [
  { code: 'ar', name: 'Arabic', nativeName: 'العربية' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'en', name: 'English', nativeName: 'English' },
];

interface LanguageModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedLanguages: Language[];
  onLanguagesChange: (languages: Language[]) => void;
}

export default function LanguageModal({
  isOpen,
  onClose,
  selectedLanguages,
  onLanguagesChange,
}: LanguageModalProps) {
  if (!isOpen) return null;

  const handleLanguageToggle = (langCode: Language) => {
    if (selectedLanguages.includes(langCode)) {
      // Remove language, but keep at least one
      if (selectedLanguages.length > 1) {
        onLanguagesChange(selectedLanguages.filter(l => l !== langCode));
      }
    } else {
      // Add language
      onLanguagesChange([...selectedLanguages, langCode]);
    }
  };

  const handleReorder = (index: number, direction: 'up' | 'down') => {
    if (selectedLanguages.length <= 1) return;
    
    const newOrder = [...selectedLanguages];
    if (direction === 'up' && index > 0) {
      [newOrder[index], newOrder[index - 1]] = [newOrder[index - 1], newOrder[index]];
    } else if (direction === 'down' && index < newOrder.length - 1) {
      [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
    }
    onLanguagesChange(newOrder);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">Select Languages</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-600 mb-4">
            Select one or more languages. The first language will be used for chat and logigramme generation. 
            The preview will show all selected languages.
          </p>

          {/* Available Languages */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Available Languages</h3>
            {LANGUAGES.map((lang) => {
              const isSelected = selectedLanguages.includes(lang.code);
              const isFirst = selectedLanguages[0] === lang.code;
              
              return (
                <label
                  key={lang.code}
                  className={`flex items-center gap-3 p-3 border-2 rounded-lg cursor-pointer transition-all ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleLanguageToggle(lang.code)}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{lang.nativeName}</span>
                      <span className="text-sm text-gray-500">({lang.name})</span>
                      {isFirst && (
                        <span className="ml-auto px-2 py-0.5 bg-blue-600 text-white text-xs font-medium rounded">
                          Primary
                        </span>
                      )}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>

          {/* Selected Languages Order */}
          {selectedLanguages.length > 1 && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">
                Language Order (drag to reorder)
              </h3>
              <div className="space-y-2">
                {selectedLanguages.map((langCode, index) => {
                  const lang = LANGUAGES.find(l => l.code === langCode);
                  if (!lang) return null;
                  
                  return (
                    <div
                      key={langCode}
                      className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200"
                    >
                      <span className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">
                        {index + 1}
                      </span>
                      <span className="flex-1 font-medium text-gray-900">{lang.nativeName}</span>
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleReorder(index, 'up')}
                          disabled={index === 0}
                          className="p-1 hover:bg-gray-200 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Move up"
                        >
                          ↑
                        </button>
                        <button
                          onClick={() => handleReorder(index, 'down')}
                          disabled={index === selectedLanguages.length - 1}
                          className="p-1 hover:bg-gray-200 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Move down"
                        >
                          ↓
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-6 pt-4 border-t border-gray-200">
            <button
              onClick={onClose}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

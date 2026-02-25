import { Survey, Node, Edge } from '../types/survey';
import { Language, LANGUAGES } from '../components/LanguageModal';

/**
 * Generate ODIN/Nipo survey script file format from survey data
 */
export function generateNipoFile(survey: Survey): string {
  if (!survey.logigramme) {
    throw new Error('Logigramme is required to generate Nipo file');
  }

  const logigramme = survey.logigramme;
  const startNode = logigramme.nodes.find(n => n.type === 'start');
  const endNode = logigramme.nodes.find(n => n.type === 'end');
  const questionNodes = logigramme.nodes.filter(n => n.type === 'question');
  
  // Build question number mapping (sequential numbering)
  const questionNumberMap = new Map<string, number>();
  questionNodes.forEach((node, index) => {
    questionNumberMap.set(node.id, index + 1);
  });

  // Build edge maps for flow control
  const edgesByFrom = new Map<string, Edge[]>();
  const edgesByTo = new Map<string, Edge[]>();
  logigramme.edges.forEach(edge => {
    if (!edgesByFrom.has(edge.from)) {
      edgesByFrom.set(edge.from, []);
    }
    edgesByFrom.get(edge.from)!.push(edge);
    
    if (!edgesByTo.has(edge.to)) {
      edgesByTo.set(edge.to, []);
    }
    edgesByTo.get(edge.to)!.push(edge);
  });

  // Determine question order: start from start node, follow edges
  // For main questionnaire, use primary language questions (without language suffix) or base questions
  const orderedQuestions: Node[] = [];
  const visited = new Set<string>();
  
  // Get primary language
  const primaryLang = logigramme.languages?.[0] || 'en';
  
  function traverseFromNode(nodeId: string) {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    
    const node = logigramme.nodes.find(n => n.id === nodeId);
    if (node && node.type === 'question') {
      // For main questionnaire, prefer primary language version or base version
      // If node has language suffix, try to find base version or primary language version
      if (node.id.includes('_') && !node.id.endsWith(`_${primaryLang}`)) {
        // This is a non-primary language node, skip it in main questionnaire
        return;
      }
      
      // Remove language suffix if present to get base ID
      const baseId = node.id.includes('_') ? node.id.split('_').slice(0, -1).join('_') : node.id;
      
      // If this is a language-specific node, find the primary language version
      if (node.id.endsWith(`_${primaryLang}`)) {
        orderedQuestions.push(node);
      } else if (!node.id.includes('_')) {
        // Base node without language suffix
        orderedQuestions.push(node);
      }
    }
    
    const outgoingEdges = edgesByFrom.get(nodeId) || [];
    outgoingEdges.forEach(edge => {
      if (edge.to !== endNode?.id) {
        traverseFromNode(edge.to);
      }
    });
  }
  
  // Start traversal from start node
  if (startNode) {
    const startEdges = edgesByFrom.get(startNode.id) || [];
    startEdges.forEach(edge => {
      traverseFromNode(edge.to);
    });
  }
  
  // If no start node or no edges from start, use all questions in order (primary language only)
  if (orderedQuestions.length === 0) {
    const primaryQuestions = questionNodes.filter(n => {
      if (n.id === 'q_language_selection') return true;
      if (n.id.endsWith(`_${primaryLang}`)) return true;
      if (!n.id.includes('_')) return true;
      return false;
    });
    orderedQuestions.push(...primaryQuestions);
  }

  let odinContent = `** =======================================================================================
** Nfield Export v3.1
**
** Questionnaire: ${survey.title || 'Untitled Survey'}
**	- Survey number...: 
**	- Last changed....: ${new Date().toISOString().split('.')[0]} UTC
** =======================================================================================

******************************************** Questionnaire Section - Start ***********************************************************************************

*TEMPLATE "KantartemplateV4"

`;

  // Generate sections as comments
  if (logigramme.sections && logigramme.sections.length > 0) {
    logigramme.sections.forEach((section, sectionIndex) => {
      odinContent += `** =======================================================================================
** Section ${sectionIndex + 1}: ${section.title}
** ${section.description}
** =======================================================================================

`;
    });
  }

  // Calculate unique field positions for each question to avoid conflicts
  // Each question needs a unique starting position that doesn't overlap
  let currentPosition = 1201; // Start from 1201
  const questionPositions = new Map<string, number>();
  
  orderedQuestions.forEach((node) => {
    let fieldLength = 1;
    switch (node.questionType) {
      case 'multiple-choice':
        fieldLength = Math.max(node.options?.length || 1, 1);
        break;
      case 'text':
        fieldLength = 1;
        break;
      case 'rating':
        fieldLength = Math.max(node.options?.length || 5, 5);
        break;
      case 'yes-no':
        fieldLength = 2;
        break;
      default:
        fieldLength = Math.max(node.options?.length || 1, 1);
    }
    
    // Assign unique position (increment by fieldLength to avoid overlaps)
    questionPositions.set(node.id, currentPosition);
    currentPosition += fieldLength; // Next question starts after this one's range
  });

  // Helper function to get language code for ODIN format
  const getOdinLanguageCode = (lang: Language): string => {
    const langMap: Record<Language, string> = {
      en: 'en-001',
      fr: 'fr-FR',
      ar: 'ar-MA',
    };
    return langMap[lang] || lang;
  };

  // Helper function to generate a single question in ODIN format
  const generateQuestionODIN = (node: Node, questionNum: number, basePosition: number, isLanguageSection: boolean = false): string => {
    const section = logigramme.sections?.find(s => s.id === node.sectionId);
    
    let questionODIN = '';

    // Question type mapping
    let questionType = '*CODES';
    let fieldLength = '1';
    let uiOptions = 'metaType=rowpicker;answertype=text;clicktosubmit = true';
    
    const fieldPosition = `${basePosition}L${fieldLength}`;
    
    switch (node.questionType) {
      case 'multiple-choice':
        questionType = '*CODES';
        fieldLength = Math.max(node.options?.length || 1, 1).toString();
        uiOptions = 'metaType=rowpicker;answertype=text;clicktosubmit = true';
        break;
      case 'text':
        questionType = '*OPEN';
        fieldLength = '1';
        uiOptions = 'metaType=textinput';
        break;
      case 'rating':
        questionType = '*CODES';
        fieldLength = Math.max(node.options?.length || 5, 5).toString();
        uiOptions = 'metaType=rowpicker;answertype=text;clicktosubmit = true';
        break;
      case 'yes-no':
        questionType = '*CODES';
        fieldLength = '2';
        uiOptions = 'metaType=rowpicker;answertype=text;clicktosubmit = true';
        break;
      default:
        questionType = '*CODES';
        fieldLength = Math.max(node.options?.length || 1, 1).toString();
    }
    
    const fieldPositionFull = `${basePosition}L${fieldLength}`;

    // Generate question variable name
    const varName = `SPSSQ${questionNum}`;
    const dimVar = `SPSSQ${questionNum}`;
    
    // Question label (sanitize)
    const questionLabel = node.label.replace(/"/g, '').substring(0, 100);
    const altText = (node.imageAlt || '').replace(/"/g, '');
    const hasImage = !!node.imageUrl;
    const imageHtml = hasImage ? `<br><img src="${node.imageUrl}" alt="${altText}" />` : '';
    
    // In language sections, only include question number and text (no full definition)
    if (isLanguageSection) {
      questionODIN += `*QUESTION ${questionNum}000
${node.label}${imageHtml}

`;
      
      // Generate options if available (translated)
      if (node.options && node.options.length > 0) {
        node.options.forEach((option, optIndex) => {
          const optionCode = optIndex + 1;
          const optionText = option.replace(/"/g, '');
          questionODIN += `${optionCode}: ${optionText}

`;
        });
      }
    } else {
      // Full question definition for main questionnaire
      questionODIN += `*QUESTION ${questionNum}000 ${questionType} ${fieldPositionFull}${fieldLength} *LABEL "Q${questionNum}_${questionLabel.replace(/[^a-zA-Z0-9\s]/g, '').substring(0, 50)}" *VAR "${varName}" *PROPERTIES "DIMVAR=${dimVar}" *UIOPTIONS "${uiOptions}"
${node.label}${imageHtml}

`;

      // Generate options if available
      if (node.options && node.options.length > 0) {
        // Check if this is the language selection question
        const isLanguageQuestion = node.id === 'q_language_selection';
        
        node.options.forEach((option, optIndex) => {
          const optionCode = optIndex + 1;
          const optionText = option.replace(/"/g, '');
          
          // Add *SWILANG directive for language selection question
          if (isLanguageQuestion && logigramme.languages && logigramme.languages.length > 1) {
            // Find the language code for this option
            const langInfo = LANGUAGES.find(l => l.nativeName === option);
            if (langInfo) {
              const odinLangCode = getOdinLanguageCode(langInfo.code);
              questionODIN += `${optionCode}: ${optionText} *SWILANG "${odinLangCode}" *PROPERTIES "DIMELE=_${optionCode}"

`;
            } else {
              questionODIN += `${optionCode}: ${optionText} *PROPERTIES "DIMELE=_${optionCode}"

`;
            }
          } else {
            questionODIN += `${optionCode}: ${optionText} *PROPERTIES "DIMELE=_${optionCode}"

`;
          }
        });
        
        // Add "Do not know" option for multiple choice and rating questions (only in main questionnaire)
        if ((node.questionType === 'multiple-choice' || node.questionType === 'rating') && !isLanguageQuestion) {
          questionODIN += `99: Do not know / no response *PROPERTIES "DIMELE=_99"

`;
        }
      }
    }
    
    return questionODIN;
  };

  // Generate questions in order (main questionnaire in primary language)
  orderedQuestions.forEach((node, index) => {
    const questionNum = index + 1;
    const section = logigramme.sections?.find(s => s.id === node.sectionId);
    
    // Section comment if applicable
    if (section && index === 0) {
      odinContent += `** ${section.title} - ${section.description}\n`;
    } else if (section) {
      const prevSection = logigramme.sections?.find(s => 
        orderedQuestions[index - 1]?.sectionId === s.id
      );
      if (!prevSection || prevSection.id !== section.id) {
        odinContent += `** ${section.title} - ${section.description}\n`;
      }
    }

    // Get unique position for this question
    const basePosition = questionPositions.get(node.id) || (1201 + questionNum);
    
    // Generate question (full definition for main questionnaire)
    odinContent += generateQuestionODIN(node, questionNum, basePosition, false);

    // Generate conditional flow logic based on edges
    const outgoingEdges = edgesByFrom.get(node.id) || [];
    
    // Track which options have been handled
    const handledOptions = new Set<number>();
    
    if (outgoingEdges.length > 1) {
      // Multiple paths - conditional branching
      outgoingEdges.forEach((edge) => {
        const targetNode = logigramme.nodes.find(n => n.id === edge.to);
        if (!targetNode) return;

        if (targetNode.type === 'end') {
          // Path to end - use END
          if (edge.label && node.options) {
            const answerCode = node.options.findIndex(opt => opt === edge.label);
            if (answerCode >= 0 && !handledOptions.has(answerCode + 1)) {
              odinContent += `*IF [Q${questionNum}000,${answerCode + 1}] *END

`;
              handledOptions.add(answerCode + 1);
            }
          }
        } else if (targetNode.type === 'question') {
          // Path to another question - verify it exists
          const targetQuestionNum = questionNumberMap.get(targetNode.id);
          if (targetQuestionNum && targetQuestionNum <= orderedQuestions.length) {
            if (edge.label && node.options) {
              const answerCode = node.options.findIndex(opt => opt === edge.label);
              if (answerCode >= 0 && !handledOptions.has(answerCode + 1)) {
                odinContent += `*IF [Q${questionNum}000,${answerCode + 1}] *GOTO ${targetQuestionNum}000

`;
                handledOptions.add(answerCode + 1);
              }
            } else if (!edge.label) {
              // Default path (no label means always go here)
              odinContent += `*GOTO ${targetQuestionNum}000

`;
            }
          }
        }
      });
      
      // Handle any unhandled options - default to next question or end
      // Only add default GOTO if there are unhandled options
      if (node.options && handledOptions.size < node.options.length) {
        const nextQuestionNum = questionNum + 1;
        if (nextQuestionNum <= orderedQuestions.length) {
          // Default to next question for unhandled options (only if not already going there)
          const unhandledOptions: number[] = [];
          for (let i = 0; i < node.options.length; i++) {
            if (!handledOptions.has(i + 1)) {
              unhandledOptions.push(i + 1);
            }
          }
          // Add single default GOTO for all unhandled options
          if (unhandledOptions.length > 0) {
            // Use the first unhandled option as the condition
            odinContent += `*IF [Q${questionNum}000,${unhandledOptions[0]}] *GOTO ${nextQuestionNum}000

`;
            // Add remaining unhandled options
            for (let i = 1; i < unhandledOptions.length; i++) {
              odinContent += `*IF [Q${questionNum}000,${unhandledOptions[i]}] *GOTO ${nextQuestionNum}000

`;
            }
          }
        } else {
          // Last question, go to end for unhandled options
          const unhandledOptions: number[] = [];
          for (let i = 0; i < node.options.length; i++) {
            if (!handledOptions.has(i + 1)) {
              unhandledOptions.push(i + 1);
            }
          }
          if (unhandledOptions.length > 0) {
            for (const opt of unhandledOptions) {
              odinContent += `*IF [Q${questionNum}000,${opt}] *END

`;
            }
          }
        }
      }
    } else if (outgoingEdges.length === 1) {
      // Single path
      const edge = outgoingEdges[0];
      const targetNode = logigramme.nodes.find(n => n.id === edge.to);
      
      if (targetNode?.type === 'end') {
        // End of survey - use END
        odinContent += `*END

`;
      } else if (targetNode?.type === 'question') {
        const targetQuestionNum = questionNumberMap.get(targetNode.id);
        if (targetQuestionNum && targetQuestionNum <= orderedQuestions.length) {
          if (targetQuestionNum !== questionNum + 1) {
            // Not sequential, need explicit GOTO
            odinContent += `*GOTO ${targetQuestionNum}000

`;
          }
          // If sequential, no GOTO needed (flow continues naturally)
        }
      }
    } else {
      // No outgoing edges - go to end if this is the last question
      if (index === orderedQuestions.length - 1) {
        odinContent += `*END

`;
      }
    }

    odinContent += '\n';
  });

  // Generate end section
  odinContent += `******************************************** End of interview *********************************************************************************************

*END

`;

  // Generate language sections with translations (following Nfield pattern)
  if (logigramme.languages && logigramme.languages.length > 1) {
    // Get primary language (first one)
    const primaryLang = logigramme.languages[0];
    const primaryLangCode = getOdinLanguageCode(primaryLang);
    
    // Add primary language section (master/default)
    odinContent += `*LANGUAGE "${primaryLangCode}"

`;

    // For each additional language, create a language section
    const additionalLanguages = logigramme.languages.slice(1);
    
    additionalLanguages.forEach(lang => {
      const langCode = getOdinLanguageCode(lang);
      const langInfo = LANGUAGES.find(l => l.code === lang);
      const langName = langInfo?.nativeName || lang;
      
      // Add RTL flag for Arabic
      const languageDirective = lang === 'ar' ? `*LANGUAGE "${langCode},RTL"` : `*LANGUAGE "${langCode}"`;
      
      odinContent += `${languageDirective}

`;

      // Generate all questions in this language (using translated nodes)
      // Use the same question order as main questionnaire
      orderedQuestions.forEach((originalNode, index) => {
        // Skip language selection question in language sections
        if (originalNode.id === 'q_language_selection') {
          return;
        }
        
        const questionNum = index + 1;
        
        // Get base node ID (remove language suffix if present)
        const baseNodeId = originalNode.id.includes('_') 
          ? originalNode.id.split('_').slice(0, -1).join('_') 
          : originalNode.id;
        
        // Find the translated version of this node for the current language
        const translatedNodeId = `${baseNodeId}_${lang}`;
        const translatedNode = logigramme.nodes.find(n => n.id === translatedNodeId);
        
        // Use translated node if available, otherwise use original
        const nodeToUse = translatedNode || originalNode;
        
        // Get base position (same as original question)
        const basePosition = questionPositions.get(originalNode.id) || questionPositions.get(baseNodeId) || (1201 + questionNum);
        
        // Generate question in language section (simplified format - just number and text)
        odinContent += generateQuestionODIN(nodeToUse, questionNum, basePosition, true);
      });
    });
  } else {
    // Single language - use default
    const defaultLang = logigramme.languages?.[0] || 'en';
    const defaultLangCode = getOdinLanguageCode(defaultLang as Language);
    odinContent += `*LANGUAGE "${defaultLangCode}"

`;
  }

  return odinContent;
}

/**
 * Download Nipo file
 */
export function downloadNipoFile(survey: Survey): void {
  try {
    const nipoContent = generateNipoFile(survey);
    const blob = new Blob([nipoContent], {
      type: 'text/plain;charset=utf-8',
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `survey-${Date.now()}.odin`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error generating Nipo file:', error);
    throw error;
  }
}

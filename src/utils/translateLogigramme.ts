import { Logigramme, Node, Section, Edge } from '../types/survey';
import { Language, LANGUAGES } from '../components/LanguageModal';

/**
 * Translate a logigramme to a target language using OpenAI
 */
export async function translateLogigramme(
  logigramme: Logigramme,
  targetLanguage: Language,
  apiKey: string
): Promise<Logigramme> {
  const langName = LANGUAGES.find(l => l.code === targetLanguage)?.nativeName || targetLanguage;

  // Prepare the logigramme structure for translation
  const logigrammeData = {
    nodes: logigramme.nodes.map(node => ({
      id: node.id,
      type: node.type,
      label: node.label,
      questionType: node.questionType,
      options: node.options || [],
    })),
    sections: logigramme.sections?.map(section => ({
      id: section.id,
      title: section.title,
      description: section.description,
    })) || [],
  };

  const systemPrompt = `You are a professional translator and survey design expert. Translate a survey logigramme to ${langName} (${targetLanguage}).

Return ONLY JSON (no markdown):
{
  "nodes": [
    {
      "id": "q1",
      "type": "question",
      "label": "Translated question text",
      "questionType": "multiple-choice",
      "options": ["Translated option 1", "Translated option 2"]
    }
  ],
  "sections": [
    {
      "id": "section1",
      "title": "Translated section title",
      "description": "Translated section description"
    }
  ]
}

Rules:
- Translate ALL text content (labels, options, titles, descriptions) to ${langName}
- Keep the same structure and IDs
- Maintain the same question types
- For yes-no questions, translate "Yes" and "No" appropriately
- Preserve all technical fields (id, type, questionType)
- Return the complete translated structure`;

  const userPrompt = `Translate this survey logigramme to ${langName}:\n\n${JSON.stringify(logigrammeData, null, 2)}`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3, // Lower temperature for more consistent translations
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`OpenAI API error: ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const translated = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(content);

    // Return translated nodes and sections (not merged, we'll create separate nodes)
    return {
      nodes: translated.nodes || [],
      edges: logigramme.edges, // Keep original edges structure
      sections: translated.sections || logigramme.sections,
    };
  } catch (error) {
    console.error(`Error translating to ${langName}:`, error);
    // Return original logigramme if translation fails
    return logigramme;
  }
}

/**
 * Create separate nodes for each language version
 * This creates duplicate nodes with language-specific IDs (e.g., q1_en, q1_ar, q1_fr)
 */
export function createLanguageSpecificNodes(
  logigramme: Logigramme,
  languages: Language[],
  translatedVersions: Map<Language, Logigramme>
): Logigramme {
  if (languages.length <= 1) {
    return logigramme; // No need for separate nodes if only one language
  }

  const startNode = logigramme.nodes.find(n => n.type === 'start');
  const endNode = logigramme.nodes.find(n => n.type === 'end');
  
  if (!startNode || !endNode) {
    return logigramme;
  }

  // Get language names for the options
  const languageOptions = languages.map(lang => {
    const langInfo = LANGUAGES.find(l => l.code === lang);
    return langInfo?.nativeName || lang;
  });

  // Create language selection question
  const languageLabels: Record<Language, string> = {
    en: 'Please select your preferred language for this survey',
    fr: 'Veuillez sélectionner votre langue préférée pour cette enquête',
    ar: 'يرجى اختيار لغتك المفضلة لهذا الاستطلاع',
  };

  const languageQuestionId = 'q_language_selection';
  const languageQuestion: Node = {
    id: languageQuestionId,
    type: 'question',
    label: languages.map(lang => languageLabels[lang] || languageLabels.en).join(' / '),
    questionType: 'multiple-choice',
    options: languageOptions,
    sectionId: logigramme.sections?.[0]?.id,
    x: startNode.x,
    y: startNode.y + 150,
  };

  // Collect all nodes and edges
  const allNodes: Node[] = [startNode, languageQuestion];
  const allEdges: Edge[] = [];
  
  // Create edge from start to language question
  allEdges.push({
    id: 'e_start_to_lang',
    from: startNode.id,
    to: languageQuestionId,
    label: '',
  });

  // For each language, create separate nodes
  languages.forEach((lang, langIndex) => {
    const langName = LANGUAGES.find(l => l.code === lang)?.nativeName || lang;
    const translated = langIndex === 0 ? logigramme : translatedVersions.get(lang);
    
    if (!translated) return;

    // Create language-specific nodes with language suffix
    // For primary language (index 0), keep original IDs but add suffix for consistency
    // For other languages, use translated content with language suffix
    const langNodes = translated.nodes
      .filter(n => n.type === 'question' && n.id !== 'q_language_selection')
      .map(node => ({
        ...node,
        id: `${node.id}_${lang}`, // e.g., q1_en, q1_ar, q1_fr
        label: node.label,
        options: node.options,
        questionType: node.questionType,
        sectionId: node.sectionId,
        x: node.x + (langIndex * 400), // Offset horizontally for visualization
        y: node.y,
      }));

    allNodes.push(...langNodes);

    // Create language-specific sections
    if (translated.sections) {
      translated.sections.forEach(section => {
        const existingSection = logigramme.sections?.find(s => s.id === section.id);
        if (existingSection) {
          // Update section with translated title/description
          existingSection.title = section.title;
          existingSection.description = section.description;
        }
      });
    }

    // Create edge from language question to first question of this language
    const firstLangNode = langNodes[0];
    if (firstLangNode) {
      allEdges.push({
        id: `e_lang_${lang}_to_first`,
        from: languageQuestionId,
        to: firstLangNode.id,
        label: langName,
      });

      // Recreate edges for this language version
      translated.edges.forEach(edge => {
        const fromNode = langNodes.find(n => n.id.replace(`_${lang}`, '') === edge.from);
        const toNode = langNodes.find(n => n.id.replace(`_${lang}`, '') === edge.to);
        
        if (fromNode && toNode) {
          allEdges.push({
            id: `${edge.id}_${lang}`,
            from: fromNode.id,
            to: toNode.id,
            label: edge.label,
          });
        } else if (fromNode && edge.to === endNode.id) {
          // Edge to end node
          allEdges.push({
            id: `${edge.id}_${lang}`,
            from: fromNode.id,
            to: endNode.id,
            label: edge.label,
          });
        }
      });
    }
  });

  // Add end node
  allNodes.push(endNode);

  return {
    nodes: allNodes,
    edges: allEdges,
    sections: logigramme.sections,
    languages: languages,
  };
}

import { Node, Edge } from '../types/survey';

interface GenerateFollowupQuestionsParams {
  question: Node;
  context: string;
  existingNodes: Node[];
  apiKey: string;
}

interface FollowupQuestionsResponse {
  nodes: Node[];
  edges: Edge[];
}

export async function generateFollowupQuestions({
  question,
  context,
  existingNodes,
  apiKey,
}: GenerateFollowupQuestionsParams): Promise<FollowupQuestionsResponse> {
  if (!apiKey) {
    throw new Error('OpenAI API key is not configured');
  }

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
          content: `You are a survey design expert. Generate follow-up questions based on a specific question in a survey.

Given a question and the survey context, create 2-4 relevant follow-up questions that would logically come after this question.

Return a JSON structure with the following format:
{
  "nodes": [
    {
      "id": "q_followup_1",
      "type": "question",
      "label": "Follow-up question text here",
      "questionType": "multiple-choice|text|rating|yes-no",
      "options": ["Option 1", "Option 2"],
      "x": 100,
      "y": 200
    }
  ],
  "edges": [
    {
      "id": "e_followup_1",
      "from": "q_original_id",
      "to": "q_followup_1",
      "label": "Option that leads here"
    }
  ]
}

Important guidelines:
- Create 2-4 relevant follow-up questions
- Position nodes appropriately (x: 100-500, y: increment by 150-200)
- Use appropriate question types
- Create edges from the original question to each follow-up
- Edge labels should be answer options from the original question
- Make sure question IDs are unique (use q_followup_1, q_followup_2, etc.)
- Consider the survey context when generating questions`
        },
        {
          role: 'user',
          content: `Generate follow-up questions for this question in the survey:

Original Question:
- ID: ${question.id}
- Text: ${question.label}
- Type: ${question.questionType}
${question.options ? `- Options: ${question.options.join(', ')}` : ''}

Survey Context: ${context}

Existing nodes in the survey: ${JSON.stringify(existingNodes.map(n => ({ id: n.id, label: n.label })))}

Generate follow-up questions that would logically come after this question.`
        }
      ],
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || 'Failed to generate follow-up questions');
  }

  const data = await response.json();
  const responseText = data.choices[0]?.message?.content?.trim();

  if (!responseText) {
    throw new Error('No response returned from OpenAI');
  }

  // Parse JSON from response (handle cases where response might have markdown code blocks)
  let result: FollowupQuestionsResponse;
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      result = JSON.parse(jsonMatch[0]);
    } else {
      result = JSON.parse(responseText);
    }
  } catch (parseError) {
    throw new Error(`Failed to parse OpenAI response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
  }

  return {
    nodes: result.nodes || [],
    edges: result.edges || [],
  };
}

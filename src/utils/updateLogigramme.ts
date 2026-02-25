import { Logigramme } from '../types/survey';

/**
 * Update an existing logigramme based on user feedback/requests
 */
export async function updateLogigramme(
  currentLogigramme: Logigramme,
  userRequest: string,
  apiKey: string
): Promise<Logigramme> {
  const systemPrompt = `You are a survey design expert. Your task is to update an existing survey logigramme based on user requests.

IMPORTANT RULES:
- DO NOT recreate the entire survey - only make the requested changes
- Preserve existing nodes, edges, and sections that are not mentioned in the request
- When adding new questions, assign them to appropriate existing sections or create new sections if needed
- Maintain the structure and IDs of existing elements unless explicitly asked to change them
- Update positions and connections as needed to accommodate changes
- Ensure all paths still lead to the end node

Return ONLY valid JSON matching this structure:
{
  "nodes": [...], // Updated nodes array (include all existing + new/modified)
  "edges": [...], // Updated edges array
  "sections": [...] // Updated sections array
}

The logigramme structure:
- nodes: Array of nodes with types: "start", "end", "question"
- edges: Array of edges connecting nodes with "from", "to", "label"
- sections: Array of sections with "id", "title", "description", "questionIds", "x", "y", "width", "height"

For question nodes:
- id: unique identifier
- type: "question"
- label: question text
- questionType: "multiple-choice" | "text" | "rating" | "yes-no"
- options: array of options (for multiple-choice/yes-no)
- sectionId: section this question belongs to
- x, y: position coordinates
- width, height: dimensions

Return the COMPLETE updated logigramme, not just the changes.`;

  const userPrompt = `Current logigramme:
${JSON.stringify(currentLogigramme, null, 2)}

User request: ${userRequest}

Please update the logigramme according to the user's request. Return the complete updated logigramme structure.`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.7,
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
  let updatedLogigramme: Logigramme;
  
  if (jsonMatch) {
    updatedLogigramme = JSON.parse(jsonMatch[0]);
  } else {
    updatedLogigramme = JSON.parse(content);
  }

  // Validate that we have the required structure
  if (!updatedLogigramme.nodes || !updatedLogigramme.edges) {
    throw new Error('Invalid response: missing nodes or edges');
  }

  // Ensure sections exist
  if (!updatedLogigramme.sections) {
    updatedLogigramme.sections = [];
  }

  // Ensure start and end nodes exist
  const hasStart = updatedLogigramme.nodes.some((n: any) => n.type === 'start');
  const hasEnd = updatedLogigramme.nodes.some((n: any) => n.type === 'end');

  if (!hasStart || !hasEnd) {
    // Preserve start/end from original if missing
    const originalStart = currentLogigramme.nodes.find(n => n.type === 'start');
    const originalEnd = currentLogigramme.nodes.find(n => n.type === 'end');
    
    if (!hasStart && originalStart) {
      updatedLogigramme.nodes.push(originalStart);
    }
    if (!hasEnd && originalEnd) {
      updatedLogigramme.nodes.push(originalEnd);
    }
  }

  // Ensure all question nodes have width and height
  updatedLogigramme.nodes = updatedLogigramme.nodes.map((node: any) => {
    if (node.type === 'question') {
      // Calculate dimensions if missing
      if (!node.width || !node.height) {
        const labelLength = node.label?.length || 0;
        const optionsCount = node.options?.length || 0;
        
        let width = Math.max(200, Math.min(350, labelLength * 8 + 32));
        if (optionsCount > 0) {
          const maxOptionLength = Math.max(...(node.options?.map((opt: string) => opt.length) || [0]));
          width = Math.max(width, Math.min(350, maxOptionLength * 7 + 32));
        }
        
        const baseHeight = 100;
        const labelLines = Math.ceil(labelLength / 40);
        const optionsHeight = optionsCount > 0 ? (Math.min(optionsCount, 3) * 20) + 20 : 0;
        const height = Math.max(baseHeight, baseHeight + (labelLines - 1) * 20 + optionsHeight);
        
        return { ...node, width, height };
      }
    }
    return node;
  });

  return updatedLogigramme as Logigramme;
}

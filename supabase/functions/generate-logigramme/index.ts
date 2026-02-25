import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { 
  STEP1_SECTIONS_PROMPT, 
  STEP2_QUESTIONS_PROMPT, 
  STEP3_SIZING_PROMPT, 
  STEP4_LOGIGRAMME_PROMPT 
} from "./prompts.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface RequestBody {
  context: string;
  apiKey: string;
}

/**
 * Call OpenAI API with a prompt
 */
async function callOpenAI(apiKey: string, systemPrompt: string, userPrompt: string): Promise<any> {
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
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0]);
  }
  return JSON.parse(content);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { context, apiKey }: RequestBody = await req.json();

    if (!context || !apiKey) {
      return new Response(
        JSON.stringify({ error: "Context and API key are required" }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // Step 1: Generate Sections
    let sections;
    try {
      const sectionsResult = await callOpenAI(apiKey, STEP1_SECTIONS_PROMPT.system, STEP1_SECTIONS_PROMPT.user(context));
      sections = sectionsResult.sections || [];
    } catch (error) {
      return new Response(
        JSON.stringify({ error: "Failed to generate sections", details: error.message }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // Step 2: Generate Questions for each Section
    let questions;
    try {
      const questionsResult = await callOpenAI(apiKey, STEP2_QUESTIONS_PROMPT.system, STEP2_QUESTIONS_PROMPT.user(sections, context));
      questions = questionsResult.questions || [];
    } catch (error) {
      return new Response(
        JSON.stringify({ error: "Failed to generate questions", details: error.message }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // Step 3: Calculate Question Card Sizing
    let questionSizes;
    try {
      // Use AI for sizing, but fallback to calculation if needed
      const sizesResult = await callOpenAI(apiKey, STEP3_SIZING_PROMPT.system, STEP3_SIZING_PROMPT.user(questions));
      questionSizes = sizesResult.questionSizes || calculateQuestionSizes(questions);
    } catch (error) {
      // Fallback to calculation if AI fails
      questionSizes = calculateQuestionSizes(questions);
    }

    // Step 4: Generate Complete Logigramme
    let logigramme;
    try {
      logigramme = await callOpenAI(apiKey, STEP4_LOGIGRAMME_PROMPT.system, STEP4_LOGIGRAMME_PROMPT.user(sections, questions, questionSizes, context));
      
      // Merge sizes into nodes
      if (logigramme.nodes) {
        logigramme.nodes = logigramme.nodes.map((node: any) => {
          if (node.type === 'question') {
            const size = questionSizes.find((s: any) => s.id === node.id);
            if (size) {
              node.width = size.width;
              node.height = size.height;
            }
          }
          return node;
        });
      }
      
      // Validate and enhance branching
      logigramme = enhanceBranching(logigramme);
    } catch (error) {
      return new Response(
        JSON.stringify({ error: "Failed to generate logigramme", details: error.message }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // Validate and auto-generate sections if missing
    if (!logigramme.sections || logigramme.sections.length === 0) {
      logigramme.sections = generateSectionsFromNodes(logigramme.nodes, logigramme.edges);
    } else {
      // Validate that all questions have sectionId
      const questionNodes = logigramme.nodes.filter(n => n.type === 'question');
      const sectionIds = new Set(logigramme.sections.map((s: any) => s.id));
      
      questionNodes.forEach((node: any) => {
        if (!node.sectionId || !sectionIds.has(node.sectionId)) {
          // Assign to first section or create one
          if (logigramme.sections.length > 0) {
            node.sectionId = logigramme.sections[0].id;
          } else {
            logigramme.sections = generateSectionsFromNodes(logigramme.nodes, logigramme.edges);
            return;
          }
        }
      });

      // Recalculate section positions and dimensions
      logigramme.sections = recalculateSectionBounds(logigramme.sections, logigramme.nodes);
    }

    return new Response(
      JSON.stringify({ logigramme }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});

// Helper function to generate sections from nodes if missing
function generateSectionsFromNodes(nodes: any[], edges: any[]): any[] {
  const questionNodes = nodes.filter(n => n.type === 'question');
  if (questionNodes.length === 0) return [];

  // Group questions into logical sections (2-4 sections)
  const numSections = Math.min(4, Math.max(2, Math.ceil(questionNodes.length / 3)));
  const questionsPerSection = Math.ceil(questionNodes.length / numSections);
  
  const sections: any[] = [];
  const sectionPadding = 20;
  const nodeWidth = 250;
  const nodeHeight = 120;

  for (let i = 0; i < numSections; i++) {
    const startIdx = i * questionsPerSection;
    const endIdx = Math.min(startIdx + questionsPerSection, questionNodes.length);
    const sectionQuestions = questionNodes.slice(startIdx, endIdx);
    
    if (sectionQuestions.length === 0) continue;

    // Calculate section bounds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    sectionQuestions.forEach((q: any) => {
      minX = Math.min(minX, q.x);
      minY = Math.min(minY, q.y);
      maxX = Math.max(maxX, q.x + nodeWidth);
      maxY = Math.max(maxY, q.y + nodeHeight);
    });

    const sectionId = `section${i + 1}`;
    
    // Assign sectionId to questions
    sectionQuestions.forEach((q: any) => {
      q.sectionId = sectionId;
    });

    sections.push({
      id: sectionId,
      title: `Section ${i + 1}`,
      description: `This section covers questions ${startIdx + 1} to ${endIdx} of the survey, focusing on related aspects of the topic.`,
      questionIds: sectionQuestions.map((q: any) => q.id),
      x: minX - sectionPadding,
      y: minY - sectionPadding,
      width: (maxX - minX) + (sectionPadding * 2),
      height: (maxY - minY) + (sectionPadding * 2),
    });
  }

  return sections;
}

// Helper function to recalculate section bounds based on actual node positions
function recalculateSectionBounds(sections: any[], nodes: any[]): any[] {
  const sectionPadding = 20;
  const nodeWidth = 250;
  const nodeHeight = 120;

  return sections.map((section: any) => {
    const sectionQuestions = nodes.filter((n: any) => 
      n.type === 'question' && n.sectionId === section.id
    );

    if (sectionQuestions.length === 0) return section;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    sectionQuestions.forEach((q: any) => {
      minX = Math.min(minX, q.x);
      minY = Math.min(minY, q.y);
      maxX = Math.max(maxX, q.x + nodeWidth);
      maxY = Math.max(maxY, q.y + nodeHeight);
    });

    return {
      ...section,
      x: minX - sectionPadding,
      y: minY - sectionPadding,
      width: (maxX - minX) + (sectionPadding * 2),
      height: (maxY - minY) + (sectionPadding * 2),
      questionIds: sectionQuestions.map((q: any) => q.id),
    };
  });
}

/**
 * Calculate question card sizes based on content
 */
function calculateQuestionSizes(questions: any[]): any[] {
  const NODE_MIN_WIDTH = 200;
  const NODE_MAX_WIDTH = 350;
  const NODE_MIN_HEIGHT = 100;
  const NODE_PADDING = 32;

  return questions.map((q: any) => {
    const labelLength = q.label?.length || 0;
    const optionsCount = q.options?.length || 0;
    
    // Calculate width
    let width = Math.max(NODE_MIN_WIDTH, Math.min(NODE_MAX_WIDTH, labelLength * 8 + NODE_PADDING));
    
    if (optionsCount > 0) {
      const maxOptionLength = Math.max(...(q.options?.map((opt: string) => opt.length) || [0]));
      width = Math.max(width, Math.min(NODE_MAX_WIDTH, maxOptionLength * 7 + NODE_PADDING));
    }
    
    // Calculate height
    const baseHeight = NODE_MIN_HEIGHT;
    const labelLines = Math.ceil(labelLength / 40);
    const optionsHeight = optionsCount > 0 ? (Math.min(optionsCount, 3) * 20) + 20 : 0;
    const height = Math.max(baseHeight, baseHeight + (labelLines - 1) * 20 + optionsHeight);
    
    return {
      id: q.id,
      width: Math.round(width),
      height: Math.round(height)
    };
  });
}

/**
 * Enhance branching logic to ensure proper conditional flows
 */
function enhanceBranching(logigramme: any): any {
  const questionNodes = logigramme.nodes.filter((n: any) => n.type === 'question');
  const edges = [...(logigramme.edges || [])];
  const endNode = logigramme.nodes.find((n: any) => n.type === 'end');
  
  if (!endNode) return logigramme;
  
  // Build edge map for quick lookup
  const edgeMap = new Map<string, any[]>();
  edges.forEach((edge: any) => {
    if (!edgeMap.has(edge.from)) {
      edgeMap.set(edge.from, []);
    }
    edgeMap.get(edge.from)!.push(edge);
  });

  // Ensure each question with multiple options creates branching paths
  questionNodes.forEach((node: any) => {
    if (node.options && node.options.length > 1) {
      const outgoingEdges = edgeMap.get(node.id) || [];
      const edgeLabels = new Set(outgoingEdges.map((e: any) => e.label).filter(Boolean));
      const connectedTargets = new Set(outgoingEdges.map((e: any) => e.to));
      
      // For each option, ensure there's a unique path
      node.options.forEach((option: string, index: number) => {
        if (!edgeLabels.has(option)) {
          // Find available targets (prefer unconnected questions in different sections)
          const availableTargets = questionNodes.filter((q: any) => 
            q.id !== node.id && 
            !connectedTargets.has(q.id) &&
            q.sectionId !== node.sectionId // Prefer different sections for branching
          );
          
          let targetId: string | undefined;
          
          // Strategy: Create different paths for different options
          if (availableTargets.length > 0) {
            // Use modulo to distribute options across available targets
            targetId = availableTargets[index % availableTargets.length]?.id;
          }
          
          // If no suitable question, route to end (but only for some options to maintain branching)
          if (!targetId && index < node.options.length - 1) {
            // For last option, can go to end, but prefer branching
            const unconnectedQuestions = questionNodes.filter((q: any) => 
              q.id !== node.id && !connectedTargets.has(q.id)
            );
            targetId = unconnectedQuestions[0]?.id || endNode.id;
          } else if (!targetId) {
            targetId = endNode.id;
          }
          
          if (targetId) {
            const newEdge = {
              id: `e_${node.id}_${option}_${Date.now()}`,
              from: node.id,
              to: targetId,
              label: option
            };
            edges.push(newEdge);
            edgeMap.set(node.id, [...(edgeMap.get(node.id) || []), newEdge]);
            connectedTargets.add(targetId);
          }
        }
      });
    } else if (node.options && node.options.length === 1) {
      // Single option questions - ensure they have an edge
      const outgoingEdges = edgeMap.get(node.id) || [];
      if (outgoingEdges.length === 0) {
        // Find next question or go to end
        const availableTargets = questionNodes.filter((q: any) => q.id !== node.id);
        const targetId = availableTargets[0]?.id || endNode.id;
        edges.push({
          id: `e_${node.id}_default_${Date.now()}`,
          from: node.id,
          to: targetId,
          label: node.options[0] || ""
        });
      }
    }
  });

  // Ensure all question nodes have at least one path to end (directly or through other questions)
  questionNodes.forEach((node: any) => {
    const outgoingEdges = edgeMap.get(node.id) || [];
    if (outgoingEdges.length === 0) {
      // Add path to end if no edges exist
      edges.push({
        id: `e_${node.id}_to_end_${Date.now()}`,
        from: node.id,
        to: endNode.id,
        label: ""
      });
    }
  });

  return {
    ...logigramme,
    edges: edges
  };
}

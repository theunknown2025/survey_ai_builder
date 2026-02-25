import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface RequestBody {
  question: {
    id: string;
    label: string;
    questionType: string;
    options?: string[];
  };
  context: string;
  existingNodes: any[];
  apiKey: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { question, context, existingNodes, apiKey }: RequestBody = await req.json();

    if (!question || !context || !apiKey) {
      return new Response(
        JSON.stringify({ error: "Question, context, and API key are required" }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const openAIResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
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
            role: "user",
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

    if (!openAIResponse.ok) {
      const errorData = await openAIResponse.json();
      return new Response(
        JSON.stringify({ error: "OpenAI API error", details: errorData }),
        {
          status: openAIResponse.status,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const data = await openAIResponse.json();
    const responseText = data.choices[0].message.content;

    let result;
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        result = JSON.parse(responseText);
      }
    } catch (parseError) {
      return new Response(
        JSON.stringify({ error: "Failed to parse response", raw: responseText }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    return new Response(
      JSON.stringify({ nodes: result.nodes || [], edges: result.edges || [] }),
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

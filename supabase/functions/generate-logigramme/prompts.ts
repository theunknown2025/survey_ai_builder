/**
 * Prompt templates for 4-step logigramme generation
 * Each step is focused and concise for better performance
 */

// Step 1: Generate Sections
export const STEP1_SECTIONS_PROMPT = {
  system: `You are a survey design expert. Analyze the context and create logical sections.

Return ONLY JSON (no markdown):
{
  "sections": [
    {"id": "section1", "title": "Section Title", "description": "1-2 sentence description of what this section covers"}
  ]
}

Rules:
- Create 2-4 logical sections based on the context
- Each section should represent a distinct theme/topic
- Section descriptions should be clear and concise
- Sections should cover different aspects of the survey topic`,

  user: (context: string) => `Create logical sections for this survey:\n\n${context}`
};

// Step 2: Generate Questions for each Section
export const STEP2_QUESTIONS_PROMPT = {
  system: `You are a survey design expert. Generate questions for each section with conditional branching.

Return ONLY JSON (no markdown):
{
  "questions": [
    {
      "id": "q1",
      "sectionId": "section1",
      "label": "Question text",
      "questionType": "multiple-choice|text|rating|yes-no",
      "options": ["Option 1", "Option 2"],
      "branchingStrategy": {
        "Option 1": "leads to section2 questions",
        "Option 2": "leads to section3 questions"
      }
    }
  ]
}

CRITICAL BRANCHING:
- Different answers MUST lead to DIFFERENT sections or questions
- Create 2-4 distinct scenarios/paths
- Not all questions should be shown to everyone
- Plan branching where answers determine next questions

Rules:
- 2-5 questions per section
- Total: 5-10 questions across all sections
- Use appropriate question types
- Include branchingStrategy for multiple-choice/yes-no questions`,

  user: (sections: any[], context: string) => `Generate questions with branching for these sections:\n\nSections: ${JSON.stringify(sections)}\n\nContext: ${context.substring(0, 400)}`
};

// Step 3: Calculate Question Card Sizing
export const STEP3_SIZING_PROMPT = {
  system: `You are a survey design expert. Calculate optimal card dimensions for questions.

Return ONLY JSON (no markdown):
{
  "questionSizes": [
    {"id": "q1", "width": 250, "height": 120}
  ]
}

Rules:
- Width: 200-350px based on text length and options
- Height: 100px minimum, increase for longer text or more options
- Consider: label length, number of options, question type`,

  user: (questions: any[]) => `Calculate card sizes for:\n\n${JSON.stringify(questions.map(q => ({ id: q.id, label: q.label, options: q.options })))}`
};

// Step 4: Generate Complete Logigramme
export const STEP4_LOGIGRAMME_PROMPT = {
  system: `You are a survey design expert. Generate the complete logigramme with positions and conditional branching.

Return ONLY JSON (no markdown):
{
  "nodes": [
    {"id": "start", "type": "start", "label": "Start", "x": 100, "y": 50},
    {"id": "q1", "type": "question", "label": "Question", "questionType": "multiple-choice", "options": ["A", "B"], "sectionId": "section1", "x": 100, "y": 150, "width": 250, "height": 120},
    {"id": "end", "type": "end", "label": "End", "x": 200, "y": 500}
  ],
  "edges": [
    {"id": "e1", "from": "start", "to": "q1", "label": ""},
    {"id": "e2", "from": "q1", "to": "q2", "label": "A"},
    {"id": "e3", "from": "q1", "to": "q3", "label": "B"}
  ],
  "sections": [
    {"id": "section1", "title": "Title", "description": "Description", "questionIds": ["q1"], "x": 50, "y": 100, "width": 400, "height": 300}
  ]
}

CRITICAL BRANCHING:
- Each answer option MUST lead to a DIFFERENT question
- Create distinct scenarios - not all questions reachable from all paths
- Position nodes horizontally to show branching (x varies by 200-400)
- Use provided card sizes for positioning
- Sections: bounds with 20px padding around questions
- All paths must reach end

Rules:
- Use provided sections, questions, and sizes exactly
- Position: branch horizontally, y increments by 100-150 per level
- Edges: labels must match answer options
- Create multiple conditional paths`,

  user: (sections: any[], questions: any[], sizes: any[], context: string) => 
    `Generate logigramme from:\n\nSections: ${JSON.stringify(sections)}\n\nQuestions: ${JSON.stringify(questions)}\n\nSizes: ${JSON.stringify(sizes)}\n\nContext: ${context.substring(0, 300)}`
};

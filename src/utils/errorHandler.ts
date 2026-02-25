/**
 * Error Handler for ODIN file errors
 * Uses OpenAI to fix errors in generated ODIN files
 */

const ODIN_FIX_SYSTEM_PROMPT = `You are an expert in Nfield ODIN script syntax. Your task is to fix errors in ODIN files.

ODIN (Nfield) script syntax rules:
- Questions start with *QUESTION followed by question number (e.g., *QUESTION 1000)
- Question types: *CODES (multiple choice), *OPEN (text input)
- Labels: *LABEL "label_text"
- Variables: *VAR "variable_name"
- Properties: *PROPERTIES "property=value"
- UI Options: *UIOPTIONS "metaType=..."
- Answer options: Number: Text *PROPERTIES "DIMELE=_number"
- Flow control: *IF [Q1000,1] *GOTO 2000
- End of survey: *GOTO END_SURVEY or *GOSUB "sbComplete"
- Template: *TEMPLATE "template_name"
- Language: *LANGUAGE "en-US"
- Comments: ** comment text

Common errors to fix:
- Invalid question numbering
- Missing or incorrect *GOTO statements
- Invalid property syntax
- Missing required properties
- Incorrect answer option formatting
- Invalid flow control logic
- Unnecessary or duplicate lines
- Missing end statements

Return ONLY the corrected ODIN file content, nothing else. Do not include explanations or markdown formatting.`;

const ODIN_FIX_USER_PROMPT = (odinContent: string, errors: string[]) => {
  return `Fix the following errors in this ODIN file:

Errors found:
${errors.map((e, i) => `${i + 1}. ${e}`).join('\n')}

ODIN File Content:
\`\`\`
${odinContent}
\`\`\`

Please fix all errors and return the corrected ODIN file. Remove any unnecessary lines and ensure proper syntax.`;
};

/**
 * Fix ODIN file errors using OpenAI
 */
export async function fixOdinErrors(
  odinContent: string,
  errors: string[],
  apiKey: string
): Promise<string> {
  if (!apiKey) {
    throw new Error('OpenAI API key is required');
  }

  if (errors.length === 0) {
    return odinContent; // No errors to fix
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
        { role: 'system', content: ODIN_FIX_SYSTEM_PROMPT },
        { role: 'user', content: ODIN_FIX_USER_PROMPT(odinContent, errors) },
      ],
      temperature: 0.3, // Lower temperature for more consistent fixes
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`OpenAI API error: ${JSON.stringify(errorData)}`);
  }

  const data = await response.json();
  let fixedContent = data.choices[0].message.content;

  // Remove markdown code blocks if present
  fixedContent = fixedContent.replace(/```[\w]*\n?/g, '').replace(/```$/g, '').trim();

  return fixedContent;
}

/**
 * Parse Nfield API error response to extract errors and warnings
 */
export function parseNfieldErrors(errorResponse: string): string[] {
  const errors: string[] = [];
  
  try {
    const parsed = JSON.parse(errorResponse);
    
    // Check for errors array in response
    if (parsed.errors && Array.isArray(parsed.errors)) {
      parsed.errors.forEach((err: any) => {
        if (err.Message) {
          errors.push(err.Message);
        }
      });
    }
    
    // Check for messages array (errors and warnings)
    if (parsed.messages && Array.isArray(parsed.messages)) {
      parsed.messages.forEach((msg: any) => {
        if (msg.MessageType === 2) { // Error type
          errors.push(`Error at line ${msg.LineNumber || 'unknown'}: ${msg.Message || msg.Text || ''}`);
        }
      });
    }
    
    // If no structured errors, use the message field
    if (errors.length === 0 && parsed.Message) {
      errors.push(parsed.Message);
    }
    
    // If still no errors, use the whole response as error text
    if (errors.length === 0) {
      errors.push(errorResponse);
    }
  } catch {
    // If not JSON, use the raw error text
    errors.push(errorResponse);
  }
  
  return errors;
}

/**
 * Validate ODIN file syntax and return errors
 * This is a basic validator - can be enhanced with more specific checks
 */
export function validateOdinFile(odinContent: string): string[] {
  const errors: string[] = [];
  const lines = odinContent.split('\n');

  // Check for basic syntax issues
  let questionCount = 0;
  let inQuestion = false;
  let currentQuestion = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lineNum = i + 1;

    // Check for QUESTION declarations
    if (line.startsWith('*QUESTION')) {
      inQuestion = true;
      questionCount++;
      
      // Extract question number
      const questionMatch = line.match(/\*QUESTION\s+(\d+)/);
      if (questionMatch) {
        currentQuestion = questionMatch[1];
        
        // Check if question number is valid (should be 4 digits typically)
        const questionNum = parseInt(currentQuestion);
        if (questionNum < 1000 || questionNum > 9999) {
          errors.push(`Line ${lineNum}: Question number ${currentQuestion} is not in valid range (1000-9999)`);
        }
      } else {
        errors.push(`Line ${lineNum}: Invalid QUESTION declaration format`);
      }

      // Check for required properties
      if (!line.includes('*LABEL')) {
        errors.push(`Line ${lineNum}: QUESTION ${currentQuestion} missing *LABEL`);
      }
      if (!line.includes('*VAR')) {
        errors.push(`Line ${lineNum}: QUESTION ${currentQuestion} missing *VAR`);
      }
    }

    // Check for invalid GOTO statements (missing argument)
    if (line.includes('*GOTO') && !line.match(/\*GOTO\s+\S+/)) {
      errors.push(`Line ${lineNum}: '*GOTO', argument missing`);
    }

    // Check for invalid IF statements
    if (line.includes('*IF')) {
      const ifMatch = line.match(/\*IF\s+\[Q(\d+),(\d+)\]/);
      if (!ifMatch) {
        errors.push(`Line ${lineNum}: Invalid IF statement format`);
      }
    }

    // Check for missing template
    if (i === 0 && !odinContent.includes('*TEMPLATE')) {
      errors.push('Missing *TEMPLATE declaration');
    }
  }

  // Check for missing end statement
  if (!odinContent.includes('*GOSUB "sbComplete"') && !odinContent.includes('*GOTO END_SURVEY')) {
    errors.push('Missing survey end statement (*GOSUB "sbComplete" or *GOTO END_SURVEY)');
  }

  // Check for at least one question
  if (questionCount === 0) {
    errors.push('No questions found in ODIN file');
  }

  return errors;
}

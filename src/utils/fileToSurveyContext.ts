// Utility to convert uploaded files (Word, PDF, CSV, text) into survey context text
// and estimate token usage for OpenAI models.

import * as mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker - using CDN for reliable cross-browser support
// The version matches the installed pdfjs-dist package
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

const TEXT_FILE_EXTENSIONS = ['.txt', '.md', '.csv', '.json'];
const DOC_FILE_EXTENSIONS = ['.doc', '.docx'];
const PDF_FILE_EXTENSIONS = ['.pdf'];

export const SUPPORTED_FILE_EXTENSIONS = [
  ...TEXT_FILE_EXTENSIONS,
  ...DOC_FILE_EXTENSIONS,
  ...PDF_FILE_EXTENSIONS,
];

// Conservative maximum tokens for context we send to OpenAI (gpt-4o supports up to ~128k)
export const OPENAI_MAX_INPUT_TOKENS = 120_000;

/**
 * Very rough token estimator based on character count.
 * Rough heuristic: ~4 characters per token on average.
 */
export function estimateTokensFromText(text: string): number {
  const charCount = text.length;
  if (!charCount) return 0;
  return Math.ceil(charCount / 4);
}

function getFileExtension(name: string): string {
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.slice(idx).toLowerCase() : '';
}

/**
 * Extract text from PDF file using pdfjs-dist
 */
async function extractTextFromPDF(file: File): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    let fullText = '';
    
    // Extract text from each page
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      
      // Combine text items from the page
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ')
        .trim();
      
      if (pageText) {
        fullText += pageText + '\n\n';
      }
    }
    
    return fullText.trim();
  } catch (error) {
    throw new Error(
      `Failed to extract text from PDF: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Extract text from DOCX file using mammoth
 */
async function extractTextFromDOCX(file: File): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    
    if (result.messages.length > 0) {
      // Log warnings but don't fail if we got some text
      console.warn('Mammoth extraction warnings:', result.messages);
    }
    
    return result.value.trim();
  } catch (error) {
    throw new Error(
      `Failed to extract text from DOCX: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Extract text from legacy .doc files (binary format)
 * Note: .doc files are much harder to parse. We'll try a basic approach,
 * but for best results, users should convert to .docx
 */
async function extractTextFromDOC(file: File): Promise<string> {
  // For .doc files, we'll try to extract readable text from the binary
  // This is a fallback - proper parsing would require a backend service
  try {
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let text = '';
    
    // Try to find readable text sequences in the binary data
    let currentWord = '';
    for (let i = 0; i < bytes.length; i++) {
      const code = bytes[i];
      
      // Look for printable ASCII characters
      if (code >= 32 && code <= 126) {
        currentWord += String.fromCharCode(code);
      } else {
        if (currentWord.length > 2) {
          // Only add words that are at least 3 characters (likely real text)
          text += currentWord + ' ';
        }
        currentWord = '';
        
        // Add line breaks for common control characters
        if (code === 10 || code === 13) {
          text += '\n';
        }
      }
    }
    
    // Add any remaining word
    if (currentWord.length > 2) {
      text += currentWord;
    }
    
    const cleaned = text
      .replace(/\s+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    
    if (!cleaned) {
      throw new Error('Could not extract readable text from .doc file. Please convert to .docx format for better results.');
    }
    
    return cleaned;
  } catch (error) {
    throw new Error(
      `Failed to extract text from DOC: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Extract text content from a File.
 * - For text-like files (txt, csv, json, md): read as UTF-8 text
 * - For docx: use mammoth library for proper parsing
 * - For doc: fallback extraction (limited support)
 * - For pdf: use pdfjs-dist for proper parsing
 */
async function extractTextFromFile(file: File): Promise<string> {
  const ext = getFileExtension(file.name);

  // Simple text types - read directly as text
  if (TEXT_FILE_EXTENSIONS.includes(ext)) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
      reader.readAsText(file, 'UTF-8');
    });
  }

  // DOCX files - use mammoth for proper parsing
  if (ext === '.docx') {
    return extractTextFromDOCX(file);
  }

  // Legacy DOC files - fallback extraction
  if (ext === '.doc') {
    return extractTextFromDOC(file);
  }

  // PDF files - use pdfjs-dist for proper parsing
  if (ext === '.pdf') {
    return extractTextFromPDF(file);
  }

  throw new Error(
    `Unsupported file type: ${ext}. Please upload Word (.doc/.docx), PDF (.pdf), or text files (.txt, .md, .csv, .json).`
  );
}

export interface FileToSurveyContextResult {
  rawText: string;
  context: string;
  tokens: number;
}

/**
 * Convert an uploaded file into survey context text and compute token estimate.
 * Currently the "context" is the cleaned raw text. If needed later,
 * we can add another OpenAI call here to summarise/condense it.
 */
export async function fileToSurveyContext(file: File): Promise<FileToSurveyContextResult> {
  const rawText = await extractTextFromFile(file);
  const trimmed = rawText.trim();

  if (!trimmed) {
    throw new Error('The uploaded file does not contain any readable text.');
  }

  const tokens = estimateTokensFromText(trimmed);

  // For safety, hard-cap extremely long inputs even if under OPENAI_MAX_INPUT_TOKENS
  const HARD_CHAR_LIMIT = 400_000; // ~100k tokens
  let context = trimmed;
  if (context.length > HARD_CHAR_LIMIT) {
    context = context.slice(0, HARD_CHAR_LIMIT);
  }

  return {
    rawText: trimmed,
    context,
    tokens,
  };
}

export type QuestionType = 'multiple-choice' | 'text' | 'rating' | 'yes-no';

export interface Section {
  id: string;
  title: string;
  description: string;
  questionIds: string[];
  x: number;
  y: number;
  width: number;
  height: number;
  translations?: Record<string, { title: string; description: string }>; // Language code -> translations
}

export interface Node {
  id: string;
  type: 'start' | 'end' | 'question';
  label: string;
  questionType?: QuestionType;
  options?: string[];
  imageUrl?: string;
  imageAlt?: string;
  sectionId?: string; // Link question to a section
  x: number;
  y: number;
  translations?: Record<string, { label: string; options?: string[] }>; // Language code -> translations
}

export interface Edge {
  id: string;
  from: string;
  to: string;
  label: string;
}

export interface Logigramme {
  nodes: Node[];
  edges: Edge[];
  sections?: Section[];
  languages?: string[]; // Language codes (e.g., ['en', 'ar', 'fr'])
}

export interface Survey {
  id?: string;
  title: string;
  context: string;
  logigramme?: Logigramme;
  status: 'draft' | 'completed';
  created_at?: string;
  updated_at?: string;
}

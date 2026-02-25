import { supabase } from './supabaseClient';

/**
 * Upload an image file to Supabase Storage and return its public URL.
 *
 * Bucket: "survey-images" by default (override with VITE_SUPABASE_IMAGE_BUCKET).
 */
export async function uploadSurveyImage(file: File): Promise<string> {
  if (!file) {
    throw new Error('No file selected');
  }

  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
    );
  }

  const bucket = import.meta.env.VITE_SUPABASE_IMAGE_BUCKET || 'survey-images';

  const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const fileName = `${unique}-${safeName}`;
  const filePath = `questions/${fileName}`;

  const { error } = await supabase.storage.from(bucket).upload(filePath, file, {
    cacheControl: '3600',
    upsert: false,
  });

  if (error) {
    console.error('[uploadSurveyImage] Upload error:', error);
    throw new Error(error.message || 'Failed to upload image');
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);

  if (!data?.publicUrl) {
    throw new Error('Failed to get public URL for uploaded image');
  }

  return data.publicUrl;
}

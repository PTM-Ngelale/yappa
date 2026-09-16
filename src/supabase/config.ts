const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_KEY;

export const SUPABASE_CONFIGURED = Boolean(supabaseUrl && supabaseKey);

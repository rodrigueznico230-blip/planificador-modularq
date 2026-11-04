// Expone createClient antes de que se evalúe cloud.js (los imports se evalúan en orden).
import { createClient } from '@supabase/supabase-js';
window.supabase = { createClient };

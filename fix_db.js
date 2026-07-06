import { createClient } from '@supabase/supabase-js'

const url = 'https://jmbtxecibdxlmalkjtei.supabase.co';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!key) {
  console.error("No service role key found in env");
  process.exit(1);
}

const supabase = createClient(url, key);

async function run() {
  const categories = [
    { slug: 'adware', name: 'Adware', description: 'Unwanted advertising software', icon: 'shield', color: '#e67e22' },
    { slug: 'stealer', name: 'Stealers', description: 'Information stealer malware', icon: 'lock', color: '#c0392b' },
    { slug: 'malvertising', name: 'Malvertising', description: 'Malicious advertising', icon: 'shield', color: '#e74c3c' },
    { slug: 'fake_update', name: 'Fake Updates', description: 'Fake software update lures', icon: 'download', color: '#d35400' },
    { slug: 'fake_download', name: 'Fake Downloads', description: 'Malicious file downloads', icon: 'download', color: '#e74c3c' }
  ];

  for (const cat of categories) {
    const { data, error } = await supabase.from('ioc_categories').upsert(cat, { onConflict: 'slug' });
    if (error) {
      console.error("Error inserting", cat.slug, error);
    } else {
      console.log("Inserted/Updated", cat.slug);
    }
  }
}

run();

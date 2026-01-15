// test-drive.js
require('dotenv').config({ path: '.env.local' });
const { google } = require('googleapis');

async function test() {
  try {
    const jsonKey = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!jsonKey) throw new Error("No Key Found");
    
    const credentials = JSON.parse(jsonKey);
    
    // Fix newlines in private key
    if (credentials.private_key) {
      credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
    }
    
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });

    const drive = google.drive({ version: 'v3', auth });
    const res = await drive.files.list({ pageSize: 5 });
    
    console.log("✅ SUCCESS! Connected to Drive.");
    console.log("Files found:", res.data.files?.length || 0);
    if (res.data.files) {
      res.data.files.forEach(f => console.log(`  - ${f.name}`));
    }
  } catch (error) {
    console.error("❌ FAILURE:", error.message);
    if (error.response) console.error("Details:", error.response.data);
  }
}

test();

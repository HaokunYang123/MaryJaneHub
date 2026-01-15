import { google } from 'googleapis';
import { Readable } from 'stream';

// --- Configuration ---
// Accept either variable name to be safe
const ROOT_ID = process.env.GOOGLE_ROOT_FOLDER_ID || process.env.GOOGLE_SHARED_DRIVE_ID;

const getCredentials = () => {
  try {
    const jsonKey = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!jsonKey) {
      console.error("❌ Missing GOOGLE_SERVICE_ACCOUNT_JSON in .env.local");
      return {};
    }
    const credentials = JSON.parse(jsonKey);
    if (credentials.private_key) {
      credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
    }
    return credentials;
  } catch (error) {
    console.error("❌ Credentials Error:", error);
    return {};
  }
};

const auth = new google.auth.GoogleAuth({
  credentials: getCredentials(),
  scopes: ['https://www.googleapis.com/auth/drive'],
});

const drive = google.drive({ version: 'v3', auth });

// --- Helper: Find or Create Folder ---
async function findOrCreateFolder(name: string): Promise<string> {
  try {
    // 1. Prepare the search query
    let query = `mimeType='application/vnd.google-apps.folder' and name='${name}' and trashed=false`;
    
    // If we have a root folder configured, make sure we only look INSIDE it
    if (ROOT_ID) {
      query += ` and '${ROOT_ID}' in parents`;
    }

    // 2. Configure the list request
    // IMPORTANT: specific "driveId" and "corpora" fields often CAUSE errors with standard folders.
    // We only use 'supportsAllDrives' which is safe for both.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const listRequest: any = {
      q: query,
      fields: 'files(id)',
      supportsAllDrives: true, 
      includeItemsFromAllDrives: true,
    };

    const list = await drive.files.list(listRequest);

    if (list.data.files && list.data.files.length > 0) {
      // Found it!
      return list.data.files[0].id!;
    }
    
    // 3. Not found, so create it
    console.log(`📁 Creating folder '${name}' inside parent '${ROOT_ID || 'Root'}'...`);
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const createRequest: any = {
      requestBody: { 
        name, 
        mimeType: 'application/vnd.google-apps.folder',
        parents: ROOT_ID ? [ROOT_ID] : undefined
      },
      fields: 'id',
      supportsAllDrives: true,
    };

    const res = await drive.files.create(createRequest);
    return res.data.id!;
  } catch (error) {
    console.error(`❌ Folder Error (${name}):`, error);
    throw error;
  }
}

// --- Upload Function ---
export async function uploadFileToDrive(file: File, folderName: string = "Inbox"): Promise<string | null> {
  try {
    const folderId = await findOrCreateFolder(folderName);

    const buffer = Buffer.from(await file.arrayBuffer());
    const stream = new Readable();
    stream.push(buffer);
    stream.push(null);

    const res = await drive.files.create({
      requestBody: {
        name: file.name,
        parents: [folderId],
      },
      media: {
        mimeType: file.type,
        body: stream,
      },
      fields: 'id',
      supportsAllDrives: true,
    });

    console.log(`✅ Uploaded ${file.name} (ID: ${res.data.id})`);
    return res.data.id || null;
  } catch (error) {
    console.error("❌ Upload Error:", error);
    throw error;
  }
}

// --- Other Helpers (Updated for Compatibility) ---

export async function moveFileToFolder(fileId: string, folderName: string): Promise<string | null> {
  try {
    const folderId = await findOrCreateFolder(folderName);
    const file = await drive.files.get({ 
      fileId, 
      fields: 'parents',
      supportsAllDrives: true 
    });
    
    const previousParents = file.data.parents?.join(',') || '';
    await drive.files.update({
      fileId,
      addParents: folderId,
      removeParents: previousParents,
      fields: 'id, parents',
      supportsAllDrives: true,
    });
    return folderId;
  } catch (error) {
    console.error('Drive Move Error:', error);
    return null;
  }
}

export async function downloadFileFromDrive(fileId: string): Promise<string | null> {
  try {
    const res = await drive.files.get(
      { fileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'text' }
    );
    return res.data as string;
  } catch (error) {
    console.error('Drive Download Error:', error);
    return null;
  }
}

export async function getInboxFolderId(): Promise<string | null> {
  try { return await findOrCreateFolder('Mary - Inbox'); } catch { return null; }
}

export async function getFolderByStatus(status: 'pending' | 'processed' | 'rejected'): Promise<string | null> {
  const map = { pending: 'Mary - Pending Review', processed: 'Mary - Processed', rejected: 'Mary - Rejected' };
  try { return await findOrCreateFolder(map[status]); } catch { return null; }
}

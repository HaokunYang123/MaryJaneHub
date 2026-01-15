import { google } from 'googleapis';
import { Readable } from 'stream';

// --- Configuration ---
const ROOT_ID = process.env.GOOGLE_ROOT_FOLDER_ID || process.env.GOOGLE_SHARED_DRIVE_ID;

const getCredentials = () => {
  try {
    const jsonKey = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!jsonKey) {
      console.error("❌ Missing GOOGLE_SERVICE_ACCOUNT_JSON");
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

// --- Helper: Find or Create Folder (Recursive for Paths) ---
// Supports paths like "Invoices/Property Invoices"
async function findOrCreatePath(path: string): Promise<string> {
  const folders = path.split('/').filter(p => p.trim() !== '');
  let parentId = ROOT_ID;

  for (const folderName of folders) {
    parentId = await findOrCreateSingleFolder(folderName, parentId);
  }

  return parentId!;
}

// Find or create a single folder within a parent
async function findOrCreateSingleFolder(name: string, parentId?: string): Promise<string> {
  try {
    // 1. Search for existing folder
    let query = `mimeType='application/vnd.google-apps.folder' and name='${name}' and trashed=false`;
    if (parentId) {
      query += ` and '${parentId}' in parents`;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const listRequest: any = {
      q: query,
      fields: 'files(id)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    };

    const list = await drive.files.list(listRequest);

    if (list.data.files && list.data.files.length > 0) {
      return list.data.files[0].id!;
    }

    // 2. Create if not found
    console.log(`📁 Creating folder '${name}' inside '${parentId || 'Root'}'...`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const createRequest: any = {
      requestBody: {
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: parentId ? [parentId] : undefined
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

// Legacy helper - uses path system now
async function findOrCreateFolder(name: string): Promise<string> {
  return findOrCreatePath(name);
}

// --- Upload Function ---
export async function uploadFileToDrive(file: File, folderPath: string = "Inbox"): Promise<string | null> {
  try {
    // Now supports paths like "Inbox" or "Invoices/Property Invoices"
    const folderId = await findOrCreatePath(folderPath);

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

// --- Move File to Folder (Supports Nested Paths) ---
export async function moveFileToFolder(fileId: string, folderPath: string): Promise<string | null> {
  try {
    // 1. Get destination folder ID (handles paths like "Invoices/Property Invoices")
    const folderId = await findOrCreatePath(folderPath);

    // 2. Get current parents to remove them
    const file = await drive.files.get({
      fileId,
      fields: 'parents',
      supportsAllDrives: true
    });

    const previousParents = file.data.parents?.join(',') || '';

    // 3. Move
    await drive.files.update({
      fileId,
      addParents: folderId,
      removeParents: previousParents,
      fields: 'id, parents',
      supportsAllDrives: true,
    });

    console.log(`✅ Moved file ${fileId} to ${folderPath}`);
    return folderId;
  } catch (error) {
    console.error('Drive Move Error:', error);
    return null;
  }
}

// --- Other Helpers ---

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

// Updated Helper names - clean names, no "Mary -" prefixes
export async function getInboxFolderId(): Promise<string | null> {
  try { return await findOrCreatePath('Inbox'); } catch { return null; }
}

export async function getFolderByStatus(status: 'pending' | 'processed' | 'rejected'): Promise<string | null> {
  // Clean folder names without "Mary -" prefix
  const map = {
    pending: 'Pending Review',
    processed: 'Processed',
    rejected: 'Rejected'
  };
  try { return await findOrCreatePath(map[status]); } catch { return null; }
}

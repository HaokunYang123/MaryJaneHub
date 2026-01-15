import { google } from 'googleapis';

// 1. SAFELY PARSE THE KEY (The Fix)
const getCredentials = () => {
  try {
    const jsonKey = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!jsonKey) {
      console.error("❌ Missing GOOGLE_SERVICE_ACCOUNT_JSON in .env.local");
      return {};
    }

    // Parse the JSON string
    const credentials = JSON.parse(jsonKey);
    
    // CRITICAL: Fix the private key newlines
    // This turns the string "\\n" into actual line breaks
    if (credentials.private_key) {
      credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
    }
    
    return credentials;
  } catch (error) {
    console.error("❌ Failed to parse Google Credentials. Check your .env.local formatting.", error);
    return {};
  }
};

// 2. Initialize Drive
const auth = new google.auth.GoogleAuth({
  credentials: getCredentials(),
  scopes: ['https://www.googleapis.com/auth/drive'],
});

const drive = google.drive({ version: 'v3', auth });

/**
 * Moves a file from the Upload Staging area to a specific folder.
 */
export async function moveFileToFolder(fileId: string, folderName: string) {
  try {
    const folderId = await findOrCreateFolder(folderName);
    
    if (!folderId) throw new Error("Could not find or create destination folder");

    // Move the file
    const file = await drive.files.get({ fileId, fields: 'parents' });
    const previousParents = file.data.parents?.join(',') || '';

    await drive.files.update({
      fileId,
      addParents: folderId,
      removeParents: previousParents,
      fields: 'id, parents',
    });
    
    console.log(`✅ Moved file ${fileId} to ${folderName}`);
    return folderId;
  } catch (error) {
    console.error('Drive Move Error:', error);
    return null; 
  }
}

/**
 * Upload a file to Google Drive
 */
export async function uploadFileToDrive(
  fileName: string, 
  mimeType: string, 
  content: Buffer | string,
  folderId?: string
) {
  try {
    const requestBody: { name: string; mimeType: string; parents?: string[] } = {
      name: fileName,
      mimeType,
    };
    
    if (folderId) {
      requestBody.parents = [folderId];
    }

    const { Readable } = await import('stream');
    const media = {
      mimeType,
      body: typeof content === 'string' ? Readable.from([content]) : Readable.from(content),
    };

    const res = await drive.files.create({
      requestBody,
      media,
      fields: 'id, name, webViewLink',
    });

    console.log(`✅ Uploaded file: ${res.data.name} (${res.data.id})`);
    return res.data;
  } catch (error) {
    console.error('Drive Upload Error:', error);
    return null;
  }
}

/**
 * Download file content from Google Drive
 */
export async function downloadFileFromDrive(fileId: string): Promise<string | null> {
  try {
    const res = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'text' }
    );
    return res.data as string;
  } catch (error) {
    console.error('Drive Download Error:', error);
    return null;
  }
}

/**
 * Get file metadata
 */
export async function getFileMetadata(fileId: string) {
  try {
    const res = await drive.files.get({
      fileId,
      fields: 'id, name, mimeType, parents, webViewLink, createdTime',
    });
    return res.data;
  } catch (error) {
    console.error('Drive Metadata Error:', error);
    return null;
  }
}

/**
 * List files in a folder
 */
export async function listFilesInFolder(folderId: string) {
  try {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'files(id, name, mimeType, createdTime, webViewLink)',
      orderBy: 'createdTime desc',
    });
    return res.data.files || [];
  } catch (error) {
    console.error('Drive List Error:', error);
    return [];
  }
}

// Internal Helper: Find or Create Folder
async function findOrCreateFolder(name: string): Promise<string | null> {
  try {
    // Search
    const list = await drive.files.list({
      q: `mimeType='application/vnd.google-apps.folder' and name='${name}' and trashed=false`,
      fields: 'files(id)',
    });

    if (list.data.files && list.data.files.length > 0) {
      return list.data.files[0].id!;
    }

    // Create
    const res = await drive.files.create({
      requestBody: {
        name,
        mimeType: 'application/vnd.google-apps.folder',
      },
      fields: 'id',
    });
    return res.data.id!;
  } catch (error) {
    console.error("Folder Error:", error);
    return null;
  }
}

/**
 * Get or create the Inbox folder for uploads
 */
export async function getInboxFolderId() {
  return findOrCreateFolder('Mary - Inbox');
}

/**
 * Get or create folder by status
 */
export async function getFolderByStatus(status: 'pending' | 'processed' | 'rejected') {
  const folderNames = {
    pending: 'Mary - Pending Review',
    processed: 'Mary - Processed',
    rejected: 'Mary - Rejected',
  };
  return findOrCreateFolder(folderNames[status]);
}

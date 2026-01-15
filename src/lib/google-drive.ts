import { google } from 'googleapis';
import { Readable } from 'stream';

// --- Configuration ---
// This can be a Shared Drive ID (starts with 0A...) OR a regular Folder ID
const ROOT_FOLDER_ID = process.env.GOOGLE_ROOT_FOLDER_ID;

const getCredentials = () => {
  try {
    const jsonKey = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!jsonKey) {
      console.error("❌ Missing GOOGLE_SERVICE_ACCOUNT_JSON in .env.local");
      return {};
    }
    const credentials = JSON.parse(jsonKey);
    // FIX: Handle newlines in private key
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
    // Universal Search Query:
    // 1. Matches name
    // 2. Is not in trash
    // 3. If a ROOT_ID is provided, strict check that the folder is INSIDE that root
    let query = `mimeType='application/vnd.google-apps.folder' and name='${name}' and trashed=false`;
    
    if (ROOT_FOLDER_ID) {
      query += ` and '${ROOT_FOLDER_ID}' in parents`;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const listRequest: any = {
      q: query,
      fields: 'files(id)',
      // These two flags make it work for BOTH Shared Drives and Shared Folders
      supportsAllDrives: true, 
      includeItemsFromAllDrives: true,
    };

    const list = await drive.files.list(listRequest);

    if (list.data.files && list.data.files.length > 0) {
      return list.data.files[0].id!;
    }
    
    // Create the folder if it doesn't exist
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const createRequest: any = {
      requestBody: { 
        name, 
        mimeType: 'application/vnd.google-apps.folder',
        // Create it INSIDE the root folder/drive if specified
        parents: ROOT_FOLDER_ID ? [ROOT_FOLDER_ID] : undefined
      },
      fields: 'id',
      supportsAllDrives: true,
    };

    const res = await drive.files.create(createRequest);
    return res.data.id!;
  } catch (error) {
    console.error("Folder Error:", error);
    throw error;
  }
}

// --- NEW: The Upload Function (accepts File object) ---
export async function uploadFileToDrive(file: File, folderName: string = "Inbox"): Promise<string | null> {
  try {
    const folderId = await findOrCreateFolder(folderName);

    // Convert standard File to a Stream that Google accepts
    const buffer = Buffer.from(await file.arrayBuffer());
    const stream = new Readable();
    stream.push(buffer);
    stream.push(null);

    const res = await drive.files.create({
      requestBody: {
        name: file.name,
        parents: [folderId], // Uploads to the specific sub-folder (e.g., "Mary - Inbox")
      },
      media: {
        mimeType: file.type,
        body: stream,
      },
      fields: 'id',
      supportsAllDrives: true, // Critical for Shared Drives
    });

    console.log(`✅ Uploaded ${file.name} to Drive ID: ${res.data.id}`);
    return res.data.id || null;
  } catch (error) {
    console.error("Upload Error:", error);
    throw error;
  }
}

// --- Upload from Buffer (alternative) ---
export async function uploadBufferToDrive(
  fileName: string, 
  mimeType: string, 
  content: Buffer,
  folderName: string = "Inbox"
): Promise<string | null> {
  try {
    const folderId = await findOrCreateFolder(folderName);

    const stream = new Readable();
    stream.push(content);
    stream.push(null);

    const res = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [folderId],
      },
      media: {
        mimeType,
        body: stream,
      },
      fields: 'id, name, webViewLink',
      supportsAllDrives: true,
    });

    console.log(`✅ Uploaded ${fileName} to Drive ID: ${res.data.id}`);
    return res.data.id || null;
  } catch (error) {
    console.error("Upload Error:", error);
    return null;
  }
}

// --- Move File to Folder ---
export async function moveFileToFolder(fileId: string, folderName: string): Promise<string | null> {
  try {
    const folderId = await findOrCreateFolder(folderName);
    
    // Check file current parents
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
    
    console.log(`✅ Moved file ${fileId} to ${folderName}`);
    return folderId;
  } catch (error) {
    console.error('Drive Move Error:', error);
    return null;
  }
}

// --- Download file content ---
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

// --- Get file metadata ---
export async function getFileMetadata(fileId: string) {
  try {
    const res = await drive.files.get({
      fileId,
      fields: 'id, name, mimeType, parents, webViewLink, createdTime',
      supportsAllDrives: true,
    });
    return res.data;
  } catch (error) {
    console.error('Drive Metadata Error:', error);
    return null;
  }
}

// --- List files in a folder ---
export async function listFilesInFolder(folderId: string) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const listRequest: any = {
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'files(id, name, mimeType, createdTime, webViewLink)',
      orderBy: 'createdTime desc',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    };

    const res = await drive.files.list(listRequest);
    return res.data.files || [];
  } catch (error) {
    console.error('Drive List Error:', error);
    return [];
  }
}

// --- Delete File ---
export async function deleteFileFromDrive(fileId: string): Promise<boolean> {
  try {
    await drive.files.delete({
      fileId,
      supportsAllDrives: true,
    });
    console.log(`✅ Deleted file ${fileId}`);
    return true;
  } catch (error) {
    console.error('Drive Delete Error:', error);
    return false;
  }
}

// --- Get or create the Inbox folder ---
export async function getInboxFolderId(): Promise<string | null> {
  try {
    return await findOrCreateFolder('Mary - Inbox');
  } catch {
    return null;
  }
}

// --- Get or create folder by status ---
export async function getFolderByStatus(status: 'pending' | 'processed' | 'rejected'): Promise<string | null> {
  const folderNames = {
    pending: 'Mary - Pending Review',
    processed: 'Mary - Processed',
    rejected: 'Mary - Rejected',
  };
  try {
    return await findOrCreateFolder(folderNames[status]);
  } catch {
    return null;
  }
}

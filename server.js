// import './file-polyfill.js'; Import the file polyfill if using NodeJS < v22.0.0
import fs from 'fs';
import {readFile} from 'fs/promises';
import express from 'express';
// import multer from 'multer';
import Busboy from 'busboy';
import path from 'path'
import { fileURLToPath } from 'url';
import { dirname } from 'path';

import {
  getAIResponse,
  generateUploadDownloadUrls,
  getClauseAndPosition,
  uploadToSignedUrl,
  insertSuggestion,
  getEditor,
} from './utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Init your server of choice. For simplicity, we use express here
const server = express();

server.get('/', async (req, res, next) => {
  res
  .status(200)
  .send("TEST GET");
})

server.post('/', async (req, res, next) => {
  let filePath = null;
  let uploadedFileName = null;

  let busboy = null;
  // missing headers?
  try {
    busboy = new Busboy({ headers: req.headers });
  } catch (e) {
    res.status(200).send('ERROR');
    return;
  }

  // save file
  busboy.on('file', async (fieldname, file, filename, encoding, mimetype) => {
    filePath = path.join(__dirname, filename);
    uploadedFileName = filename;
    file.pipe(fs.createWriteStream(filePath));
  });

  // after file save
  busboy.on("finish", async () => {
    // init signed urls
    const {
      upload: uploadUrl,
      download: downloadUrl
    } = await generateUploadDownloadUrls(uploadedFileName);

    // init editor & modify document
    let documentData = await readFile(filePath);
    // TODO - handle atob error
    let editor = null;
    try {
      editor = await getEditor(documentData);
    } catch (e) {
      res.status(200).send("ERROR");
      return;
    }
    
    // generate clause and find position
    const AIResponse = await getAIResponse(editor);
    const {clause, position } = await getClauseAndPosition({AIResponse, editor});

    // insert suggestion
    insertSuggestion({editor, position, clause});

    // Export the docx and create a buffer to return to the user
    let zipBuffer = null;
    try {
      zipBuffer = await editor.exportDocx();
    } catch (e) {
      res.status(200).send("ERROR");
      return;
    }
    documentData = Buffer.from(zipBuffer);

    // upload file
    uploadToSignedUrl(uploadUrl, documentData);

    // respond with download url
    res.status(200).send(downloadUrl);
  });

  req.pipe(busboy);
  // busboy.end(req.rawBody)
})

server.listen(8080, '0.0.0.0', () => console.debug(`Server running on port 8080`));
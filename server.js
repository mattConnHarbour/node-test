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
  getDataFromAIResponse,
  uploadToSignedUrl,
  insertSuggestion,
  getClausePosition,
  getEditor,
  generateRandomFilename
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

server.post('/text', async (req, res, next) => {
  let filePath = null;
  let uploadedFileName = null;

  let busboy = null;
  // missing headers?
  try {
    busboy = new Busboy({ headers: req.headers });
  } catch (e) {
    res.status(200).send({
      success: false
    });
    return;
  }

  // save file
  busboy.on('file', async (fieldname, file, filename, encoding, mimetype) => {
    uploadedFileName = filename || generateRandomFilename();
    filePath = path.join(__dirname, uploadedFileName);
    file.pipe(fs.createWriteStream(filePath));
  });

  // after file save
  busboy.on("finish", async () => {
    let documentData = await readFile(filePath);

    let editor = null;
    try {
      editor = await getEditor(documentData);
    } catch (e) {
      res.status(200).send({
        success: false
      });
      return;
    }

    const text = editor.state.doc.textContent;

    // respond with download url
    res.status(200).send({
      success: true,
      text
    });
  });

  req.pipe(busboy);
  // busboy.end(req.rawBody)
})

server.post('/insert', async (req, res, next) => {
  let filePath = null;
  let uploadedFileName = null;

  let busboy = null;
  // missing headers?
  try {
    busboy = new Busboy({ headers: req.headers });
  } catch (e) {
    res.status(200).send({
      success: false
    });
    return;
  }

  const fields = {};
  busboy.on('field', (fieldname, value) => {
    fields[fieldname] = value;
  });

  // save file
  busboy.on('file', async (fieldname, file, filename, encoding, mimetype) => {
    uploadedFileName = filename || generateRandomFilename();
    filePath = path.join(__dirname, uploadedFileName);
    file.pipe(fs.createWriteStream(filePath));

    console.log(">>> Uploaded file name:", uploadedFileName);
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
      res.status(200).send({
        success: false
      });
      return;
    }
    
    // generate clause and find position
    // const AIResponse = await getAIResponse(editor);
    // const {
    //   clauseBefore,
    //   clause,
    //   clauseAfter,
    //   position
    // } = await getDataFromAIResponse({AIResponse, editor});

    const clause = fields['clause'];
    const clauseBefore = fields['clause-before'];
    const clauseAfter = fields['clause-after'];

    const position = getClausePosition(editor, clauseBefore);

    // insert suggestion
    insertSuggestion({editor, position, clause});

    // Export the docx and create a buffer to return to the user
    let zipBuffer = null;
    try {
      zipBuffer = await editor.exportDocx();
    } catch (e) {
      res.status(200).send({
        success: false
      });
      return;
    }
    documentData = Buffer.from(zipBuffer);

    // upload file
    uploadToSignedUrl(uploadUrl, documentData);

    // respond with download url
    res.status(200).send({
      success: true,
      file: downloadUrl,
      // clauseBefore,
      // clause,
      // clauseAfter,
    });
  });

  req.pipe(busboy);
  // busboy.end(req.rawBody)
})

server.listen(8080, '0.0.0.0', () => console.debug(`Server running on port 8080`));
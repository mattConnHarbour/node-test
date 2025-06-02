// import './file-polyfill.js'; Import the file polyfill if using NodeJS < v22.0.0
import fs from 'fs';
import {readFile, writeFile} from 'fs/promises';
import express from 'express';
// import multer from 'multer';
import https from 'https';
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

const server = express();
server.use(express.json());

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
// https://zapier-dev-files.s3.amazonaws.com/cli-platform/20240/x-ZIRXjDbyxuHJi_5LcSc73SgbOeETN9oEqaTuDyLpbndL0_m-l7bV-vDAXH4auCgCE9fGJ6-gLB0fdF3pvcUwJKzDmd99Yd_yiIP4KPYjL0rDHVnHpjx5s2eUsHizeGtkQHKRX1-M0xgZ0qe5as4Qz3YqNJ17VV7RA6xEccXEQ

server.post('/insert', async (req, res, next) => {
  const json = req.body;
  const {
    clauseBefore,
    clause,
    clauseAfter,
    file
  } = json;

  // const fileResponse = await fetch(file);
  // console.log(">>> FR", fileResponse)
  const fileName = generateRandomFilename();
  const filePath = `./${fileName}`;
  const fileStream = fs.createWriteStream(filePath);
  await new Promise((resolve, reject) => {
    https.get(file, (response) => {
      response.pipe(fileStream);

      // after download completed close filestream
      fileStream.on("finish", () => {
        fileStream.close();
        console.log("Download Completed");
        resolve();
      });
    });
  });

  let documentData = await readFile(filePath);

  let editor = null;
  editor = await getEditor(documentData);
  const position = getClausePosition(editor, clauseBefore);

  // insert suggestion
  insertSuggestion({editor, position, clause});

      let zipBuffer = null;
    try {
      zipBuffer = await editor.exportDocx();
    } catch (e) {
      res.status(200).send({
        success: false
      });
      return;
    }

    const exportedData = Buffer.from(zipBuffer);
    const {
      upload: uploadUrl,
      download: downloadUrl
    } = await generateUploadDownloadUrls(fileName);
    // upload file
    uploadToSignedUrl(uploadUrl, exportedData);

  res.status(200).send({
    success: true,
    file: downloadUrl
  });

  // await new Promise((resolve, reject) => {
  //   request(file).pipe(fileStream);
  //   fileStream.on("finish", resolve);
  // });

  // req.pipe(busboy);
});
  // const editor = await getEditor(documentData);


// server.post('/insert', async (req, res, next) => {
//   let filePath = null;
//   let uploadedFileName = null;

//   let busboy = null;
//   // missing headers?
//   try {
//     busboy = new Busboy({ headers: req.headers });
//   } catch (e) {
//     res.status(200).send({
//       success: false
//     });
//     return;
//   }

//   const fields = {};
//   busboy.on('field', (fieldname, value) => {
//     fields[fieldname] = value;
//   });

//   // save file
//   busboy.on('file', async (fieldname, file, filename, encoding, mimetype) => {
//     uploadedFileName = filename || generateRandomFilename();
//     filePath = path.join(__dirname, uploadedFileName);
//     file.pipe(fs.createWriteStream(filePath));

//     console.log(">>> Uploaded file name:", uploadedFileName);
//   });

//   // after file save
//   busboy.on("finish", async () => {
//     // init signed urls
//     const {
//       upload: uploadUrl,
//       download: downloadUrl
//     } = await generateUploadDownloadUrls(uploadedFileName);

//     // init editor & modify document
//     let documentData = await readFile(filePath);
//     // TODO - handle atob error
//     let editor = null;
//     try {
//       editor = await getEditor(documentData);
//     } catch (e) {
//       res.status(200).send({
//         success: false
//       });
//       return;
//     }
    
//     // generate clause and find position
//     // const AIResponse = await getAIResponse(editor);
//     // const {
//     //   clauseBefore,
//     //   clause,
//     //   clauseAfter,
//     //   position
//     // } = await getDataFromAIResponse({AIResponse, editor});

//     const clause = fields['clause'];
//     const clauseBefore = fields['clause-before'];
//     const clauseAfter = fields['clause-after'];

//     const position = getClausePosition(editor, clauseBefore);

//     // insert suggestion
//     insertSuggestion({editor, position, clause});

//     // Export the docx and create a buffer to return to the user
//     let zipBuffer = null;
//     try {
//       zipBuffer = await editor.exportDocx();
//     } catch (e) {
//       res.status(200).send({
//         success: false
//       });
//       return;
//     }
//     documentData = Buffer.from(zipBuffer);

//     // upload file
//     uploadToSignedUrl(uploadUrl, documentData);

//     // respond with download url
//     res.status(200).send({
//       success: true,
//       file: downloadUrl,
//       // clauseBefore,
//       // clause,
//       // clauseAfter,
//     });
//   });

//   req.pipe(busboy);
//   // busboy.end(req.rawBody)
// })

server.listen(8080, '0.0.0.0', () => console.debug(`Server running on port 8080`));
// import './file-polyfill.js'; Import the file polyfill if using NodeJS < v22.0.0
import fs from 'fs';
import {readFile} from 'fs/promises';
import express from 'express';
import { JSDOM } from 'jsdom';
// import multer from 'multer';
import Busboy from 'busboy';
import { Storage } from '@google-cloud/storage';
import path from 'path'
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import https from 'https'

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// In Node, we use the Editor class directly from superdoc/super-editor
import { Editor, getStarterExtensions, getRichTextExtensions } from '@harbour-enterprises/superdoc/super-editor';

const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// Init your server of choice. For simplicity, we use express here
const server = express();

// const upload = multer({ dest: './tmp' });

const generateSignedUrl = async (bucketName, objectName, expirationTime, action) => {
  const storage = new Storage();
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(objectName);

  let options = {
    version: 'v4',
    action,
    expires: expirationTime,
  }

  if (action === 'write') {
    options = {
      ...options,
      contentType: DOCX_MIME_TYPE, // Or appropriate content type
    }
  }

  const [signedUrl] = await file.getSignedUrl(options);

  return signedUrl;
}

// Example usage in your Cloud Function
const uploadFile = async (req, res) => {
// Get the bucket name, object name, and expiration time from the request
const bucketName = 'slackbot-uploads';
const objectName = 'TEST_UPLOAD.txt';
const expirationTime = new Date(new Date().getTime() + 3600 * 1000); // 1 hour from now

try {
  const signedUrl = await generateSignedUrl(bucketName, objectName, expirationTime);
  return signedUrl;
} catch (error) {
  console.error('Error generating signed URL:', error);
  return null;
}
};

/**
 * A basic endpoint that appends content to the document.
 * You can pass in text and html as query parameters, at least one of which is required to edit the document.
 * If no param is passed, the document will be returned as as-is (blank template with header and footer).
 */
server.get('/', async (req, res, next) => {
  // Download the file
  res
  .status(200)
  .send("TEST GET");
})

server.post('/upload', async (req, res, next) => {
  const busboy = new Busboy({ headers: req.headers });
  const signedUrl = await uploadFile() || "NO URL";

  res
  .status(200)
  .send(signedUrl)

  req.pipe(busboy);
  busboy.end(req.rawBody);
});


server.post('/', async (req, res, next) => {
  let filePath = null;
  let fileName = null;
  // Load our example document - a blank template with a header and footer
  const busboy = new Busboy({ headers: req.headers });


  busboy.on('file', async (fieldname, file, filename, encoding, mimetype) => {
    // const saveTo = path.join(__dirname, 'uploads', filename);
    filePath = path.join(__dirname, filename);
    fileName = filename
    console.log(">>> PATH", filePath)
    // const writeStream = fs.createWriteStream(path);
    file.pipe(fs.createWriteStream(filePath));
    console.log(">>> TEST")
    // document = file;

  });

  busboy.on('finish', async () => {
    console.log(">>> FINISH", filePath)

  const bucketName = 'harbour-prod-webapp.appspot.com/slackbot-uploads';
  const objectName = fileName;
  const expirationTime = new Date(new Date().getTime() + 3600 * 1000); // 1 hour from now

  const signedUrl = await generateSignedUrl(bucketName, objectName, expirationTime, 'write');
  console.log(">>> SIGNED URL", signedUrl);

  if (!signedUrl) {
    res
    .status(200)
    .send("FAILED")
  } else {

    let documentData = await readFile(filePath);

    // If we have text or html, we will to load the editor and insert the content
    // if (text || html) {
  
      const editor = await getEditor(documentData);
  
      editor.commands.insertContent("TEXT INSERT");
  
      // Export the docx and create a buffer to return to the user
      const zipBuffer = await editor.exportDocx();
      documentData = Buffer.from(zipBuffer);

      const signedUrlPath = signedUrl.split('/').pop();
      const requestPath = `/harbour-prod-webapp.appspot.com/slackbot-uploads/${signedUrlPath}`

      const options = {
        hostname: 'storage.googleapis.com',
        path: requestPath,
        method: 'PUT',
        headers: {
          'Content-Type': DOCX_MIME_TYPE
        }
      };

      const signedUrlReq = https.request(options, function(res) {
        console.log('STATUS: ' + res.statusCode);
        console.log('HEADERS: ' + JSON.stringify(res.headers));
        res.setEncoding('utf8');
        res.on('data', function (chunk) {
          console.log('BODY: ' + chunk);
        });
      });

      signedUrlReq.write(documentData);
      signedUrlReq.end();


      const downloadSignedUrl = await generateSignedUrl(bucketName, objectName, expirationTime, 'read');


      res
      .status(200)
      .send(downloadSignedUrl)
      // .type(DOCX_MIME_TYPE)
      // .set('Content-Disposition', 'attachment; filename="exported-superdoc.docx"')
      // .send(documentData);
    // });
  }
  });

  req.pipe(busboy);
  // busboy.end(req.rawBody)


  /*
  // Get the text and html from the query parameters
  const { text, html } = req.query;
  const {file} = req;
  console.log(">>> FILE", file);
  let documentData = await fs.readFile(file.path);

  // If we have text or html, we will to load the editor and insert the content
  // if (text || html) {

    const editor = await getEditor(documentData);

    if (text) editor.commands.insertContent(text);
    if (html) editor.commands.insertContent(html);
    editor.commands.insertContent("TEXT INSERT");

    // Export the docx and create a buffer to return to the user
    const zipBuffer = await editor.exportDocx();
    documentData = Buffer.from(zipBuffer);

  // }

  // Download the file
  res
  .status(200)
  .type(DOCX_MIME_TYPE)
  .set('Content-Disposition', 'attachment; filename="exported-superdoc.docx"')
  .send(documentData);
  */

})

server.listen(8080, '0.0.0.0', () => console.debug(`Server running on port 8080`));


/**
 * Loads the editor with the document data
 * @param {Buffer} docxFileBuffer The docx file as a Buffer
 * @returns {Promise<Editor>} The Super Editor instance
 */
const getEditor = async (docxFileBuffer) => {
  // For now, this is boilerplate code to mock the window and document
  const { window: mockWindow } = (new JSDOM('<!DOCTYPE html><html><body></body></html>'));
  const { document: mockDocument } = mockWindow;

  // Prepare document data for the editor
  const [content, mediaFiles] = await Editor.loadXmlData(docxFileBuffer);
  // console.log(">>> CONTENT", content)

  return new Editor({
    isHeadless: true,

    // We pass in the mock document and window here
    mockDocument,
    mockWindow,

    // Our standard list of extensions
    extensions: getStarterExtensions(),

    // Our prepaerd document data
    content,
    mediaFiles,
  });
};

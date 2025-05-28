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
import https from 'https';
import { TextSelection } from 'prosemirror-state';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// In Node, we use the Editor class directly from superdoc/super-editor
import { Editor, getStarterExtensions, Toolbar } from '@harbour-enterprises/superdoc/super-editor';

const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// Init your server of choice. For simplicity, we use express here
const server = express();

const positionCursor = (editor, toPos) => {
  const selection = new TextSelection(editor.view.state.doc.resolve(toPos+1));
  const tr = editor.view.state.tr.setSelection(selection);
  const state = editor.view.state.apply(tr)
  editor.view.updateState(state)
};

const streamData = async (response) => {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let result = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        console.log('Stream finished');
        break;
      }
      const textChunk = decoder.decode(value);
      result += textChunk;
    }

    let jsonString = result.split('```')[1];
    jsonString = jsonString.replace('json\n{','{');
    return JSON.parse(jsonString);
  } catch (error) {
    console.error('Error reading stream:', error);
  } finally {
    reader.releaseLock();
  }
}

const apiEndpoint = "https://sd-dev-express-gateway-i6xtm.ondigitalocean.app/insights";
const getAIContent = async (editor) => {
  const xml = editor.state.doc.textContent;
  // console.log("XML:", xml)

  const payload = {
    "stream": true,
    "context": "You are an expert copywriter and you are immersed in a document editor. You are to provide document related text responses based on the user prompts. Only write what is asked for. Do not provide explanations. Try to keep placeholders as short as possible. Do not output your prompt. Your instructions are: ",
    "insights": [
        {
        "type": "custom_prompt",
        "name": "text_generation",
        "message": `Find the phrase after which a GDPR clause should be inserted: "${xml}"
          Then, generate a GDPR clause. Return your results in a JSON response, "phrase" and "clause" as keys.
        `,
        "format": [{ "value": "" }]
        }
    ],
    "document_content": xml
    }

  const response = await fetch(apiEndpoint, {
    method: 'POST',
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload),
  });
  const result = await streamData(response);

  return result;
}

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

server.get('/', async (req, res, next) => {
  res
  .status(200)
  .send("TEST GET");
})

server.post('/', async (req, res, next) => {
  let filePath = null;
  let fileName = null;

  let busboy = null;
  try {
    busboy = new Busboy({ headers: req.headers });
  } catch (e) {
    res.status(200).send('ERROR');
  }

  // save file
  busboy.on('file', async (fieldname, file, filename, encoding, mimetype) => {
    filePath = path.join(__dirname, filename);
    fileName = filename
    file.pipe(fs.createWriteStream(filePath));
  });

  // after file save
  busboy.on("finish", async () => {
    // cloud storage variables
    const bucketName = "harbour-prod-webapp.appspot.com/slackbot-uploads";
    const objectName = fileName;
    const expirationTime = new Date(new Date().getTime() + 3600 * 1000); // 1 hour from now

    // signed url for upload
    const signedUrl = await generateSignedUrl(
      bucketName,
      objectName,
      expirationTime,
      "write"
    );

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
    const aiResult = await getAIContent(editor);
    const {phrase, clause} = aiResult;
    console.log(">>> Phrase replaced", phrase);
    const searchResult = editor.commands.search(phrase).pop();
    // console.log(">>> search result", searchResult);
    const {from, to} = searchResult;
    console.log(">>> FROM, TO", from, to)
    // console.log(">>> CONTENT", clause);
    editor.setDocumentMode("suggesting");
    editor.commands.enableTrackChanges();
    positionCursor(editor, {from, to});
    editor.commands.insertContent(`\n${clause}\n`);
    // editor.commands.insertContentAt({ from, to, }, phrase, {});
    // // Wrap the raw content in a span with our animation class and unique ID
    // const wrappedContent = {
    //   type: "text",
    //   marks: [
    //     {
    //       type: "aiAnimationMark",
    //       attrs: {
    //         class: "sd-ai-text-appear",
    //         dataMarkId: `ai-animation-${Date.now()}`,
    //       },
    //     },
    //   ],
    //   text: content,
    // };

    // Insert the raw content with animation mark
    // editor.commands.insertContent(wrappedContent);
    // editor.commands.insertContent(clause);
    // editor.commands.insertContentAt({ from: 0, to: 1 }, content, {});

    // Export the docx and create a buffer to return to the user
    let zipBuffer = null;
    try {
      zipBuffer = await editor.exportDocx();
    } catch (e) {
      res.status(200).send("ERROR");
      return;
    }
    documentData = Buffer.from(zipBuffer);

    // upload to cloud store
    const signedUrlPath = signedUrl.split("/").pop();
    const requestPath = `/${bucketName}/${signedUrlPath}`;
    const options = {
      hostname: "storage.googleapis.com",
      path: requestPath,
      method: "PUT",
      headers: {
        "Content-Type": DOCX_MIME_TYPE,
      },
    };

    const signedUrlReq = https.request(options, function (res) {
      res.setEncoding("utf8");
      res.on("data", function (chunk) {
        console.log("BODY: " + chunk);
      });
    });

    signedUrlReq.write(documentData);
    signedUrlReq.end();

    // get download signed url
    const downloadSignedUrl = await generateSignedUrl(
      bucketName,
      objectName,
      expirationTime,
      "read"
    );

    res.status(200).send(downloadSignedUrl);
  });

  req.pipe(busboy);
  // busboy.end(req.rawBody)
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
    user: {
      name: "Superdoc",
      // email: "matthew@harbourshare.com",
      email: null,
      image: null
    },

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

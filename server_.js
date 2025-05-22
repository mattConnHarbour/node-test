// import './file-polyfill.js'; Import the file polyfill if using NodeJS < v22.0.0
import fs from 'fs';
import {readFile} from 'fs/promises';
import express from 'express';
import { JSDOM } from 'jsdom';
// import multer from 'multer';
import Busboy from 'busboy';

// In Node, we use the Editor class directly from superdoc/super-editor
import { Editor, getStarterExtensions, getRichTextExtensions } from '@harbour-enterprises/superdoc/super-editor';

const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// Init your server of choice. For simplicity, we use express here
const server = express();

// const upload = multer({ dest: './tmp' });

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

server.post('/', async (req, res, next) => {
  // Load our example document - a blank template with a header and footer
  const busboy = new Busboy({ headers: req.headers });
let path = null;
let document = null;
  busboy.on('file', async (fieldname, file, filename, encoding, mimetype) => {
    // const saveTo = path.join(__dirname, 'uploads', filename);
    path = `./tmp/${filename}`;
    const writeStream = fs.createWriteStream(path);
    file.pipe(writeStream);
    console.log(">>> TEST")
    document = file;

    writeStream.on('finish', () => {
      const readStream = fs.createReadStream(path);
      res
      .status(200)
      .type(DOCX_MIME_TYPE)
      .set('Content-Disposition', 'attachment; filename="exported-superdoc.docx"')

      readStream.pipe(res);
    });
  });

  busboy.on('finish', async () => {
    console.log(">>> FINISH", path)

    // let documentData = await readFile(path);
    // console.log(">>> DATA", documentData)
    // res
    // .status(200)
    // .type(DOCX_MIME_TYPE)
    // .set('Content-Disposition', 'attachment; filename="exported-superdoc.docx"')
    // .send(documentData);
  });

  // req.pipe(busboy);
  busboy.end(req.rawBody)


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

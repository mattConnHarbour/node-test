import { TextSelection, Selection } from 'prosemirror-state';
import { Storage } from '@google-cloud/storage';
import { JSDOM } from 'jsdom';
import https from 'https';

// In Node, we use the Editor class directly from superdoc/super-editor
import { Editor, getStarterExtensions } from '@harbour-enterprises/superdoc/super-editor';

const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// AI Utils
const getDataFromStreamedResult = async (response) => {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let result = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        console.log("Stream finished");
        break;
      }
      const textChunk = decoder.decode(value);
      result += textChunk;
    }
    return result;
  } catch (error) {
    console.error("Error reading stream:", error);
  } finally {
    reader.releaseLock();
  }
};

const getJSONFromResult = (AIResult) => {
  let jsonString = AIResult.split("```")[1];
  jsonString = jsonString.replace("json\n{", "{");
  return JSON.parse(jsonString);
}

const getAIResponse = async (editor) => {
  const xml = editor.state.doc.textContent;
  const prompt = `
  Find the phrase after which a GDPR clause should be inserted, then find the phrase after: "${xml}"
  Then, generate a GDPR clause. Do not include placeholders or templating.
  Return your results in a JSON response like this:
  {
    clauseBefore,
    clause,
    clauseAfter
  }
  `;

  const payload = {
    stream: true,
    context:
      "You are an expert copywriter and you are immersed in a document editor. You are to provide document related text responses based on the user prompts. Only write what is asked for. Do not provide explanations. Try to keep placeholders as short as possible. Do not output your prompt. Your instructions are: ",
    insights: [
      {
        type: "custom_prompt",
        name: "text_generation",
        message: prompt,
        format: [{ value: "" }],
      },
    ],
    document_content: xml,
  };

  const apiEndpoint = "https://sd-dev-express-gateway-i6xtm.ondigitalocean.app/insights";
  const response = await fetch(apiEndpoint, {
    method: 'POST',
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload),
  });
  
  return response;
}

const getDataFromAIResponse = async ({AIResponse, editor}) => {
  const result = await getDataFromStreamedResult(AIResponse);
  const json = getJSONFromResult(result);
  const {
    clauseBefore,
    clause,
    clauseAfter,
  } = json;
  console.log("Phrase to insert after:", clauseBefore);

  const position = getClausePosition(editor, clauseBefore);

  return {
    position,
    clauseBefore,
    clause,
    clauseAfter,
  };
}

const generateSignedUrl = async (bucketName, objectName, expirationTime, action) => {
  console.log(`>>> generateSignedUrl (${action}) - bucketName:`, bucketName)
  console.log(`>>> generateSignedUrl (${action}) - objectName:`, objectName)
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

// cloud storage variables
const bucketName = "harbour-prod-webapp.appspot.com/slackbot-uploads";
const expirationTime = new Date(new Date().getTime() + 3600 * 1000); // 1 hour from now

// upload to cloud store
const uploadToSignedUrl = (uploadUrl, data) => {
  const signedUrlPath = uploadUrl.split("/").pop();
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

  signedUrlReq.write(data);
  signedUrlReq.end();
};

const generateUploadDownloadUrls = async (objectName) => {
  const urls = {
    upload: null,
    download: null
  };

  const uploadSignedUrl = await generateSignedUrl(
    bucketName,
    objectName,
    expirationTime,
    "write"
  );
  urls.upload = uploadSignedUrl;

  // get download signed url
  const downloadSignedUrl = await generateSignedUrl(
    bucketName,
    objectName,
    expirationTime,
    "read"
  );
  urls.download = downloadSignedUrl;

  return urls;
}

// Editor utils
const getClausePosition = (editor, phrase) => {
  const searchResult = editor.commands.search(phrase).pop();
  if (!searchResult) {
    console.log("Clause insert position not found");
    return null;
  }
  const {from, to} = searchResult;
  return to;
}

const positionCursor = (editor, toPos) => {
  let selection = null;
  if (!toPos) {
    selection = Selection.atEnd(editor.view.docView.node)
  } else {
    selection = new TextSelection(editor.view.state.doc.resolve(toPos+1));
  }
  const tr = editor.view.state.tr.setSelection(selection);
  const state = editor.view.state.apply(tr)
  editor.view.updateState(state)
};

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

const insertSuggestion = ({editor, position, clause}) => {
  editor.setDocumentMode("suggesting");
  editor.commands.enableTrackChanges();
  positionCursor(editor, position);
  editor.commands.insertContent(`<br /><br />${clause}<br /><br />`);
};

const generateRandomFilename = () => {
  const randomNum = String(Date.now())+Math.floor(Math.random()*1E9);
  return `file_${randomNum}.docx`
}

export {
  getAIResponse,
  generateUploadDownloadUrls,
  uploadToSignedUrl,
  positionCursor,
  getEditor,
  getDataFromAIResponse,
  getClausePosition,
  insertSuggestion,
  DOCX_MIME_TYPE,
  generateRandomFilename
}

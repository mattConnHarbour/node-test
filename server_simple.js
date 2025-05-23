const generateSignedUrl =async (bucketName, objectName, expirationTime) => {
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(objectName);

  const [signedUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: expirationTime,
      contentType: 'application/octet-stream', // Or appropriate content type
  });

  return signedUrl;
}

// Example usage in your Cloud Function
const uploadFile = async (req, res) => {
// Get the bucket name, object name, and expiration time from the request
const bucketName = 'harbour-prod-webapp.appspot.com/superdocs/None';
const objectName = 'TEST_UPLOAD.txt';
const expirationTime = new Date(new Date().getTime() + 3600 * 1000); // 1 hour from now

try {
  const signedUrl = await generateSignedUrl(bucketName, objectName, expirationTime);
  res.status(200).send({ signedUrl });
} catch (error) {
  console.error('Error generating signed URL:', error);
  res.status(500).send({ error: 'Failed to generate signed URL' });
}
};
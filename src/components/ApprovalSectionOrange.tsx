await new Promise((resolve, reject) => {
  const upload = new tus.Upload(file, {
    endpoint: `${supabaseUrl}/storage/v1/upload/resumable`,
    retryDelays: [0, 3000, 5000, 10000],
    headers: {
      authorization: `Bearer ${token}`,
      'x-upsert': 'true',
    },
    uploadLengthDeferred: false,
    uploadDataDuringCreation: false, // OBRIGATÓRIO: impede que o POST inicial envie dados da mídia
    removeFingerprintOnSuccess: true,
    metadata: {
      bucketName: 'posts',
      objectName: filePath,
      contentType: file.type || (isVideoFile ? 'video/mp4' : 'image/jpeg'),
      cacheControl: '3600',
    },
    chunkSize: 1 * 1024 * 1024, // Reduzido para 1MB por chunk
    onError: (error) => {
      console.error('Erro no upload TUS:', error);
      reject(error);
    },
    onProgress: (bytesUploaded, bytesTotal) => {
      const percentage = ((bytesUploaded / bytesTotal) * 100).toFixed(0);
      setFeedbackMessage(`A enviar mídia (${percentage}%)...`);
    },
    onSuccess: () => {
      resolve(true);
    },
  });

  upload.start();
});
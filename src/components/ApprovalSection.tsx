const handleCreatePost = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!houseName.trim()) {
    alert('Por favor, insira o nome da casa.');
    return;
  }
  if (!file) {
    alert('Por favor, faça upload de um vídeo ou foto.');
    return;
  }

  try {
    setSubmitting(true);
    setUploadStatus('A preparar envio...');

    const fileExt = file.name.split('.').pop()?.toLowerCase() || 'mp4';
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
    const filePath = `approval-uploads/${fileName}`;
    const isVideoFile = file.type.startsWith('video/') || Boolean(file.name.match(/\.(mp4|mov|webm)$/i));

    // Obter sessão e token de autenticação
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

    // Se o ficheiro for maior que 6MB, envia via TUS (Resumable Upload)
    if (file.size > 6 * 1024 * 1024) {
      if (!supabaseUrl) {
        throw new Error('A variável NEXT_PUBLIC_SUPABASE_URL não está configurada no .env');
      }

      await new Promise((resolve, reject) => {
        const upload = new tus.Upload(file, {
          endpoint: `${supabaseUrl}/storage/v1/upload/resumable`,
          retryDelays: [0, 3000, 5000, 10000],
          headers: {
            authorization: `Bearer ${token}`,
            'x-upsert': 'true',
          },
          uploadDataDuringCreation: true,
          removeFingerprintOnSuccess: true,
          metadata: {
            bucketName: 'posts',
            objectName: filePath,
            contentType: file.type || (isVideoFile ? 'video/mp4' : 'image/jpeg'),
            cacheControl: '3600',
          },
          chunkSize: 6 * 1024 * 1024,
          onError: (error) => {
            console.error('Erro no upload TUS:', error);
            reject(error);
          },
          onProgress: (bytesUploaded, bytesTotal) => {
            const percentage = ((bytesUploaded / bytesTotal) * 100).toFixed(0);
            setUploadStatus(`A enviar mídia (${percentage}%)...`);
          },
          onSuccess: () => {
            resolve(true);
          },
        });

        upload.start();
      });
    } else {
      // Envio tradicional para ficheiros pequenos
      setUploadStatus('A enviar mídia...');
      const { error: uploadError } = await supabase.storage
        .from('posts')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type || (isVideoFile ? 'video/mp4' : 'image/jpeg'),
        });

      if (uploadError) throw uploadError;
    }

    const { data: urlData } = supabase.storage.from('posts').getPublicUrl(filePath);
    const tokenApproval = Math.random().toString(36).substring(2) + Date.now().toString(36);

    setUploadStatus('A registar conteúdo...');
    const { error: dbError } = await supabase.from('posts').insert([
      {
        house_name: houseName,
        caption: caption,
        media_url: urlData.publicUrl,
        media_type: isVideoFile ? 'video' : 'image',
        approval_status: 'pending',
        approval_token: tokenApproval,
        platform: 'instagram',
        scheduled_date: new Date().toISOString().split('T')[0],
        scheduled_time: '19:00',
      },
    ]);

    if (dbError) throw dbError;

    setIsModalOpen(false);
    setHouseName('');
    setCaption('');
    setFile(null);
    setMediaPreview(null);
    fetchPosts();
    alert('Vídeo/Foto enviado para a pasta de aprovação com sucesso!');
  } catch (err: any) {
    console.error('Erro no upload:', err);
    alert(`Erro ao enviar: ${err.message || 'Erro desconhecido'}`);
  } finally {
    setSubmitting(false);
    setUploadStatus('');
  }
};
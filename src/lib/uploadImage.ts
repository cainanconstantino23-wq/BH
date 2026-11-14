// Envia uma imagem do navegador para o R2 (URL assinada em /api/upload-url) e devolve o endereço público.
export async function uploadImage(file: File) {
  const response = await fetch('/api/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName: file.name, fileType: file.type || 'image/jpeg' }),
  });
  if (!response.ok) throw new Error(`upload-url respondeu ${response.status}`);
  const { uploadUrl, publicUrl } = (await response.json()) as { uploadUrl: string; publicUrl: string };
  const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type || 'image/jpeg' }, body: file });
  if (!put.ok) throw new Error(`envio respondeu ${put.status}`);
  return publicUrl;
}

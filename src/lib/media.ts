const videoExtensions = new Set(['mp4', 'm4v', 'mov', 'webm', 'ogv', 'ogg', 'avi', 'mkv']);

export const isVideoMedia = (mediaUrl: string, mediaType?: string) => {
  if (mediaType?.toLowerCase().startsWith('video/')) return true;
  if (mediaType?.toLowerCase() === 'video') return true;
  if (mediaUrl.toLowerCase().startsWith('data:video/')) return true;

  const cleanUrl = mediaUrl.split(/[?#]/, 1)[0];
  const extension = cleanUrl.split('.').pop()?.toLowerCase();
  return extension ? videoExtensions.has(extension) : false;
};

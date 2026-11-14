// Tipos da aprovação de capa (pastas por casa com fotos do Google Drive). Usados no painel, nas rotas e na página pública.

export interface CoverPhoto {
  driveId: string;
  name: string;
  width: number | null;
  height: number | null;
  favorite: boolean;
  approved: boolean;
  /** Versão cortada no editor (R2); quando existe, é ela que aparece e vai para a aprovação. */
  edited: EditedImage | null;
}

export interface EditedImage {
  url: string;
  width: number;
  height: number;
  /** Ex.: "Instagram · Feed 4:5" */
  label: string;
}

export interface CoverCollectionSummary {
  id: number;
  houseName: string;
  neighborhood: string;
  houseNumber: string;
  photoCount: number;
  favoriteCount: number;
  approvedCount: number;
  coverDriveId: string | null;
  /** Corte da foto de capa, se houver. */
  coverEditedUrl: string | null;
  shareToken: string | null;
  responded: boolean;
  updatedAt: string;
}

export interface CoverCollectionDetail extends CoverCollectionSummary {
  feedback: string;
  respondedAt: string | null;
  photos: CoverPhoto[];
}

/** Resposta pública do link: só as favoritas. */
export interface PublicCoverCollection {
  label: string;
  feedback: string;
  respondedAt: string | null;
  photos: CoverPhoto[];
}

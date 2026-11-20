'use client';

import Image from 'next/image';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, LoaderCircle, Moon, Sun } from 'lucide-react';
import { FeedGridEditor } from '@/components/grade/FeedGridEditor';
import { ApproverPhotoViewer, type CropSize } from '@/components/capa/ApproverPhotoViewer';
import { formatLongStamp, type CoverPhoto } from '@/lib/covers';
import { APPLE_DARK, APPLE_LIGHT, sharedVars } from '@/components/apple/appleTheme';
import { periodLabel, postDates, setCover, toLayout, type PlanCandidate, type PlanHouse, type PublicFeedPlan } from '@/lib/feedPlan';

// Link da Thereza para a grade do feed dos próximos dias (sem login).
// Ela vê como o feed vai ficar, arrasta para trocar, toca num post para escolher a capa ou trocar a casa,
// e aprova a grade. Cada mudança é salva sozinha (PUT), para não perder se fechar.
// Na casa: tocar na foto abre a foto inteira em tela grande (cortar, próxima, usar como capa);
// "ver mais fotos da casa" mostra a pasta da casa no Drive (só leitura) para ela escolher outra capa;
// "Não quero esta casa" tira a casa da grade e avisa a equipe para colocar outra.

/** Foto do link da grade no formato que a tela grande usa. */
const asPhoto = (candidate: { driveId: string; name: string; editedUrl?: string | null }): CoverPhoto => ({
  driveId: candidate.driveId,
  name: candidate.name,
  width: null,
  height: null,
  favorite: false,
  approved: false,
  edited: candidate.editedUrl ? { url: candidate.editedUrl, width: 0, height: 0, label: '' } : null,
  addedBy: null,
  addedAt: null,
  favoritedBy: null,
  favoritedAt: null,
  favoritedByApprover: false,
  approvedBy: null,
  approvedAt: null,
  editedBy: null,
  editedAt: null,
});

type Viewer = { collectionId: number; source: 'casa' | 'pasta'; index: number };
type MorePhotos = { collectionId: number; status: 'loading' | 'error' } | { collectionId: number; status: 'ready'; photos: CoverPhoto[] };

type LoadState = { status: 'loading' } | { status: 'missing' } | { status: 'ready'; data: PublicFeedPlan };

// Visual no padrão Apple (como a "Selecionar capas"): fonte do sistema, vidro, cores do sistema; claro por padrão.
const SF = { fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", system-ui, sans-serif' };
type Theme = 'light' | 'dark';
const THEME_KEY = 'bh-grade-tema';

export default function FeedPlanLinkPage() {
  const params = useParams();
  const token = typeof params?.token === 'string' ? decodeURIComponent(params.token).trim() : '';
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [houses, setHouses] = useState<PlanHouse[]>([]);
  const [feedback, setFeedback] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const saveTimer = useRef<number | null>(null);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [more, setMore] = useState<MorePhotos | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState('');
  // cortes feitos por ela nesta visita: só esses podem voltar à original
  const [myCrops, setMyCrops] = useState<Set<string>>(new Set());
  const api = `/api/grade-link/${encodeURIComponent(token)}`;
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return typeof window !== 'undefined' && window.localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });
  const toggleTheme = () =>
    setTheme((current) => {
      const next: Theme = current === 'light' ? 'dark' : 'light';
      try {
        window.localStorage.setItem(THEME_KEY, next);
      } catch {
        // sem localStorage: vale só nesta visita
      }
      return next;
    });
  // variáveis no <html>: valem também para a janela da casa, aberta fora da página
  useEffect(() => {
    const root = document.documentElement;
    const values = theme === 'dark' ? APPLE_DARK : APPLE_LIGHT;
    const all = { ...values, ...sharedVars(values) };
    for (const [key, value] of Object.entries(all)) root.style.setProperty(key, value);
    root.style.colorScheme = theme;
    document.body.style.background = values['--bg'];
    return () => {
      for (const key of Object.keys(all)) root.style.removeProperty(key);
      root.style.colorScheme = '';
      document.body.style.background = '';
    };
  }, [theme]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(api, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return setState({ status: 'missing' });
        const data = (await response.json()) as PublicFeedPlan;
        setState({ status: 'ready', data });
        setHouses(data.houses);
        setFeedback(data.feedback);
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: 'missing' });
      });
    return () => controller.abort();
  }, [api]);

  const image = useCallback(
    (candidate: PlanCandidate, size: number) => candidate.editedUrl ?? `${api}/thumb/${encodeURIComponent(candidate.driveId)}?s=${size}`,
    [api],
  );

  // salva sozinho um pouco depois de cada mudança
  const change = (next: PlanHouse[]) => {
    setHouses(next);
    setSent(false);
    setSaveState('saving');
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      const response = await fetch(api, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ layout: toLayout(next) }) }).catch(() => null);
      setSaveState(response?.ok ? 'saved' : 'error');
    }, 700);
  };

  // ---- casa aberta: tela grande, corte, mais fotos da pasta, recusar ----
  const houseOf = (collectionId: number) => houses.find((house) => house.collectionId === collectionId);
  const thumb = (collectionId: number, driveId: string, size: number) => `${api}/thumb/${encodeURIComponent(driveId)}?s=${size}&casa=${collectionId}`;

  /** Põe (ou atualiza) uma foto nas candidatas da casa e, se pedido, usa como capa. */
  const putCandidate = (collectionId: number, candidate: PlanCandidate, makeCover: boolean) => {
    const next = houses.map((house) => {
      if (house.collectionId !== collectionId) return house;
      const exists = house.candidates.some((item) => item.driveId === candidate.driveId);
      const candidates = exists ? house.candidates.map((item) => (item.driveId === candidate.driveId ? candidate : item)) : [...house.candidates, candidate];
      return { ...house, candidates, coverDriveId: makeCover ? candidate.driveId : house.coverDriveId };
    });
    change(next);
  };

  const openFolder = async (collectionId: number) => {
    setPhotoError('');
    setMore({ collectionId, status: 'loading' });
    const response = await fetch(`${api}/folder?casa=${collectionId}`, { cache: 'no-store' }).catch(() => null);
    if (!response?.ok) return setMore({ collectionId, status: 'error' });
    const body = (await response.json()) as { photos: { driveId: string; name: string }[] };
    setMore({ collectionId, status: 'ready', photos: body.photos.map((photo) => asPhoto(photo)) });
  };

  const chooseCover = async (collectionId: number, photo: CoverPhoto, source: Viewer['source']) => {
    const house = houseOf(collectionId);
    if (!house || house.coverDriveId === photo.driveId) return;
    if (source === 'casa' || house.candidates.some((item) => item.driveId === photo.driveId)) {
      change(setCover(houses, collectionId, photo.driveId));
      return;
    }
    // foto da pasta da casa: entra nas candidatas (registrada como escolha dela) e vira a capa
    setPhotoBusy(true);
    setPhotoError('');
    const response = await fetch(`${api}/photo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ collectionId, fileId: photo.driveId }) }).catch(() => null);
    setPhotoBusy(false);
    if (!response?.ok) return setPhotoError('Não foi possível usar esta foto. Tente de novo.');
    const body = (await response.json()) as { candidate: PlanCandidate };
    putCandidate(collectionId, body.candidate, true);
  };

  const saveCrop = async (collectionId: number, photo: CoverPhoto, file: File, size: CropSize, source: Viewer['source']) => {
    setPhotoBusy(true);
    setPhotoError('');
    const form = new FormData();
    form.set('collectionId', String(collectionId));
    form.set('fileId', photo.driveId);
    form.set('file', file);
    form.set('width', String(size.width));
    form.set('height', String(size.height));
    form.set('label', size.label);
    const response = await fetch(`${api}/crop`, { method: 'POST', body: form }).catch(() => null);
    setPhotoBusy(false);
    if (!response?.ok) {
      setPhotoError('Não foi possível salvar o corte. Tente de novo.');
      return false;
    }
    const body = (await response.json()) as { candidate: PlanCandidate };
    setMyCrops((current) => new Set(current).add(photo.driveId));
    // corte de uma foto da pasta da casa = ela quer essa foto: entra nas candidatas como capa
    putCandidate(collectionId, body.candidate, source === 'pasta');
    if (source === 'pasta') setMore((current) => (current?.status === 'ready' ? { ...current, photos: current.photos.map((item) => (item.driveId === photo.driveId ? asPhoto(body.candidate) : item)) } : current));
    return true;
  };

  const undoCrop = async (collectionId: number, photo: CoverPhoto) => {
    setPhotoBusy(true);
    setPhotoError('');
    const response = await fetch(`${api}/crop`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ collectionId, fileId: photo.driveId }) }).catch(() => null);
    setPhotoBusy(false);
    if (!response?.ok) return setPhotoError('Não foi possível voltar à foto original.');
    putCandidate(collectionId, { driveId: photo.driveId, name: photo.name, editedUrl: null }, false);
    setMore((current) => (current?.status === 'ready' ? { ...current, photos: current.photos.map((item) => (item.driveId === photo.driveId ? { ...item, edited: null } : item)) } : current));
  };

  const rejectHouse = async (house: PlanHouse, motivo: string) => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    const response = await fetch(`${api}/recusar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ collectionId: house.collectionId, motivo }) }).catch(() => null);
    if (!response?.ok) {
      setError('Não foi possível tirar a casa. Tente de novo.');
      return false;
    }
    change(houses.filter((item) => item.collectionId !== house.collectionId));
    return true;
  };

  const approve = async () => {
    setSending(true);
    setError('');
    const response = await fetch(api, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ layout: toLayout(houses), feedback }),
    }).catch(() => null);
    setSending(false);
    if (response?.ok) {
      setSent(true);
      setState((current) => (current.status === 'ready' ? { status: 'ready', data: { ...current.data, status: 'aprovado', respondedAt: new Date().toISOString() } } : current));
    } else {
      setError('Não foi possível enviar. Tente de novo em instantes.');
    }
  };

  const data = state.status === 'ready' ? state.data : null;
  // tela grande aberta: a casa e as fotos (candidatas da casa ou a pasta da casa no Drive)
  const viewerHouse = viewer ? houses.find((item) => item.collectionId === viewer.collectionId) : undefined;
  const viewerPhotos = !viewer ? [] : viewer.source === 'casa' ? (viewerHouse?.candidates ?? []).map(asPhoto) : more?.status === 'ready' ? more.photos : [];
  const freeDays = data ? postDates(data.startDate, data.days).filter((date) => !houses.some((house) => house.slotDate === date)).length : 0;

  return (
    <main style={SF} className="min-h-dvh bg-[var(--bg)] text-[var(--fg)] antialiased transition-colors duration-300">
      {/* fundo: degradê suave com as cores do sistema Apple, parado */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0" style={{ background: 'radial-gradient(70% 45% at 8% 0%, var(--mesh-a), transparent 60%), radial-gradient(55% 40% at 100% 8%, var(--mesh-c), transparent 60%), radial-gradient(60% 40% at 80% 100%, var(--mesh-b), transparent 60%)' }} />

      {/* barra de vidro: situação do salvamento, período e tema */}
      <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-[var(--material)] backdrop-blur-2xl backdrop-saturate-150">
        <div className="mx-auto grid max-w-3xl grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 pb-2.5 pt-[calc(0.6rem+env(safe-area-inset-top))] sm:px-8">
          <span className="inline-flex items-center gap-1.5 justify-self-start text-[13px] text-[var(--fg3)]">
            {data && (
              <>
                <span className="h-[7px] w-[7px] rounded-full" style={{ background: saveState === 'saving' ? 'var(--orange)' : saveState === 'error' ? 'var(--red)' : 'var(--green)' }} />
                {saveState === 'saving' ? 'Salvando…' : saveState === 'error' ? 'Não salvou' : 'Salvo'}
              </>
            )}
          </span>
          <div className="min-w-0 text-center">
            <p className="truncate text-[15px] font-semibold tracking-[-0.01em]">Grade do feed</p>
            {data && <p className="text-[12px] tabular-nums text-[var(--fg3)]">{periodLabel(data.startDate, data.days)} · {String(data.hour).padStart(2, '0')}h</p>}
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'light' ? 'Mudar para o tema escuro' : 'Mudar para o tema claro'}
            className="flex h-[34px] w-[34px] items-center justify-center justify-self-end rounded-full bg-[var(--fill2)] text-[var(--fg2)] transition-[transform,color] duration-150 hover:text-[var(--fg)] active:scale-[0.94]"
          >
            {theme === 'light' ? <Moon size={17} strokeWidth={2.2} aria-hidden="true" /> : <Sun size={17} strokeWidth={2.2} aria-hidden="true" />}
          </button>
        </div>
      </header>

      <div className="relative mx-auto max-w-3xl px-4 pb-[calc(9rem+env(safe-area-inset-bottom))] pt-6 sm:px-8 lg:pt-10">
        <Image src="/bahia-homes-logo.png" alt="Bahia Homes" width={1834} height={276} priority className={`h-auto w-28 sm:w-32 ${theme === 'dark' ? 'brightness-0 invert' : 'mix-blend-multiply'}`} />

        {state.status === 'loading' && (
          <div className="py-24 text-center">
            <LoaderCircle aria-hidden="true" size={22} className="mx-auto animate-spin text-[var(--fg3)] motion-reduce:animate-none" />
            <p role="status" className="mt-3 text-[15px] text-[var(--fg2)]">Carregando a grade…</p>
          </div>
        )}

        {state.status === 'missing' && (
          <div className="mx-auto max-w-sm py-24 text-center">
            <h1 className="text-[28px] font-bold leading-tight tracking-[-0.022em]">Este link não está disponível</h1>
            <p className="mt-2 text-[15px] text-[var(--fg2)]">Peça o link atualizado à equipe Bahia Homes.</p>
          </div>
        )}

        {data && (
          <>
            <header className="mt-7 max-w-2xl">
              <p className="text-[13px] font-medium text-[var(--fg3)]">Para a Thereza · {data.days} dias</p>
              <h1 className="mt-0.5 text-[34px] font-bold leading-[1.05] tracking-[-0.025em] sm:text-[40px]">Aprove a grade</h1>
              <p className="mt-2 max-w-[58ch] text-[15px] leading-relaxed text-[var(--fg2)]">
                É assim que o feed vai ficar, com o mais novo em cima. Segure e arraste um post para trocar o dia. Toque numa casa para ver as capas, cortar,
                escolher outra foto da casa ou trocar a casa. Domingo é dia de Reels.
              </p>
            </header>

            <div className="mt-7">
              <FeedGridEditor
                houses={houses}
                startDate={data.startDate}
                days={data.days}
                published={data.published}
                imageSrc={image}
                onChange={change}
                photoTools={{
                  overlayOpen: viewer !== null || more !== null,
                  onView: (house, driveId) =>
                    setViewer({ collectionId: house.collectionId, source: 'casa', index: Math.max(0, house.candidates.findIndex((item) => item.driveId === driveId)) }),
                  onFindMore: (house) => void openFolder(house.collectionId),
                  onReject: rejectHouse,
                }}
              />
            </div>

            {/* comentário: campo agrupado no estilo iOS */}
            <label className="mt-8 block">
              <span className="px-4 text-[13px] uppercase tracking-[0.02em] text-[var(--fg3)]">Comentário para a equipe (opcional)</span>
              <textarea
                value={feedback}
                onChange={(event) => {
                  setFeedback(event.target.value);
                  setSent(false);
                }}
                rows={3}
                maxLength={2000}
                placeholder="Ex.: gostei, mas troque a casa de terça."
                className="mt-1.5 w-full rounded-[12px] bg-[var(--sheet)] p-4 text-[17px] text-[var(--fg)] placeholder:text-[var(--fg3)] focus-visible:outline-2 focus-visible:outline-[var(--blue)]"
              />
            </label>
          </>
        )}
      </div>

      {/* cápsula de vidro flutuante: situação + aprovar */}
      {data && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <div className="pointer-events-auto flex w-full max-w-xl items-center justify-between gap-3 rounded-full border border-[var(--line)] bg-[var(--material)] py-[7px] pl-5 pr-[7px] shadow-[0_18px_40px_-18px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.22)] backdrop-blur-2xl backdrop-saturate-150">
            <p role="status" className="min-w-0 text-[15px] leading-tight">
              {error ? <span style={{ color: 'var(--red)' }}>{error}</span>
                : sent ? <span className="font-semibold">Grade aprovada <span className="font-normal text-[var(--fg3)]">· a equipe já foi avisada</span></span>
                : saveState === 'error' ? <span style={{ color: 'var(--red)' }}>A última mudança não salvou</span>
                : data.status === 'aprovado' && data.respondedAt ? <span>Aprovada <span className="text-[var(--fg3)]">em {formatLongStamp(data.respondedAt)}</span></span>
                : <span><span className="font-semibold tabular-nums">{houses.filter((house) => house.slotDate).length} casas</span><span className="text-[var(--fg3)]">{freeDays > 0 ? ` · ${freeDays} ${freeDays === 1 ? 'dia livre' : 'dias livres'}` : ' · grade completa'}</span></span>}
            </p>
            <button
              type="button"
              onClick={() => void approve()}
              disabled={sending || saveState === 'saving'}
              className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full px-5 text-[15px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] transition-[transform,filter,background-color] duration-150 active:scale-[0.97] disabled:opacity-50 [@media(hover:hover)_and_(pointer:fine)]:hover:brightness-110"
              style={{ background: sent ? 'var(--green)' : 'var(--blue)' }}
            >
              {sending ? <LoaderCircle size={17} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : sent ? <Check size={17} strokeWidth={2.6} aria-hidden="true" /> : null}
              {sent ? 'Aprovada' : data.status === 'aprovado' ? 'Aprovar de novo' : 'Aprovar grade'}
            </button>
          </div>
        </div>
      )}

      {/* mais fotos da casa (pasta no Drive): tela cheia no tema da página */}
      {more && (() => {
        const house = houses.find((item) => item.collectionId === more.collectionId);
        return (
          <div role="dialog" aria-modal="true" aria-label="Mais fotos da casa" className="fixed inset-0 z-[90] flex flex-col bg-[var(--bg)]">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-[var(--line)] bg-[var(--material)] px-3 pb-2.5 pt-[calc(0.6rem+env(safe-area-inset-top))] backdrop-blur-2xl sm:px-6">
              <button type="button" autoFocus onClick={() => setMore(null)} className="inline-flex h-9 items-center gap-0.5 justify-self-start rounded-full pl-1 pr-3 text-[17px] active:opacity-60" style={{ color: 'var(--blue)' }}>
                <ChevronLeft size={24} strokeWidth={2.3} aria-hidden="true" /> Voltar
              </button>
              <div className="min-w-0 max-w-[55vw] text-center">
                <p className="truncate text-[15px] font-semibold">Mais fotos</p>
                {house && <p className="truncate text-[12px] text-[var(--fg3)]">{house.label}</p>}
              </div>
              <span />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-8">
              <p className="mx-auto mb-4 max-w-4xl text-[15px] text-[var(--fg2)]">Toque numa foto para ver grande, cortar e usar como capa.</p>
              {more.status === 'loading' && (
                <p role="status" className="mx-auto flex max-w-4xl items-center gap-2 text-[15px] text-[var(--fg2)]">
                  <LoaderCircle size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> Abrindo a pasta da casa…
                </p>
              )}
              {more.status === 'error' && <p className="mx-auto max-w-4xl text-[15px]" style={{ color: 'var(--red)' }}>Não foi possível abrir a pasta da casa agora. Volte e tente de novo.</p>}
              {more.status === 'ready' && more.photos.length === 0 && <p className="mx-auto max-w-4xl text-[15px] text-[var(--fg2)]">Não há outras fotos na pasta desta casa.</p>}
              {more.status === 'ready' && (
                <ul className="mx-auto grid max-w-4xl grid-cols-2 gap-2.5 sm:grid-cols-4">
                  {more.photos.map((photo, index) => {
                    const isCover = house?.coverDriveId === photo.driveId;
                    return (
                      <li key={photo.driveId}>
                        <button
                          type="button"
                          onClick={() => setViewer({ collectionId: more.collectionId, source: 'pasta', index })}
                          className="relative block aspect-[3/4] w-full overflow-hidden rounded-[12px] bg-[var(--tile)] transition-transform duration-150 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--blue)]"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element -- imagem do Drive pelo servidor */}
                          <img src={photo.edited?.url ?? thumb(more.collectionId, photo.driveId, 600)} alt="" loading="lazy" className="h-full w-full object-cover" />
                          {isCover && (
                            <>
                              <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[12px]" style={{ boxShadow: 'inset 0 0 0 3px var(--blue)' }} />
                              <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white" style={{ background: 'var(--blue)' }}>
                                <Check size={11} strokeWidth={3} aria-hidden="true" /> Capa escolhida
                              </span>
                            </>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        );
      })()}

      {viewer && viewerHouse && viewerPhotos[viewer.index] && (
          <ApproverPhotoViewer
            photos={viewerPhotos}
            index={viewer.index}
            onIndex={(index) => setViewer({ ...viewer, index })}
            onClose={() => {
              setViewer(null);
              setPhotoError('');
            }}
            title={viewerHouse.label}
            layerClass="z-[95]"
            toggleKind="capa"
            startCropping={viewer.source === 'casa'}
            src={(photo, size) => photo.edited?.url ?? thumb(viewerHouse.collectionId, photo.driveId, size)}
            originalSrc={(photo) => thumb(viewerHouse.collectionId, photo.driveId, 4000)}
            isFavorite={(photo) => viewerHouse.coverDriveId === photo.driveId || (!viewerHouse.coverDriveId && viewerHouse.candidates[0]?.driveId === photo.driveId)}
            onToggleFavorite={(photo) => void chooseCover(viewerHouse.collectionId, photo, viewer.source)}
            canUndo={(photo) => myCrops.has(photo.driveId)}
            onUndoCrop={(photo) => undoCrop(viewerHouse.collectionId, photo)}
            saving={photoBusy}
            onSaveCrop={(photo, file, size) => saveCrop(viewerHouse.collectionId, photo, file, size, viewer.source)}
          />
      )}

      {photoError && (viewer || more) && (
        <p role="alert" className="fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-[100] mx-auto max-w-md rounded-full px-4 py-2 text-center text-[15px] text-white shadow-lg" style={{ background: 'var(--red)' }}>
          {photoError}
        </p>
      )}
    </main>
  );
}

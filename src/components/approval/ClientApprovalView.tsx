'use client';

import Image from 'next/image';
import { useId, useState, type FormEvent } from 'react';
import { AlertTriangle, Check, LoaderCircle, PencilLine, X } from 'lucide-react';

export type ApprovalDecision = 'approved' | 'changes_requested' | 'rejected';
export type ApprovalStatus = 'pending' | ApprovalDecision;

export interface ClientApprovalVersion {
  version: number;
  mediaUrl: string;
  mediaType: 'image' | 'video';
  caption: string;
  note?: string;
  createdAt?: string;
  decision: ApprovalDecision | null;
  feedback?: string;
  respondedAt?: string;
}

export interface ClientApprovalPost {
  houseName: string;
  caption: string;
  mediaUrl: string;
  mediaType: 'image' | 'video';
  format?: string;
  scheduledDate?: string;
  scheduledTime?: string;
  approvalStatus: ApprovalStatus;
  clientFeedback?: string;
  currentVersion?: number;
  versions?: ClientApprovalVersion[];
}

interface ClientApprovalViewProps {
  post: ClientApprovalPost;
  onRespond: (decision: ApprovalDecision, feedback: string, version: number) => Promise<void>;
}

const decisions: Record<
  ApprovalDecision,
  {
    label: string;
    description: string;
    submitLabel: string;
    doneTitle: string;
    feedbackLabel: string;
    feedbackRequired: boolean;
    icon: typeof Check;
    accent: string;
    button: string;
  }
> = {
  approved: {
    label: 'Aprovar',
    description: 'O conteúdo pode ser publicado como está.',
    submitLabel: 'Aprovar conteúdo',
    doneTitle: 'Conteúdo aprovado',
    feedbackLabel: 'Comentário para a equipe (opcional)',
    feedbackRequired: false,
    icon: Check,
    accent: 'border-bh-mata text-bh-mata',
    button: 'bg-bh-mata hover:bg-bh-mata-escuro',
  },
  changes_requested: {
    label: 'Pedir ajustes',
    description: 'Algo precisa mudar antes da publicação.',
    submitLabel: 'Enviar pedido de ajustes',
    doneTitle: 'Pedido de ajustes enviado',
    feedbackLabel: 'O que precisa mudar?',
    feedbackRequired: true,
    icon: PencilLine,
    accent: 'border-bh-madeira text-bh-madeira',
    button: 'bg-bh-madeira hover:bg-bh-madeira-escuro',
  },
  rejected: {
    label: 'Reprovar',
    description: 'O conteúdo não deve ser publicado.',
    submitLabel: 'Reprovar conteúdo',
    doneTitle: 'Conteúdo reprovado',
    feedbackLabel: 'Motivo (opcional)',
    feedbackRequired: false,
    icon: X,
    accent: 'border-status-danger text-status-danger',
    button: 'bg-status-danger hover:bg-[#8a1f1f]',
  },
};

const formatLabels: Record<string, string> = {
  REEL: 'Reel',
  POST: 'Post no feed',
  STORY: 'Story',
  CARROSSEL: 'Carrossel',
};

function formatSchedule(format?: string, date?: string, time?: string) {
  const formatLabel = (format && formatLabels[format.toUpperCase()]) || 'Publicação';
  if (!date) return null;

  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;

  const dateLabel = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long' }).format(parsed);
  const hourLabel = formatHour(time);
  return `${formatLabel} previsto para ${dateLabel}${hourLabel ? `, às ${hourLabel}` : ''}`;
}

function formatHour(time?: string) {
  if (!time) return '';
  const match = time.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) return '';

  let hour = Number(match[1]);
  const minutes = match[2] ?? '00';
  const period = match[3]?.toUpperCase();
  if (period === 'PM' && hour < 12) hour += 12;
  if (period === 'AM' && hour === 12) hour = 0;

  return minutes === '00' ? `${hour}h` : `${hour}h${minutes}`;
}

function formatSentAt(value?: string) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    .format(parsed)
    .replace('.', '');
}

const isTallFormat = (format?: string) => ['REEL', 'STORY'].includes((format ?? '').toUpperCase());

export function ClientApprovalView({ post, onRespond }: ClientApprovalViewProps) {
  const [choice, setChoice] = useState<ApprovalDecision | null>(null);
  const [feedback, setFeedback] = useState(post.clientFeedback ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const feedbackId = useId();
  const errorId = useId();

  const schedule = formatSchedule(post.format, post.scheduledDate, post.scheduledTime);
  const answered = post.approvalStatus !== 'pending';
  const selected = choice ? decisions[choice] : null;

  // Versões: abre na mais nova; as anteriores ficam nas abas para comparar.
  const versions = post.versions ?? [];
  const currentVersion = post.currentVersion ?? versions.at(-1)?.version ?? 1;
  const [viewedVersion, setViewedVersion] = useState(currentVersion);
  const viewed = versions.find((v) => v.version === viewedVersion);
  const isCurrent = viewedVersion === currentVersion;
  const mediaUrl = isCurrent ? post.mediaUrl || viewed?.mediaUrl || '' : viewed?.mediaUrl || '';
  const mediaType = isCurrent ? post.mediaType : viewed?.mediaType ?? 'image';
  const caption = isCurrent ? post.caption : viewed?.caption ?? '';
  const hasVersions = versions.length > 1;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!choice || !selected) {
      setErrorMessage('Escolha uma resposta antes de enviar.');
      return;
    }
    if (selected.feedbackRequired && !feedback.trim()) {
      setErrorMessage('Descreva o que precisa mudar para a equipe poder ajustar o conteúdo.');
      return;
    }

    setSubmitting(true);
    setErrorMessage('');
    try {
      await onRespond(choice, feedback.trim(), currentVersion);
    } catch (error) {
      const message = error instanceof Error && error.message ? ` (${error.message})` : '';
      setErrorMessage(`A resposta não foi enviada${message}. Verifique sua conexão e tente de novo.`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="press-feedback min-h-dvh bg-bh-cal font-display text-bh-tinta antialiased">
      <header className="mx-auto flex max-w-6xl items-center px-5 pb-4 pt-[calc(1.25rem+env(safe-area-inset-top))] sm:px-8 lg:pb-8 lg:pt-10">
        <Image
          src="/bahia-homes-logo.png"
          alt="Bahia Homes"
          width={1834}
          height={276}
          priority
          className="h-auto w-32 mix-blend-multiply sm:w-36"
        />
      </header>

      <div className="mx-auto grid max-w-6xl gap-8 pb-[calc(2.5rem+env(safe-area-inset-bottom))] lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-14 lg:px-8">
        <section
          aria-label="Conteúdo para aprovação"
          className="flex flex-col items-center justify-center gap-4 bg-bh-azul px-5 py-6 sm:px-8 sm:py-10 lg:sticky lg:top-8 lg:self-start lg:rounded-[1.25rem] lg:py-12"
        >
          {hasVersions && (
            <div role="tablist" aria-label="Versões do conteúdo" className="flex max-w-full gap-1 overflow-x-auto rounded-full bg-bh-papel/70 p-1">
              {versions.map((v) => {
                const active = v.version === viewedVersion;
                return (
                  <button
                    key={v.version}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setViewedVersion(v.version)}
                    className={`min-h-10 shrink-0 rounded-full px-4 text-[0.95rem] transition-colors duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bh-mata ${
                      active ? 'bg-bh-tinta font-medium text-white' : 'text-bh-tinta hover:bg-bh-papel'
                    }`}
                  >
                    V{v.version}
                    {v.version === currentVersion && <span className={active ? 'text-white/75' : 'text-bh-tinta-suave'}> · atual</span>}
                  </button>
                );
              })}
            </div>
          )}

          {mediaUrl ? (
            mediaType === 'video' ? (
              <video
                key={mediaUrl}
                src={mediaUrl}
                controls
                playsInline
                preload="metadata"
                aria-label={`Vídeo da publicação de ${post.houseName}`}
                className={`block max-h-[72dvh] w-auto max-w-full rounded-lg bg-bh-tinta ${isTallFormat(post.format) ? 'aspect-[9/16]' : ''}`}
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={mediaUrl}
                src={mediaUrl}
                alt={`Imagem da publicação de ${post.houseName}`}
                className="block max-h-[72dvh] w-auto max-w-full rounded-lg object-contain"
              />
            )
          ) : (
            <p className="py-16 text-center text-[0.95rem] text-bh-tinta">
              A mídia desta publicação ainda não foi enviada.
            </p>
          )}
        </section>

        <div className="min-w-0 px-5 sm:px-8 lg:px-0 lg:pt-2">
          <h1 className="text-[2.5rem] font-light leading-[1.05] tracking-[0.005em] text-bh-tinta sm:text-[3.25rem]">
            {post.houseName}
          </h1>
          {schedule && <p className="mt-3 text-base text-bh-tinta-suave">{schedule}</p>}

          {hasVersions && !isCurrent && (
            <div className="mt-6 rounded-xl border border-bh-linha bg-bh-papel p-4">
              <p className="text-base text-bh-tinta">
                Você está vendo a <strong className="font-medium">versão {viewedVersion}</strong>. A resposta vale para a versão{' '}
                {currentVersion}, a mais recente.
              </p>
              <button
                type="button"
                onClick={() => setViewedVersion(currentVersion)}
                className="mt-3 min-h-10 rounded-lg border border-bh-linha px-4 text-[0.95rem] font-medium text-bh-tinta hover:bg-bh-cal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bh-mata"
              >
                Ver versão {currentVersion}
              </button>
            </div>
          )}

          {viewed?.note && (
            <section className="mt-8 border-t border-bh-linha pt-6">
              <h2 className="text-[0.95rem] font-medium text-bh-tinta">O que mudou na versão {viewed.version}</h2>
              <p className="mt-3 max-w-[62ch] whitespace-pre-line text-base leading-[1.65] text-bh-tinta">{viewed.note}</p>
            </section>
          )}

          {caption && (
            <section className="mt-8 border-t border-bh-linha pt-6">
              <h2 className="text-[0.95rem] font-medium text-bh-tinta">
                Legenda da publicação{hasVersions ? ` · versão ${viewedVersion}` : ''}
              </h2>
              <p className="mt-3 max-w-[62ch] whitespace-pre-line text-base leading-[1.65] text-bh-tinta">
                {caption}
              </p>
            </section>
          )}

          <section className="mt-8 border-t border-bh-linha pt-6" aria-live="polite">
            {hasVersions && (
              <p className="mb-2 text-[0.9rem] font-medium uppercase tracking-[0.08em] text-bh-tinta-suave">
                Versão {currentVersion}
              </p>
            )}
            {answered ? (
              <AnsweredState status={post.approvalStatus as ApprovalDecision} feedback={post.clientFeedback} />
            ) : (
              <form onSubmit={handleSubmit} noValidate>
                <fieldset>
                  <legend className="text-[1.375rem] font-normal text-bh-tinta">Sua resposta</legend>
                  <p className="mt-1.5 text-[0.95rem] text-bh-tinta-suave">
                    Você tem até 7 dias após o recebimento do link para responder.
                  </p>

                  <div className="mt-5 divide-y divide-bh-linha overflow-hidden rounded-xl border border-bh-linha bg-bh-papel">
                    {(Object.keys(decisions) as ApprovalDecision[]).map((key) => {
                      const option = decisions[key];
                      const Icon = option.icon;
                      const isSelected = choice === key;
                      return (
                        <label
                          key={key}
                          className={`relative flex min-h-16 cursor-pointer items-center gap-4 px-4 py-3.5 transition-colors duration-150 ease-out focus-within:bg-bh-cal/60 hover:bg-bh-cal/50 ${
                            isSelected ? 'bg-bh-cal/70' : ''
                          }`}
                        >
                          <input
                            type="radio"
                            name="decision"
                            value={key}
                            checked={isSelected}
                            onChange={() => {
                              setChoice(key);
                              setErrorMessage('');
                            }}
                            className="peer sr-only"
                          />
                          <span
                            aria-hidden="true"
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors duration-150 ease-out peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-bh-mata ${
                              isSelected ? option.accent : 'border-bh-linha text-bh-tinta-suave'
                            }`}
                          >
                            <Icon size={17} strokeWidth={2} />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-[1.0625rem] font-medium text-bh-tinta">{option.label}</span>
                            <span className="block text-[0.9rem] leading-snug text-bh-tinta-suave">{option.description}</span>
                          </span>
                          {isSelected && (
                            <span
                              aria-hidden="true"
                              className={`absolute inset-y-0 left-0 w-1 ${option.button.split(' ')[0]}`}
                            />
                          )}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>

                {selected && (
                  <div className="mt-5">
                    <label htmlFor={feedbackId} className="block text-[0.95rem] font-medium text-bh-tinta">
                      {selected.feedbackLabel}
                    </label>
                    <textarea
                      id={feedbackId}
                      value={feedback}
                      onChange={(event) => {
                        setFeedback(event.target.value);
                        setErrorMessage('');
                      }}
                      rows={4}
                      required={selected.feedbackRequired}
                      aria-invalid={Boolean(errorMessage) && selected.feedbackRequired && !feedback.trim()}
                      aria-describedby={errorMessage ? errorId : undefined}
                      placeholder={
                        choice === 'changes_requested'
                          ? 'Ex.: trocar a cena de abertura pela vista da piscina.'
                          : ''
                      }
                      className="mt-2 w-full resize-y rounded-xl border border-bh-linha bg-bh-papel p-3.5 text-base leading-relaxed text-bh-tinta placeholder:text-bh-tinta-suave/80 focus-visible:border-bh-mata focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-bh-mata"
                    />
                  </div>
                )}

                {errorMessage && (
                  <p id={errorId} role="alert" className="mt-4 flex items-start gap-2 text-[0.95rem] text-status-danger">
                    <AlertTriangle aria-hidden="true" size={18} className="mt-0.5 shrink-0" />
                    {errorMessage}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className={`mt-5 flex min-h-13 w-full items-center justify-center gap-2 rounded-xl px-5 text-base font-medium text-white transition-colors duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bh-mata disabled:cursor-wait disabled:opacity-80 ${
                    selected ? selected.button : 'bg-bh-tinta/85 hover:bg-bh-tinta'
                  }`}
                >
                  {submitting && <LoaderCircle aria-hidden="true" size={18} className="animate-spin motion-reduce:animate-none" />}
                  {submitting ? 'Enviando resposta…' : selected ? selected.submitLabel : 'Enviar resposta'}
                </button>
              </form>
            )}
          </section>

          {hasVersions && <VersionHistory versions={versions} currentVersion={currentVersion} onView={setViewedVersion} />}
        </div>
      </div>
    </main>
  );
}

function AnsweredState({ status, feedback }: { status: ApprovalDecision; feedback?: string }) {
  const option = decisions[status] ?? decisions.approved;
  const Icon = option.icon;

  return (
    <div className="answer-enter">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-[1.5px] ${option.accent}`}
        >
          <Icon size={20} strokeWidth={2} />
        </span>
        <h2 className="text-[1.75rem] font-light leading-tight text-bh-tinta">{option.doneTitle}</h2>
      </div>
      <p className="mt-3 text-base text-bh-tinta-suave">
        Sua resposta foi registrada e a equipe Bahia Homes já pode vê-la.
      </p>
      {feedback && (
        <blockquote className="mt-5 border-l-2 border-bh-linha pl-4 text-base leading-[1.65] text-bh-tinta">
          {feedback}
        </blockquote>
      )}
    </div>
  );
}

function VersionHistory({
  versions,
  currentVersion,
  onView,
}: {
  versions: ClientApprovalVersion[];
  currentVersion: number;
  onView: (version: number) => void;
}) {
  return (
    <section className="mt-10 border-t border-bh-linha pt-6">
      <h2 className="text-[1.375rem] font-normal text-bh-tinta">Histórico</h2>
      <ol className="mt-4 space-y-5">
        {[...versions].reverse().map((v) => {
          const option = v.decision ? decisions[v.decision] : null;
          const Icon = option?.icon;
          const sentAt = formatSentAt(v.createdAt);
          return (
            <li key={v.version} className="border-l-2 border-bh-linha pl-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <button
                  type="button"
                  onClick={() => onView(v.version)}
                  className="text-left text-[1.0625rem] font-medium text-bh-tinta underline decoration-bh-linha underline-offset-4 hover:decoration-bh-tinta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bh-mata"
                >
                  Versão {v.version}
                </button>
                {sentAt && <span className="text-[0.9rem] text-bh-tinta-suave">enviada em {sentAt}</span>}
              </div>
              {option && Icon ? (
                <p className={`mt-1.5 flex items-center gap-1.5 text-[0.95rem] font-medium ${option.accent.split(' ').find((c) => c.startsWith('text-'))}`}>
                  <Icon aria-hidden="true" size={15} strokeWidth={2} />
                  {option.doneTitle}
                </p>
              ) : (
                <p className="mt-1.5 text-[0.95rem] text-bh-tinta-suave">
                  {v.version === currentVersion ? 'Aguardando sua resposta' : 'Sem resposta'}
                </p>
              )}
              {v.feedback && (
                <p className="mt-2 whitespace-pre-line text-base leading-[1.6] text-bh-tinta">“{v.feedback}”</p>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

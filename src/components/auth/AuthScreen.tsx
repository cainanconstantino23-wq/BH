'use client';

import Image from 'next/image';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, Eye, EyeOff, TriangleAlert } from 'lucide-react';

type AuthMode = 'signin' | 'signup';

function getAuthErrorMessage(message: string, mode: AuthMode) {
  const normalizedMessage = message.toLowerCase();

  if (normalizedMessage.includes('invalid login credentials')) {
    return 'E-mail ou senha incorretos. Confira os dados e tente novamente.';
  }
  if (normalizedMessage.includes('email not confirmed')) {
    return 'Confirme seu e-mail pelo link enviado antes de entrar.';
  }
  if (normalizedMessage.includes('password should be at least')) {
    return 'A senha é curta demais. Use uma senha mais longa.';
  }
  if (normalizedMessage.includes('user already registered')) {
    return 'Este e-mail já possui uma conta. Entre com sua senha.';
  }

  return mode === 'signup'
    ? 'Não foi possível criar sua conta agora. Tente novamente.'
    : 'Não foi possível entrar agora. Confira seus dados e tente novamente.';
}

export function AuthScreen({ callbackNotice: initialCallbackNotice }: { callbackNotice?: string | null }) {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [callbackNotice] = useState(initialCallbackNotice ?? null);
  const [formError, setFormError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    let isActive = true;
    const url = new URL(window.location.href);
    url.searchParams.delete('meta');
    url.searchParams.delete('error');
    url.searchParams.delete('reason');
    if (url.hash === '#_=_') url.hash = '';
    const cleanPath = `${url.pathname}${url.search}${url.hash}`;
    if (cleanPath !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      router.replace(cleanPath, { scroll: false });
    }

    const restoreSession = async () => {
      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error && error.name !== 'AuthSessionMissingError') {
          console.error('Não foi possível restaurar a sessão na tela de login:', error);
        }
        if (isActive && user) {
          router.replace('/');
        }
      } catch (error) {
        console.error('Falha ao verificar a sessão na tela de login:', error);
      } finally {
        if (isActive) setIsCheckingSession(false);
      }
    };

    void restoreSession();
    return () => {
      isActive = false;
    };
  }, [router, supabase]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setFormError(null);
    setSuccessNotice(null);

    try {
      const normalizedEmail = email.trim().toLowerCase();
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            emailRedirectTo: new URL('/', window.location.origin).toString(),
          },
        });

        if (error) {
          console.error('Falha ao criar conta Supabase:', error);
          setFormError(getAuthErrorMessage(error.message, mode));
          return;
        }

        if (data.session) {
          router.replace('/');
          router.refresh();
          return;
        }

        setSuccessNotice('Conta criada. Verifique seu e-mail para confirmar o cadastro antes de entrar.');
        setMode('signin');
        setPassword('');
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error) {
        console.error('Falha ao entrar com Supabase:', error);
        setFormError(getAuthErrorMessage(error.message, mode));
        return;
      }

      router.replace('/');
      router.refresh();
    } catch (error) {
      console.error('Erro inesperado durante a autenticação:', error);
      setFormError('Não foi possível concluir a autenticação. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleModeChange = () => {
    setMode((currentMode) => (currentMode === 'signin' ? 'signup' : 'signin'));
    setFormError(null);
    setSuccessNotice(null);
  };

  if (isCheckingSession) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-canvas p-6 text-sm text-ink-muted">
        <p role="status">Verificando sua sessão…</p>
      </main>
    );
  }

  return (
    <main className="press-feedback relative flex min-h-dvh flex-col items-center justify-center overflow-y-auto bg-[#241f1b] p-4 py-8">
      <Image
        src="/login-background.jpg"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover object-center"
      />
      <div aria-hidden="true" className="absolute inset-0 bg-[#181612]/35" />

      <div className="relative z-10 flex w-full flex-col items-center">
        <div className="mb-8 rounded-control bg-white/95 px-5 py-3">
          <Image
            src="/bahia-homes-logo.png"
            alt="Bahia Homes"
            width={1834}
            height={276}
            className="h-auto w-56 sm:w-64"
          />
        </div>

        <section
          aria-labelledby="login-title"
          className="w-full max-w-md rounded-panel border border-white/60 bg-surface/95 p-6 backdrop-blur-sm sm:p-8"
        >
          {callbackNotice && (
            <p role="status" className="mb-5 flex items-start gap-2 rounded-control border border-status-warning-border bg-status-warning-soft p-3 text-sm text-status-warning">
              <TriangleAlert aria-hidden="true" size={17} className="mt-0.5 shrink-0" />
              {callbackNotice}
            </p>
          )}

          <h1 id="login-title" className="text-2xl font-bold tracking-tight text-ink">
            {mode === 'signin' ? 'Acesse sua conta' : 'Crie sua conta'}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            {mode === 'signin'
              ? 'Entre para acessar o painel e conectar sua conta do Meta Ads.'
              : 'Cadastre seu e-mail para começar a usar o Bahia Homes Analytics.'}
          </p>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-1.5">
              <label htmlFor="auth-email" className="block text-sm font-medium text-ink">
                E-mail
              </label>
              <input
                id="auth-email"
                name="email"
                type="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="min-h-12 w-full rounded-control border border-border bg-white px-3 text-base text-ink outline-none transition-colors duration-150 placeholder:text-ink-muted/70 focus:border-brand-plum focus:ring-2 focus:ring-brand-plum/20"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="auth-password" className="block text-sm font-medium text-ink">
                Senha
              </label>
              <div className="relative">
                <input
                  id="auth-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  minLength={6}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="min-h-12 w-full rounded-control border border-border bg-white px-3 pr-12 text-base text-ink outline-none transition-colors duration-150 placeholder:text-ink-muted/70 focus:border-brand-plum focus:ring-2 focus:ring-brand-plum/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((isVisible) => !isVisible)}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  aria-pressed={showPassword}
                  className="absolute inset-y-0 right-0 flex min-h-11 min-w-11 items-center justify-center rounded-r-control text-ink-muted transition-colors hover:text-brand-plum focus-visible:outline-2 focus-visible:outline-brand-plum"
                >
                  {showPassword
                    ? <EyeOff aria-hidden="true" size={18} />
                    : <Eye aria-hidden="true" size={18} />}
                </button>
              </div>
            </div>

            {formError && (
              <p role="alert" className="rounded-control border border-status-danger-border bg-status-danger-soft p-3 text-sm text-status-danger">
                {formError}
              </p>
            )}
            {successNotice && (
              <p role="status" className="rounded-control border border-status-success-border bg-status-success-soft p-3 text-sm text-status-success">
                {successNotice}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-control bg-brand-plum px-4 py-3 text-sm font-semibold text-white transition-colors duration-150 ease-out hover:bg-brand-plum-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum active:scale-[0.99] disabled:cursor-wait disabled:opacity-60"
            >
              {isSubmitting
                ? (mode === 'signin' ? 'Entrando…' : 'Criando conta…')
                : (mode === 'signin' ? 'Entrar' : 'Criar conta')}
              {!isSubmitting && <ArrowRight aria-hidden="true" size={16} />}
            </button>
          </form>

          <p className="mt-6 border-t border-border pt-5 text-center text-sm text-ink-muted">
            {mode === 'signin' ? 'Ainda não tem uma conta?' : 'Já tem uma conta?'}
            {' '}
            <button
              type="button"
              onClick={handleModeChange}
              className="min-h-11 px-1 font-semibold text-brand-plum transition-colors hover:text-brand-plum-hover focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum"
            >
              {mode === 'signin' ? 'Criar conta' : 'Entrar'}
            </button>
          </p>
        </section>
      </div>
    </main>
  );
}
import { AuthScreen } from '@/components/auth/AuthScreen';

type LoginPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const error = firstValue(params.error);
  const reason = firstValue(params.reason);
  const meta = firstValue(params.meta);
  const callbackNotice =
    error === 'meta_auth_required' ||
    reason === 'authentication_required' ||
    reason === 'user_validation_failed'
      ? 'Entre na sua conta para conectar o Meta Ads.'
      : meta === 'connected'
        ? 'A conexão com o Meta foi concluída. Entre na sua conta para acessar o painel.'
        : meta === 'error' || error
          ? 'Não foi possível concluir a conexão com o Meta Ads. Entre na sua conta e tente novamente.'
          : null;

  return <AuthScreen callbackNotice={callbackNotice} />;
}

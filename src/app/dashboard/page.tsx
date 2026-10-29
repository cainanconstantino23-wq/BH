import { ConnectMetaButton } from '@/components/ConnectMetaButton';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ meta?: string; token?: string }>;
}) {
  const params = await searchParams;
  const isConnected = params.meta === 'connected';

  return (
    <div className="p-8">
      <h1 className="mb-4 text-2xl font-bold">Integração com Meta Ads</h1>

      {isConnected ? (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-800">
          <p className="font-medium">✅ Meta Ads conectado com sucesso!</p>
          {params.token && (
            <p className="mt-1 text-xs text-green-600 truncate max-w-xl">
              Token de acesso obtido: {params.token}
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 p-6 bg-white shadow-sm">
          <p className="mb-4 text-gray-600">
            Conecte a conta do Meta Ads para visualizar as métricas de anúncios dos seus clientes.
          </p>
          <ConnectMetaButton />
        </div>
      )}
    </div>
  );
}
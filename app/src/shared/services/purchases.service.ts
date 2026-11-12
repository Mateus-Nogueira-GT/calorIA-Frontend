import api from './api';

/** Recarga de créditos pelo Asaas (spec 2026-11-12). */

export interface CreditPackage {
  code: string;
  name: string;
  credits: number;
  price_cents: number;
}

export type PurchaseStatus = 'pending' | 'paid' | 'refunded' | 'canceled' | 'expired';

export interface Purchase {
  id: string;
  status: PurchaseStatus;
  credits: number;
  price_cents: number;
  invoice_url: string | null;
}

export interface CheckoutResult {
  purchase_id: string;
  status: 'pending';
  invoice_url: string | null;
}

export const purchasesService = {
  packages: () =>
    api
      .get<{ packages: CreditPackage[] }>('/credit-purchases/packages')
      .then((r) => r.data.packages),
  hasCustomer: () =>
    api
      .get<{ has_customer: boolean }>('/credit-purchases/customer')
      .then((r) => r.data.has_customer),
  checkout: (body: { package_code: string; cpf_cnpj?: string; name?: string }) =>
    api.post<CheckoutResult>('/credit-purchases/checkout', body).then((r) => r.data),
  get: (id: string) =>
    api.get<Purchase>(`/credit-purchases/${encodeURIComponent(id)}`).then((r) => r.data),
};

export function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Só dígitos, com máscara de CPF (11) ou CNPJ (14) enquanto digita. */
export function maskCpfCnpj(input: string): string {
  const d = input.replace(/\D/g, '').slice(0, 14);
  if (d.length <= 11)
    return d
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1-$2');
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

export function purchaseErrorMessage(error: unknown): string {
  const status = (error as { response?: { status?: number } })?.response?.status;
  const code = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
  switch (code) {
    case 'INVALID_DOCUMENT':
      return 'Confira o CPF ou CNPJ informado.';
    case 'DOCUMENT_REQUIRED':
      return 'Informe seu nome e CPF para a primeira compra.';
    case 'PACKAGE_NOT_FOUND':
      return 'Este pacote não está mais disponível. Escolha outro.';
    case 'CHECKOUT_IN_PROGRESS':
      return 'Sua compra já está sendo criada. Aguarde um instante.';
    case 'PAYMENTS_UNAVAILABLE':
    case 'PAYMENT_PROVIDER_ERROR':
      return 'O pagamento está indisponível no momento. Tente novamente em instantes.';
    default:
      return status === 404
        ? 'A compra de créditos ainda não está disponível.'
        : 'Não foi possível concluir. Verifique sua conexão e tente novamente.';
  }
}

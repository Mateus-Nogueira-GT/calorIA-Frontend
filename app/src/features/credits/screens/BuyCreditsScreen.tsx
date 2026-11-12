import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Input, Text, screenShellStyle } from '@shared/components';
import { notifyCreditChange } from '@shared/services/credits.service';
import {
  CreditPackage,
  formatBRL,
  maskCpfCnpj,
  purchaseErrorMessage,
  purchasesService,
} from '@shared/services/purchases.service';
import { colors, radius, spacing } from '@theme';

/** Conferência da compra depois de abrir a fatura: a cada 5 s, por até 2 min. */
export const POLL_INTERVAL_MS = 5000;
export const POLL_MAX_TRIES = 24;

const labels = {
  openInvoice: 'Abrir pagamento',
  alreadyPaid: 'Já paguei',
  otherPackage: 'Escolher outro pacote',
  retry: 'Tentar novamente',
} as const;

type Phase = 'choose' | 'document' | 'waiting' | 'paid';

export function BuyCreditsScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const [packages, setPackages] = useState<CreditPackage[] | null>(null);
  const [needsDocument, setNeedsDocument] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<CreditPackage | null>(null);
  const [phase, setPhase] = useState<Phase>('choose');
  const [name, setName] = useState('');
  const [document, setDocument] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [purchase, setPurchase] = useState<{ id: string; invoiceUrl: string | null } | null>(null);
  const tries = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [list, hasCustomer] = await Promise.all([
        purchasesService.packages(),
        purchasesService.hasCustomer(),
      ]);
      if (!mounted.current) return;
      setPackages(list);
      setNeedsDocument(!hasCustomer);
    } catch (e) {
      if (mounted.current) setLoadError(purchaseErrorMessage(e));
    }
  }, []);

  const stopPolling = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const check = useCallback(async (id: string) => {
    try {
      const p = await purchasesService.get(id);
      if (!mounted.current) return;
      if (p.status === 'paid') {
        stopPolling();
        setPhase('paid');
        notifyCreditChange();
        return;
      }
      if (p.status !== 'pending') {
        stopPolling();
        setPhase('choose');
        setError('O pagamento não foi concluído. Você pode tentar de novo.');
        return;
      }
    } catch {
      /* Rede instável: tenta de novo no próximo ciclo. */
    }
    tries.current += 1;
    if (mounted.current && tries.current < POLL_MAX_TRIES)
      timer.current = setTimeout(() => void check(id), POLL_INTERVAL_MS);
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      stopPolling();
    };
  }, [load]);

  // Voltou do navegador: confere na hora, sem esperar o próximo ciclo.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && purchase && phase === 'waiting') {
        stopPolling();
        tries.current = 0;
        void check(purchase.id);
      }
    });
    return () => sub.remove();
  }, [purchase, phase, check]);

  const openInvoice = async (url: string | null) => {
    if (!url) {
      setError('A fatura ainda não ficou pronta. Toque em "Abrir pagamento" em instantes.');
      return;
    }
    try {
      await Linking.openURL(url);
    } catch {
      setError('Não foi possível abrir o pagamento. Tente novamente.');
    }
  };

  const buy = async (pkg: CreditPackage) => {
    setError(null);
    setSelected(pkg);
    if (needsDocument && phase !== 'document') {
      setPhase('document');
      return;
    }
    setBusy(true);
    try {
      const r = await purchasesService.checkout({
        package_code: pkg.code,
        ...(needsDocument ? { cpf_cnpj: document, name: name.trim() } : {}),
      });
      if (!mounted.current) return;
      setNeedsDocument(false);
      setPurchase({ id: r.purchase_id, invoiceUrl: r.invoice_url });
      setPhase('waiting');
      tries.current = 0;
      stopPolling();
      timer.current = setTimeout(() => void check(r.purchase_id), POLL_INTERVAL_MS);
      await openInvoice(r.invoice_url);
    } catch (e) {
      if (mounted.current) setError(purchaseErrorMessage(e));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const payLabel = selected ? `Pagar ${formatBRL(selected.price_cents)}` : '';
  const documentDigits = document.replace(/\D/g, '');
  const documentReady =
    name.trim().length >= 2 && (documentDigits.length === 11 || documentDigits.length === 14);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
      keyboardShouldPersistTaps="handled"
    >
      {phase === 'paid' && selected ? (
        <View style={styles.block} accessibilityLiveRegion="polite">
          <Text variant="heading2">Pronto!</Text>
          <Text>{selected.credits} créditos foram adicionados ao seu saldo.</Text>
        </View>
      ) : null}

      {phase === 'waiting' && selected ? (
        <View style={styles.block} accessibilityLiveRegion="polite">
          <Text variant="heading3">Aguardando o pagamento</Text>
          <Text>
            Pague a fatura de {formatBRL(selected.price_cents)} com Pix, cartão ou boleto. Assim que
            o pagamento for confirmado, os {selected.credits} créditos entram no seu saldo.
          </Text>
          <Button onPress={() => void openInvoice(purchase?.invoiceUrl ?? null)}>
            {labels.openInvoice}
          </Button>
          <Button
            variant="secondary"
            onPress={() => {
              if (!purchase) return;
              stopPolling();
              tries.current = 0;
              void check(purchase.id);
            }}
          >
            {labels.alreadyPaid}
          </Button>
        </View>
      ) : null}

      {phase === 'document' && selected ? (
        <View style={styles.block}>
          <Text variant="heading3">Seus dados para a cobrança</Text>
          <Text>
            Pedimos só na primeira compra. O CPF vai direto para o Asaas, que processa o pagamento,
            e não fica guardado no CalorIA.
          </Text>
          <Input label="Nome completo" value={name} onChangeText={setName} autoComplete="name" />
          <Input
            label="CPF ou CNPJ"
            value={document}
            onChangeText={(t) => setDocument(maskCpfCnpj(t))}
            keyboardType="number-pad"
          />
          <Button loading={busy} disabled={!documentReady} onPress={() => void buy(selected)}>
            {payLabel}
          </Button>
          <Button variant="ghost" onPress={() => setPhase('choose')}>
            {labels.otherPackage}
          </Button>
        </View>
      ) : null}

      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}

      {loadError ? (
        <>
          <Text accessibilityRole="alert">{loadError}</Text>
          <Button onPress={() => void load()}>{labels.retry}</Button>
        </>
      ) : null}

      {phase === 'choose' || phase === 'paid' ? (
        <>
          <Text variant="heading3">Escolha um pacote</Text>
          {packages === null && !loadError ? <Text>Carregando pacotes…</Text> : null}
          {packages?.length === 0 ? <Text>Nenhum pacote disponível no momento.</Text> : null}
          {packages?.map((pkg) => (
            <Pressable
              key={pkg.code}
              accessibilityRole="button"
              accessibilityLabel={`${pkg.credits} créditos por ${formatBRL(pkg.price_cents)}`}
              disabled={busy}
              onPress={() => void buy(pkg)}
              style={({ pressed }) => [styles.package, pressed && styles.pressed]}
            >
              <View style={styles.packageText}>
                <Text variant="heading3">{pkg.credits} créditos</Text>
                <Text color={colors.brandTextMuted}>
                  {formatBRL(Math.round(pkg.price_cents / pkg.credits))} por crédito
                </Text>
              </View>
              <Text variant="heading3">{formatBRL(pkg.price_cents)}</Text>
            </Pressable>
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.brandBackground },
  content: { ...screenShellStyle, padding: spacing.lg, gap: spacing.lg },
  block: { gap: spacing.md },
  error: { color: colors.brandPrimaryText },
  package: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.brandDivider,
    borderRadius: radius.md,
    backgroundColor: colors.brandSurface,
    gap: spacing.md,
  },
  packageText: { flex: 1, gap: spacing.xs },
  pressed: { opacity: 0.7 },
});

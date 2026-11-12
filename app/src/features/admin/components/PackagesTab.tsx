import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Input, Text } from '@shared/components';
import { AdminCreditPackage, adminService } from '@shared/services/admin.service';
import { formatBRL } from '@shared/services/purchases.service';
import { colors, radius, spacing } from '@theme';

const labels = { create: 'Criar pacote', savePrice: 'Salvar preço' } as const;

/** "60" / "60,50" / "R$ 1.234,56" → centavos; inválido → null. */
export function parsePriceToCents(input: string): number | null {
  const clean = input.replace(/[R$\s.]/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
}

function errorText(e: unknown): string {
  const code = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
  if (code === 'PACKAGE_CODE_TAKEN') return 'Já existe um pacote com essa quantidade de créditos.';
  if (code === 'VALIDATION_ERROR' || code === 'INVALID_PACKAGE')
    return 'Confira os valores: preço mínimo de R$ 5,00 e de 1 a 100.000 créditos.';
  return 'Não foi possível salvar. Tente novamente.';
}

/** Pacotes de recarga: preço e créditos editáveis sem deploy (spec 2026-11-12). */
export function PackagesTab(): React.JSX.Element {
  const [items, setItems] = useState<AdminCreditPackage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [credits, setCredits] = useState('');
  const [price, setPrice] = useState('');
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await adminService.creditPackages());
      setError(null);
    } catch {
      setError('Não foi possível carregar os pacotes.');
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const qty = Number.parseInt(credits, 10);
  const cents = parsePriceToCents(price);
  const canCreate = Number.isInteger(qty) && qty > 0 && cents !== null && cents >= 500;

  return (
    <View style={styles.wrap}>
      <Text variant="heading3">Novo pacote</Text>
      <Input
        label="Créditos"
        value={credits}
        onChangeText={(t) => setCredits(t.replace(/\D/g, ''))}
        keyboardType="number-pad"
      />
      <Input label="Preço (R$)" value={price} onChangeText={setPrice} keyboardType="decimal-pad" />
      {canCreate && cents !== null ? (
        <Text color={colors.brandTextMuted}>{formatBRL(Math.round(cents / qty))} por crédito</Text>
      ) : null}
      <Button
        disabled={!canCreate}
        loading={busy}
        onPress={async () => {
          if (cents === null) return;
          const ok = await run(() =>
            adminService.createCreditPackage({
              code: `pacote-${qty}`,
              name: `${qty} créditos`,
              credits: qty,
              price_cents: cents,
            }),
          );
          if (ok) {
            setCredits('');
            setPrice('');
          }
        }}
      >
        {labels.create}
      </Button>

      {error ? <Text accessibilityRole="alert">{error}</Text> : null}

      <Text variant="heading3">Pacotes</Text>
      {items === null && !error ? <Text>Carregando…</Text> : null}
      {items?.length === 0 ? <Text>Nenhum pacote cadastrado.</Text> : null}
      {items?.map((pkg) => {
        const draft = prices[pkg.id] ?? '';
        const draftCents = parsePriceToCents(draft);
        return (
          <View key={pkg.id} style={[styles.card, !pkg.active && styles.inactive]}>
            <Text variant="heading3">
              {pkg.credits} créditos · {formatBRL(pkg.price_cents)}
            </Text>
            <Text color={colors.brandTextMuted}>
              {formatBRL(Math.round(pkg.price_cents / pkg.credits))} por crédito ·{' '}
              {pkg.active ? 'à venda' : 'fora de venda'}
            </Text>
            <Input
              label="Novo preço (R$)"
              value={draft}
              onChangeText={(t) => setPrices((p) => ({ ...p, [pkg.id]: t }))}
              keyboardType="decimal-pad"
            />
            <View style={styles.row}>
              <Button
                variant="secondary"
                disabled={busy || draftCents === null || draftCents < 500}
                onPress={async () => {
                  if (draftCents === null) return;
                  const ok = await run(() =>
                    adminService.updateCreditPackage(pkg.id, { price_cents: draftCents }),
                  );
                  if (ok) setPrices((p) => ({ ...p, [pkg.id]: '' }));
                }}
              >
                {labels.savePrice}
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onPress={() =>
                  void run(() => adminService.updateCreditPackage(pkg.id, { active: !pkg.active }))
                }
              >
                {pkg.active ? 'Tirar de venda' : 'Pôr à venda'}
              </Button>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  card: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.brandDivider,
    backgroundColor: colors.brandSurface,
  },
  inactive: { opacity: 0.6 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});

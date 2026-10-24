import React, { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import { Button, Input, Text, screenShellStyle } from '@shared/components';
import { adminService, AdminUserRow } from '@shared/services/admin.service';
import { newOperationKey } from '@shared/services/credits.service';
import { colors, radius, spacing } from '@theme';

const PRESETS = [15, 50, 100];
const MAX_CREDITS = 1000;
const AMOUNT_ERROR = 'Informe de 1 a 1.000 créditos';
const CONFLICT_MESSAGE =
  'Esta liberação já foi registrada com outros dados. Feche e tente de novo.';
const GENERIC_MESSAGE = 'Não foi possível liberar os créditos. Tente novamente.';
const UNLIMITED_MESSAGE = 'Não foi possível alterar o acesso ilimitado. Tente novamente.';

interface Props {
  user: AdminUserRow;
  onClose: () => void;
  /** Valores novos da conta, para a linha da lista refletir sem recarregar. */
  onUpdated: (patch: Partial<Pick<AdminUserRow, 'balance_units' | 'unlimited'>>) => void;
}

/**
 * Montado a cada abertura: a Idempotency-Key nasce junto e é reaproveitada em
 * toques repetidos e novas tentativas, então o backend credita uma única vez.
 */
export function UserCreditsSheet({ user, onClose, onUpdated }: Props): React.JSX.Element {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [amountError, setAmountError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [unlimited, setUnlimited] = useState(user.unlimited);
  const key = useRef<string | null>(null);
  const busy = useRef(false);

  async function confirm(): Promise<void> {
    if (busy.current) return;
    const credits = Number(amount);
    if (!/^\d+$/.test(amount.trim()) || credits < 1 || credits > MAX_CREDITS) {
      setAmountError(AMOUNT_ERROR);
      return;
    }
    setAmountError(null);
    setError(null);
    busy.current = true;
    setSaving(true);
    key.current ??= newOperationKey();
    try {
      const result = await adminService.grantCredits(
        user.id,
        credits,
        note.trim() || undefined,
        key.current,
      );
      // A linha da lista mostra o disponível (saldo - reservado), não o saldo total.
      onUpdated({ balance_units: result.available_units, unlimited: result.unlimited });
      onClose();
    } catch (e) {
      const code = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(code === 'IDEMPOTENCY_CONFLICT' ? CONFLICT_MESSAGE : GENERIC_MESSAGE);
      busy.current = false;
      setSaving(false);
    }
  }

  async function toggleUnlimited(next: boolean): Promise<void> {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setError(null);
    try {
      const result = await adminService.setUnlimited(user.id, next);
      setUnlimited(result.unlimited);
      onUpdated({ unlimited: result.unlimited });
    } catch {
      setError(UNLIMITED_MESSAGE);
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.sheet}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            <View style={styles.header}>
              <View style={styles.title}>
                <Text variant="heading3">Liberar créditos</Text>
                <Text variant="caption">{user.name || user.email || 'Sem nome'}</Text>
              </View>
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Fechar"
                style={styles.close}
              >
                <Text>✕</Text>
              </Pressable>
            </View>
            <View style={styles.presets}>
              {PRESETS.map((value) => (
                <Pressable
                  key={value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: amount === String(value) }}
                  onPress={() => {
                    setAmount(String(value));
                    setAmountError(null);
                  }}
                  style={[styles.preset, amount === String(value) && styles.presetSelected]}
                >
                  <Text style={amount === String(value) ? styles.presetTextSelected : undefined}>
                    {String(value)}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Input
              label="Quantidade de créditos"
              value={amount}
              onChangeText={(text) => {
                setAmount(text);
                setAmountError(null);
              }}
              keyboardType="number-pad"
              error={amountError ?? undefined}
            />
            <Input
              label="Observação (opcional)"
              value={note}
              onChangeText={setNote}
              maxLength={100}
            />
            {error && <Text accessibilityRole="alert">{error}</Text>}
            <Button loading={saving} disabled={saving} onPress={() => void confirm()}>
              Confirmar liberação
            </Button>
            <View style={styles.switchRow}>
              <Text variant="label">Acesso ilimitado</Text>
              <Switch
                value={unlimited}
                onValueChange={(next) => void toggleUnlimited(next)}
                accessibilityLabel="Acesso ilimitado"
              />
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    ...screenShellStyle,
    backgroundColor: colors.brandBackground,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
  },
  content: { padding: spacing.xl, paddingBottom: 40, gap: spacing.md },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { flex: 1, gap: spacing.xs },
  close: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  presets: { flexDirection: 'row', gap: spacing.sm },
  preset: {
    minHeight: 48,
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.brandDivider,
    backgroundColor: colors.brandSurface,
  },
  presetSelected: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  presetTextSelected: { color: colors.brandBackground },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 48,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.brandDivider,
  },
});

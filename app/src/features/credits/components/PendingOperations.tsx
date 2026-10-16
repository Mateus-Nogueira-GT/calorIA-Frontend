import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/types';
import { Button, Text } from '@shared/components';
import { creditsService, CreditOperation } from '@shared/services/credits.service';
import {
  pendingRequests,
  finishRequest,
  PendingRequest,
} from '@shared/services/operation-requests';
import { useAuthStore } from '@features/auth/store';
import { useScannerStore } from '@features/scanner/store';
import { useCoachStore } from '@features/coach/store';
import type { ScanItem } from '@shared/services/scanner.service';

export function PendingOperations(): React.JSX.Element | null {
  const userId = useAuthStore((s) => s.user?.id);
  const [pending, setPending] = useState<PendingRequest[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  useEffect(() => {
    let active = true;
    setPending([]);
    setStatus(null);
    setBusy(false);
    if (userId)
      void pendingRequests(userId)
        .then((requests) => {
          if (active) setPending(requests);
        })
        .catch(() => {
          if (active) setStatus('Não foi possível ler suas solicitações pendentes.');
        });
    return () => {
      active = false;
    };
  }, [userId]);
  async function recover(request: PendingRequest) {
    if (!userId || busy) return;
    const generation = useAuthStore.getState().sessionGeneration;
    setBusy(true);
    setStatus(null);
    try {
      const operation: CreditOperation = await creditsService.operation(request.key);
      if (generation !== useAuthStore.getState().sessionGeneration) return;
      if (operation.state === 'failed') {
        await finishRequest(request, userId);
        if (generation !== useAuthStore.getState().sessionGeneration) return;
        setPending((old) => old.filter((r) => r.key !== request.key));
        setStatus(
          'Esta tentativa terminou sem cobrança. Você pode iniciar outra no scanner ou no coach.',
        );
      } else if (operation.state === 'succeeded') {
        const result = operation.result as
          { items?: ScanItem[]; conversation_id?: string } | undefined;
        if (request.type === 'photo' && Array.isArray(result?.items)) {
          useScannerStore.setState({ items: result.items, isAnalyzing: false, error: null });
          await finishRequest(request, userId);
          if (generation !== useAuthStore.getState().sessionGeneration) return;
          navigation.navigate('Scanner', { screen: 'ScanResult' });
        } else if (request.type === 'chat' && result?.conversation_id) {
          useCoachStore.setState({ conversationId: result.conversation_id });
          await useCoachStore.getState().loadHistory();
          if (generation !== useAuthStore.getState().sessionGeneration) return;
          await finishRequest(request, userId);
          setStatus('Resposta recuperada. Ela está disponível na conversa do Coach.');
          setPending((old) => old.filter((r) => r.key !== request.key));
        } else
          setStatus('A operação foi concluída. Consulte seu histórico para acessar o resultado.');
      } else
        setStatus(
          'Ainda em processamento. Consulte novamente em instantes; nenhuma nova análise foi iniciada.',
        );
    } catch (e) {
      if (generation !== useAuthStore.getState().sessionGeneration) return;
      const statusCode = (e as { response?: { status?: number } }).response?.status;
      setStatus(
        statusCode === 404
          ? 'Ainda não localizamos esta tentativa. Retorne à solicitação original para tentar novamente com a mesma chave.'
          : 'Não foi possível recuperar agora. Sua tentativa foi preservada.',
      );
    } finally {
      if (generation === useAuthStore.getState().sessionGeneration) setBusy(false);
    }
  }
  if (!pending.length && !status) return null;
  return (
    <View>
      <Text variant="heading3">Solicitações pendentes</Text>
      {pending.map((request) => (
        <Button
          key={request.key}
          variant="secondary"
          disabled={busy}
          onPress={() => recover(request)}
        >
          {request.type === 'photo' ? 'Recuperar análise da foto' : 'Recuperar resposta do coach'}
        </Button>
      ))}
      {status && <Text accessibilityLiveRegion="polite">{status}</Text>}
    </View>
  );
}

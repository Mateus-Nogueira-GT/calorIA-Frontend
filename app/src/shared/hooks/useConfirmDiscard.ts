import { useEffect } from 'react';
import { Alert } from 'react-native';
import type { EventArg, NavigationProp } from '@react-navigation/native';

type BeforeRemoveEvent = EventArg<'beforeRemove', true, { action: Readonly<{ type: string }> }>;

interface Options {
  /** Só pergunta quando há algo digitado que seria perdido. */
  hasUnsavedChanges: boolean;
  navigation: Pick<NavigationProp<Record<string, object | undefined>>, 'addListener' | 'dispatch'>;
  message?: string;
}

/**
 * N4: o app não tratava o botão voltar do Android em lugar nenhum
 * (`grep BackHandler src` voltava vazio). Nos formulários isso significava
 * perder o que já tinha sido digitado, sem aviso.
 *
 * `beforeRemove` cobre os TRÊS caminhos de saída numa implementação só —
 * botão físico/gestual do Android, swipe de voltar do iOS e a seta do header —
 * enquanto um BackHandler cru pegaria só o primeiro. É a API estável do
 * react-navigation 6 (o `usePreventRemove` só saiu de UNSTABLE_ na v7).
 */
export function useConfirmDiscard({
  hasUnsavedChanges,
  navigation,
  message = 'Você tem alterações não salvas. Quer descartar?',
}: Options): void {
  useEffect(() => {
    if (!hasUnsavedChanges) return;

    const unsubscribe = navigation.addListener('beforeRemove', (e: BeforeRemoveEvent) => {
      e.preventDefault();
      Alert.alert('Descartar alterações?', message, [
        { text: 'Continuar editando', style: 'cancel' },
        {
          text: 'Descartar',
          style: 'destructive',
          onPress: () => navigation.dispatch(e.data.action),
        },
      ]);
    });

    return unsubscribe;
  }, [hasUnsavedChanges, navigation, message]);
}

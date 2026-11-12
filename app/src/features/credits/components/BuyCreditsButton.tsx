import React from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button } from '@shared/components';
import type { RootStackParamList } from '@navigation/types';

const label = 'Comprar créditos';

/** Leva à tela de compra. Usado na tela de Créditos e no aviso de saldo insuficiente. */
export function BuyCreditsButton({
  variant = 'primary',
}: {
  variant?: 'primary' | 'secondary';
}): React.JSX.Element {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  return (
    <Button variant={variant} onPress={() => navigation.navigate('BuyCredits')}>
      {label}
    </Button>
  );
}

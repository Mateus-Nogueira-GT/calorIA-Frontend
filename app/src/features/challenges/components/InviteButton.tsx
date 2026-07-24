import React from 'react';
import { Share } from 'react-native';
import { Button } from '@shared/components/Button';

interface Props {
  inviteCode: string;
  title: string;
}

export function InviteButton({ inviteCode, title }: Props): React.JSX.Element {
  const onPress = async () => {
    // H1 da spec: URL https universal — o scheme caloria:// não abre para quem
    // não tem o app instalado (o prefixo https já está no linking do app).
    const url = `https://caloria.app/challenge/${inviteCode}`;
    try {
      await Share.share({
        message: `Bora pro desafio "${title}" no CalorIA? Entre por aqui: ${url}`,
        url,
      });
    } catch {
      /* usuário cancelou o share */
    }
  };

  return (
    <Button variant='secondary' onPress={onPress}>
      Convidar amigos
    </Button>
  );
}

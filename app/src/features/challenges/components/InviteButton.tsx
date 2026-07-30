import React from 'react';
import { Share } from 'react-native';
import { APP_WEB_URL } from '@env';
import { Button } from '@shared/components/Button';

interface Props {
  inviteCode: string;
  title: string;
}

export function InviteButton({ inviteCode, title }: Props): React.JSX.Element {
  const onPress = async () => {
    // https para quem NÃO tem o app (abre o web); caloria:// para quem tem
    // (Universal Links exigiriam domínio próprio + assetlinks/AASA hospedados).
    const webUrl = `${APP_WEB_URL || 'https://caloria.app'}/challenge/${inviteCode}`;
    try {
      await Share.share({
        message: `Bora pro desafio "${title}" no CalorIA? Entre por aqui: ${webUrl}\nJá tem o app? caloria://challenge/${inviteCode}`,
        url: webUrl,
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

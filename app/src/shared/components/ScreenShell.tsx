import React from 'react';
import { StyleSheet, View, ViewProps } from 'react-native';

/**
 * R7: o app foi desenhado para telefone. Das 25 telas, só 5 limitavam a largura
 * do conteúdo — as outras esticavam de ponta a ponta no tablet. No print do
 * cliente (Samsung em paisagem) o "Editar perfil" virava um botão verde de
 * ~1300px e um campo de nome do mesmo tamanho.
 *
 * A medida NÃO é nova: é exatamente a que o Dashboard e o Diário já usavam em
 * produção (`width: '100%', maxWidth: 760, alignSelf: 'center'`). Aqui ela
 * vira um lugar só, para não haver 25 números diferentes.
 */
export const MAX_CONTENT_WIDTH = 760;

export const screenShellStyle = {
  width: '100%',
  maxWidth: MAX_CONTENT_WIDTH,
  alignSelf: 'center',
} as const;

interface Props extends ViewProps {
  children: React.ReactNode;
  /** flex: 1 quando a tela precisa ocupar a altura toda (listas, scroll interno). */
  fill?: boolean;
}

export function ScreenShell({ children, fill = false, style, ...rest }: Props): React.JSX.Element {
  return (
    <View style={[styles.shell, fill && styles.fill, style]} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: screenShellStyle,
  fill: { flex: 1 },
});

import React from 'react';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { StyleSheet, Text as RNText } from 'react-native';
import { render } from '@testing-library/react-native';
import { ScreenShell, MAX_CONTENT_WIDTH } from './ScreenShell';

/** Telas full-bleed por design: a câmera e o loading dela ocupam a tela toda. */
const FULL_BLEED = ['CaptureScreen.tsx', 'AnalyzingScreen.tsx'];

function allScreens(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) allScreens(full, found);
    else if (entry.name.endsWith('Screen.tsx') && !entry.name.includes('.test.')) found.push(full);
  }
  return found;
}

describe('ScreenShell', () => {
  it('limita a largura do conteúdo e centraliza', () => {
    const { getByTestId } = render(
      <ScreenShell testID="shell">
        <RNText>oi</RNText>
      </ScreenShell>,
    );
    const style = StyleSheet.flatten(getByTestId('shell').props.style);
    expect(style.maxWidth).toBe(MAX_CONTENT_WIDTH);
    expect(style.alignSelf).toBe('center');
  });

  it('fill acrescenta flex: 1 sem perder a limitação', () => {
    const { getByTestId } = render(
      <ScreenShell fill testID="shell">
        <RNText>oi</RNText>
      </ScreenShell>,
    );
    const style = StyleSheet.flatten(getByTestId('shell').props.style);
    expect(style.flex).toBe(1);
    expect(style.maxWidth).toBe(MAX_CONTENT_WIDTH);
  });

  /**
   * R7: o app foi desenhado para telefone e 19 das 25 telas esticavam de ponta
   * a ponta no tablet. Este teste é o que impede a regressão silenciosa: tela
   * nova sem limite de largura quebra o CI, não o print do cliente.
   */
  it('toda tela limita a largura do conteúdo (exceto as full-bleed)', () => {
    const semLimite = allScreens(join(__dirname, '..', '..', 'features'))
      .filter((file) => !FULL_BLEED.includes(file.split('/').pop() as string))
      .filter((file) => {
        const src = readFileSync(file, 'utf8');
        return !src.includes('screenShellStyle') && !src.includes('maxWidth');
      })
      .map((file) => file.split('/').pop());

    expect(semLimite).toEqual([]);
  });
});

import React from 'react';
import { Platform } from 'react-native';
import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { ScreenContainer } from './ScreenContainer';

describe('ScreenContainer', () => {
  it('renderiza os filhos', () => {
    const { getByText } = render(<ScreenContainer><Text>oi</Text></ScreenContainer>);
    expect(getByText('oi')).toBeTruthy();
  });
  it('no web aplica maxWidth e centraliza', () => {
    const original = Platform.OS;
    // @ts-expect-error override para teste
    Platform.OS = 'web';
    const { getByTestId } = render(<ScreenContainer maxWidth={600}><Text>x</Text></ScreenContainer>);
    const flat = Object.assign({}, ...[].concat(getByTestId('screen-container').props.style));
    expect(flat.maxWidth).toBe(600);
    expect(flat.alignSelf).toBe('center');
    expect(flat.width).toBe('100%');
    // @ts-expect-error restore
    Platform.OS = original;
  });
  it('no nativo não aplica maxWidth', () => {
    const original = Platform.OS;
    // @ts-expect-error override
    Platform.OS = 'ios';
    const { getByTestId } = render(<ScreenContainer><Text>x</Text></ScreenContainer>);
    const flat = Object.assign({}, ...[].concat(getByTestId('screen-container').props.style ?? {}));
    expect(flat.maxWidth).toBeUndefined();
    // @ts-expect-error restore
    Platform.OS = original;
  });
});

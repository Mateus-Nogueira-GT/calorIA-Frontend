import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { PermissionsAndroid, Platform } from 'react-native';
import { pickImage } from './image-picker.service';

jest.mock('react-native-image-picker');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const picker = require('react-native-image-picker');

/** Roda o corpo com Platform.OS forçado (o default do preset é 'ios'). */
function withPlatform(os: string, fn: () => Promise<void>): () => Promise<void> {
  return async () => {
    const original = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
    try {
      await fn();
    } finally {
      Object.defineProperty(Platform, 'OS', { value: original, configurable: true });
    }
  };
}

describe('pickImage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('camera: retorna data URL a partir do base64', async () => {
    picker.launchCamera.mockResolvedValue({ assets: [{ base64: 'AAA', type: 'image/jpeg' }] });
    const out = await pickImage('camera');
    expect(out).toBe('data:image/jpeg;base64,AAA');
  });

  it('galeria: usa launchImageLibrary', async () => {
    picker.launchImageLibrary.mockResolvedValue({ assets: [{ base64: 'BBB', type: 'image/jpeg' }] });
    const out = await pickImage('gallery');
    expect(picker.launchImageLibrary).toHaveBeenCalled();
    expect(out).toBe('data:image/jpeg;base64,BBB');
  });

  it('retorna null quando cancelado', async () => {
    picker.launchCamera.mockResolvedValue({ didCancel: true });
    const out = await pickImage('camera');
    expect(out).toBeNull();
  });

  it(
    'errorCode do picker deixa de ser silêncio → lança (J3)',
    withPlatform('ios', async () => {
      picker.launchCamera.mockResolvedValue({ errorCode: 'camera_unavailable' });
      await expect(pickImage('camera')).rejects.toThrow('camera_unavailable');
    }),
  );
});

describe('pickImage — permissão de câmera no Android (J3)', () => {
  let requestSpy: jest.SpiedFunction<typeof PermissionsAndroid.request>;

  beforeEach(() => {
    jest.clearAllMocks();
    requestSpy = jest.spyOn(PermissionsAndroid, 'request');
  });

  afterEach(() => {
    requestSpy.mockRestore();
  });

  it(
    'permissão negada → lança CAMERA_PERMISSION_DENIED e nem abre a câmera',
    withPlatform('android', async () => {
      requestSpy.mockResolvedValue('denied' as never);
      await expect(pickImage('camera')).rejects.toThrow('CAMERA_PERMISSION_DENIED');
      expect(picker.launchCamera).not.toHaveBeenCalled();
    }),
  );

  it(
    'permissão concedida → abre a câmera normalmente',
    withPlatform('android', async () => {
      requestSpy.mockResolvedValue('granted' as never);
      picker.launchCamera.mockResolvedValue({ assets: [{ base64: 'CCC', type: 'image/png' }] });
      await expect(pickImage('camera')).resolves.toBe('data:image/png;base64,CCC');
      expect(requestSpy).toHaveBeenCalledWith(
        PermissionsAndroid.PERMISSIONS.CAMERA,
        expect.objectContaining({ title: expect.any(String) }),
      );
    }),
  );

  it(
    'galeria NÃO pede permissão de câmera',
    withPlatform('android', async () => {
      picker.launchImageLibrary.mockResolvedValue({
        assets: [{ base64: 'DDD', type: 'image/jpeg' }],
      });
      await expect(pickImage('gallery')).resolves.toBe('data:image/jpeg;base64,DDD');
      expect(requestSpy).not.toHaveBeenCalled();
    }),
  );

  it(
    'cancelar continua sendo null (cancelou ≠ erro)',
    withPlatform('android', async () => {
      requestSpy.mockResolvedValue('granted' as never);
      picker.launchCamera.mockResolvedValue({ didCancel: true });
      await expect(pickImage('camera')).resolves.toBeNull();
    }),
  );
});

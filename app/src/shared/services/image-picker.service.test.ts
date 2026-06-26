import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { pickImage } from './image-picker.service';

jest.mock('react-native-image-picker');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const picker = require('react-native-image-picker');

describe('pickImage', () => {
  beforeEach(() => jest.clearAllMocks());

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
});

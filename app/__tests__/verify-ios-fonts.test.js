import { describe, it, expect } from '@jest/globals';
import fs from 'node:fs';
import { Buffer } from 'node:buffer';
import path from 'node:path';
import { verifyIosFonts } from '../scripts/verify-ios-fonts';

const root = path.resolve(__dirname, '..');
const realInput = () => ({
  infoPlist: fs.readFileSync(path.join(root, 'ios/calorIA/Info.plist'), 'utf8'),
  pbxproj: fs.readFileSync(path.join(root, 'ios/calorIA.xcodeproj/project.pbxproj'), 'utf8'),
  readFont: (name) => {
    const p = path.join(root, 'assets/fonts', name);
    return fs.existsSync(p) ? fs.readFileSync(p) : null;
  },
});

describe('verifyIosFonts', () => {
  it('o repositório atual passa', () => {
    expect(verifyIosFonts(realInput())).toEqual([]);
  });

  it('fonte HTML (o erro de antes do #59) falha', () => {
    const input = realInput();
    const errors = verifyIosFonts({
      ...input,
      readFont: (n) => (n === 'Inter-Bold.ttf' ? Buffer.from('\n<!DOCTYPE html>') : input.readFont(n)),
    });
    expect(errors).toEqual([expect.stringContaining('Inter-Bold.ttf')]);
  });

  it('fonte do Info.plist ausente em assets/fonts falha', () => {
    const input = realInput();
    const errors = verifyIosFonts({ ...input, readFont: (n) => (n === 'Inter-Medium.ttf' ? null : input.readFont(n)) });
    expect(errors).toEqual([expect.stringContaining('Inter-Medium.ttf')]);
  });

  it('fonte fora do project.pbxproj falha (compila, mas não carrega)', () => {
    const input = realInput();
    const errors = verifyIosFonts({ ...input, pbxproj: input.pbxproj.replaceAll('Inter-SemiBold.ttf', 'X.ttf') });
    expect(errors).toEqual([expect.stringContaining('Inter-SemiBold.ttf')]);
  });

  it('fonte truncada com cabeçalho TTF falha', () => {
    const input = realInput();
    const truncated = Buffer.alloc(12);
    truncated.writeUInt32BE(0x00010000);
    expect(verifyIosFonts({ ...input, readFont: (n) => n === 'Inter-Bold.ttf' ? truncated : input.readFont(n) }))
      .toEqual([expect.stringContaining('Inter-Bold.ttf')]);
  });

  it('referência solta fora da fase Resources não basta', () => {
    const input = realInput();
    const pbxproj = input.pbxproj.replace(/\/\* Begin PBXResourcesBuildPhase section \*\/[\s\S]*?\/\* End PBXResourcesBuildPhase section \*\//, '');
    expect(verifyIosFonts({ ...input, pbxproj })).toHaveLength(5);
  });

  it('Info.plist sem UIAppFonts falha', () => {
    const input = realInput();
    expect(verifyIosFonts({ ...input, infoPlist: '<plist><dict></dict></plist>' })).toEqual([
      expect.stringContaining('UIAppFonts'),
    ]);
  });
});

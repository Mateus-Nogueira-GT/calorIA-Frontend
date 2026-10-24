import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Modelo oficial colado no painel do Supabase (Authentication → Emails → Reset Password).
const recovery = readFileSync(
  new URL('../../supabase/templates/recovery.html', import.meta.url),
  'utf8',
);

const count = (text: string, needle: string) => text.split(needle).length - 1;

describe('modelo de e-mail de recuperação', () => {
  it('usa {{ .ConfirmationURL }} como único href', () => {
    expect(count(recovery, 'href="{{ .ConfirmationURL }}"')).toBe(1);
    expect(count(recovery, 'href=')).toBe(1);
  });

  it('repete o endereço só como texto visível de apoio', () => {
    expect(count(recovery, '{{ .ConfirmationURL }}')).toBe(2);
    expect(recovery).toContain(
      'Se o botão não funcionar, copie e cole este endereço no navegador:',
    );
  });

  it('está em português, com botão, aviso e marca', () => {
    expect(recovery).toContain('Redefinir senha');
    expect(recovery).toContain('Se você não pediu, ignore este e-mail');
    expect(recovery).toContain('CalorIA');
  });

  it('não carrega o texto genérico do provedor nem recursos externos', () => {
    expect(recovery).not.toContain('Reset Your Password');
    expect(recovery).not.toContain('Follow this link');
    expect(recovery.toLowerCase()).not.toContain('supabase');
    expect(recovery).not.toMatch(/<img|<script|<link|@media|@import/i);
  });
});

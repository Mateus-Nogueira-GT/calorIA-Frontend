// Em web, a captura é feita pelo ScannerViewfinder (input file). Este wrapper
// não é usado diretamente; expõe a mesma assinatura para manter os tipos.
export async function pickImage(_source: 'camera' | 'gallery'): Promise<string | null> {
  return null;
}

import { createContext, useContext } from 'react';

/**
 * Guideline 5.1.1(v) da App Store: o scanner não é recurso de conta, então
 * funciona sem login a partir da Welcome. Em modo convidado a análise vai para
 * /scanner/analyze-guest e só SALVAR no diário pede cadastro.
 */
export const ScannerGuestContext = createContext(false);

export function useIsGuestScanner(): boolean {
  return useContext(ScannerGuestContext);
}

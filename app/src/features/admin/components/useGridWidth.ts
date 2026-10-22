import { useWindowDimensions } from 'react-native';

/** 1 coluna no celular; grade de 3–4 colunas a partir de 900 px (web/tablet). */
export function useGridWidth(): { columns: number; itemWidth: `${number}%` } {
  const { width } = useWindowDimensions();
  const columns = width >= 1200 ? 4 : width >= 900 ? 3 : 1;
  return { columns, itemWidth: columns === 1 ? '100%' : `${Math.floor(100 / columns) - 2}%` };
}

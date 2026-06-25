# Câmera & Scanner — Design Spec (Spec A)

**Data:** 2026-06-25
**Escopo:** itens D27–D32 do checklist de Frontend:

- Botão flutuante de câmera (acesso rápido de qualquer tela) — D27–D28
- Tela de captura: câmera nativa + galeria — D28–D29
- Tela de loading da análise (animação enquanto IA processa) — D29–D30
- Tela de resultado: lista de alimentos detectados + calorias + macros — D30–D31
- Permitir editar/corrigir itens antes de confirmar — D31–D32

## 1. Contexto

O scanner atual (`app/src/features/scanner/`) funciona **apenas em web** (input file HTML), retorna **um único** alimento (`ScanResult`), **não permite edição** e adiciona direto ao food-log. Esta spec moderniza o fluxo: captura **nativa** (câmera + galeria), acesso por **botão central na tab bar**, **loading animado**, e **resultado como lista editável** antes de confirmar.

Backend de visão IA não muda de responsabilidade, mas o **contrato muda** para retornar múltiplos itens. Desenvolvido contra **MSW** (padrão do projeto); o time de backend implementa depois.

Alinhado à identidade visual **VITAL LIGHT** (tokens de `app/src/theme/colors.ts`).

## 2. Decisões-chave

| Decisão | Escolha | Razão |
|---|---|---|
| Captura nativa | `react-native-image-picker` | Uma lib cobre câmera **e** galeria com API simples; retorna uri/base64. Leve vs. vision-camera. |
| Acesso | **Botão central de câmera na tab bar** (remove a aba Scanner só-web) | Acesso global de qualquer tela; mantém a densidade da tab bar. |
| Web | Mantém input file como fallback | `react-native-image-picker` não roda em web; preserva o fluxo web atual. |
| Resultado | **Lista de itens detectados, editável** | Atende D30–D31; um prato tem vários alimentos. |
| Edição | Editar nome/cal/macros, remover item, adicionar item manual | Atende D31–D32; corrige erros da IA antes de salvar. |
| Confirmação | Um `foodLogService.addMeal` por item confirmado | Reaproveita o food-log existente. |
| Backend | Contrato documentado + MSW | Backend inexistente; mantém o front desbloqueado. |

## 3. Dependência nova e permissões

- **`react-native-image-picker`** (dependency em `app/package.json`).
- **iOS** (`app/ios/.../Info.plist`): `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription` (textos em PT-BR).
- **Android** (`app/android/app/src/main/AndroidManifest.xml`): `<uses-permission android:name="android.permission.CAMERA" />`. (Galeria via picker do sistema não exige permissão de storage no fluxo padrão.)
- **Jest:** mock do módulo em `app/__mocks__/react-native-image-picker.js` (evita falha de native module nos testes, padrão dos mocks existentes em `__mocks__/`).

## 4. Arquitetura

```
app/src/features/scanner/
├── components/
│   ├── ScanItemRow.tsx          linha editável de alimento detectado (nome + cal + macros)
│   ├── ScanResultList.tsx       lista de ScanItemRow + "adicionar item manual" + total
│   ├── AnalyzingAnimation.tsx   animação de processamento (Animated API)
│   ├── ConfidenceBadge.tsx      (reaproveitado)
│   └── ScannerViewfinder.tsx    (reaproveitado — fallback web)
├── screens/
│   ├── CaptureScreen.tsx        escolha câmera/galeria (nativo) ou input file (web)
│   ├── AnalyzingScreen.tsx      loading enquanto POST /scanner/analyze
│   └── ScanResultScreen.tsx     lista editável + confirmar
├── hooks/
│   └── useScanner.ts            seletores do store
└── store.ts                     Zustand: imagem, items, flags, edição (+ store.test.ts)

app/src/shared/services/
└── scanner.service.ts           analyzePhoto → { items: ScanItem[] } (+ pickImage helper)

app/src/shared/services/
└── image-picker.service.ts      wrapper de react-native-image-picker (.ts nativo + .web.ts fallback)

app/src/navigation/
├── ScannerNavigator.tsx         (novo) stack: Capture → Analyzing → ScanResult
├── BrandTabNavigator.tsx        (extensão) botão central de câmera; remove aba Scanner
└── types.ts                     (extensão) ScannerStackParamList

app/mocks/handlers/
└── scanner.ts                   (extensão) /scanner/analyze retorna múltiplos itens
```

## 5. Modelo de Dados

```ts
// scanner.service.ts
export interface ScanItem {
  id: string;          // id local (gerado no front se backend não enviar)
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: number;  // 0..1
}

export interface ScanAnalysis {
  items: ScanItem[];
}
```

`ScanResult` antigo (objeto único) é **substituído** por `ScanAnalysis { items }`.

## 6. Contrato de API

| Método | Path | Body | Retorno |
|---|---|---|---|
| `POST` | `/scanner/analyze` | `{ image: string }` (data URL base64) | `ScanAnalysis` (`{ items: ScanItem[] }`) |

Mudança vs. atual: o retorno passa de um `ScanResult` único para `{ items: [...] }`. MSW (`app/mocks/handlers/scanner.ts`) atualizado para devolver 2–3 itens de exemplo com confianças variadas.

## 7. Captura de imagem (`image-picker.service.ts`)

- **Nativo** (`image-picker.service.ts`): usa `launchCamera` / `launchImageLibrary` de `react-native-image-picker` com `{ mediaType: 'photo', includeBase64: true, maxWidth: 1024, maxHeight: 1024, quality: 0.8 }`; retorna data URL base64. Trata cancelamento (retorna `null`) e erro de permissão (lança erro tratável).
- **Web** (`image-picker.service.web.ts`): reusa o fluxo do `ScannerViewfinder` (input file + canvas resize) — `pickFromCamera` cai para o mesmo seletor de arquivo.
- API: `pickImage(source: 'camera' | 'gallery'): Promise<string | null>`.

## 8. Estado (Zustand) — `features/scanner/store.ts`

```ts
interface ScannerState {
  image: string | null;          // data URL capturada
  items: ScanItem[];             // resultado editável
  isAnalyzing: boolean;
  error: string | null;

  analyze: (image: string) => Promise<void>;   // POST /scanner/analyze → items
  updateItem: (id: string, patch: Partial<ScanItem>) => void;  // edição local
  removeItem: (id: string) => void;
  addManualItem: () => void;     // item em branco para preencher
  confirm: () => Promise<void>;  // addMeal por item → limpa
  reset: () => void;
  clear: () => void;             // logout
}
```

`analyze` seta `isAnalyzing`, chama o service, popula `items` (gera `id` local se faltar). `confirm` chama `foodLogService.addMeal` para cada item válido (cal/nome preenchidos) e reseta.

## 9. Navegação

- `BrandTabNavigator`: **remove** `Tab.Screen name='Scanner'`; adiciona um **botão central de câmera** (item destacado, elevado, `brandPrimary`) que faz `navigation.navigate('Scanner', { screen: 'Capture' })` no `ScannerNavigator`.
- `ScannerNavigator` (native-stack, apresentado como modal full-screen sobre as tabs):
  - `Capture` → escolhe câmera/galeria; ao obter imagem, navega para `Analyzing`.
  - `Analyzing` (sem header) → dispara `analyze(image)`; em sucesso `replace('ScanResult')`; em erro mostra retry/voltar.
  - `ScanResult` → `ScanResultList` editável + botão "Confirmar e adicionar"; sucesso → fecha o stack e vai ao `FoodLog`.
- `types.ts`: `ScannerStackParamList = { Capture: undefined; Analyzing: { image: string }; ScanResult: undefined }` + `Scanner` no `RootStack`/tab conforme padrão.

## 10. Componentes (destaques)

- **CameraTabButton**: botão central elevado (círculo `brandPrimary` com ícone de câmera no estilo dos ícones desenhados do `BrandTabNavigator`).
- **CaptureScreen**: dois CTAs grandes — "Tirar foto" / "Escolher da galeria" (nativo); em web, o `ScannerViewfinder`.
- **AnalyzingScreen** + **AnalyzingAnimation**: pulso/spinner animado (Animated API; drenar timers em teste) + texto "Analisando seu prato...".
- **ScanResultScreen** + **ScanResultList** + **ScanItemRow**: cada linha com nome (Input), cal/macros (Inputs numéricos), `ConfidenceBadge`, botão remover; rodapé com total de calorias e "Adicionar item"; CTA "Confirmar e adicionar ao diário".

## 11. Estados de loading/erro

| Cenário | UX |
|---|---|
| Permissão de câmera negada | Alert explicando + opção de usar galeria |
| Captura cancelada | Volta ao `Capture` sem erro |
| `analyze` em andamento | `AnalyzingScreen` com animação |
| `analyze` falha | Mensagem + "Tentar de novo" / "Voltar" |
| `analyze` retorna 0 itens | Estado vazio: "Não detectei alimentos. Adicione manualmente?" → vai ao ScanResult com 1 item em branco |
| `confirm` falha (addMeal) | Alert; mantém a lista para retry |

## 12. Testes (Jest + RTL)

- `store.test.ts`: `analyze` popula items (mock service); `updateItem`/`removeItem`/`addManualItem`; `confirm` chama addMeal por item; `reset`/`clear`.
- `ScanItemRow`: edição dispara `updateItem`; remover dispara `removeItem`.
- `ScanResultScreen`: renderiza lista, total e confirma.
- `AnalyzingAnimation`: render sem warnings (timers drenados).
- Mock de `react-native-image-picker` em `__mocks__/`.

## 13. Fora de escopo

- Custom camera UI / frame processors (vision-camera).
- Edição de foto (crop/rotate).
- Histórico de scans.
- Reconhecimento de código de barras (pode reusar contrato futuro).

## 14. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Lib nativa exige rebuild/permissões | Documentar permissões iOS/Android; mock no jest; web mantém fallback. |
| Densidade da tab bar com botão central | Botão central elevado conta como slot; validar visualmente; labels compactos. |
| Backend ainda retorna 1 item | Service normaliza: se vier objeto único, embrulha em `{ items: [obj] }`. |

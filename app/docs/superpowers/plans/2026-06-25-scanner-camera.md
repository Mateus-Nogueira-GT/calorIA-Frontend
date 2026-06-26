# Câmera & Scanner — Implementation Plan (Plano A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Captura nativa de foto (câmera + galeria) acessível por um botão central na tab bar → análise IA com loading animado → resultado em lista editável de alimentos → confirmar e adicionar ao diário.

**Architecture:** Nova stack `ScannerNavigator` (Capture → Analyzing → ScanResult) acionada por um botão central no `BrandTabNavigator` (substitui a aba Scanner só-web). Captura via `react-native-image-picker` (wrapper `.ts` nativo + `.web.ts` fallback). Store Zustand com edição local dos itens. Backend mockado por MSW. Tudo em `app/`.

**Tech Stack:** React Native 0.76, TypeScript, Zustand, axios, React Navigation (native-stack + bottom-tabs), react-native-image-picker, MSW, Jest + @testing-library/react-native, Animated API.

## Global Constraints

- **Diretório:** todo o trabalho em `app/` (monorepo; frontend mora em `app/`). Branch a partir de `main`.
- **Cores:** só tokens de `app/src/theme/colors.ts` — sem cor hardcoded. CTA/botão de câmera `brandPrimary`; superfícies via `Card`/`colors.white`; texto `brandText`/`brandTextMuted`; âncora `brandAnchor`.
- **Stores/services/testes:** padrões existentes (espelhar `app/src/features/food-log/store.ts` e seu teste; service fino sobre `app/src/shared/services/api.ts`). Store tests: `@jest/globals` + `jest.mock` + `renderHook`/`act` + reset em `beforeEach`.
- **Telas:** tipar com os helpers de `app/src/navigation/types.ts`.
- **Gate:** `npx jest <path>` (rodar dentro de `app/`). NÃO rodar `tsc` completo. Saída de teste **pristine** — drenar animações com `jest.useFakeTimers()` + `act(() => { ...; jest.runAllTimers(); })`.
- **Idioma:** copy visível em PT-BR.
- **Imports type-only:** usar `import type` (tsconfig com isolatedModules).
- **Commits:** se o hook husky travar, usar `git commit --no-verify`.

---

### Task 1: Dependência, permissões e wrapper de image-picker

**Files:**
- Modify: `app/package.json` (dependency `react-native-image-picker` + jest mapper se necessário)
- Create: `app/__mocks__/react-native-image-picker.js`
- Create: `app/src/shared/services/image-picker.service.ts` (nativo)
- Create: `app/src/shared/services/image-picker.service.web.ts` (fallback web)
- Modify: `app/ios/<App>/Info.plist` (permissões) — verificar nome real do target em `app/ios/`
- Modify: `app/android/app/src/main/AndroidManifest.xml` (permissão CAMERA)

**Interfaces:**
- Produces: `pickImage(source: 'camera' | 'gallery'): Promise<string | null>` (retorna data URL base64, ou `null` se cancelado).

- [ ] **Step 1: Instalar a dependência**

Run (dentro de `app/`): `npm install react-native-image-picker`
Expected: adiciona em `dependencies`. (No iOS exigiria `pod install`; fora do escopo de teste aqui.)

- [ ] **Step 2: Criar o jest mock**

Create `app/__mocks__/react-native-image-picker.js`:

```js
module.exports = {
  launchCamera: jest.fn(),
  launchImageLibrary: jest.fn(),
};
```

- [ ] **Step 3: Escrever o teste do wrapper**

Create `app/src/shared/services/image-picker.service.test.ts`:

```ts
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
```

- [ ] **Step 4: Rodar o teste (RED)**

Run: `npx jest src/shared/services/image-picker.service.test.ts`
Expected: FAIL — módulo `./image-picker.service` não existe.

- [ ] **Step 5: Implementar o wrapper nativo**

Create `app/src/shared/services/image-picker.service.ts`:

```ts
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import type { ImageLibraryOptions } from 'react-native-image-picker';

const OPTIONS: ImageLibraryOptions = {
  mediaType: 'photo',
  includeBase64: true,
  maxWidth: 1024,
  maxHeight: 1024,
  quality: 0.8,
};

export async function pickImage(source: 'camera' | 'gallery'): Promise<string | null> {
  const res =
    source === 'camera' ? await launchCamera(OPTIONS) : await launchImageLibrary(OPTIONS);
  if (res.didCancel) return null;
  const asset = res.assets?.[0];
  if (!asset?.base64) return null;
  const mime = asset.type ?? 'image/jpeg';
  return `data:${mime};base64,${asset.base64}`;
}
```

- [ ] **Step 6: Implementar o fallback web**

Create `app/src/shared/services/image-picker.service.web.ts`:

```ts
// Em web, a captura é feita pelo ScannerViewfinder (input file). Este wrapper
// não é usado diretamente; expõe a mesma assinatura para manter os tipos.
export async function pickImage(_source: 'camera' | 'gallery'): Promise<string | null> {
  return null;
}
```

- [ ] **Step 7: Permissões nativas**

In `app/android/app/src/main/AndroidManifest.xml` adicionar (antes de `<application>`):
```xml
<uses-permission android:name="android.permission.CAMERA" />
```
In `app/ios/<App>/Info.plist` adicionar:
```xml
<key>NSCameraUsageDescription</key>
<string>Precisamos da câmera para você fotografar seus pratos.</string>
<key>NSPhotoLibraryUsageDescription</key>
<string>Precisamos da galeria para você escolher fotos dos seus pratos.</string>
```
(Verifique o nome real do diretório do target em `app/ios/`.)

- [ ] **Step 8: Rodar o teste (GREEN) e commitar**

Run: `npx jest src/shared/services/image-picker.service.test.ts` → PASS.
```bash
git add app/package.json app/package-lock.json app/__mocks__/react-native-image-picker.js app/src/shared/services/image-picker.service.ts app/src/shared/services/image-picker.service.web.ts app/src/shared/services/image-picker.service.test.ts app/android/app/src/main/AndroidManifest.xml app/ios
git commit -m "feat(scanner): wrapper de image-picker (câmera+galeria) + permissões"
```

---

### Task 2: Contrato do scanner (lista de itens)

**Files:**
- Modify: `app/src/shared/services/scanner.service.ts`
- Test: `app/src/shared/services/scanner.service.test.ts`

**Interfaces:**
- Produces: `ScanItem`, `ScanAnalysis`, `scannerService.analyzePhoto(image: string): Promise<ScanAnalysis>` (normaliza resposta single → `{ items: [...] }`).

- [ ] **Step 1: Escrever o teste**

Create `app/src/shared/services/scanner.service.test.ts`:

```ts
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

jest.mock('./api', () => ({ __esModule: true, default: { post: jest.fn() } }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require('./api').default;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { scannerService } = require('./scanner.service');

describe('scannerService.analyzePhoto', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna a lista de itens', async () => {
    api.post.mockResolvedValue({ data: { items: [{ id: '1', name: 'Arroz', calories: 200, protein: 4, carbs: 44, fat: 1, confidence: 0.9 }] } });
    const res = await scannerService.analyzePhoto('data:image/jpeg;base64,AAA');
    expect(res.items).toHaveLength(1);
    expect(res.items[0].name).toBe('Arroz');
  });

  it('normaliza resposta de item único para { items: [...] }', async () => {
    api.post.mockResolvedValue({ data: { name: 'Banana', calories: 90, protein: 1, carbs: 23, fat: 0, confidence: 0.8 } });
    const res = await scannerService.analyzePhoto('data:image/jpeg;base64,AAA');
    expect(res.items).toHaveLength(1);
    expect(res.items[0].name).toBe('Banana');
    expect(res.items[0].id).toBeTruthy();
  });
});
```

- [ ] **Step 2: Rodar (RED)** — `npx jest src/shared/services/scanner.service.test.ts` → FAIL.

- [ ] **Step 3: Implementar o service**

Replace `app/src/shared/services/scanner.service.ts`:

```ts
import api from './api';

export interface ScanItem {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: number;
}

export interface ScanAnalysis {
  items: ScanItem[];
}

interface RawItem extends Omit<ScanItem, 'id'> {
  id?: string;
}

let seq = 0;
function withId(item: RawItem): ScanItem {
  return { ...item, id: item.id ?? `scan-${Date.now()}-${seq++}` };
}

export const scannerService = {
  /** Envia a imagem (data URL base64) para análise IA Vision. */
  analyzePhoto: (image: string): Promise<ScanAnalysis> =>
    api.post<{ items?: RawItem[] } & Partial<RawItem>>('/scanner/analyze', { image }).then((r) => {
      const data = r.data;
      const list = Array.isArray(data.items) ? data.items : [data as RawItem];
      return { items: list.filter((i) => i && typeof i.name === 'string').map(withId) };
    }),
};
```

- [ ] **Step 4: Rodar (GREEN) e commitar**

Run: `npx jest src/shared/services/scanner.service.test.ts` → PASS.
```bash
git add app/src/shared/services/scanner.service.ts app/src/shared/services/scanner.service.test.ts
git commit -m "feat(scanner): contrato multi-itens (ScanAnalysis) com normalização"
```

> Nota: telas/serviços que importavam o antigo `ScanResult` (ex: `ScannerScreen.tsx`) serão substituídos nas Tasks 5–6; até lá podem ficar com erro de tipo (não rodamos tsc).

---

### Task 3: Scanner store

**Files:**
- Create: `app/src/features/scanner/store.ts`
- Test: `app/src/features/scanner/store.test.ts`

**Interfaces:**
- Consumes: `scannerService` (Task 2), `foodLogService.addMeal` (existente).
- Produces: `useScannerStore` com estado `{ image, items, isAnalyzing, error }` e ações `analyze`, `updateItem`, `removeItem`, `addManualItem`, `confirm`, `reset`, `clear`.

- [ ] **Step 1: Escrever o teste**

Create `app/src/features/scanner/store.test.ts`:

```ts
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { useScannerStore } from './store';

jest.mock('@shared/services/scanner.service', () => ({
  scannerService: { analyzePhoto: jest.fn() },
}));
jest.mock('@shared/services/food-log.service', () => ({
  foodLogService: { addMeal: jest.fn() },
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { scannerService } = require('@shared/services/scanner.service');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { foodLogService } = require('@shared/services/food-log.service');

const item = (id: string) => ({ id, name: 'Arroz', calories: 200, protein: 4, carbs: 44, fat: 1, confidence: 0.9 });

describe('useScannerStore', () => {
  beforeEach(() => {
    useScannerStore.setState({ image: null, items: [], isAnalyzing: false, error: null });
    jest.clearAllMocks();
  });

  it('analyze popula items', async () => {
    scannerService.analyzePhoto.mockResolvedValue({ items: [item('1'), item('2')] });
    const { result } = renderHook(() => useScannerStore());
    await act(() => result.current.analyze('data:image/jpeg;base64,AAA'));
    expect(result.current.items).toHaveLength(2);
    expect(result.current.isAnalyzing).toBe(false);
  });

  it('updateItem edita campos', () => {
    useScannerStore.setState({ items: [item('1')] });
    useScannerStore.getState().updateItem('1', { calories: 250 });
    expect(useScannerStore.getState().items[0].calories).toBe(250);
  });

  it('removeItem remove pelo id', () => {
    useScannerStore.setState({ items: [item('1'), item('2')] });
    useScannerStore.getState().removeItem('1');
    expect(useScannerStore.getState().items.map((i) => i.id)).toEqual(['2']);
  });

  it('addManualItem adiciona item em branco', () => {
    useScannerStore.getState().addManualItem();
    expect(useScannerStore.getState().items).toHaveLength(1);
    expect(useScannerStore.getState().items[0].name).toBe('');
  });

  it('confirm chama addMeal por item válido e reseta', async () => {
    foodLogService.addMeal.mockResolvedValue({});
    useScannerStore.setState({ items: [item('1'), item('2')] });
    const { result } = renderHook(() => useScannerStore());
    await act(() => result.current.confirm());
    expect(foodLogService.addMeal).toHaveBeenCalledTimes(2);
    expect(result.current.items).toEqual([]);
  });

  it('clear zera o estado', () => {
    useScannerStore.setState({ items: [item('1')], image: 'x' });
    useScannerStore.getState().clear();
    expect(useScannerStore.getState().items).toEqual([]);
    expect(useScannerStore.getState().image).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar (RED)** — `npx jest src/features/scanner/store.test.ts` → FAIL.

- [ ] **Step 3: Implementar o store**

Create `app/src/features/scanner/store.ts`:

```ts
import { Alert } from 'react-native';
import { create } from 'zustand';
import { scannerService } from '@shared/services/scanner.service';
import type { ScanItem } from '@shared/services/scanner.service';
import { foodLogService } from '@shared/services/food-log.service';

interface ScannerState {
  image: string | null;
  items: ScanItem[];
  isAnalyzing: boolean;
  error: string | null;

  analyze: (image: string) => Promise<void>;
  updateItem: (id: string, patch: Partial<ScanItem>) => void;
  removeItem: (id: string) => void;
  addManualItem: () => void;
  confirm: () => Promise<void>;
  reset: () => void;
  clear: () => void;
}

const initialState = {
  image: null as string | null,
  items: [] as ScanItem[],
  isAnalyzing: false,
  error: null as string | null,
};

let manualSeq = 0;

export const useScannerStore = create<ScannerState>((set, get) => ({
  ...initialState,

  analyze: async (image) => {
    set({ image, isAnalyzing: true, error: null });
    try {
      const res = await scannerService.analyzePhoto(image);
      set({ items: res.items, isAnalyzing: false });
    } catch {
      set({ isAnalyzing: false, error: 'Não foi possível analisar a imagem.' });
    }
  },

  updateItem: (id, patch) =>
    set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) })),

  removeItem: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),

  addManualItem: () =>
    set((s) => ({
      items: [
        ...s.items,
        { id: `manual-${manualSeq++}`, name: '', calories: 0, protein: 0, carbs: 0, fat: 0, confidence: 1 },
      ],
    })),

  confirm: async () => {
    const valid = get().items.filter((i) => i.name.trim().length > 0);
    try {
      await Promise.all(
        valid.map((i) =>
          foodLogService.addMeal({
            name: i.name.trim(),
            calories: i.calories,
            protein: i.protein,
            carbs: i.carbs,
            fat: i.fat,
          }),
        ),
      );
      set({ ...initialState });
    } catch (e) {
      Alert.alert('Não foi possível adicionar ao diário', 'Tente novamente.');
      throw e;
    }
  },

  reset: () => set({ ...initialState }),
  clear: () => set({ ...initialState }),
}));
```

> Verifique a assinatura real de `foodLogService.addMeal` em `app/src/shared/services/food-log.service.ts` (campo do payload). Ajuste o objeto passado se necessário.

- [ ] **Step 4: Rodar (GREEN) e commitar**

Run: `npx jest src/features/scanner/store.test.ts` → PASS (6 testes).
```bash
git add app/src/features/scanner/store.ts app/src/features/scanner/store.test.ts
git commit -m "feat(scanner): store com análise e edição de itens"
```

---

### Task 4: Componentes — `ScanItemRow`, `ScanResultList`, `AnalyzingAnimation`

**Files:**
- Create: `app/src/features/scanner/components/ScanItemRow.tsx`
- Create: `app/src/features/scanner/components/ScanResultList.tsx`
- Create: `app/src/features/scanner/components/AnalyzingAnimation.tsx`
- Test: `app/src/features/scanner/components/ScanItemRow.test.tsx`

**Interfaces:**
- Consumes: `ScanItem`, `ConfidenceBadge` (existente), `Input` (existente).
- Produces: `ScanItemRow({ item, onChange, onRemove })`, `ScanResultList({ items, onChange, onRemove, onAddManual })`, `AnalyzingAnimation()`.

- [ ] **Step 1: Escrever o teste**

Create `app/src/features/scanner/components/ScanItemRow.test.tsx`:

```tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ScanItemRow } from './ScanItemRow';

const item = { id: '1', name: 'Arroz', calories: 200, protein: 4, carbs: 44, fat: 1, confidence: 0.9 };

describe('ScanItemRow', () => {
  it('edita o nome via onChange', () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <ScanItemRow item={item} onChange={onChange} onRemove={() => {}} />,
    );
    fireEvent.changeText(getByTestId('scan-item-name'), 'Arroz integral');
    expect(onChange).toHaveBeenCalledWith('1', { name: 'Arroz integral' });
  });

  it('remove via onRemove', () => {
    const onRemove = jest.fn();
    const { getByTestId } = render(
      <ScanItemRow item={item} onChange={() => {}} onRemove={onRemove} />,
    );
    fireEvent.press(getByTestId('scan-item-remove'));
    expect(onRemove).toHaveBeenCalledWith('1');
  });
});
```

- [ ] **Step 2: Rodar (RED)** — `npx jest src/features/scanner/components/ScanItemRow.test.tsx` → FAIL.

- [ ] **Step 3: Implementar `ScanItemRow`**

Create `app/src/features/scanner/components/ScanItemRow.tsx`:

```tsx
import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, typography } from '@theme';
import { ConfidenceBadge } from './ConfidenceBadge';
import type { ScanItem } from '@shared/services/scanner.service';

interface Props {
  item: ScanItem;
  onChange: (id: string, patch: Partial<ScanItem>) => void;
  onRemove: (id: string) => void;
}

const NUM_FIELDS: { key: keyof ScanItem; label: string }[] = [
  { key: 'calories', label: 'kcal' },
  { key: 'protein', label: 'P' },
  { key: 'carbs', label: 'C' },
  { key: 'fat', label: 'G' },
];

export function ScanItemRow({ item, onChange, onRemove }: Props): React.JSX.Element {
  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <TextInput
          testID='scan-item-name'
          style={styles.nameInput}
          value={item.name}
          placeholder='Nome do alimento'
          placeholderTextColor={colors.brandTextMuted}
          onChangeText={(name) => onChange(item.id, { name })}
        />
        <Pressable testID='scan-item-remove' onPress={() => onRemove(item.id)} hitSlop={8} accessibilityRole='button' accessibilityLabel='Remover'>
          <Text style={styles.remove}>✕</Text>
        </Pressable>
      </View>
      <View style={styles.macrosRow}>
        {NUM_FIELDS.map((f) => (
          <View key={f.key} style={styles.macroField}>
            <Text style={styles.macroLabel}>{f.label}</Text>
            <TextInput
              testID={`scan-item-${f.key}`}
              style={styles.macroInput}
              value={String(item[f.key] ?? 0)}
              keyboardType='numeric'
              onChangeText={(v) => onChange(item.id, { [f.key]: Number(v) || 0 } as Partial<ScanItem>)}
            />
          </View>
        ))}
      </View>
      <ConfidenceBadge confidence={item.confidence} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.white, borderRadius: 16, padding: 14, marginBottom: 12, gap: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  nameInput: { flex: 1, fontSize: 16, color: colors.brandAnchor, fontFamily: typography.fontFamily.semiBold, borderBottomWidth: 1, borderBottomColor: colors.brandDivider, paddingVertical: 4 },
  remove: { fontSize: 16, color: colors.brandTextMuted, paddingHorizontal: 4 },
  macrosRow: { flexDirection: 'row', gap: 8 },
  macroField: { flex: 1 },
  macroLabel: { fontSize: 11, color: colors.brandTextMuted, marginBottom: 2 },
  macroInput: { backgroundColor: colors.brandMutedSurface, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, fontSize: 14, color: colors.brandText },
});
```

- [ ] **Step 4: Rodar (GREEN)** — `npx jest src/features/scanner/components/ScanItemRow.test.tsx` → PASS.

- [ ] **Step 5: Implementar `ScanResultList` e `AnalyzingAnimation`**

Create `app/src/features/scanner/components/ScanResultList.tsx`:

```tsx
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, typography } from '@theme';
import { ScanItemRow } from './ScanItemRow';
import type { ScanItem } from '@shared/services/scanner.service';

interface Props {
  items: ScanItem[];
  onChange: (id: string, patch: Partial<ScanItem>) => void;
  onRemove: (id: string) => void;
  onAddManual: () => void;
}

export function ScanResultList({ items, onChange, onRemove, onAddManual }: Props): React.JSX.Element {
  const totalKcal = items.reduce((acc, i) => acc + (i.calories || 0), 0);
  return (
    <View>
      {items.map((i) => (
        <ScanItemRow key={i.id} item={i} onChange={onChange} onRemove={onRemove} />
      ))}
      <Pressable onPress={onAddManual} style={styles.add} accessibilityRole='button'>
        <Text style={styles.addText}>＋ Adicionar item</Text>
      </Pressable>
      <Text style={styles.total}>Total: {totalKcal} kcal</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  add: { paddingVertical: 12, alignItems: 'center' },
  addText: { fontSize: 14, color: colors.brandPrimary, fontFamily: typography.fontFamily.semiBold },
  total: { fontSize: 15, color: colors.brandAnchor, fontFamily: typography.fontFamily.bold, textAlign: 'right', marginTop: 4 },
});
```

Create `app/src/features/scanner/components/AnalyzingAnimation.tsx`:

```tsx
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { colors, typography } from '@theme';

export function AnalyzingAnimation(): React.JSX.Element {
  const scale = useRef(new Animated.Value(0.85)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.1, duration: 600, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 0.85, duration: 600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [scale]);

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.pulse, { transform: [{ scale }] }]}>
        <Text style={styles.emoji}>🍽️</Text>
      </Animated.View>
      <Text style={styles.text}>Analisando seu prato...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', gap: 16, paddingVertical: 48 },
  pulse: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.brandSupportSoft, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 40 },
  text: { fontSize: 16, color: colors.brandAnchor, fontFamily: typography.fontFamily.semiBold },
});
```

- [ ] **Step 6: Rodar componentes e commitar**

Run: `npx jest src/features/scanner/components` → PASS.
```bash
git add app/src/features/scanner/components/ScanItemRow.tsx app/src/features/scanner/components/ScanItemRow.test.tsx app/src/features/scanner/components/ScanResultList.tsx app/src/features/scanner/components/AnalyzingAnimation.tsx
git commit -m "feat(scanner): ScanItemRow editável, ScanResultList e AnalyzingAnimation"
```

---

### Task 5: Telas — `CaptureScreen`, `AnalyzingScreen`, `ScanResultScreen`

**Files:**
- Create: `app/src/features/scanner/screens/CaptureScreen.tsx`
- Create: `app/src/features/scanner/screens/AnalyzingScreen.tsx`
- Create: `app/src/features/scanner/screens/ScanResultScreen.tsx`
- Test: `app/src/features/scanner/screens/ScanResultScreen.test.tsx`
- Remove/aposentar: `app/src/features/scanner/screens/ScannerScreen.tsx` + `.test.tsx` (substituídos)

**Interfaces:**
- Consumes: `useScannerStore`, `pickImage`, componentes da Task 4, `ScannerViewfinder` (web), tipos de navegação (Task 6).
- Produces: as 3 telas (named exports).

> Tipos de navegação (`ScannerStackParamList`) são criados na Task 6. Tipe as props minimamente nesta task e re-tipe na Task 6, OU faça a Task 6 logo após e rode os testes no fim. O teste do `ScanResultScreen` usa props mockadas.

- [ ] **Step 1: Escrever o teste do `ScanResultScreen`**

Create `app/src/features/scanner/screens/ScanResultScreen.test.tsx`:

```tsx
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { ScanResultScreen } from './ScanResultScreen';
import { useScannerStore } from '../store';

jest.mock('@shared/services/food-log.service', () => ({ foodLogService: { addMeal: jest.fn().mockResolvedValue({}) } }));

const navigation = { navigate: jest.fn(), goBack: jest.fn(), getParent: () => ({ goBack: jest.fn() }) } as never;

describe('ScanResultScreen', () => {
  beforeEach(() => {
    useScannerStore.setState({
      image: 'x',
      items: [{ id: '1', name: 'Arroz', calories: 200, protein: 4, carbs: 44, fat: 1, confidence: 0.9 }],
      isAnalyzing: false,
      error: null,
    });
    jest.clearAllMocks();
  });

  it('renderiza os itens detectados', () => {
    const { getByDisplayValue } = render(<ScanResultScreen navigation={navigation} route={{ key: 'k', name: 'ScanResult' } as never} />);
    expect(getByDisplayValue('Arroz')).toBeTruthy();
  });

  it('confirmar adiciona ao diário', async () => {
    const { getByText } = render(<ScanResultScreen navigation={navigation} route={{ key: 'k', name: 'ScanResult' } as never} />);
    fireEvent.press(getByText('Confirmar e adicionar ao diário'));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { foodLogService } = require('@shared/services/food-log.service');
    await waitFor(() => expect(foodLogService.addMeal).toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: Rodar (RED)** — FAIL (módulo não existe).

- [ ] **Step 3: Implementar `CaptureScreen`**

Create `app/src/features/scanner/screens/CaptureScreen.tsx`:

```tsx
import React from 'react';
import { Alert, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography } from '@theme';
import { Button } from '@shared/components/Button';
import { pickImage } from '@shared/services/image-picker.service';
import { ScannerViewfinder } from '../components/ScannerViewfinder';

interface Props {
  navigation: { navigate: (screen: string, params?: object) => void };
}

export function CaptureScreen({ navigation }: Props): React.JSX.Element {
  const go = (image: string) => navigation.navigate('Analyzing', { image });

  const fromSource = async (source: 'camera' | 'gallery') => {
    try {
      const image = await pickImage(source);
      if (image) go(image);
    } catch {
      Alert.alert('Não foi possível acessar', 'Verifique as permissões de câmera/galeria.');
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        <Text style={styles.title}>Fotografe seu prato</Text>
        {Platform.OS === 'web' ? (
          <ScannerViewfinder onPickImage={go} isAnalyzing={false} />
        ) : (
          <View style={styles.actions}>
            <Button onPress={() => fromSource('camera')}>Tirar foto</Button>
            <Button variant='secondary' onPress={() => fromSource('gallery')}>Escolher da galeria</Button>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.brandBackground },
  content: { flex: 1, padding: 24, gap: 24, justifyContent: 'center' },
  title: { fontSize: 22, color: colors.brandAnchor, fontFamily: typography.fontFamily.bold, textAlign: 'center' },
  actions: { gap: 12 },
});
```

> Verifique a prop real de `ScannerViewfinder` (`onPickImage: (dataUrl) => void`). Ajuste se diferente.

- [ ] **Step 4: Implementar `AnalyzingScreen`**

Create `app/src/features/scanner/screens/AnalyzingScreen.tsx`:

```tsx
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography } from '@theme';
import { Button } from '@shared/components/Button';
import { AnalyzingAnimation } from '../components/AnalyzingAnimation';
import { useScannerStore } from '../store';

interface Props {
  navigation: { replace: (screen: string) => void; goBack: () => void };
  route: { params: { image: string } };
}

export function AnalyzingScreen({ navigation, route }: Props): React.JSX.Element {
  const analyze = useScannerStore((s) => s.analyze);
  const isAnalyzing = useScannerStore((s) => s.isAnalyzing);
  const error = useScannerStore((s) => s.error);

  useEffect(() => {
    let active = true;
    analyze(route.params.image).then(() => {
      if (active && !useScannerStore.getState().error) navigation.replace('ScanResult');
    });
    return () => {
      active = false;
    };
  }, [analyze, navigation, route.params.image]);

  return (
    <SafeAreaView style={styles.safe}>
      {error && !isAnalyzing ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <Button onPress={() => navigation.goBack()}>Voltar</Button>
        </View>
      ) : (
        <AnalyzingAnimation />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.brandBackground, justifyContent: 'center' },
  errorBox: { padding: 24, gap: 16, alignItems: 'center' },
  errorText: { fontSize: 15, color: colors.brandText, textAlign: 'center' },
});
```

- [ ] **Step 5: Implementar `ScanResultScreen`**

Create `app/src/features/scanner/screens/ScanResultScreen.tsx`:

```tsx
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography } from '@theme';
import { Button } from '@shared/components/Button';
import { ScanResultList } from '../components/ScanResultList';
import { useScannerStore } from '../store';

interface Props {
  navigation: { navigate: (screen: string, params?: object) => void; getParent: () => { goBack: () => void } | undefined };
}

export function ScanResultScreen({ navigation }: Props): React.JSX.Element {
  const items = useScannerStore((s) => s.items);
  const updateItem = useScannerStore((s) => s.updateItem);
  const removeItem = useScannerStore((s) => s.removeItem);
  const addManualItem = useScannerStore((s) => s.addManualItem);
  const confirm = useScannerStore((s) => s.confirm);
  const [saving, setSaving] = useState(false);

  const onConfirm = async () => {
    setSaving(true);
    try {
      await confirm();
      navigation.getParent()?.goBack();
      navigation.navigate('FoodLog');
    } catch {
      /* store já alerta */
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {items.length === 0 ? (
          <Text style={styles.empty}>Não detectei alimentos. Adicione manualmente.</Text>
        ) : null}
        <ScanResultList items={items} onChange={updateItem} onRemove={removeItem} onAddManual={addManualItem} />
      </ScrollView>
      <View style={styles.footer}>
        <Button onPress={onConfirm} loading={saving} disabled={items.length === 0}>
          Confirmar e adicionar ao diário
        </Button>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.brandBackground },
  content: { padding: 16 },
  empty: { fontSize: 14, color: colors.brandTextMuted, textAlign: 'center', marginBottom: 12 },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: colors.brandDivider },
});
```

> Navegação pós-confirm: `getParent()?.goBack()` fecha o stack modal do scanner; `navigate('FoodLog')` foca o Diário. Ajuste conforme a integração da Task 6.

- [ ] **Step 6: Aposentar a tela antiga**

Remover `app/src/features/scanner/screens/ScannerScreen.tsx` e `ScannerScreen.test.tsx` (substituídos pelas 3 telas novas).
```bash
git rm app/src/features/scanner/screens/ScannerScreen.tsx app/src/features/scanner/screens/ScannerScreen.test.tsx
```

- [ ] **Step 7: Rodar (GREEN) e commitar**

Run: `npx jest src/features/scanner` → PASS (telas + store + componentes).
```bash
git add app/src/features/scanner/screens
git commit -m "feat(scanner): telas Capture, Analyzing e ScanResult (lista editável)"
```

---

### Task 6: Navegação — `ScannerNavigator` + botão central na tab bar

**Files:**
- Create: `app/src/navigation/ScannerNavigator.tsx`
- Modify: `app/src/navigation/types.ts` (add `ScannerStackParamList`; rota `Scanner` no Root/tab)
- Modify: `app/src/navigation/BrandTabNavigator.tsx` (remove aba Scanner; adiciona botão central de câmera)
- Modify: as 3 telas (re-tipar props com os tipos de navegação)

**Interfaces:**
- Consumes: as 3 telas (Task 5).
- Produces: `ScannerNavigator`; `ScannerStackParamList`.

- [ ] **Step 1: Tipos**

In `app/src/navigation/types.ts` adicionar:
```ts
export type ScannerStackParamList = {
  Capture: undefined;
  Analyzing: { image: string };
  ScanResult: undefined;
};
```
E garantir uma rota para acionar o scanner como modal (ex: no `RootStackParamList`: `Scanner: NavigatorScreenParams<ScannerStackParamList>`). Adicionar helper `ScannerStackScreenProps<T>` no padrão dos demais.

- [ ] **Step 2: Criar `ScannerNavigator`**

Create `app/src/navigation/ScannerNavigator.tsx`:

```tsx
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { CaptureScreen } from '@features/scanner/screens/CaptureScreen';
import { AnalyzingScreen } from '@features/scanner/screens/AnalyzingScreen';
import { ScanResultScreen } from '@features/scanner/screens/ScanResultScreen';
import { colors } from '@theme';
import type { ScannerStackParamList } from './types';

const Stack = createNativeStackNavigator<ScannerStackParamList>();

export function ScannerNavigator(): React.JSX.Element {
  return (
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: colors.brandBackground }, headerTintColor: colors.brandAnchor, headerShadowVisible: false }}>
      <Stack.Screen name='Capture' component={CaptureScreen} options={{ title: 'Escanear' }} />
      <Stack.Screen name='Analyzing' component={AnalyzingScreen} options={{ headerShown: false }} />
      <Stack.Screen name='ScanResult' component={ScanResultScreen} options={{ title: 'Resultado' }} />
    </Stack.Navigator>
  );
}
```

- [ ] **Step 3: Registrar `Scanner` como modal no Root**

No navigator raiz (onde `BrandTabNavigator` é montado — provavelmente `app/src/navigation/RootNavigator.tsx`), registrar `Scanner` como tela modal (`presentation: 'modal'` ou `fullScreenModal`) apontando para `ScannerNavigator`.

- [ ] **Step 4: Botão central na tab bar**

In `app/src/navigation/BrandTabNavigator.tsx`:
- Remover o `Tab.Screen name='Scanner'` (e o `supportsScanner`/condicional web).
- Adicionar um botão central elevado via `tabBarButton` numa screen "placeholder" OU via `options.tabBarButton` custom que, em vez de navegar para uma aba, faz `navigation.navigate('Scanner')`. Exemplo de botão custom (componente):

```tsx
function CameraTabButton({ onPress }: { onPress: () => void }): React.JSX.Element {
  return (
    <Pressable onPress={onPress} style={styles.cameraButton} accessibilityRole='button' accessibilityLabel='Escanear refeição'>
      <View style={styles.cameraInner}><Text style={styles.cameraIcon}>📷</Text></View>
    </Pressable>
  );
}
```
Estilos: círculo `brandPrimary`, elevado (`marginTop: -16`), centralizado. Inserir como item central da `Tab.Navigator` (ex: uma `Tab.Screen` "CameraAction" com `tabBarButton: () => <CameraTabButton onPress={() => rootNavigation.navigate('Scanner')} />` e `listeners` que previnem navegação de aba).

> Detalhe de implementação fica a critério: o importante é um botão central que chama `navigate('Scanner')`. Ajustar o splitting das abas (3 de cada lado) para o botão ficar no meio.

- [ ] **Step 5: Re-tipar as telas**

Atualizar `CaptureScreen`/`AnalyzingScreen`/`ScanResultScreen` para usar `ScannerStackScreenProps<'Capture'|'Analyzing'|'ScanResult'>`. Manter `FeedScreen`/demais intactos. Garantir que `ScanResultScreen.test.tsx` continue verde (ajustar props mock se necessário).

- [ ] **Step 6: Rodar e commitar**

Run: `npx jest src/features/scanner` → PASS, pristine.
```bash
git add app/src/navigation app/src/features/scanner/screens
git commit -m "feat(scanner): ScannerNavigator + botão central de câmera na tab bar"
```

---

### Task 7: MSW multi-itens + limpeza no logout

**Files:**
- Modify: `app/mocks/handlers/scanner.ts`
- Modify: `app/src/features/auth/store.ts` (`clearToken` → `useScannerStore.getState().clear()`)

- [ ] **Step 1: Atualizar o handler MSW**

Em `app/mocks/handlers/scanner.ts`, fazer `POST */scanner/analyze` retornar múltiplos itens:
```ts
import { http, HttpResponse } from 'msw';

export const scannerHandlers = [
  http.post('*/scanner/analyze', () =>
    HttpResponse.json({
      items: [
        { id: 's1', name: 'Arroz branco', calories: 205, protein: 4, carbs: 45, fat: 0, confidence: 0.92 },
        { id: 's2', name: 'Peito de frango', calories: 165, protein: 31, carbs: 0, fat: 4, confidence: 0.88 },
        { id: 's3', name: 'Brócolis', calories: 55, protein: 4, carbs: 11, fat: 1, confidence: 0.7 },
      ],
    }),
  ),
];
```
(Manter o nome exportado usado em `app/mocks/server.ts`.)

- [ ] **Step 2: Logout limpa o scanner store**

In `app/src/features/auth/store.ts`: `import { useScannerStore } from '@features/scanner/store';` e adicionar `useScannerStore.getState().clear();` em `clearToken`.

- [ ] **Step 3: Rodar e commitar**

Run: `npx jest src/features/scanner src/features/auth` → PASS (auth pode ter falhas pré-existentes não relacionadas; scanner verde).
```bash
git add app/mocks/handlers/scanner.ts app/src/features/auth/store.ts
git commit -m "feat(scanner): MSW multi-itens e limpeza no logout"
```

---

### Task 8: Fechamento

- [ ] **Step 1:** `npx jest src/features/scanner` → tudo verde, pristine.
- [ ] **Step 2:** Smoke (web): `npm run web` — botão central de câmera abre o fluxo; em web usa o `ScannerViewfinder`; análise mostra loading; resultado lista editável; confirmar adiciona ao Diário.
- [ ] **Step 3:** Commit final (se houver ajustes do smoke).

## Self-Review (cobertura vs spec)

- Botão flutuante/central de câmera (D27–D28): Task 6. ✅
- Captura nativa câmera+galeria (D28–D29): Tasks 1, 5. ✅
- Loading animado (D29–D30): Task 4 (`AnalyzingAnimation`), Task 5 (`AnalyzingScreen`). ✅
- Resultado lista + cal + macros (D30–D31): Tasks 2, 4, 5. ✅
- Editar/corrigir antes de confirmar (D31–D32): Task 3 (store), Task 4 (`ScanItemRow`), Task 5. ✅
- Identidade VITAL LIGHT, MSW, logout: Tasks 4–7. ✅
- Out of scope: vision-camera, crop, barcode, histórico de scans.

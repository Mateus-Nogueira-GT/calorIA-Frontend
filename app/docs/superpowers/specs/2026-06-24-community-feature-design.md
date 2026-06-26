# Comunidade (Social) Feature — Design Spec

**Data:** 2026-06-24
**Branch:** `feat/community` (base: `feat/d1-d2-frontend-setup`)
**Escopo:** itens D17–D26 do checklist de Frontend (módulo social estilo Hevy/Gym Rats):

- Feed (scroll infinito, cards de post) — D17–D20
- Post card (texto, conquista, likes, comentários) — D20–D21
- Criar post — D21–D22
- Interações: like (animação) + comentários — D22–D23
- Desafios: listar ativos — D23–D24
- Criar desafio + convidar amigos (link) — D24–D25
- Ranking/leaderboard (posição, streak, avatar) — D25–D26
- Notificações in-app — D26

## 1. Contexto

O app CalorIA é individual (auth/onboarding, Dashboard, Coach IA, dieta, food-log, scanner, perfil). Falta a camada **social/comunidade**. Esta spec cobre o módulo Comunidade completo, alinhado à identidade visual oficial "VITAL LIGHT" (tokens em `src/theme/colors.ts`).

O backend ainda não existe: o front consome um contrato documentado e é desenvolvido contra **handlers MSW**. O time de backend implementa depois com base neste contrato.

## 2. Decisões-chave

| Decisão | Escolha | Razão |
|---|---|---|
| Estrutura | Spec única "Comunidade", 3 planos sequenciais | Subsistemas compartilham tipos (`PostAuthor`), navegação e logout. |
| Backend | Contrato + handlers MSW | Backend inexistente; mantém o front desbloqueado. |
| Navegação | 6ª aba "Comunidade" com stack interno | Pilar de produto que merece descoberta de topo. |
| Conteúdo do post | Texto livre + card de conquista do app (opcional) | Integra ao produto sem depender de upload de imagem (sem image picker nativo). |
| Métrica do ranking | Streak (dias seguidos) | Reaproveita o conceito de streak existente; é o pedido no checklist. |
| Convite | Share API nativo + deep link `caloria://challenge/:code` | Atende "compartilhar link" e abre o desafio. |
| Animação de like | Animated API nativa | Sem dependência nova. |
| Notificações | Polling (~45s + AppState foreground) | Sem infra de realtime/push neste escopo. |
| Updates de like/join/read | Otimistas com rollback | Feedback instantâneo é crítico em mobile. |

## 3. Arquitetura

```
src/features/feed/         components (PostCard, LikeButton, AchievementCard, CommentRow, PostCardSkeleton, EmptyFeedState)
                           screens (FeedScreen, CreatePostScreen, PostCommentsScreen) · hooks (useFeed) · store
src/features/challenges/   components (ChallengeCard, LeaderboardRow, InviteButton, EmptyChallengesState)
                           screens (ChallengesScreen, CreateChallengeScreen, ChallengeLeaderboardScreen) · store
src/features/notifications/ components (NotificationBell, NotificationRow)
                           screens (NotificationsScreen) · hooks (useNotificationPolling) · store
src/shared/services/       feed.service · challenges.service · notifications.service
src/navigation/            CommunityNavigator (+ types, BrandTabNavigator 6ª aba, RootNavigator deep link)
mocks/handlers/            feed · challenges · notifications
```

Identidade visual (VITAL LIGHT) via tokens: fundo `brandBackground` #FAF8F4; superfície `colors.white`; CTA/coração/ponto-não-lida `brandPrimary` #FF6B35; nomes/headers `brandAnchor` #1B2D5B; badges/conquista/ranking `brandSupport`/`brandSupportSoft` #FFB347; texto `brandText`/`brandTextMuted`.

## 4. Modelo de Dados (tipos compartilhados)

```ts
// Feed
type AchievementType = 'meal_logged' | 'diet_completed' | 'streak';
interface PostAuthor { id: string; name: string; avatarEmoji?: string; }
interface PostAchievement { type: AchievementType; emoji: string; title: string; subtitle: string; }
interface Post { id; author: PostAuthor; content: string; achievement: PostAchievement | null;
  likeCount: number; commentCount: number; likedByMe: boolean; createdAt: string; }
interface Comment { id; postId; author: PostAuthor; content: string; createdAt: string; }
interface FeedPage { posts: Post[]; nextCursor: string | null; }

// Desafios
interface Challenge { id; title; description; emoji; startDate; endDate; participantCount: number;
  metric: 'streak'; joinedByMe: boolean; inviteCode: string; }
interface LeaderboardEntry { rank: number; user: PostAuthor; streak: number; isMe: boolean; }

// Notificações
type NotificationType = 'like' | 'comment' | 'challenge_invite' | 'challenge_rank';
interface AppNotification { id; type: NotificationType; actor: PostAuthor; message: string;
  targetId: string | null; read: boolean; createdAt: string; }
interface NotificationsResponse { items: AppNotification[]; unreadCount: number; }
```

`PostAuthor` é a fonte única (em `feed.service.ts`), reimportado pelos outros services.

## 5. Contrato de API

| Método | Path | Body | Retorno |
|---|---|---|---|
| GET | `/feed?cursor=&limit=` | — | `FeedPage` |
| POST | `/posts` | `{content, achievement?}` | `Post` |
| POST/DELETE | `/posts/:id/like` | — | `{likeCount, likedByMe}` |
| GET/POST | `/posts/:id/comments` | `{content}` (POST) | `Comment[]` / `Comment` |
| GET | `/challenges` | — | `Challenge[]` |
| POST | `/challenges` | `{title, description, startDate, endDate}` | `Challenge` |
| POST | `/challenges/:id/join` | — | `Challenge` |
| GET | `/challenges/:id/leaderboard` | — | `LeaderboardEntry[]` |
| GET | `/challenges/invite/:code` | — | `Challenge` |
| GET | `/notifications` | — | `NotificationsResponse` |
| POST | `/notifications/read` | `{ids?}` | `{unreadCount}` |

## 6. Estado (Zustand)

- **feed/store**: posts/cursor/loading flags/commentsByPost; `loadInitial/loadMore/refresh/createPost/toggleLike/loadComments/addComment/clear`. Like e comentário otimistas com rollback.
- **challenges/store**: challenges/leaderboardByChallenge/flags; `load/create/join/loadLeaderboard/resolveInvite/clear`. Join otimista.
- **notifications/store**: items/unreadCount/isLoading; `load/markAllRead/markRead/clear`. markRead/markAllRead otimistas reconciliando com o servidor.
- **Logout**: `useAuthStore.clearToken` limpa os 3 stores.

## 7. Navegação e deep link

- `BrandTabNavigator` ganha a 6ª aba **Comunidade** → `CommunityNavigator` (native-stack): Feed (inicial) → CreatePost (modal) → PostComments → Challenges → CreateChallenge (modal) → ChallengeLeaderboard → Notifications.
- `linking` no `NavigationContainer`: `caloria://post/:postId` e `caloria://challenge/:code` (resolvido por `GET /challenges/invite/:code`).
- Polling de notificações montado no `CommunityNavigator` (só autenticado + foreground).

## 8. Estados de loading/erro

Carga inicial → skeletons; vazio → EmptyState com CTA; falha → retry; ações otimistas com rollback + `Alert`. Paginação com spinner no footer e guarda de `isLoadingMore`/`nextCursor`.

## 9. Testes

Jest + @testing-library/react-native. Cobertura: stores (incl. otimismo/rollback), hooks (polling: mount/intervalo/AppState/cleanup/auth-gate), componentes-chave (PostCard, LikeButton, LeaderboardRow `isMe`, NotificationBell/Row), telas (carga + empty + navegação ao tocar). Saída pristine (animações drenadas com fake timers). Handlers MSW por subsistema.

## 10. Fora de escopo

Push real (FCM/APNs); upload de imagem/vídeo; grafo de seguidores; editar/excluir posts e comentários; moderação; realtime (WebSocket/SSE); ranking por métrica além de streak; seletor de datas custom no desafio (período fixo de 7 dias no MVP).

## 11. Status de implementação

Implementado em 3 planos (`docs/superpowers/plans/2026-06-24-community-{1-feed,2-challenges,3-notifications}.md`), todos na branch `feat/community`:
- Plano 1 (Feed): ✅
- Plano 2 (Desafios + Ranking): ✅
- Plano 3 (Notificações): ✅

Suítes do módulo (feed + challenges + notifications): verdes e pristine. Follow-ups: corrigir tests pré-existentes de outras features; seletor de datas; upload de imagem; push real.

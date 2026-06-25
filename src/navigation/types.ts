import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps, NavigatorScreenParams } from '@react-navigation/native';

// Auth Stack
export type AuthStackParamList = {
  Welcome: undefined;
  Register: undefined;
  Login: undefined;
  ForgotPassword: undefined;
  ProfileSetup: undefined;
};

// Community Stack
export type CommunityStackParamList = {
  Feed: undefined;
  CreatePost: undefined;
  PostComments: { postId: string };
  Challenges: undefined;
  CreateChallenge: undefined;
  ChallengeLeaderboard: { challengeId?: string; code?: string };
  // Notifications é adicionada no Plano 3.
};

// Tab Navigator
export type TabParamList = {
  Dashboard: undefined;
  FoodLog: undefined;
  Scanner: undefined;
  Coach: undefined;
  Community: NavigatorScreenParams<CommunityStackParamList>;
  Profile: undefined;
};

// Root Stack
export type RootStackParamList = {
  Auth: undefined;
  App: undefined;
  ProfileGoals: undefined;
  ProfileCoachPersonality: undefined;
};

// Screen props helpers
export type AuthStackScreenProps<T extends keyof AuthStackParamList> =
  NativeStackScreenProps<AuthStackParamList, T>;

export type TabScreenProps<T extends keyof TabParamList> = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, T>,
  NativeStackScreenProps<RootStackParamList>
>;

export type RootStackScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;

export type CommunityStackScreenProps<T extends keyof CommunityStackParamList> =
  CompositeScreenProps<
    NativeStackScreenProps<CommunityStackParamList, T>,
    TabScreenProps<'Community'>
  >;

import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';

// Auth Stack
export type AuthStackParamList = {
  Welcome: undefined;
  Register: undefined;
  Login: undefined;
  ForgotPassword: undefined;
  ProfileSetup: undefined;
};

// Tab Navigator
export type TabParamList = {
  Dashboard: undefined;
  FoodLog: undefined;
  Scanner: undefined;
  Coach: undefined;
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

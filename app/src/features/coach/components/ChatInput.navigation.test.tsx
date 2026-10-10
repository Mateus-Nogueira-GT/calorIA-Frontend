import { useAuthStore } from '@features/auth/store';
import React, { useEffect } from 'react';
import { AppState, Text, TouchableOpacity } from 'react-native';
import { NavigationContainer, useIsFocused, useNavigation } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { act, fireEvent, render } from '@testing-library/react-native';
import { ChatInput } from './ChatInput';

const mockCancel = jest.fn<Promise<void>, []>();
const mockTranscribe = jest.fn<Promise<string>, []>();
const mockUnmount = jest.fn();
const mockSend = jest.fn<Promise<boolean>, [string]>();
jest.mock('@shared/services/voice-recorder.service', () => ({
  isVoiceSupported: true,
  VOICE_MIME_TYPE: 'audio/m4a',
  requestMicrophonePermission: jest.fn().mockResolvedValue(true),
  startVoiceRecording: jest.fn().mockImplementation(async () => ({
    stop: jest.fn().mockResolvedValue('audio'),
    cancel: mockCancel,
  })),
}));
jest.mock('@shared/services/coach.service', () => ({
  coachService: { transcribe: () => mockTranscribe() },
}));
const Tab = createBottomTabNavigator<{ Coach: undefined; Profile: undefined }>();
function VoiceScreen() {
  const navigation = useNavigation();
  useEffect(
    () => () => {
      mockUnmount();
    },
    [],
  );
  return (
    <>
      <TouchableOpacity onPress={() => navigation.navigate('Profile' as never)}>
        <Text>Abrir Perfil</Text>
      </TouchableOpacity>
      <ChatInput isFocused={useIsFocused()} onSend={mockSend} disabled={false} />
    </>
  );
}
function ProfileScreen() {
  return <Text>Perfil aberto</Text>;
}

it('trocar de aba cancela o microfone sem desmontar o mentor nem enviar aos 60 s', async () => {
  AppState.currentState = 'active';
  useAuthStore
    .getState()
    .setToken('test-token', { id: 'voice-test', name: 'Maria', email: 'test@test.com' });
  jest.useFakeTimers();
  mockCancel.mockResolvedValue();
  mockTranscribe.mockResolvedValue('áudio oculto');
  mockSend.mockResolvedValue(true);
  const view = render(
    <NavigationContainer>
      <Tab.Navigator screenOptions={{ headerShown: false }}>
        <Tab.Screen name="Coach" component={VoiceScreen} />
        <Tab.Screen name="Profile" component={ProfileScreen} />
      </Tab.Navigator>
    </NavigationContainer>,
  );
  try {
    await act(async () => {
      fireEvent.press(view.getByTestId('chat-mic-btn'));
    });
    expect(view.getByTestId('chat-mic-stop-btn')).toBeTruthy();
    await act(async () => {
      fireEvent.press(view.getByText('Abrir Perfil'));
    });
    expect(view.getByText('Perfil aberto')).toBeTruthy();
    expect(mockUnmount).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(61000);
    });
    expect(mockCancel).toHaveBeenCalledTimes(1);
    expect(mockTranscribe).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  } finally {
    view.unmount();
    jest.useRealTimers();
  }
});

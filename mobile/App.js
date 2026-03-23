import { useEffect } from 'react';
import { TouchableOpacity, Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuthStore } from './src/store/useStore';
import { startOfflineSync } from './src/services/offline';

// Auth screens
import PhoneInput from './src/screens/auth/PhoneInput';
import OTPVerify from './src/screens/auth/OTPVerify';

// Role screens
import SOSScreen from './src/screens/citizen/SOSScreen';
import DriverMap from './src/screens/driver/DriverMap';
import CommunityHome from './src/screens/community/CommunityHome';
import VoicePlayer from './src/screens/shared/VoicePlayer';

const Stack = createNativeStackNavigator();

const screenOptions = {
  headerStyle: { backgroundColor: '#1A2535' },
  headerTintColor: '#FFFFFF',
  headerTitleStyle: { fontWeight: '700' },
  headerBackTitle: 'Back',
  contentStyle: { backgroundColor: '#0F1923' },
};

function LogoutButton({ onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{ paddingHorizontal: 12, paddingVertical: 6, minWidth: 44, minHeight: 44, justifyContent: 'center' }}
      activeOpacity={0.7}
    >
      <Text style={{ color: '#FF4757', fontWeight: '600', fontSize: 14 }}>Logout</Text>
    </TouchableOpacity>
  );
}

export default function App() {
  const { user, isAuthenticated, hydrate, logout } = useAuthStore();

  useEffect(() => {
    hydrate();
    startOfflineSync();
  }, []);

  const logoutOption = {
    headerRight: () => <LogoutButton onPress={logout} />,
  };

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={screenOptions}>
        {!isAuthenticated ? (
          <>
            <Stack.Screen name="PhoneInput" component={PhoneInput} options={{ title: 'ResQNet', headerShown: true }} />
            <Stack.Screen name="OTPVerify" component={OTPVerify} options={{ title: 'Verify OTP' }} />
          </>
        ) : (
          <>
            {user?.role === 'citizen' && (
              <Stack.Screen
                name="SOSScreen"
                component={SOSScreen}
                options={{ title: 'Send SOS', ...logoutOption }}
              />
            )}
            {user?.role === 'driver' && (
              <Stack.Screen
                name="DriverMap"
                component={DriverMap}
                options={{ title: `${user.vehicleType || 'Vehicle'} — ResQNet`, ...logoutOption }}
              />
            )}
            {user?.role === 'community' && (
              <Stack.Screen
                name="CommunityHome"
                component={CommunityHome}
                options={{ title: 'ResQNet', ...logoutOption }}
              />
            )}
            <Stack.Screen
              name="VoicePlayer"
              component={VoicePlayer}
              options={{ title: 'Voice Broadcast', presentation: 'modal' }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

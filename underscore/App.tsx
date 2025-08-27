import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { makeRedirectUri, useAuthRequest, exchangeCodeAsync, ResponseType, TokenResponse } from 'expo-auth-session';
import { StyleSheet, Text, View, Pressable, Alert, Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthProvider, useAuth } from './src/auth/AuthContext';
import SignInScreen from './src/auth/SignInScreen';
import SignUpScreen from './src/auth/SignUpScreen';
import { db } from './src/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { setupVoice, startListening, stopListening, destroyListening } from './src/speech';
import { fetchUserPlaylists, pickTrackUriByKeyword } from './src/spotify';

WebBrowser.maybeCompleteAuthSession();

const SPOTIFY_CLIENT_ID = process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID as string;
const SPOTIFY_SCOPES = ['user-read-email', 'playlist-read-private', 'playlist-read-collaborative', 'user-modify-playback-state'];
const SECURE_TOKEN_KEY = 'spotify_token_response';

function HomeScreen() {
  const { user } = useAuth();
  // Existing Spotify UI becomes Home screen
  const isExpoGo = true;
  const redirectUri = (makeRedirectUri as any)({ scheme: 'underscore', useProxy: true });
  console.log('redirectUri =>', redirectUri);
  const [listening, setListening] = React.useState(false);
  const [partial, setPartial] = React.useState('');

  const [request, response, promptAsync] = useAuthRequest(
    {
      clientId: SPOTIFY_CLIENT_ID,
      responseType: ResponseType.Code,
      usePKCE: true,
      scopes: SPOTIFY_SCOPES,
      redirectUri,
    },
    {
      authorizationEndpoint: 'https://accounts.spotify.com/authorize',
      tokenEndpoint: 'https://accounts.spotify.com/api/token',
      // Spotify does not provide a token revocation endpoint
    }
  );

  async function saveToken(token: TokenResponse) {
    try {
      await SecureStore.setItemAsync(SECURE_TOKEN_KEY, JSON.stringify(token));
    } catch (e) {
      // Fallback to async storage if secure store fails (e.g., on web)
      await AsyncStorage.setItem(SECURE_TOKEN_KEY, JSON.stringify(token));
    }
  }

  async function loadToken(): Promise<TokenResponse | null> {
    try {
      const json = await SecureStore.getItemAsync(SECURE_TOKEN_KEY);
      if (json) return new TokenResponse(JSON.parse(json));
    } catch {}
    const json = await AsyncStorage.getItem(SECURE_TOKEN_KEY);
    return json ? new TokenResponse(JSON.parse(json)) : null;
  }

  async function handleAuth() {
    try {
      const result = await (promptAsync as any)({ useProxy: true });
      if (result.type !== 'success' || !('params' in result) || !(result as any).params?.code) return;
      const code = (result as any).params.code as string;
      const token = await exchangeCodeAsync(
        {
          clientId: SPOTIFY_CLIENT_ID,
          code,
          redirectUri,
          extraParams: {
            code_verifier: request?.codeVerifier ?? '',
          },
        },
        { tokenEndpoint: 'https://accounts.spotify.com/api/token' }
      );
      await saveToken(token);
      // Persist to Firestore if user signed in
      try {
        // Save minimal token fields; avoid long-term storage of secrets in production
        if (user) {
          await setDoc(doc(db, 'users', user.uid), {
            spotify: {
              accessToken: token.accessToken,
              issuedAt: token.issuedAt,
              expiresIn: token.expiresIn,
              tokenType: token.tokenType,
              scope: token.scope,
            },
          }, { merge: true });
          // Call backend to store refresh token if present
          const functions = getFunctions();
          const saveTokens = httpsCallable(functions, 'saveSpotifyTokens');
          await saveTokens({
            accessToken: token.accessToken,
            refreshToken: (token as any).refreshToken ?? null,
            expiresIn: token.expiresIn,
            scope: token.scope,
            tokenType: token.tokenType,
            issuedAt: token.issuedAt,
          });
        }
      } catch {}
      Alert.alert('Connected to Spotify');
    } catch (err) {
      Alert.alert('Auth error', String(err));
    }
  }

  async function openSpotifyToPlay(trackUri: string) {
    const url = `spotify:track:${trackUri}`;
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
    } else {
      await Linking.openURL('https://open.spotify.com/track/' + trackUri);
    }
  }

  async function demoPickByKeyword() {
    const token = await loadToken();
    if (!token) {
      Alert.alert('Not connected', 'Please connect Spotify first.');
      return;
    }
    try {
      const playlists = await fetchUserPlaylists(token.accessToken);
      const uri = pickTrackUriByKeyword(playlists, 'focus');
      if (uri) {
        await openSpotifyToPlay(uri);
      } else {
        Alert.alert('No track found');
      }
    } catch (e) {
      Alert.alert('Error', String(e));
    }
  }

  React.useEffect(() => {
    setupVoice({
      onPartial: setPartial,
      onFinal: async (text) => {
        try {
          if (!user) return;
          const functions = getFunctions();
          const classify = httpsCallable(functions, 'classifyUtterance');
          const result: any = await classify({ text });
          const mood: string = result?.data?.mood ?? 'neutral';
          const query: string = result?.data?.query ?? mood;
          // Basic search fallback by mood keyword
          const token = await loadToken();
          if (!token) return;
          const searchRes = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=1`, {
            headers: { Authorization: `Bearer ${token.accessToken}` },
          });
          const json = await searchRes.json();
          const trackUri = json?.tracks?.items?.[0]?.uri;
          if (trackUri) {
            await openSpotifyToPlay(String(trackUri).replace('spotify:track:', ''));
          }
        } catch (e) {
          console.warn('classify/play error', e);
        }
      },
    });
    return () => { destroyListening(); };
  }, [user]);

  async function toggleListening() {
    try {
      if (listening) {
        await stopListening();
        setListening(false);
      } else {
        await startListening();
        setListening(true);
      }
    } catch (e) {
      Alert.alert('Speech error', String(e));
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Underscore</Text>
      <Text style={styles.subtitle}>Connect Spotify and test launch</Text>

      <Pressable style={styles.button} disabled={!request} onPress={handleAuth}>
        <Text style={styles.buttonText}>Connect Spotify</Text>
      </Pressable>

      <Pressable style={styles.buttonSecondary} onPress={() => openSpotifyToPlay('11dFghVXANMlKmJXsNCbNl')}>
        <Text style={styles.buttonText}>Play sample in Spotify</Text>
      </Pressable>

      <Pressable style={styles.buttonSecondary} onPress={demoPickByKeyword}>
        <Text style={styles.buttonText}>Pick by keyword: "focus"</Text>
      </Pressable>

      <Pressable style={listening ? styles.buttonStop : styles.button} onPress={toggleListening}>
        <Text style={styles.buttonText}>{listening ? 'Stop Listening' : 'Start Listening'}</Text>
      </Pressable>
      {!!partial && <Text style={{ marginTop: 8, color: '#777' }} numberOfLines={2}>Heard: {partial}</Text>}

      <StatusBar style="auto" />
    </View>
  );
}

function RootNavigator() {
  const Stack = createNativeStackNavigator();
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <View style={styles.container}>
        <Text>Loading...</Text>
      </View>
    );
  }
  return (
    <Stack.Navigator>
      {user ? (
        <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
      ) : (
        <>
          <Stack.Screen name="SignIn" component={SignInScreen} options={{ title: 'Sign In' }} />
          <Stack.Screen name="SignUp" component={SignUpScreen} options={{ title: 'Sign Up' }} />
        </>
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <NavigationContainer>
        <RootNavigator />
      </NavigationContainer>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
    marginBottom: 8,
  },
  subtitle: {
    color: '#444',
    marginBottom: 24,
  },
  button: {
    backgroundColor: '#1DB954',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  buttonSecondary: {
    backgroundColor: '#111',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonStop: {
    backgroundColor: '#d00000',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
  },
});

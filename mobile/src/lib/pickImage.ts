import * as ImagePicker from 'expo-image-picker';
import { Alert, Platform } from 'react-native';

export type Picked = { uri: string; base64?: string | null };

export async function pickImage(source: 'camera' | 'library', withBase64 = false): Promise<Picked | null> {
  const opts: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    quality: 0.7,
    base64: withBase64,
    allowsEditing: false,
  };
  if (source === 'camera' && Platform.OS !== 'web') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Camera permission needed', 'Allow camera access in Settings to photograph your plants.');
      return null;
    }
    const r = await ImagePicker.launchCameraAsync(opts);
    return r.canceled ? null : { uri: r.assets[0].uri, base64: r.assets[0].base64 };
  }
  const r = await ImagePicker.launchImageLibraryAsync(opts);
  return r.canceled ? null : { uri: r.assets[0].uri, base64: r.assets[0].base64 };
}

export const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

export const fmtTime = (ms: number) =>
  new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }).toLowerCase();

export const cap = (s?: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

// Web preview only (CIVICPULSE_PREVIEW=1): phone-only modules are swapped for stand-ins.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

if (process.env.CIVICPULSE_PREVIEW === '1') {
  const stub = path.join(__dirname, '.preview', 'stubs.js');
  const shims = {
    'expo-secure-store': path.join(__dirname, '.preview', 'secure-store.js'),
    'expo-sqlite': stub,
    'expo-file-system': stub,
    'expo-camera': stub,
    'expo-location': stub,
    '@maplibre/maplibre-react-native': stub,
  };
  config.resolver.resolveRequest = (context, name, platform) =>
    platform === 'web' && shims[name]
      ? { type: 'sourceFile', filePath: shims[name] }
      : context.resolveRequest(context, name, platform);
}

module.exports = config;

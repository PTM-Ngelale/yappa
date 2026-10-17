// Next.js web version of Clue Line. It renders the same screens as the Android app (app/, src/)
// through react-native-web, so gameplay code lives in one place. Expo-only pieces are
// swapped out here: `react-native` -> react-native-web, `expo-router` -> lib/expo-router.tsx
// (backed by Next's router), and `.web.tsx` files win over their native versions.
import nextEnv from '@next/env';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(webDir, '..');

// The Supabase URL and anon key are shared with the Expo app: read the repo's .env files.
// forceReload: Next has already loaded (and cached) web/'s env files by now.
nextEnv.loadEnvConfig(repoRoot, process.env.NODE_ENV !== 'production', undefined, true);

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Shared code lives outside web/ (../app, ../src, ../assets).
  outputFileTracingRoot: repoRoot,
  // The share card picture reads its fonts from web/fonts at request time.
  outputFileTracingIncludes: { '/c/[id]/image.png': ['./fonts/**/*'] },
  experimental: { externalDir: true },
  env: {
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
    EXPO_PUBLIC_SUPABASE_KEY: process.env.EXPO_PUBLIC_SUPABASE_KEY ?? '',
  },
  // Invite links: /join/ABCD opens Home with the Join form filled in (Home upper-cases it).
  async redirects() {
    return [{ source: '/join/:code', destination: '/?room=:code', permanent: false }];
  },
  transpilePackages: [
    'react-native-web',
    'react-native-safe-area-context',
    'expo',
    'expo-asset',
    'expo-audio',
    'expo-constants',
    'expo-font',
    'expo-modules-core',
    'expo-status-bar',
    '@expo/vector-icons',
    '@expo-google-fonts/bricolage-grotesque',
    '@react-native-async-storage/async-storage',
  ],
  webpack(config, { dev, webpack }) {
    config.resolve.alias = {
      ...config.resolve.alias,
      'react-native$': 'react-native-web',
      'expo-router$': path.join(webDir, 'lib/expo-router.tsx'),
    };
    config.resolve.extensions = [
      '.web.tsx',
      '.web.ts',
      '.web.jsx',
      '.web.js',
      ...config.resolve.extensions,
    ];
    // Fonts, sounds and images required from shared code become plain URLs.
    // Only shared assets: web/app/icon.png etc. go through Next's own metadata loader.
    // Next's image loader would otherwise also claim shared images and turn them into JS
    // modules (served as the "image"), so keep it off the shared assets folder.
    const sharedAssets = path.join(repoRoot, 'assets');
    const excludeSharedAssets = (rules) => {
      for (const rule of rules ?? []) {
        if (!rule || typeof rule !== 'object') continue;
        if (rule.oneOf) excludeSharedAssets(rule.oneOf);
        if (rule.rules) excludeSharedAssets(rule.rules);
        if (String(rule.loader ?? '').includes('next-image-loader')) {
          rule.exclude = [...[rule.exclude ?? []].flat(), sharedAssets];
        }
      }
    };
    excludeSharedAssets(config.module.rules);
    config.module.rules.push({
      test: /\.(ttf|otf|wav|mp3|m4a|png|jpe?g|gif|webp)$/i,
      include: [path.join(repoRoot, 'assets'), path.join(repoRoot, 'node_modules')],
      type: 'asset/resource',
      generator: { filename: 'static/media/[name].[contenthash:8][ext]' },
    });
    config.plugins.push(
      // app/_layout.tsx imports ../global.css (Tailwind directives, unused by the screens);
      // Next only allows global CSS from its own root layout.
      new webpack.NormalModuleReplacementPlugin(/[\\/]global\.css$/, path.join(webDir, 'lib/empty.js')),
      new webpack.DefinePlugin({
        __DEV__: JSON.stringify(dev),
        'process.env.EXPO_OS': JSON.stringify('web'),
      })
    );
    return config;
  },
};

export default nextConfig;

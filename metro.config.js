const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

config.resolver.unstable_enablePackageExports = false;

const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Work around Metro failing to resolve react-dom subpath exports on Windows
  if (moduleName === 'react-dom/client') {
    return {
      filePath: path.resolve(__dirname, 'node_modules/react-dom/client.js'),
      type: 'sourceFile',
    };
  }
  if (moduleName === 'react-dom/server') {
    return {
      filePath: path.resolve(__dirname, 'node_modules/react-dom/server.browser.js'),
      type: 'sourceFile',
    };
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: './global.css' });

export const CHROME_BASED_BROWSERS = [
  "com.google.Chrome",
  "com.google.Chrome.beta",
  "com.google.Chrome.dev",
  "com.google.Chrome.canary",
  "com.brave.Browser",
  "com.brave.Browser.beta",
  "com.brave.Browser.nightly",
  "com.microsoft.edgemac",
  "com.microsoft.edgemac.Beta",
  "com.microsoft.edgemac.Dev",
  "com.microsoft.edgemac.Canary",
  "com.mighty.app",
  "com.ghostbrowser.gb1",
  "com.bookry.wavebox",
  "com.pushplaylabs.sidekick",
  "com.operasoftware.Opera",
  "com.operasoftware.OperaNext",
  "com.operasoftware.OperaDeveloper",
  "com.operasoftware.OperaGX",
  "com.vivaldi.Vivaldi",
  "company.thebrowser.Browser",
];

export const SAFARI_BROWSERS = [
  "com.apple.Safari",
  "com.apple.SafariTechnologyPreview",
  "com.apple.Safari.canary", // Added for completeness if it exists, matching pattern
];

export const isChromeBasedBrowser = (bundleId: string): boolean => {
  return CHROME_BASED_BROWSERS.includes(bundleId);
};

export const isSafariBrowser = (bundleId: string): boolean => {
  return SAFARI_BROWSERS.includes(bundleId);
};

export const isSupportedBrowser = (bundleId: string): boolean => {
  return isChromeBasedBrowser(bundleId) || isSafariBrowser(bundleId);
};


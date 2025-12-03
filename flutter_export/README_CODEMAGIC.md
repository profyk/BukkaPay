
# Building BukkaPay Mobile on Codemagic

This guide will help you build the Flutter app on Codemagic CI/CD.

## Prerequisites

1. A Codemagic account (https://codemagic.io/)
2. Your Flutter project repository on GitHub/GitLab/Bitbucket

## Setup Steps

### 1. Push to Git Repository

First, push only the `flutter_export` directory to your Git repository:

```bash
cd flutter_export
git init
git add .
git commit -m "Initial Flutter app commit"
git remote add origin YOUR_GIT_REPOSITORY_URL
git push -u origin main
```

### 2. Connect to Codemagic

1. Log in to Codemagic
2. Click "Add application"
3. Connect your repository
4. Select the Flutter project

### 3. Configure Build

The `codemagic.yaml` file is already configured with:
- **Android workflow**: Builds release APK
- **iOS workflow**: Builds iOS app (requires Apple Developer account for signing)

### 4. Environment Variables (Optional)

To use a different API URL:
1. Go to Codemagic app settings
2. Add environment variable: `API_BASE_URL`
3. Set value to your backend URL

### 5. Android Signing (For Release)

To sign your Android app:
1. Generate a keystore file
2. Upload to Codemagic under Code signing
3. Add these environment variables:
   - `FCI_KEYSTORE_PATH`
   - `FCI_KEYSTORE_PASSWORD`
   - `FCI_KEY_PASSWORD`
   - `FCI_KEY_ALIAS`

### 6. iOS Signing (For Release)

To sign your iOS app:
1. Upload your provisioning profile
2. Upload your certificate
3. Configure in Codemagic settings

## Build Commands

The workflows will automatically:
- Install Flutter dependencies
- Build the app
- Generate artifacts (APK/AAB for Android, .app for iOS)

## Artifacts

After successful build, you'll find:
- **Android**: APK and AAB files in `build/app/outputs/`
- **iOS**: .app file in `build/ios/iphoneos/`

## Customization

Edit `codemagic.yaml` to:
- Change Flutter version
- Add custom build scripts
- Configure different build flavors
- Add automated testing
- Set up deployment to stores

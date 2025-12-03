
# BukkaPay Flutter Mobile App

Complete Flutter mobile application for BukkaPay - Modern Mobile Wallet.

## Features

✅ **Authentication**
- Login & Signup
- JWT token-based auth
- Secure session management

✅ **Dashboard**
- Real-time balance display
- Multiple budgeting cards
- Recent transactions
- Quick actions

✅ **Wallet Management**
- Multiple cards with categories
- Real-time balance updates
- Card transfers

✅ **Transactions**
- View transaction history
- Create transfers
- Real-time updates

✅ **Profile**
- User information
- Settings
- Logout

## Setup Instructions

### 1. Install Flutter

Follow the [official Flutter installation guide](https://docs.flutter.dev/get-started/install) for your OS.

### 2. Create Flutter Project

```bash
flutter create bukkapay_mobile
cd bukkapay_mobile
```

### 3. Copy Files

Copy all files from this `flutter_export/` directory to your new project:

```bash
cp -r lib/* your_project/lib/
cp pubspec.yaml your_project/
```

### 4. Update API URL

Edit `lib/services/api_service.dart` and update the `baseUrl` to your Replit deployment URL:

```dart
static const String baseUrl = 'https://your-repl-url.replit.dev';
```

### 5. Install Dependencies

```bash
flutter pub get
```

### 6. Run the App

For development:
```bash
flutter run
```

For web:
```bash
flutter run -d chrome
```

For Android release:
```bash
flutter build apk --release
```

For iOS release (macOS only):
```bash
flutter build ios --release
```

## Project Structure

```
lib/
├── main.dart                 # App entry point
├── models/
│   ├── data_models.dart      # Data models with JSON serialization
│   └── mock_data.dart        # Mock data (fallback)
├── providers/
│   └── app_state.dart        # State management with Provider
├── screens/
│   ├── home_screen.dart      # Dashboard
│   ├── login_screen.dart     # Login
│   ├── signup_screen.dart    # Signup
│   ├── wallet_screen.dart    # Cards management
│   ├── scan_screen.dart      # QR scanner
│   ├── transfer_screen.dart  # Money transfer
│   └── profile_screen.dart   # User profile
├── services/
│   └── api_service.dart      # Backend API integration
└── widgets/
    ├── bottom_nav.dart       # Navigation bar
    └── wallet_card.dart      # Card widget
```

## Backend Integration

The app connects to your BukkaPay backend API with these endpoints:

- `POST /api/auth/login` - User login
- `POST /api/auth/signup` - User registration
- `GET /api/auth/me` - Get current user
- `GET /api/cards` - Get wallet cards
- `GET /api/transactions` - Get transactions
- `POST /api/transactions` - Create transaction
- `GET /api/contacts` - Get contacts

## State Management

Uses Provider package for state management:
- `AppState` - Global app state
- Reactive UI updates
- Centralized API calls

## Testing

Run tests:
```bash
flutter test
```

## Deployment

### Android
```bash
flutter build apk --release
# APK will be in build/app/outputs/flutter-apk/
```

### iOS
```bash
flutter build ios --release
# Open Xcode and archive for App Store
```

### Web
```bash
flutter build web
# Deploy the build/web/ directory
```

## Notes

- The app requires an active internet connection
- API calls use JWT tokens stored in SharedPreferences
- All screens are responsive and mobile-optimized
- Uses Material 3 design system
- Google Fonts: Inter & Outfit

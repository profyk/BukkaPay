## BukkaPay Flutter Export

This directory contains the complete Flutter source code for the BukkaPay mobile wallet app.

### Getting Started

1. **Create a new Flutter project**:
   ```bash
   flutter create bukkapay
   cd bukkapay
   ```

2. **Add Dependencies**:
   Add the following to your `pubspec.yaml` file:
   ```yaml
   dependencies:
     flutter:
       sdk: flutter
     google_fonts: ^6.1.0
     lucide_icons: ^0.3.0
   ```

3. **Copy Files**:
   Replace the `lib/` directory in your new project with the `lib/` directory from this export.

4. **Run**:
   ```bash
   flutter run
   ```

### Features Implemented

- **Modern UI**: Uses Material 3 with custom theming and Google Fonts (Outfit & Inter).
- **Navigation**: Custom Bottom Navigation Bar.
- **Screens**:
  - **Home**: Dashboard with Cards, Quick Actions, and Transactions.
  - **Wallet**: List of budgeting cards with progress bars.
  - **Scan**: QR Code scanner UI with toggleable modes.
  - **Transfer**: Money transfer flow with numeric keypad.
  - **Profile**: User settings and menu.
